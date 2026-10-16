import { MiddlewareHandler } from '../types/module';
import { BadRequest } from '../utils/errors';
import redis from '../services/redis';
import { IDEMPOTENCY_LOCK_TTL_SECONDS, IDEMPOTENCY_RESULT_TTL_SECONDS } from '../utils/variables';
import { trace } from '../utils/trace';

interface IdempotencyRecord {
  processing: boolean;
  status?: number;
  body?: unknown;
}

const cacheKeyFor = (key: string) => `idempotency:${key}`;


export const idempotencyGuard: MiddlewareHandler = async (req, res, next) => {
  const key = req.headers['idempotency-key'];
  const users = Number(req.body?.userId) ? [Number(req.body.userId)] : undefined;
  if (!key || typeof key !== 'string') {
    trace('warn', 'idempotency.missing', 'Rejected: Idempotency-Key header is missing', { users });
    return next(new BadRequest('Idempotency-Key header is required'));
  }

  const cacheKey = cacheKeyFor(key);
  const existing = await redis.get<IdempotencyRecord>(cacheKey);
  if (existing) {
    if (existing.processing) {
      trace('warn', 'idempotency.in-flight', `Key ${key} is still being processed → 409`, { users, data: { key } });
      res.status(409).json({
        ok: false, status: 409, message: 'A request with this Idempotency-Key is still being processed'
      });
      return;
    }
    trace('info', 'idempotency.replay', `Key ${key} already completed → replaying stored ${existing.status ?? 200} response, no new write`, { users, data: { key } });
    res.status(existing.status ?? 200).json(existing.body);
    return;
  }

  const claimed = await redis.setNXWithTTL(
    cacheKey,
    JSON.stringify({
      processing: true
    }),
    IDEMPOTENCY_LOCK_TTL_SECONDS
  );
  if (!claimed) {
    trace('warn', 'idempotency.in-flight', `Key ${key} lost the SET NX race → 409`, { users, data: { key } });
    res.status(409).json({
      ok: false, status: 409, message: 'A request with this Idempotency-Key is still being processed'
    });
    return;
  }

  trace('info', 'idempotency.claim', `Claimed key ${key} (SET NX)`, { users, data: { key } });
  req.idempotencyKey = cacheKey;
  next();
};

export async function saveIdempotentResult(cacheKey: string, status: number, body: unknown): Promise<void> {
  await redis.setWithTTL(cacheKey, {
    processing: false, status, body
  }, IDEMPOTENCY_RESULT_TTL_SECONDS);
  trace('info', 'idempotency.save', `Stored ${status} response for ${cacheKey.replace('idempotency:', 'key ')}`);
}

export async function releaseIdempotencyClaim(cacheKey: string): Promise<void> {
  await redis.delete(cacheKey);
  trace('warn', 'idempotency.release', `Released ${cacheKey.replace('idempotency:', 'key ')} after failure — safe to retry`);
}
