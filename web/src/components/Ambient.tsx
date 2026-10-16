import { CandleBackdrop } from './CandleBackdrop';

export function Ambient() {
  return (
    <div className="ambient" aria-hidden>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="grid" />
      <CandleBackdrop />
      <div className="grain" />
    </div>
  );
}
