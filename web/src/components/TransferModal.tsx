import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { formatMoney } from '../format';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { Check } from './Icons';

interface Props {
  token: string;
  userId: number;
  balance: number;
  initialTo?: number;
  onClose: () => void;
  onDone: (result: { transactionId: number; amount: number; toUserId: number; fromBalance: string }) => void;
}

export const CONTACTS = [1, 2, 3, 4, 5];

export function TransferModal({ token, userId, balance, initialTo, onClose, onDone }: Props) {
  const others = CONTACTS.filter((id) => id !== userId);
  const [to, setTo] = useState<number>(initialTo ?? others[0]);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const value = Number(amount);
  const valid = value > 0 && Number.isFinite(value) && to !== userId;
  const tooMuch = value > balance;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const amt = Math.round(value * 100) / 100;
      const res = await api.transfer(token, to, amt);
      setDone(amt);
      onDone({ transactionId: res.transactionId, amount: amt, toUserId: to, fromBalance: res.fromBalance });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (done !== null) {
    return (
      <Modal eyebrow="Transfer" title="Sent" onClose={onClose}>
        <div className="success">
          <span className="check"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
          <div className="serif" style={{ fontSize: 44, lineHeight: 1 }}>${formatMoney(done)}</div>
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            is now with <Avatar userId={to} size={24} /> <b style={{ color: 'var(--text)', fontWeight: 500 }}>user{to}</b>
          </p>
        </div>
        <button className="btn btn-primary btn-block" onClick={onClose}><Check size={18} /> Done</button>
      </Modal>
    );
  }

  return (
    <Modal eyebrow="Transfer" title="Send money" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="field">
          <label>To</label>
          <div className="recipients">
            {others.map((id) => (
              <button type="button" key={id} className={`recipient ${to === id ? 'active' : ''}`} onClick={() => setTo(id)}>
                <Avatar userId={id} size={40} />
                user{id}
              </button>
            ))}
          </div>
        </div>
        <label className="amount-input">
          <span>$</span>
          <input
            autoFocus inputMode="decimal" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
          />
        </label>
        <div className="meta-row">
          <span>Available</span>
          <button type="button" className="num" style={{ color: tooMuch ? 'var(--out)' : 'var(--text-2)' }} onClick={() => setAmount(String(balance))}>
            ${formatMoney(balance)} · use max
          </button>
        </div>
        {error && <div className="error-banner" key={error}>{error}</div>}
        <button className="btn btn-primary btn-block" disabled={!valid || loading}>
          {loading ? <span className="spinner" /> : valid ? `Send $${formatMoney(value)} to user${to}` : 'Enter an amount'}
        </button>
      </form>
    </Modal>
  );
}
