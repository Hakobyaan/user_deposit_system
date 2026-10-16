import { useMemo, useState } from 'react';
import { eventsApi, type TraceEvent } from '../api';
import { useEventStream } from '../useEventStream';
import { balanceOf, deposit, round2, transfer } from '../lab/client';
import { formatMoney } from '../format';
import { Avatar } from './Avatar';
import { EventRow, traceHue } from './EventRow';
import { Send, X } from './Icons';
import { useToast } from './Toast';
import { CONTACTS } from './TransferModal';

type Topic = 'all' | 'transfer' | 'deposit' | 'idempotency' | 'guards' | 'errors';

const TOPICS: { id: Topic; label: string; match: (e: TraceEvent) => boolean }[] = [
  { id: 'all',         label: 'Everything',  match: () => true },
  { id: 'transfer',    label: 'Transfers',   match: (e) => e.kind.startsWith('transfer.') },
  { id: 'deposit',     label: 'Deposits',    match: (e) => e.kind.startsWith('deposit.') || e.kind.startsWith('rabbitmq.') },
  { id: 'idempotency', label: 'Idempotency', match: (e) => e.kind.startsWith('idempotency.') },
  { id: 'guards',      label: 'Guards',      match: (e) => /^(auth|ratelimit|deadlock|fault)\./.test(e.kind) },
  { id: 'errors',      label: 'Errors only', match: (e) => e.level === 'error' || e.level === 'warn' },
];

export function Logs() {
  const toast = useToast();
  const [live, setLive] = useState(true);
  const { events, setEvents, online } = useEventStream({ enabled: live });
  const [user, setUser] = useState<number | null>(null);
  const [topic, setTopic] = useState<Topic>('all');
  const [traceFilter, setTraceFilter] = useState<string | null>(null);
  const [showHttp, setShowHttp] = useState(false);

  const shown = useMemo(() => {
    const t = TOPICS.find((x) => x.id === topic)!;
    return events.filter((e) =>
      (showHttp || e.kind !== 'http')
      && t.match(e)
      && (user === null || e.users?.includes(user))
      && (!traceFilter || e.traceId === traceFilter));
  }, [events, topic, user, traceFilter, showHttp]);

  const stats = useMemo(() => ({
    commits:   events.filter((e) => e.kind.endsWith('.commit')).length,
    rollbacks: events.filter((e) => e.kind.endsWith('.rollback')).length,
    replays:   events.filter((e) => e.kind === 'idempotency.replay').length,
    rejected:  events.filter((e) => e.kind === 'http' && Number(e.data?.status) >= 400).length,
  }), [events]);

  const clear = async () => {
    try {
      await eventsApi.clear();
      setEvents([]);
      toast('success', 'Log cleared');
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };

  return (
    <div className="logs">
      <div className="greeting fade-up">
        <div>
          <div className="eyebrow">Live logs</div>
          <h1 className="serif" style={{ marginTop: 8 }}>What the server did<span>, step by step.</span></h1>
        </div>
        <div className="topbar-right">
          <span className={`live-pill ${live && online ? 'on' : ''}`}>
            <span className={live && online ? 'live-dot' : 'dot-off'} />
            {!online ? 'Offline' : live ? 'Live' : 'Paused'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setLive(!live)}>{live ? 'Pause' : 'Resume'}</button>
          <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
        </div>
      </div>

      <div className="grid">
        <section className="card stats span-12 fade-up" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <Stat label="Commits" value={stats.commits} color="var(--in)" />
          <Stat label="Rollbacks" value={stats.rollbacks} color="var(--danger)" />
          <Stat label="Idempotent replays" value={stats.replays} color="var(--violet)" />
          <Stat label="Rejected requests" value={stats.rejected} color="var(--out)" />
        </section>

        <div className="span-8 fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="card log-panel">
            <div className="log-toolbar">
              <div className="filters">
                {TOPICS.map((t) => (
                  <button key={t.id} className={`chip ${topic === t.id ? 'active' : ''}`} onClick={() => setTopic(t.id)}>{t.label}</button>
                ))}
              </div>
              <div className="filters">
                <button className={`chip ${user === null ? 'active' : ''}`} onClick={() => setUser(null)}>All users</button>
                {CONTACTS.map((id) => (
                  <button key={id} className={`chip user-chip ${user === id ? 'active' : ''}`} onClick={() => setUser(user === id ? null : id)}>
                    <Avatar userId={id} size={20} /> user{id}
                  </button>
                ))}
                <label className="toggle">
                  <input type="checkbox" checked={showHttp} onChange={(e) => setShowHttp(e.target.checked)} /> HTTP lines
                </label>
              </div>
              {traceFilter && (
                <div className="trace-filter" style={{ borderColor: traceHue(traceFilter) }}>
                  Showing one request trace: <code>{traceFilter}</code>
                  <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setTraceFilter(null)} aria-label="Clear trace filter"><X size={14} /></button>
                </div>
              )}
            </div>
            <div className="log-list">
              {shown.length === 0 ? (
                <div className="empty" style={{ padding: '48px 24px' }}>
                  <p className="muted" style={{ fontSize: 14, maxWidth: 360 }}>
                    {events.length === 0
                      ? 'No events yet. Make a deposit or transfer, run a Test lab scenario, or use the traffic generator.'
                      : 'Nothing matches these filters.'}
                  </p>
                </div>
              ) : shown.map((e) => <EventRow key={e.id} event={e} onTraceClick={setTraceFilter} />)}
            </div>
          </div>
        </div>

        <aside className="span-4 side fade-up" style={{ animationDelay: '0.1s' }}>
          <TrafficGenerator />
          <div className="card side-card">
            <div className="eyebrow">How to read it</div>
            <ul className="legend">
              <li><b className="ev-kw begin">BEGIN</b> DB transaction opened, rows locked with <code>FOR UPDATE</code></li>
              <li><b className="ev-kw commit">COMMIT</b> every write in the transaction became visible at once</li>
              <li><b className="ev-kw rollback">ROLLBACK</b> every write was undone — balances untouched</li>
              <li><span className="swatch" /> Same colour bar = same request. Click a trace id to isolate it.</li>
              <li><span className="faint">pid</span> — the cluster worker that handled it</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <span className="value num" style={{ color }}>{value}</span>
    </div>
  );
}

