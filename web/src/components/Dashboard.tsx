import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type TraceEvent, type Transaction } from '../api';
import { useEventStream } from '../useEventStream';
import { BalanceCandles } from './BalanceCandles';
import type { Session } from '../App';
import { formatMoney, splitMoney } from '../format';
import { Avatar } from './Avatar';
import { BalanceChart } from './BalanceChart';
import { DepositModal } from './DepositModal';
import { ChevronRight, Download, Logo, LogOut, Plus, Refresh, Send, TrendDown, TrendUp } from './Icons';
import { ReportCard } from './ReportCard';
import { useToast } from './Toast';
import { TransactionList } from './TransactionList';
import { CONTACTS, TransferModal } from './TransferModal';
import { useCountUp } from './useCountUp';
import { Lab } from './Lab';
import { Logs } from './Logs';

const PAGE_SIZE = 20;

type ModalState = null | { kind: 'deposit' } | { kind: 'transfer'; to?: number };

type View = 'wallet' | 'lab' | 'logs';
const VIEWS: { id: View; label: string }[] = [
  { id: 'wallet', label: 'Wallet' },
  { id: 'lab',    label: 'Test lab' },
  { id: 'logs',   label: 'Logs' },
];

const viewFromHash = (): View => {
  const h = window.location.hash.replace('#/', '');
  return h === 'lab' || h === 'logs' ? h : 'wallet';
};

