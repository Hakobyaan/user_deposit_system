import { MiddlewareHandler } from '../types/module';
import { BadRequest } from '../utils/errors';
import redis from '../services/redis';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS } from '../utils/variables';
import { trace } from '../utils/trace';


export const depositRateLimiter: MiddlewareHandler = async (req, res, next) => {
  const userId = req.body?.userId;
  if (!userId) return next(new BadRequest('userId is required'));

  const windowBucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `ratelimit:deposit:${userId}:${windowBucket}`;

  const count = await redis.incrWithWindow(key, RATE_LIMIT_WINDOW_SECONDS);
  if (count > RATE_LIMIT_MAX) {
    trace('warn', 'ratelimit.blocked', `user${userId}: deposit #${count} in this ${RATE_LIMIT_WINDOW_SECONDS}s window (max ${RATE_LIMIT_MAX}) → 429`, {
      users: [Number(userId)], data: { count }
    });
    res.status(429).json({
      ok: false, status: 429, message: 'Too many deposit requests — try again in a minute'
    });
    return;
  }

  next();
};
