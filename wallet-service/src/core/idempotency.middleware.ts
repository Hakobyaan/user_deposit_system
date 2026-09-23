import { MiddlewareHandler } from '../types/module';
import { BadRequest } from '../utils/errors';
import redis from '../services/redis';
import { IDEMPOTENCY_LOCK_TTL_SECONDS, IDEMPOTENCY_RESULT_TTL_SECONDS } from '../utils/variables';

interface IdempotencyRecord {
  processing: boolean;
  status?: number;
  body?: unknown;
}

const cacheKeyFor = (key: string) => `idempotency:${key}`;

/**
 * Requires an Idempotency-Key header. A request replayed with the same key
 * either short-circuits with the cached result of the first attempt (no
 * duplicate deposit is ever performed) or, if the first attempt is still
 * in-flight, gets a 409 rather than racing it.
 *
 * The route handler is responsible for calling `finalizeIdempotentResponse`
 * once it knows the real outcome — this middleware only claims the key.
 */
export const idempotencyGuard: MiddlewareHandler = async (req, res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') {
    return next(new BadRequest('Idempotency-Key header is required'));
  }

  const cacheKey = cacheKeyFor(key);
  const existing = await redis.get<IdempotencyRecord>(cacheKey);
  if (existing) {
    if (existing.processing) {
      res.status(409).json({
        ok: false, status: 409, message: 'A request with this Idempotency-Key is still being processed'
      });
      return;
    }
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
    // Lost the race to another concurrent request with the same key —
    // replay whatever it ends up producing instead of double-processing.
    res.status(409).json({
      ok: false, status: 409, message: 'A request with this Idempotency-Key is still being processed'
    });
    return;
  }

  req.idempotencyKey = cacheKey;
  next();
};

/** Called by the handler once the deposit has actually committed. */
export async function saveIdempotentResult(cacheKey: string, status: number, body: unknown): Promise<void> {
  await redis.setWithTTL(cacheKey, {
    processing: false, status, body
  }, IDEMPOTENCY_RESULT_TTL_SECONDS);
}

/** Called by the handler if the deposit failed, so the same key can be retried cleanly. */
export async function releaseIdempotencyClaim(cacheKey: string): Promise<void> {
  await redis.delete(cacheKey);
}
