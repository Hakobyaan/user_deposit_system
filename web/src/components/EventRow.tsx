import type { CSSProperties, ReactNode } from 'react';
import type { TraceEvent } from '../api';

const time = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleTimeString('en-GB', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

// Highlights the parts of a message people scan for: users, money, SQL-ish
// keywords and HTTP statuses.
function highlight(message: string): ReactNode[] {
  return message.split(/(user\d+|\$[\d,.]+|\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b|→ \d{3}\b|#\d+)/g).map((part, i) => {
    if (/^user\d+$/.test(part)) return <span key={i} className={`ev-user u${Number(part.slice(4)) % 6}`}>{part}</span>;
    if (/^\$/.test(part)) return <b key={i} className="ev-money">{part}</b>;
    if (part === 'BEGIN' || part === 'COMMIT' || part === 'ROLLBACK') return <b key={i} className={`ev-kw ${part.toLowerCase()}`}>{part}</b>;
    if (/^→ \d{3}$/.test(part)) {
      const code = Number(part.slice(2));
      return <span key={i}>→ <b className={`ev-code ${code >= 500 ? 'e5' : code >= 400 ? 'e4' : 'ok'}`}>{code}</b></span>;
    }
    if (/^#\d+$/.test(part)) return <span key={i} className="ev-id">{part}</span>;
    return part;
  });
}

export const traceHue = (traceId: string | null) => {
  if (!traceId) return 'transparent';
  let h = 0;
  for (const ch of traceId) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 62%)`;
};

interface Props {
  event: TraceEvent;
  showTrace?: boolean;
  onTraceClick?: (traceId: string) => void;
}

export function EventRow({ event, showTrace = true, onTraceClick }: Props) {
  return (
    <div className={`ev lvl-${event.level}`} style={{ '--trace': traceHue(event.traceId) } as CSSProperties}>
      <span className="ev-time num">{time(event.ts)}</span>
      <span className="ev-kind">{event.kind}</span>
      <span className="ev-msg">{highlight(event.message)}</span>
      {showTrace && (
        <span className="ev-meta">
          {event.traceId && (
            <button className="ev-trace" title={`Filter by ${event.traceId}`} onClick={() => onTraceClick?.(event.traceId!)}>
              {event.traceId.replace(/^lab:/, '').slice(0, 26)}
            </button>
          )}
          <span className="faint" title="Cluster worker pid">pid {event.pid}</span>
        </span>
      )}
    </div>
  );
}
