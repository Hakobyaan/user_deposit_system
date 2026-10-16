import { useEffect, useState } from 'react';

// Mock market strip — purely decorative, prices are a random walk.

interface Quote { symbol: string; price: number; open: number; dir: 0 | 1 | -1 }

const SEED: [string, number][] = [
  ['VLT/USD', 1284.5], ['BTC/USD', 64210], ['ETH/USD', 3120.4], ['SOL/USD', 148.2],
  ['EUR/USD', 1.0842], ['GBP/USD', 1.2715], ['AMD/USD', 0.0026], ['XAU/USD', 2381.6],
  ['NDX', 18342.1], ['SPX', 5288.3], ['TON/USD', 6.84], ['USDT/USD', 1.0001],
];

const decimals = (p: number) => (p < 0.1 ? 4 : p < 10 ? 4 : p < 1000 ? 2 : 1);

export function Ticker() {
  const [quotes, setQuotes] = useState<Quote[]>(() =>
    SEED.map(([symbol, price]) => ({ symbol, price, open: price * (1 + (Math.random() - 0.5) * 0.03), dir: 0 })));

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      setQuotes((qs) => qs.map((q) => {
        if (Math.random() < 0.55) return { ...q, dir: 0 };
        const next = q.price * (1 + (Math.random() - 0.5) * 0.004);
        return { ...q, price: next, dir: next >= q.price ? 1 : -1 };
      }));
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const row = quotes.map((q) => {
    const change = ((q.price - q.open) / q.open) * 100;
    return (
      <span key={q.symbol} className={`tick ${q.dir === 1 ? 'flash-up' : q.dir === -1 ? 'flash-down' : ''}`}>
        <b>{q.symbol}</b>
        <span className="num">{q.price.toFixed(decimals(q.price))}</span>
        <span className={`num ${change >= 0 ? 'up' : 'down'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%</span>
      </span>
    );
  });

  return (
    <div className="ticker" aria-hidden>
      <span className="ticker-label"><span className="live-dot" /> Markets · demo</span>
      <div className="ticker-track">
        <div className="ticker-run"><span className="ticker-set">{row}</span><span className="ticker-set">{row}</span></div>
      </div>
    </div>
  );
}
