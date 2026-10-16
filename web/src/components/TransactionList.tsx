import { useMemo, useState, type ReactNode } from 'react';
import type { TraceEvent, Transaction, TxType } from '../api';
import { EventRow } from './EventRow';
import { dayLabel, formatMoney, formatTime } from '../format';
import { ArrowDownLeft, Plus, Send, Wallet } from './Icons';

const META: Record<TxType, { title: string; cls: string; sign: 1 | -1; Icon: typeof Plus }> = {
  deposit:      { title: 'Deposit',       cls: 'dep', sign: 1,  Icon: Plus },
  transfer_in:  { title: 'Received',      cls: 'in',  sign: 1,  Icon: ArrowDownLeft },
  transfer_out: { title: 'Sent',          cls: 'out', sign: -1, Icon: Send },
  withdrawal:   { title: 'Withdrawal',    cls: 'out', sign: -1, Icon: Send },
};

type Filter = 'all' | 'in' | 'out';

interface Props {
  transactions: Transaction[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  freshIds: Set<number>;
  onLoadMore: () => void;
  onDeposit: () => void;
  chart?: ReactNode;
  liveEvents: TraceEvent[];
  liveOnline: boolean;
}

type Tab = 'history' | 'live';

export function TransactionList({
  transactions, total, loading, loadingMore, freshIds, onLoadMore, onDeposit, chart, liveEvents, liveOnline,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<Tab>('history');

  const groups = useMemo(() => {
    const shown = transactions.filter((tx) =>
      filter === 'all' || (filter === 'in' ? META[tx.type].sign > 0 : META[tx.type].sign < 0));
    const map = new Map<string, Transaction[]>();
    for (const tx of shown) {
      const key = dayLabel(tx.createdAt);
      map.set(key, [...(map.get(key) ?? []), tx]);
    }
    return [...map.entries()];
  }, [transactions, filter]);

  return (
    <div className="card">
      <div className="panel-head">
        <h3 className="serif">Activity</h3>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            History
          </button>
          <button role="tab" aria-selected={tab === 'live'} className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
            <span className={liveOnline ? 'live-dot' : 'dot-off'} /> Live log
            {liveEvents.length > 0 && <span className="tab-count num">{liveEvents.length}</span>}
          </button>
        </div>
      </div>

      {chart}

      {tab === 'live' ? (
        <div className="activity-log">
          {liveEvents.length === 0 ? (
            <div className="empty" style={{ padding: '40px 24px' }}>
              <p className="muted" style={{ fontSize: 14, maxWidth: 320 }}>
                Nothing yet. Every deposit or transfer that touches this account shows up here step by step — BEGIN, locks, debit/credit, COMMIT or ROLLBACK.
              </p>
            </div>
          ) : liveEvents.slice(0, 60).map((e) => <EventRow key={e.id} event={e} showTrace={false} />)}
          <div className="tx-foot">
            <a className="btn btn-ghost btn-sm" href="#/logs">Open full logs →</a>
          </div>
        </div>
      ) : <>
      <div className="filters activity-filters">
        {(['all', 'in', 'out'] as Filter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'in' ? 'Incoming' : 'Outgoing'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '12px 0 20px' }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.1}s` }} />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="empty">
          <span className="ring"><Wallet size={28} /></span>
          <div className="serif" style={{ fontSize: 24 }}>Nothing here yet</div>
          <p className="muted" style={{ maxWidth: 300, fontSize: 14 }}>Make your first deposit and it will show up here instantly.</p>
          {filter === 'all' && <button className="btn btn-primary" onClick={onDeposit} style={{ marginTop: 6 }}><Plus size={18} /> Add money</button>}
        </div>
      ) : (
        <>
          {groups.map(([day, txs]) => (
            <div className="tx-group" key={day}>
              <div className="tx-day">{day}</div>
              {txs.map((tx, i) => {
                const m = META[tx.type];
                return (
                  <div key={tx.id} className={`tx ${freshIds.has(tx.id) ? 'tx-new' : ''}`} style={{ animationDelay: `${Math.min(i, 10) * 0.035}s` }}>
                    <span className={`tx-ico ${m.cls}`}><m.Icon size={19} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="tx-title">{m.title}</div>
                      <div className="tx-sub">{formatTime(tx.createdAt)} · #{tx.id}</div>
                    </div>
                    <div className="tx-amt">
                      <div className={`num ${m.sign > 0 ? 'pos' : 'neg'}`}>{m.sign > 0 ? '+' : '−'}${formatMoney(tx.amount)}</div>
                      <div className="tx-sub num">${formatMoney(tx.balanceAfter)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="tx-foot">
            {transactions.length < total ? (
              <button className="btn btn-ghost" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? <span className="spinner" /> : `Show more · ${total - transactions.length} left`}
              </button>
            ) : (
              <span className="faint" style={{ fontSize: 13 }}>That's everything — {total} transaction{total === 1 ? '' : 's'}</span>
            )}
          </div>
        </>
      )}
      </>}
    </div>
  );
}
