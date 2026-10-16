import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 20, ...rest }: P) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...rest,
});

export const Logo = (p: P) => <svg {...base(p)} strokeWidth={2.6}><path d="M6 6.5l6 11 6-11" /></svg>;
export const Plus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const Send = (p: P) => <svg {...base(p)}><path d="M7 17L17 7M9 7h8v8" /></svg>;
export const ArrowDownLeft = (p: P) => <svg {...base(p)}><path d="M17 7L7 17M15 17H7V9" /></svg>;
export const Download = (p: P) => <svg {...base(p)}><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" /></svg>;
export const FileText = (p: P) => <svg {...base(p)}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>;
export const LogOut = (p: P) => <svg {...base(p)}><path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 01-2-2V6a2 2 0 012-2h6" /></svg>;
export const Refresh = (p: P) => <svg {...base(p)}><path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" /></svg>;
export const X = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const Check = (p: P) => <svg {...base(p)} strokeWidth={2.4}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const Alert = (p: P) => <svg {...base(p)}><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>;
export const Shield = (p: P) => <svg {...base(p)}><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>;
export const Zap = (p: P) => <svg {...base(p)}><path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" /></svg>;
export const Layers = (p: P) => <svg {...base(p)}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>;
export const ChevronRight = (p: P) => <svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>;
export const TrendUp = (p: P) => <svg {...base(p)}><path d="M4 16l6-6 4 4 6-6M14 8h6v6" /></svg>;
export const TrendDown = (p: P) => <svg {...base(p)}><path d="M4 8l6 6 4-4 6 6M14 16h6v-6" /></svg>;
export const Wallet = (p: P) => <svg {...base(p)}><path d="M19 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-3" /><path d="M21 9h-6a3 3 0 000 6h6V9z" /></svg>;
