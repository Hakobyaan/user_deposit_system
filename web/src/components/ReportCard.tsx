import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from './Toast';
import { Download, FileText } from './Icons';

type State =
  | { kind: 'idle' }
  | { kind: 'processing'; reportId: string }
  | { kind: 'done'; reportId: string }
  | { kind: 'error'; message: string };

export function ReportCard({ userId }: { userId: number }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const timer = useRef<number>(0);
  const toast = useToast();

  useEffect(() => () => clearTimeout(timer.current), []);

  const poll = (reportId: string) => {
    timer.current = window.setTimeout(async () => {
      try {
        const s = await api.reportStatus(reportId);
        if (s.status === 'done') {
          setState({ kind: 'done', reportId });
          toast('success', 'Your PDF statement is ready');
        } else if (s.status === 'error') {
          setState({ kind: 'error', message: s.message ?? 'Report generation failed' });
        } else {
          poll(reportId);
        }
      } catch (err) {
        setState({ kind: 'error', message: (err as Error).message });
      }
    }, 900);
  };

  const generate = async () => {
    clearTimeout(timer.current);
    try {
      const { reportId } = await api.generateReport(userId);
      setState({ kind: 'processing', reportId });
      poll(reportId);
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <div className="card side-card">
      <div>
        <div className="eyebrow">Statements</div>
        <h4 className="serif" style={{ marginTop: 6 }}>PDF report</h4>
      </div>
      <p className="muted" style={{ fontSize: 13.5, marginTop: -6 }}>
        Rendered in a background worker thread — the API stays responsive while it builds.
      </p>

      {state.kind !== 'idle' && (
        <div className="report-state">
          <span className="doc"><FileText size={18} style={{ color: 'var(--text-2)' }} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>
              {state.kind === 'processing' && 'Generating…'}
              {state.kind === 'done' && 'Statement ready'}
              {state.kind === 'error' && 'Something went wrong'}
            </div>
            {state.kind === 'processing' && <div className="progress"><i /></div>}
            {state.kind === 'done' && <div className="faint num" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{state.reportId}</div>}
            {state.kind === 'error' && <div style={{ fontSize: 12.5, color: 'var(--out)' }}>{state.message}</div>}
          </div>
        </div>
      )}

      {state.kind === 'done' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-primary" style={{ flex: 1 }} href={api.downloadUrl(state.reportId)}><Download size={18} /> Download</a>
          <button className="btn btn-ghost" onClick={generate}>New</button>
        </div>
      ) : (
        <button className="btn btn-ghost" onClick={generate} disabled={state.kind === 'processing'}>
          {state.kind === 'processing' ? <span className="spinner" /> : <><FileText size={18} /> Generate statement</>}
        </button>
      )}
    </div>
  );
}
