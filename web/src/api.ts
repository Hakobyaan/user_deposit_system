export type TxType = 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out';

export interface Transaction {
  id: number;
  userId: number;
  amount: string;
  type: TxType;
  balanceAfter: string;
  createdAt: string;
}

export interface History {
  total: number;
  page: number;
  limit: number;
  transactions: Transaction[];
}

export interface ReportStatus {
  reportId: string;
  status: 'processing' | 'done' | 'error';
  message?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = '/api';

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach wallet-service. Is it running on :3000?');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || body?.ok === false) {
    const message = body?.message ?? (res.status === 429 ? 'Too many requests — slow down a little.' : `Request failed (${res.status})`);
    throw new ApiError(res.status, message);
  }
  return body?.data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; userId: number }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),

  me: (token: string) => request<{ userId: number; balance: string }>('/accounts/me', {}, token),

  history: (userId: number, page = 1, limit = 20) =>
    request<History>(`/transactions/${userId}?page=${page}&limit=${limit}`),

  deposit: (userId: number, amount: number, idempotencyKey: string) =>
    request<{ transactionId: number; userId: number; amount: number; balance: string }>('/deposit', {
      method:  'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body:    JSON.stringify({ userId, amount }),
    }),

  transfer: (token: string, toUserId: number, amount: number) =>
    request<{ transactionId: number; fromBalance: string; toBalance: string }>('/transfer', {
      method: 'POST', body: JSON.stringify({ toUserId, amount }),
    }, token),

  generateReport: (userId: number) =>
    request<{ reportId: string }>('/reports/generate', {
      method: 'POST', body: JSON.stringify({ userId }),
    }),

  reportStatus: (reportId: string) => request<ReportStatus>(`/reports/${reportId}/status`),

  exportUrl:   (userId: number) => `${BASE}/transactions/${userId}/export`,
  downloadUrl: (reportId: string) => `${BASE}/reports/${reportId}/download`,
};

export type TraceLevel = 'info' | 'success' | 'warn' | 'error';

export interface TraceEvent {
  id: number;
  ts: string;
  traceId: string | null;
  pid: number;
  level: TraceLevel;
  kind: string;
  message: string;
  users?: number[];
  data?: Record<string, unknown>;
}

export const eventsApi = {
  list: (after = 0, traceId?: string) =>
    request<{ faultInjection: boolean; events: TraceEvent[] }>(
      `/events?after=${after}${traceId ? `&traceId=${encodeURIComponent(traceId)}` : ''}`,
    ),
  clear: () => request<{ cleared: boolean }>('/events', { method: 'DELETE' }),
};
