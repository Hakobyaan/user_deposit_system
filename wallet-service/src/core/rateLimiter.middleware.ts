import { MiddlewareHandler } from '../types/module';
import { BadRequest } from '../utils/errors';
import redis from '../services/redis';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS } from '../utils/variables';

/**
 * Fixed-window limiter: max RATE_LIMIT_MAX deposit requests per user per
 * RATE_LIMIT_WINDOW_SECONDS. INCR + EXPIRE is atomic per Redis command, and
 * EXPIRE is only (re)armed on the first hit of a window, so a crash between
 * the two calls can't leave a key stuck without a TTL.
 */
export const depositRateLimiter: MiddlewareHandler = async (req, res, next) => {
  const userId = req.body?.userId;
  if (!userId) return next(new BadRequest('userId is required'));

  const windowBucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `ratelimit:deposit:${userId}:${windowBucket}`;

  const count = await redis.incrWithWindow(key, RATE_LIMIT_WINDOW_SECONDS);
  if (count > RATE_LIMIT_MAX) {
    res.status(429).json({
      ok: false, status: 429, message: 'Too many deposit requests — try again in a minute'
    });
    return;
  }

  next();
};
