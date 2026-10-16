import { useEffect, type ReactNode } from 'react';
import { X } from './Icons';

interface Props {
  eyebrow: string;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ eyebrow, title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h3 className="serif" style={{ marginTop: 6 }}>{title}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
