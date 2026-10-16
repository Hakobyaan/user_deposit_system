import { useState } from 'react';
import { Ambient } from './components/Ambient';
import { ToastProvider } from './components/Toast';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Ticker } from './components/Ticker';

export interface Session { token: string; userId: number }

const KEY = 'vault.session';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  const signIn = (s: Session) => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
    setSession(s);
  };
  const signOut = () => {
    try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    setSession(null);
  };

  return (
    <ToastProvider>
      <Ambient />
      {session && <Ticker />}
      {session
        ? <Dashboard key={session.userId} session={session} onSignOut={signOut} />
        : <Login onSignIn={signIn} />}
    </ToastProvider>
  );
}