function useView() {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (v: View) => { window.location.hash = v === 'wallet' ? '' : `/${v}`; };
  return [view, go] as const;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const isIncoming = (tx: Transaction) => tx.type === 'deposit' || tx.type === 'transfer_in';

const CHART_HISTORY = 200;

// A committed deposit/transfer event carries everything needed to show the
// ledger row right away, without waiting for the 30s history cache.
function txFromEvent(e: TraceEvent, userId: number): (Transaction & { from?: number }) | null {
  const d = e.data ?? {};
  if (e.kind === 'deposit.commit' && e.users?.[0] === userId && d.amount != null) {
    return { id: Number(d.transactionId), userId, type: 'deposit', amount: String(d.amount), balanceAfter: String(d.balance), createdAt: e.ts };
  }
  if (e.kind !== 'transfer.commit') return null;
  if (d.fromUserId === userId) {
    return { id: Number(d.transactionId), userId, type: 'transfer_out', amount: String(d.amount), balanceAfter: String(d.fromBalance), createdAt: e.ts };
  }
  if (d.toUserId === userId && d.inTransactionId != null) {
    return {
      id: Number(d.inTransactionId), userId, type: 'transfer_in', amount: String(d.amount), balanceAfter: String(d.toBalance),
      createdAt: e.ts, from: Number(d.fromUserId),
    };
  }
  return null;
}

export function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { token, userId } = session;
  const toast = useToast();

  const [balance, setBalance] = useState(0);
  const [fetched, setFetched] = useState<Transaction[]>([]);
  const [chartHistory, setChartHistory] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Page 1 of history is served from a 30s Redis cache, so anything created
  // from this tab is kept locally and merged in until the cache catches up.
  const [local, setLocal] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [view, go] = useView();

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    try {
      const [me, hist, long] = await Promise.all([
        api.me(token), api.history(userId, 1, PAGE_SIZE), api.history(userId, 1, CHART_HISTORY),
      ]);
      setChartHistory(long.transactions);
      setBalance(Number(me.balance));
      setFetched(hist.transactions);
      setTotal(hist.total);
      setPage(1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast('error', 'Session expired — please sign in again');
        onSignOut();
        return;
      }
      toast('error', (err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, userId, toast, onSignOut]);

  // The lab and the traffic generator move money around, so reload whenever
  // the wallet view is (re)opened.
  useEffect(() => { if (view === 'wallet') load(); }, [view, load]);
  useEffect(() => {
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const hist = await api.history(userId, page + 1, PAGE_SIZE);
      setFetched((xs) => [...xs, ...hist.transactions]);
      setTotal(hist.total);
      setPage(page + 1);
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const stream = useEventStream({ enabled: view === 'wallet', max: 400 });
  const userEvents = useMemo(
    () => stream.events.filter((e) => e.kind !== 'http' && e.users?.includes(userId)),
    [stream.events, userId],
  );
  const liveTx = useMemo(() => {
    if (stream.baseline === null) return [];
    return userEvents
      .filter((e) => e.id > stream.baseline!)
      .map((e) => ({ event: e, tx: txFromEvent(e, userId) }))
      .filter((x): x is { event: TraceEvent; tx: Transaction & { from?: number } } => x.tx !== null);
  }, [userEvents, stream.baseline, userId]);

  // Keep the headline balance in step with whatever just committed, and call
  // out money arriving from someone else.
  const appliedEvent = useRef(0);
  useEffect(() => {
    const newest = liveTx[0];
    if (!newest || newest.event.id <= appliedEvent.current) return;
    const received = liveTx.filter(({ event, tx }) => event.id > appliedEvent.current && tx.type === 'transfer_in');
    if (received.length === 1) {
      toast('success', `user${received[0].tx.from} sent you $${formatMoney(received[0].tx.amount)}`);
    } else if (received.length > 1) {
      const sum = received.reduce((acc, { tx }) => acc + Number(tx.amount), 0);
      toast('success', `${received.length} incoming transfers · +$${formatMoney(sum)}`);
    }
    appliedEvent.current = newest.event.id;
    setBalance(Number(newest.tx.balanceAfter));
  }, [liveTx, toast]);

  const transactions = useMemo(() => {
    const byId = new Map<number, Transaction>();
    for (const tx of [...fetched, ...local, ...liveTx.map((x) => x.tx)]) if (!byId.has(tx.id)) byId.set(tx.id, tx);
    return [...byId.values()].sort((a, b) => b.id - a.id);
  }, [fetched, local, liveTx]);

  const chartTransactions = useMemo(() => {
    const byId = new Map<number, Transaction>();
    for (const tx of [...chartHistory, ...transactions]) byId.set(tx.id, tx);
    return [...byId.values()];
  }, [chartHistory, transactions]);

  const pendingLocal = transactions.length - fetched.length;
  const freshIds = useMemo(
    () => new Set([...local.map((t) => t.id), ...liveTx.map((x) => x.tx.id)]),
    [local, liveTx],
  );

  const addLocal = (tx: Omit<Transaction, 'userId' | 'createdAt'>) =>
    setLocal((xs) => [{ ...tx, userId, createdAt: new Date().toISOString() }, ...xs]);

  // Net change over the last 7 days, derived from the loaded history.
  const weekNet = useMemo(() => {
    const since = Date.now() - 7 * 86400000;
    return transactions
      .filter((tx) => new Date(tx.createdAt).getTime() >= since)
      .reduce((sum, tx) => sum + (isIncoming(tx) ? 1 : -1) * Number(tx.amount), 0);
  }, [transactions]);

  const stats = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const tx of transactions) {
      if (isIncoming(tx)) inflow += Number(tx.amount); else outflow += Number(tx.amount);
    }
    return { inflow, outflow };
  }, [transactions]);

  const animated = useCountUp(balance);
  const { whole, cents } = splitMoney(animated);
  const flowMax = Math.max(stats.inflow, stats.outflow, 1);

  return (
    <div className="shell">
      <header className="topbar fade-up">
        <div className="brand"><span className="brand-mark"><Logo size={18} /></span>Vault</div>
        <nav className="views" aria-label="Sections">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'active' : ''} aria-current={view === v.id ? 'page' : undefined} onClick={() => go(v.id)}>
              {v.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="icon-btn" onClick={() => load(true)} aria-label="Refresh" title="Refresh">
            {refreshing ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Refresh size={18} />}
          </button>
          <div className="user-pill">
            <Avatar userId={userId} size={30} />
            <span className="name" style={{ fontSize: 14, fontWeight: 500 }}>user{userId}</span>
            <span className="live-dot" title="Connected" />
          </div>
          <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

      {view === 'lab' && <Lab />}
      {view === 'logs' && <Logs />}

      {view === 'wallet' && <>
      <div className="greeting fade-up" style={{ animationDelay: '0.05s' }}>
        <h1 className="serif">{greeting()}, <span>user{userId}.</span></h1>
        <span className="faint" style={{ fontSize: 14 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div className="grid">
        <section className="card hero span-8 fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="hero-top">
            <div>
              <div className="eyebrow">Total balance</div>
              <div className="balance">
                <span className="currency">$</span>
                <span className="whole">{whole}</span>
                <span className="cents">.{cents}</span>
              </div>
            </div>
            {transactions.length > 0 && (
              <span className={`delta ${weekNet >= 0 ? 'up' : 'down'}`} title="Net change over the last 7 days">
                {weekNet >= 0 ? <TrendUp size={14} /> : <TrendDown size={14} />}
                <span className="num">{weekNet >= 0 ? '+' : '−'}${formatMoney(Math.abs(weekNet))}</span>
                <span style={{ opacity: 0.7 }}>7d</span>
              </span>
            )}
          </div>
          <div className="hero-chart">
            {!loading && <BalanceChart transactions={transactions} />}
          </div>
        </section>

        <section className="card actions span-4 fade-up" style={{ animationDelay: '0.15s' }}>
          <button className="action primary" onClick={() => setModal({ kind: 'deposit' })}>
            <span className="ico"><Plus size={20} /></span>
            <span><b>Add money</b><small>Instant deposit</small></span>
          </button>
          <button className="action" onClick={() => setModal({ kind: 'transfer' })}>
            <span className="ico"><Send size={20} /></span>
            <span><b>Send</b><small>To another vault</small></span>
          </button>
          <a className="action" href={api.exportUrl(userId)} onClick={() => toast('success', 'CSV export started')}>
            <span className="ico"><Download size={20} /></span>
            <span><b>Export</b><small>Full history · CSV</small></span>
          </a>
          <button className="action" onClick={() => load(true)}>
            <span className="ico"><Refresh size={20} className={refreshing ? 'spin' : ''} /></span>
            <span><b>Sync</b><small>Pull latest</small></span>
          </button>
        </section>

        <section className="card stats span-12 fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="stat">
            <span className="eyebrow">Money in</span>
            <span className="value num" style={{ color: 'var(--in)' }}>+${formatMoney(stats.inflow)}</span>
            <span className="bar"><i style={{ width: `${(stats.inflow / flowMax) * 100}%`, background: 'var(--in)' }} /></span>
          </div>
          <div className="stat">
            <span className="eyebrow">Money out</span>
            <span className="value num" style={{ color: 'var(--out)' }}>−${formatMoney(stats.outflow)}</span>
            <span className="bar"><i style={{ width: `${(stats.outflow / flowMax) * 100}%`, background: 'var(--out)' }} /></span>
          </div>
          <div className="stat">
            <span className="eyebrow">Transactions</span>
            <span className="value num">{total + pendingLocal}</span>
            <span className="faint" style={{ fontSize: 12.5 }}>Stats cover the {transactions.length} most recent</span>
          </div>
        </section>

        <div className="span-8 fade-up" style={{ animationDelay: '0.25s' }}>
          <TransactionList
            transactions={transactions}
            total={total + pendingLocal}
            loading={loading}
            loadingMore={loadingMore}
            freshIds={freshIds}
            onLoadMore={loadMore}
            onDeposit={() => setModal({ kind: 'deposit' })}
            chart={!loading && <BalanceCandles transactions={chartTransactions} />}
            liveEvents={userEvents}
            liveOnline={stream.online}
          />
        </div>

        <aside className="span-4 side fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="card side-card">
            <div>
              <div className="eyebrow">Quick send</div>
              <h4 className="serif" style={{ marginTop: 6 }}>People</h4>
            </div>
            <div className="contacts">
              {CONTACTS.filter((id) => id !== userId).map((id) => (
                <button key={id} className="contact" onClick={() => setModal({ kind: 'transfer', to: id })}>
                  <Avatar userId={id} size={38} />
                  <span>
                    <div style={{ fontWeight: 500 }}>user{id}</div>
                    <div className="faint" style={{ fontSize: 12.5 }}>Vault #{String(id).padStart(4, '0')}</div>
                  </span>
                  <ChevronRight size={18} className="arrow" />
                </button>
              ))}
            </div>
          </div>
          <ReportCard userId={userId} />
        </aside>
      </div>
      </>}

      {modal?.kind === 'deposit' && (
        <DepositModal
          userId={userId}
          onClose={() => setModal(null)}
          onDone={({ transactionId, amount, balance: b }) => {
            setBalance(Number(b));
            addLocal({ id: transactionId, type: 'deposit', amount: String(amount), balanceAfter: String(b) });
            toast('success', `Deposited $${formatMoney(amount)}`);
          }}
        />
      )}
      {modal?.kind === 'transfer' && (
        <TransferModal
          token={token}
          userId={userId}
          balance={balance}
          initialTo={modal.to}
          onClose={() => setModal(null)}
          onDone={({ transactionId, amount, toUserId, fromBalance }) => {
            setBalance(Number(fromBalance));
            addLocal({ id: transactionId, type: 'transfer_out', amount: String(amount), balanceAfter: fromBalance });
            toast('success', `Sent $${formatMoney(amount)} to user${toUserId}`);
          }}
        />
      )}
    </div>
  );
}
