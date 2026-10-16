import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { Transaction } from '../api';
import { formatMoney } from '../format';

// Real data this time: the user's balance history grouped into OHLC candles.
// open  = balance before the first transaction in the bucket
// close = balance after the last one
// high/low = extremes the balance touched inside the bucket
// volume = money in (green) and out (red) during the bucket

interface Candle {
  start: number;
  o: number; h: number; l: number; c: number;
  vin: number; vout: number;
  count: number;
}

const FRAMES = [
  { id: '1m', ms: 60_000 },
  { id: '5m', ms: 5 * 60_000 },
  { id: '1h', ms: 3_600_000 },
  { id: '1D', ms: 86_400_000 },
] as const;
type Frame = typeof FRAMES[number]['id'] | 'auto';

const MAX_CANDLES = 48;
const MIN_SLOTS = 28;
const H = 280;
const AXIS = 70;
const VOL_H = 40;
const TIME_H = 20;
const TOP = 16;

const incoming = (tx: Transaction) => tx.type === 'deposit' || tx.type === 'transfer_in';

function buildCandles(txs: Transaction[], ms: number): Candle[] {
  const chrono = [...txs].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
  const out: Candle[] = [];
  for (const tx of chrono) {
    const t = new Date(tx.createdAt).getTime();
    const start = Math.floor(t / ms) * ms;
    const amount = Number(tx.amount);
    const after = Number(tx.balanceAfter);
    const before = after + (incoming(tx) ? -amount : amount);
    let c = out[out.length - 1];
    if (!c || c.start !== start) {
      c = { start, o: before, h: before, l: before, c: before, vin: 0, vout: 0, count: 0 };
      out.push(c);
    }
    c.c = after;
    c.h = Math.max(c.h, after);
    c.l = Math.min(c.l, after);
    if (incoming(tx)) c.vin += amount; else c.vout += amount;
    c.count += 1;
  }
  return out.slice(-MAX_CANDLES);
}

const fmtTime = (t: number, ms: number, withDate = false) => {
  const d = new Date(t);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (ms >= 86_400_000) return date;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return withDate && d.toDateString() !== new Date().toDateString() ? `${date} ${time}` : time;
};

const compact = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : formatMoney(n);

