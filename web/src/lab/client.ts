import { eventsApi, type TraceEvent } from '../api';
import { newIdempotencyKey } from '../format';

// The lab talks to the API directly instead of going through api.ts, because
// a scenario needs the raw status code of every response (409 vs 201 vs 500),
// not just "it threw".

export interface RawResponse<T = any> {
  status: number;
  ok: boolean;
  data: T;
  message?: string;
  ms: number;
}

interface CallOptions {
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  traceId?: string;
  fault?: string;
}

export async function call<T = any>(method: string, path: string, opts: CallOptions = {}): Promise<RawResponse<T>> {
  const headers = new Headers(opts.headers);
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`);
  if (opts.traceId) headers.set('X-Trace-Id', opts.traceId);
  if (opts.fault) headers.set('X-Fault', opts.fault);

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    return { status: 0, ok: false, data: null as T, message: 'Network error — is wallet-service running?', ms: 0 };
  }
  const body = await res.json().catch(() => null);
  return {
    status:  res.status,
    ok:      res.ok && body?.ok !== false,
    data:    body?.data as T,
    message: body?.message,
    ms:      Math.round(performance.now() - started),
  };
}

const tokens = new Map<number, string>();

export async function tokenFor(userId: number): Promise<string> {
  const cached = tokens.get(userId);
  if (cached) return cached;
  const res = await call<{ token: string }>('POST', '/auth/login', {
    body: { username: `user${userId}`, password: `user${userId}` },
  });
  if (!res.ok) throw new Error(`Cannot sign in as user${userId}: ${res.message ?? res.status}`);
  tokens.set(userId, res.data.token);
  return res.data.token;
}

export async function balanceOf(userId: number): Promise<number> {
  const res = await call<{ balance: string }>('GET', '/accounts/me', { token: await tokenFor(userId) });
  if (res.status === 401) {
    tokens.delete(userId);
    return balanceOf(userId);
  }
  if (!res.ok) throw new Error(`Cannot read balance of user${userId}: ${res.message ?? res.status}`);
  return Number(res.data.balance);
}

export interface DepositResult { transactionId: number; balance: string }
export interface TransferResult { transactionId: number; fromBalance: string; toBalance: string }

export const deposit = (userId: number, amount: number, opts: { key?: string | null; traceId?: string; fault?: string } = {}) =>
  call<DepositResult>('POST', '/deposit', {
    body:    { userId, amount },
    headers: opts.key === null ? {} : { 'Idempotency-Key': opts.key ?? newIdempotencyKey() },
    traceId: opts.traceId,
    fault:   opts.fault,
  });

export const transfer = async (
  fromUserId: number,
  toUserId: number,
  amount: number,
  opts: { traceId?: string; fault?: string; token?: string | null } = {},
) =>
  call<TransferResult>('POST', '/transfer', {
    body:    { toUserId, amount },
    token:   opts.token === undefined ? await tokenFor(fromUserId) : opts.token,
    traceId: opts.traceId,
    fault:   opts.fault,
  });

// Trace events are written fire-and-forget on the server, so give them a
// moment to land before reading a request's trace back.
export async function traceOf(traceId: string): Promise<TraceEvent[]> {
  await new Promise((r) => setTimeout(r, 350));
  return (await eventsApi.list(0, traceId)).events;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
