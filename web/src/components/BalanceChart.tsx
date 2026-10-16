import { useEffect, useMemo, useRef, useState } from 'react';
import type { Transaction } from '../api';
import { formatMoney } from '../format';

interface Point { t: number; v: number; label: string }

const signed = (tx: Transaction) =>
  (tx.type === 'deposit' || tx.type === 'transfer_in' ? 1 : -1) * Number(tx.amount);

function toPoints(txs: Transaction[]): Point[] {
  if (!txs.length) return [];
  const chrono = [...txs].reverse();
  const first = chrono[0];
  const points: Point[] = [{
    t: new Date(first.createdAt).getTime() - 1,
    v: Number(first.balanceAfter) - signed(first),
    label: 'Start',
  }];
  for (const tx of chrono) {
    points.push({ t: new Date(tx.createdAt).getTime(), v: Number(tx.balanceAfter), label: new Date(tx.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) });
  }
  return points;
}

// Smooth path through the points (Catmull-Rom → cubic Bézier, y clamped so
// the curve never overshoots below the chart floor).
function smoothPath(xy: [number, number][], floor: number) {
  if (xy.length < 2) return '';
  let d = `M${xy[0][0]},${xy[0][1]}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[i + 2] ?? p2;
    const k = 0.18;
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) * k, Math.min(floor, p1[1] + (p2[1] - p0[1]) * k)];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) * k, Math.min(floor, p2[1] - (p3[1] - p1[1]) * k)];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function BalanceChart({ transactions }: { transactions: Transaction[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 160 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(() => toPoints(transactions), [transactions]);
  const { w, h } = size;
  const padTop = 24;
  const floor = h - 2;

  const xy = useMemo<[number, number][]>(() => {
    if (points.length < 2) return [];
    const max = Math.max(...points.map((p) => p.v));
    const min = Math.min(...points.map((p) => p.v));
    const range = max - min || 1;
    // Even spacing reads better than true time scale for bursty demo data.
    return points.map((p, i) => [
      (i / (points.length - 1)) * w,
      padTop + (1 - (p.v - min) / range) * (h - padTop - 20),
    ]);
  }, [points, w, h]);

  const line = smoothPath(xy, floor);
  const area = line ? `${line} L${w},${h} L0,${h} Z` : '';

  const onMove = (e: React.MouseEvent) => {
    if (!xy.length) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    xy.forEach(([px], i) => { if (Math.abs(px - x) < Math.abs(xy[best][0] - x)) best = i; });
    setHover(best);
  };

  return (
    <div ref={wrap} style={{ position: 'absolute', inset: 0 }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {xy.length ? (
        <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d4ff4f" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#d4ff4f" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#area)" />
          <path key={line.length} d={line} className="chart-line draw" />
          {hover !== null && (
            <g>
              <line x1={xy[hover][0]} x2={xy[hover][0]} y1={0} y2={h} stroke="rgba(255,255,255,0.14)" strokeDasharray="3 4" />
              <circle cx={xy[hover][0]} cy={xy[hover][1]} r={9} fill="rgba(212,255,79,0.18)" />
              <circle cx={xy[hover][0]} cy={xy[hover][1]} r={4.5} fill="#07080b" stroke="#d4ff4f" strokeWidth={2.5} />
            </g>
          )}
        </svg>
      ) : (
        <div className="chart-empty">Your balance curve appears after the first deposit</div>
      )}
      {hover !== null && xy[hover] && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(xy[hover][0], 70), w - 70), top: xy[hover][1] }}>
          <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>${formatMoney(points[hover].v)}</div>
          <div className="faint">{points[hover].label}</div>
        </div>
      )}
    </div>
  );
}
