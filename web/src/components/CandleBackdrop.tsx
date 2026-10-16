import { useEffect, useRef } from 'react';

// Decorative live candlestick chart behind the page. All data is mock — a
// mean-reverting random walk — and nothing here touches the API.

interface Candle { o: number; h: number; l: number; c: number; v: number }

const STEP = 22;          // px per candle, including the gap
const BODY = 12;          // candle body width
const PERIOD = 2600;      // ms before a new candle opens
const TICK = 90;          // ms between live price ticks
const RIGHT_PAD = 96;     // room for the last-price tag
const BASE = 1284.5;

const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function nextPrice(p: number) {
  const revert = (BASE - p) * 0.004;
  return Math.max(1, p + revert + gauss() * 0.9);
}

function seed(count: number): Candle[] {
  const out: Candle[] = [];
  let p = BASE + gauss() * 20;
  for (let i = 0; i < count; i++) {
    const o = p;
    let h = o, l = o;
    for (let k = 0; k < 24; k++) {
      p = nextPrice(p);
      h = Math.max(h, p);
      l = Math.min(l, p);
    }
    out.push({ o, h, l, c: p, v: 0.3 + Math.random() * 0.7 });
  }
  return out;
}

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export function CandleBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const up = css('--in', '#7cf5b4');
    const down = css('--out', '#ff8f7a');
    const accent = css('--accent', '#d4ff4f');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const capacity = () => Math.ceil(w / STEP) + 4;
    const candles = seed(capacity());
    let price = candles[candles.length - 1].c;
    let opened = performance.now();
    let lastTick = opened;
    let lo = 0, hi = 0;
    let raf = 0;

    const openCandle = () => {
      candles.push({ o: price, h: price, l: price, c: price, v: 0.2 });
      while (candles.length > capacity()) candles.shift();
    };

    const draw = (now: number) => {
      if (!still) {
        // Tab was hidden for a while — don't fast-forward dozens of candles.
        if (now - opened > PERIOD * 4) opened = now - PERIOD;
        while (now - opened >= PERIOD) {
          opened += PERIOD;
          openCandle();
        }
        while (now - lastTick >= TICK) {
          lastTick += TICK;
          price = nextPrice(price);
          const live = candles[candles.length - 1];
          live.c = price;
          live.h = Math.max(live.h, price);
          live.l = Math.min(live.l, price);
          live.v = Math.min(1, live.v + Math.random() * 0.03);
        }
      }

      const progress = still ? 0 : Math.min(1, (now - opened) / PERIOD);
      const n = candles.length;
      const xOf = (i: number) => w - RIGHT_PAD - (n - 1 - i) * STEP - progress * STEP;

      const visible = candles.filter((_, i) => xOf(i) > -STEP);
      const tMin = Math.min(...visible.map((c) => c.l));
      const tMax = Math.max(...visible.map((c) => c.h));
      const pad = (tMax - tMin) * 0.12 || 1;
      // Ease the scale instead of snapping, so the chart "breathes".
      if (!hi || still) { lo = tMin - pad; hi = tMax + pad; }
      lo += (tMin - pad - lo) * 0.06;
      hi += (tMax + pad - hi) * 0.06;

      const top = h * 0.14;
      const bottom = h * 0.78;
      const yOf = (p: number) => bottom - ((p - lo) / (hi - lo)) * (bottom - top);

      ctx.clearRect(0, 0, w, h);

      // price grid
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      ctx.font = '10.5px "Geist Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let g = 0; g <= 4; g++) {
        const y = Math.round(top + ((bottom - top) * g) / 4) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        const p = hi - ((hi - lo) * g) / 4;
        ctx.fillText(p.toFixed(2), w - RIGHT_PAD + 22, y - 5);
      }

      // volume
      for (let i = 0; i < n; i++) {
        const c = candles[i];
        const x = xOf(i);
        const vh = c.v * h * 0.1;
        ctx.fillStyle = c.c >= c.o ? 'rgba(124,245,180,0.1)' : 'rgba(255,143,122,0.1)';
        ctx.fillRect(x - BODY / 2, h * 0.92 - vh, BODY, vh);
      }

      // candles
      for (let i = 0; i < n; i++) {
        const c = candles[i];
        const x = xOf(i);
        const color = c.c >= c.o ? up : down;
        const isLive = i === n - 1;
        ctx.globalAlpha = isLive ? 1 : 0.85;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, yOf(c.h));
        ctx.lineTo(Math.round(x) + 0.5, yOf(c.l));
        ctx.stroke();
        const y1 = yOf(Math.max(c.o, c.c));
        const bh = Math.max(1.5, yOf(Math.min(c.o, c.c)) - y1);
        ctx.fillStyle = color;
        if (isLive) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 18;
        }
        ctx.fillRect(Math.round(x - BODY / 2), y1, BODY, bh);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // moving average
      const span = 9;
      ctx.beginPath();
      let started = false;
      for (let i = span - 1; i < n; i++) {
        let s = 0;
        for (let k = i - span + 1; k <= i; k++) s += candles[k].c;
        const x = xOf(i), y = yOf(s / span);
        if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
      }
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // last price line + tag
      const live = candles[n - 1];
      const ly = yOf(live.c);
      const tagColor = live.c >= live.o ? up : down;
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = tagColor;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(ly) + 0.5);
      ctx.lineTo(w - RIGHT_PAD + 16, Math.round(ly) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const label = live.c.toFixed(2);
      ctx.font = '600 11.5px "Geist Mono", ui-monospace, monospace';
      const tw = ctx.measureText(label).width + 14;
      ctx.fillStyle = tagColor;
      ctx.beginPath();
      ctx.roundRect(w - RIGHT_PAD + 16, ly - 10, tw, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#07080b';
      ctx.fillText(label, w - RIGHT_PAD + 23, ly + 4);

      if (!still) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="candles" />;
}
