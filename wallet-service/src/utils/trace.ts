import { AsyncLocalStorage } from 'node:async_hooks';
import redis from '../services/redis';
import logger from './logger';
import { AppError } from './errors';
import { EVENT_LOG_MAX, FAULT_INJECTION } from './variables';

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

interface TraceContext {
  traceId: string | null;
  fault: string | null;
}

const EVENTS_KEY = 'events:log';
const EVENTS_SEQ_KEY = 'events:seq';

const storage = new AsyncLocalStorage<TraceContext>();

export const runWithTrace = <T>(ctx: TraceContext, fn: () => T): T => storage.run(ctx, fn);

export const currentTraceId = (): string | null => storage.getStore()?.traceId ?? null;

// Stored in Redis, not in memory: every cluster worker writes to the same
// list, so the UI sees one timeline no matter which worker served a request.
export function trace(
  level: TraceLevel,
  kind: string,
  message: string,
  extra: { users?: number[]; data?: Record<string, unknown> } = {}
): void {
  (async () => {
    const id = await redis.client.incr(EVENTS_SEQ_KEY);
    const event: TraceEvent = {
      id,
      ts:      new Date().toISOString(),
      traceId: currentTraceId(),
      pid:     process.pid,
      level,
      kind,
      message,
      ...extra,
    };
    await redis.client.multi()
      .lPush(EVENTS_KEY, JSON.stringify(event))
      .lTrim(EVENTS_KEY, 0, EVENT_LOG_MAX - 1)
      .exec();
  })().catch((err) => logger.error('Failed to write trace event', err));
}

export async function readEvents(after: number, traceId?: string, limit = 300): Promise<TraceEvent[]> {
  const raw = await redis.client.lRange(EVENTS_KEY, 0, EVENT_LOG_MAX - 1);
  const events: TraceEvent[] = [];
  for (const item of raw) {
    const event = JSON.parse(item) as TraceEvent;
    if (event.id <= after) continue;
    if (traceId && event.traceId !== traceId) continue;
    events.push(event);
  }
  return events.sort((a, b) => a.id - b.id).slice(-limit);
}

export async function clearEvents(): Promise<void> {
  await redis.client.del(EVENTS_KEY);
}

export class FaultInjected extends AppError {
  public status: number = 500;
  public name: string = 'FAULT_INJECTED';
}

/**
 * Throws when the current request asked (via the X-Fault header) to fail at
 * `point`. Only active with FAULT_INJECTION=true, so production traffic can
 * never trigger it.
 */
export function faultPoint(point: string): void {
  if (!FAULT_INJECTION) return;
  if (storage.getStore()?.fault !== point) return;
  trace('error', 'fault.injected', `Injected fault at "${point}"`);
  throw new FaultInjected(`Injected fault at "${point}"`);
}