export function BalanceCandles({ transactions }: { transactions: Transaction[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [frame, setFrame] = useState<Frame>('auto');
  const [hover, setHover] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-evaluate which candle is "live" as time passes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // Auto picks the finest frame that still shows the whole loaded history.
  const ms = useMemo(() => {
    if (frame !== 'auto') return FRAMES.find((f) => f.id === frame)!.ms;
    for (const f of FRAMES) {
      const buckets = new Set(transactions.map((tx) => Math.floor(new Date(tx.createdAt).getTime() / f.ms)));
      if (buckets.size <= MAX_CANDLES) return f.ms;
    }
    return FRAMES[FRAMES.length - 1].ms;
  }, [transactions, frame]);

  const candles = useMemo(() => buildCandles(transactions, ms), [transactions, ms]);

  const plotW = Math.max(120, width - AXIS);
  const priceBottom = H - VOL_H - TIME_H - 8;
  const slots = Math.max(candles.length, MIN_SLOTS);
  const slot = plotW / slots;
  const body = Math.max(3, Math.min(16, slot * 0.62));
  const xOf = (i: number) => plotW - (candles.length - i - 0.5) * slot;

  const { lo, hi, vmax } = useMemo(() => {
    if (!candles.length) return { lo: 0, hi: 1, vmax: 1 };
    const l = Math.min(...candles.map((c) => c.l));
    const h = Math.max(...candles.map((c) => c.h));
    const pad = (h - l) * 0.1 || Math.max(1, h * 0.02);
    return { lo: l >= 0 ? Math.max(0, l - pad) : l - pad, hi: h + pad, vmax: Math.max(...candles.map((c) => c.vin + c.vout), 1) };
  }, [candles]);
  const yOf = (p: number) => TOP + (1 - (p - lo) / (hi - lo)) * (priceBottom - TOP);

  const ma = useMemo(() => {
    const span = 5;
    return candles.map((_, i) => {
      if (i < span - 1) return null;
      let s = 0;
      for (let k = i - span + 1; k <= i; k++) s += candles[k].c;
      return s / span;
    });
  }, [candles]);

  if (!candles.length) {
    return (
      <div className="candles-card" ref={wrap}>
        <div className="candles-empty">Your balance chart appears after the first transaction.</div>
      </div>
    );
  }

  const last = candles[candles.length - 1];
  // Measure the change from the first non-zero balance, so an account that
  // started at $0 doesn't show a meaningless 0% / ∞%.
  const base = candles.find((c) => c.o > 0)?.o ?? candles.find((c) => c.c > 0)?.c ?? 0;
  const change = last.c - base;
  const pct = base ? (change / base) * 100 : 0;
  const liveIdx = now - last.start < ms ? candles.length - 1 : -1;
  const shown = hover !== null ? candles[hover] : last;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = Math.round(candles.length - 0.5 - (plotW - x) / slot);
    setHover(i >= 0 && i < candles.length && x <= plotW ? i : null);
  };

  const gridLines = [0, 1, 2, 3, 4].map((g) => hi - ((hi - lo) * g) / 4);
  const labelEvery = Math.max(1, Math.ceil(candles.length / Math.max(2, Math.floor(plotW / 90))));

  return (
    <div className="candles-card" ref={wrap}>
      <div className="candles-head">
        <div className="candles-quote">
          <span className="eyebrow">Balance · OHLC</span>
          <div className="candles-price">
            <span className="num">${formatMoney(shown.c)}</span>
            <span className={`delta ${change >= 0 ? 'up' : 'down'}`}>
              {change >= 0 ? '▲' : '▼'} <span className="num">{Math.abs(pct).toFixed(2)}%</span>
              <span className="num" style={{ opacity: 0.75 }}>{change >= 0 ? '+' : '−'}${compact(Math.abs(change))}</span>
            </span>
          </div>
          <div className="candles-ohlc num">
            <span>O <b>{compact(shown.o)}</b></span>
            <span>H <b>{compact(shown.h)}</b></span>
            <span>L <b>{compact(shown.l)}</b></span>
            <span>C <b className={shown.c >= shown.o ? 'up' : 'down'}>{compact(shown.c)}</b></span>
            <span className="faint">{shown.count} tx · {fmtTime(shown.start, ms, true)}</span>
          </div>
        </div>
        <div className="frames">
          {(['auto', ...FRAMES.map((f) => f.id)] as Frame[]).map((f) => (
            <button key={f} className={frame === f ? 'active' : ''} onClick={() => setFrame(f)}>
              {f === 'auto' ? `Auto${frame === 'auto' ? ` · ${FRAMES.find((x) => x.ms === ms)?.id}` : ''}` : f}
            </button>
          ))}
        </div>
      </div>

      <svg className="candles-svg" width={width} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <filter id="live-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {gridLines.map((p, i) => (
          <g key={i}>
            <line x1={0} x2={plotW} y1={Math.round(yOf(p)) + 0.5} y2={Math.round(yOf(p)) + 0.5} className="c-grid" />
            <text x={plotW + 10} y={yOf(p) + 4} className="c-axis">{compact(p)}</text>
          </g>
        ))}
        <line x1={0} x2={plotW} y1={H - TIME_H + 0.5} y2={H - TIME_H + 0.5} className="c-grid" />

        {hover !== null && (
          <g className="c-cross">
            <line x1={xOf(hover)} x2={xOf(hover)} y1={TOP - 8} y2={H - TIME_H} />
            <line x1={0} x2={plotW} y1={yOf(candles[hover].c)} y2={yOf(candles[hover].c)} />
          </g>
        )}

        {candles.map((c, i) => {
          const x = xOf(i);
          const vIn = (c.vin / vmax) * VOL_H;
          const vOut = (c.vout / vmax) * VOL_H;
          const base = H - TIME_H - 2;
          return (
            <g key={c.start} opacity={hover !== null && hover !== i ? 0.55 : 1}>
              <rect x={x - body / 2} y={base - vIn - vOut} width={body} height={vOut} className="c-vol-out" rx={1} />
              <rect x={x - body / 2} y={base - vIn} width={body} height={vIn} className="c-vol-in" rx={1} />
            </g>
          );
        })}

        <path
          className="c-ma"
          d={ma.map((v, i) => (v === null ? '' : `${ma[i - 1] == null ? 'M' : 'L'}${xOf(i)},${yOf(v)}`)).join(' ')}
        />

        {candles.map((c, i) => {
          const x = Math.round(xOf(i)) + 0.5;
          const upC = c.c >= c.o;
          const y1 = yOf(Math.max(c.o, c.c));
          const bh = Math.max(1.5, yOf(Math.min(c.o, c.c)) - y1);
          const cls = upC ? 'c-up' : 'c-down';
          return (
            <g key={c.start} className={`${cls} ${i === liveIdx ? 'c-live' : ''}`} opacity={hover !== null && hover !== i ? 0.55 : 1}>
              {i === liveIdx && <rect x={x - body / 2} y={y1} width={body} height={bh} filter="url(#live-glow)" className="c-glow" />}
              <line x1={x} x2={x} y1={yOf(c.h)} y2={yOf(c.l)} />
              <rect x={x - body / 2} y={y1} width={body} height={bh} rx={1.5} />
            </g>
          );
        })}

        <line x1={0} x2={plotW + 6} y1={yOf(last.c)} y2={yOf(last.c)} className={`c-last ${last.c >= last.o ? 'up' : 'down'}`} />
        <g transform={`translate(${plotW + 4}, ${yOf(last.c) - 10})`}>
          <rect width={AXIS - 8} height={20} rx={6} className={`c-tag ${last.c >= last.o ? 'up' : 'down'}`} />
          <text x={(AXIS - 8) / 2} y={14} textAnchor="middle" className="c-tag-text">{compact(last.c)}</text>
        </g>

        {candles.map((c, i) => (i % labelEvery === (candles.length - 1) % labelEvery ? (
          <text key={c.start} x={xOf(i)} y={H - 5} textAnchor="middle" className="c-axis">{fmtTime(c.start, ms)}</text>
        ) : null))}
      </svg>
    </div>
  );
}
