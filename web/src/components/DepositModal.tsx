import { useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { formatMoney, newIdempotencyKey } from '../format';
import { Modal } from './Modal';
import { Check, Shield } from './Icons';

const PRESETS = [50, 100, 250, 500, 1000];

interface Props {
  userId: number;
  onClose: () => void;
  onDone: (result: { transactionId: number; amount: number; balance: string }) => void;
}

export function DepositModal({ userId, onClose, onDone }: Props) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  // One key per modal opening: a retry after a network blip replays the
  // server-cached result instead of depositing twice.
  const key = useMemo(newIdempotencyKey, []);

  const value = Number(amount);
  const valid = value > 0 && Number.isFinite(value);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.deposit(userId, Math.round(value * 100) / 100, key);
      setDone(value);
      onDone({ transactionId: res.transactionId, amount: res.amount, balance: String(res.balance) });
    } catch (err) {
      const e2 = err as ApiError;
      setError(e2.status === 429 ? 'Rate limit hit — max 10 deposits per minute. Take a breath and try again shortly.' : e2.message);
    } finally {
      setLoading(false);
    }
  };

  if (done !== null) {
    return (
      <Modal eyebrow="Deposit" title="All set" onClose={onClose}>
        <div className="success">
          <span className="check"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
          <div className="serif" style={{ fontSize: 44, lineHeight: 1 }}>+${formatMoney(done)}</div>
          <p className="muted">landed in your vault. A confirmation email is on its way.</p>
        </div>
        <button className="btn btn-primary btn-block" onClick={onClose}><Check size={18} /> Done</button>
      </Modal>
    );
  }

  return (
    <Modal eyebrow="Deposit" title="Add money" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <label className="amount-input">
          <span>$</span>
          <input
            autoFocus inputMode="decimal" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
          />
        </label>
        <div className="presets">
          {PRESETS.map((p) => (
            <button type="button" key={p} className={`chip ${value === p ? 'active' : ''}`} onClick={() => setAmount(String(p))}>
              ${p.toLocaleString()}
            </button>
          ))}
        </div>
        {error && <div className="error-banner" key={error}>{error}</div>}
        <button className="btn btn-primary btn-block" disabled={!valid || loading}>
          {loading ? <span className="spinner" /> : valid ? `Deposit $${formatMoney(value)}` : 'Enter an amount'}
        </button>
        <div className="meta-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Shield size={14} /> Idempotency key</span>
          <code title={key}>{key.slice(0, 18)}…</code>
        </div>
      </form>
    </Modal>
  );
}
