import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { Session } from '../App';
import { Avatar } from './Avatar';
import { Layers, Logo, Shield, Zap } from './Icons';

const DEMO_USERS = [1, 2, 3, 4, 5];

export function Login({ onSignIn }: { onSignIn: (s: Session) => void }) {
  const [username, setUsername] = useState('user1');
  const [password, setPassword] = useState('user1');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pick = (id: number) => {
    setUsername(`user${id}`);
    setPassword(`user${id}`);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      onSignIn(await api.login(username.trim(), password));
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <main className="login">
      <section className="login-hero fade-up">
        <div className="brand">
          <span className="brand-mark"><Logo size={18} /></span>
          Vault
        </div>
        <h1 className="serif">
          Money that moves<br />at the speed of <em>thought.</em>
        </h1>
        <p>Deposits, transfers and statements — atomic, idempotent and rate-limited under the hood, effortless on the surface.</p>
        <div className="feature-row">
          <span className="feature"><Shield size={15} /> Idempotent deposits</span>
          <span className="feature"><Zap size={15} /> Deadlock-safe transfers</span>
          <span className="feature"><Layers size={15} /> Streaming exports</span>
        </div>
        <div className="login-visual" style={{ paddingTop: 30, paddingLeft: 20 }}>
          <div className="floating-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="chip-gold" />
              <span className="brand" style={{ fontSize: 14 }}><Logo size={16} /> Vault</span>
            </div>
            <div>
              <div className="num" style={{ fontSize: 17, letterSpacing: '0.18em', color: 'var(--text-2)' }}>•••• •••• •••• 2026</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
                <span>DEMO HOLDER</span><span className="num">09/30</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel card fade-up" style={{ animationDelay: '0.12s' }}>
        <div>
          <div className="eyebrow">Welcome back</div>
          <h2 className="serif" style={{ marginTop: 8 }}>Sign in to your vault</h2>
        </div>

        <div className="field">
          <label>Demo accounts</label>
          <div className="demo-users">
            {DEMO_USERS.map((id) => (
              <button
                key={id}
                type="button"
                className={`demo-user ${username === `user${id}` ? 'active' : ''}`}
                onClick={() => pick(id)}
              >
                <Avatar userId={id} size={26} /> user{id}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="u">Username</label>
            <input id="u" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="p">Password</label>
            <input id="p" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <div className="error-banner" key={error}>{error}</div>}
          <button className="btn btn-primary btn-block" disabled={loading || !username || !password}>
            {loading ? <span className="spinner" /> : 'Continue'}
          </button>
        </form>

        <p className="faint" style={{ fontSize: 12.5, textAlign: 'center' }}>
          Demo auth — the password is the same as the username.
        </p>
      </section>
    </main>
  );
}