function TrafficGenerator() {
  const toast = useToast();
  const [from, setFrom] = useState(1);
  const [amount, setAmount] = useState('5');
  const [rounds, setRounds] = useState(1);
  const [busy, setBusy] = useState(false);
  const targets = CONTACTS.filter((id) => id !== from);

  const send = async () => {
    const amt = round2(Number(amount));
    if (!(amt > 0)) return;
    setBusy(true);
    const traceId = `traffic:user${from}:${Date.now().toString(36)}`;
    try {
      const need = amt * targets.length * rounds;
      const balance = await balanceOf(from);
      if (balance < need) {
        const r = await deposit(from, round2(need - balance + 50), { traceId });
        if (r.status !== 201) throw new Error(`Top-up failed: ${r.message ?? r.status}`);
      }
      const jobs = [];
      for (let i = 0; i < rounds; i++) for (const to of targets) jobs.push(transfer(from, to, amt, { traceId: `${traceId}:${i}→${to}` }));
      const rs = await Promise.all(jobs);
      const ok = rs.filter((r) => r.status === 200).length;
      toast(ok === rs.length ? 'success' : 'error', `${ok}/${rs.length} transfers from user${from} committed`);
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card side-card">
      <div>
        <div className="eyebrow">Traffic generator</div>
        <h4 className="serif" style={{ marginTop: 6 }}>Fan-out transfers</h4>
        <p className="faint" style={{ fontSize: 13, marginTop: 4 }}>
          One user pays everyone else in parallel — watch the debit, credits and ledger rows land for each receiver.
        </p>
      </div>
      <div className="field">
        <label>From</label>
        <div className="recipients">
          {CONTACTS.map((id) => (
            <button key={id} type="button" className={`recipient ${from === id ? 'active' : ''}`} onClick={() => setFrom(id)}>
              <Avatar userId={id} size={32} /> user{id}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>Amount each</label>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        </div>
        <div className="field">
          <label>Rounds</label>
          <input className="input" type="number" min={1} max={10} value={rounds}
            onChange={(e) => setRounds(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={send} disabled={busy || !(Number(amount) > 0)}>
        {busy ? <span className="spinner" /> : <Send size={17} />}
        user{from} → {targets.map((t) => `user${t}`).join(', ')}
      </button>
      <span className="faint" style={{ fontSize: 12 }}>
        {targets.length * rounds} transfers · ${formatMoney(round2(Number(amount) || 0) * targets.length * rounds)} total · tops up the sender if needed
      </span>
    </div>
  );
}
