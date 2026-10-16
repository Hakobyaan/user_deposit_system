import { useEffect, useState } from 'react';
import { eventsApi } from '../api';
import { runScenario, SCENARIOS, type Category, type RunResult, type Scenario } from '../lab/scenarios';
import { EventRow } from './EventRow';
import { Alert, Check, ChevronRight, Layers, Shield, X, Zap } from './Icons';

const CATEGORIES: { id: Category; blurb: string; Icon: typeof Zap }[] = [
  { id: 'Idempotency', blurb: 'Retries and double-clicks must never double-charge.', Icon: Layers },
  { id: 'Rollback',    blurb: 'Failures mid-transaction must leave no partial writes.', Icon: Shield },
  { id: 'Concurrency', blurb: 'Parallel requests on the same accounts stay consistent.', Icon: Zap },
  { id: 'Guards',      blurb: 'Bad input is rejected before touching the ledger.', Icon: Alert },
];

type State = Record<string, { running: boolean; result?: RunResult }>;

export function Lab() {
  const [faults, setFaults] = useState<boolean | null>(null);
  const [state, setState] = useState<State>({});
  const [open, setOpen] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);

  useEffect(() => {
    eventsApi.list(Number.MAX_SAFE_INTEGER).then((r) => setFaults(r.faultInjection)).catch(() => setFaults(false));
  }, []);

  const run = async (s: Scenario) => {
    setState((st) => ({ ...st, [s.id]: { ...st[s.id], running: true } }));
    const result = await runScenario(s, !!faults);
    setState((st) => ({ ...st, [s.id]: { running: false, result } }));
    if (result.status !== 'pass') setOpen(s.id);
    return result;
  };

  const runAll = async () => {
    setRunningAll(true);
    setOpen(null);
    for (const s of SCENARIOS) await run(s);
    setRunningAll(false);
  };

  const results = SCENARIOS.map((s) => state[s.id]?.result).filter(Boolean) as RunResult[];
  const count = (st: RunResult['status']) => results.filter((r) => r.status === st).length;

  return (
    <div className="lab">
      <div className="greeting fade-up">
        <div>
          <div className="eyebrow">Test lab</div>
          <h1 className="serif" style={{ marginTop: 8 }}>Planned failures<span>, verified live.</span></h1>
        </div>
        <div className="lab-summary">
          {results.length > 0 && (
            <span className="faint num" style={{ fontSize: 13 }}>
              <b style={{ color: 'var(--in)' }}>{count('pass')} passed</b>
              {count('fail') > 0 && <> · <b style={{ color: 'var(--danger)' }}>{count('fail')} failed</b></>}
              {count('skip') > 0 && <> · {count('skip')} skipped</>}
            </span>
          )}
          <button className="btn btn-primary" onClick={runAll} disabled={runningAll}>
            {runningAll ? <span className="spinner" /> : <Zap size={18} />} Run all {SCENARIOS.length}
          </button>
        </div>
      </div>

      <div className={`lab-banner card fade-up ${faults ? 'on' : 'off'}`}>
        <span className="dot" />
        {faults === null ? 'Checking fault injection…'
          : faults ? <>Fault injection is <b>on</b> — scenarios can crash a request at a chosen point (<code>X-Fault</code> header) to prove the rollback.</>
            : <>Fault injection is <b>off</b> — crash scenarios will be skipped. Start wallet-service with <code>FAULT_INJECTION=true</code>.</>}
      </div>

      {CATEGORIES.map(({ id, blurb, Icon }, ci) => (
        <section key={id} className="lab-group fade-up" style={{ animationDelay: `${0.05 + ci * 0.05}s` }}>
          <div className="lab-group-head">
            <span className="lab-ico"><Icon size={18} /></span>
            <div>
              <h3 className="serif">{id}</h3>
              <p className="faint" style={{ fontSize: 13.5 }}>{blurb}</p>
            </div>
          </div>
          <div className="lab-cards">
            {SCENARIOS.filter((s) => s.category === id).map((s) => {
              const st = state[s.id];
              const r = st?.result;
              const expanded = open === s.id && !!r;
              return (
                <article key={s.id} className={`card scenario ${r ? `is-${r.status}` : ''} ${expanded ? 'expanded' : ''}`}>
                  <div className="scenario-head">
                    <div style={{ minWidth: 0 }}>
                      <h4>{s.title}</h4>
                      <p className="muted">{s.summary}</p>
                      <p className="expect"><span>Expected</span>{s.expect}</p>
                    </div>
                    <div className="scenario-actions">
                      {r && <span className={`badge ${r.status}`}>{r.status === 'pass' ? <Check size={13} /> : r.status === 'fail' ? <X size={13} /> : null}{r.status}</span>}
                      <button className="btn btn-ghost btn-sm" onClick={() => run(s)} disabled={st?.running || runningAll}>
                        {st?.running ? <span className="spinner" style={{ width: 14, height: 14 }} /> : r ? 'Re-run' : 'Run'}
                      </button>
                    </div>
                  </div>

                  {r && (
                    <button className="scenario-toggle" onClick={() => setOpen(expanded ? null : s.id)}>
                      <ChevronRight size={15} className={expanded ? 'rot' : ''} />
                      {r.checks.filter((c) => !c.note).length} checks · {r.trace.length} server events · {r.ms}ms
                    </button>
                  )}

                  {expanded && r && (
                    <div className="scenario-body">
                      {r.error && <div className={r.status === 'skip' ? 'skip-banner' : 'error-banner'}>{r.error}</div>}
                      <ul className="checks">
                        {r.checks.map((c, i) => (
                          <li key={i} className={c.note ? 'note' : c.pass ? 'pass' : 'fail'}>
                            <span className="mark">{c.note ? '·' : c.pass ? <Check size={13} /> : <X size={13} />}</span>
                            <span>{c.label}</span>
                            {c.detail && <code>{c.detail}</code>}
                          </li>
                        ))}
                      </ul>
                      {r.trace.length > 0 && (
                        <div className="trace-box">
                          <div className="eyebrow" style={{ padding: '0 4px 6px' }}>Server trace</div>
                          {r.trace.map((e) => <EventRow key={e.id} event={e} showTrace={false} />)}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
