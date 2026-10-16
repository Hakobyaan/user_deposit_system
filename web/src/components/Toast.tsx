import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Alert, Check } from './Icons';

type Kind = 'success' | 'error';
interface ToastItem { id: number; kind: Kind; text: string }

const ToastCtx = createContext<(kind: Kind, text: string) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, kind, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="t-ico">{t.kind === 'success' ? <Check size={16} /> : <Alert size={16} />}</span>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
