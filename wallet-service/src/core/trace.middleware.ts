import type { NextFunction } from 'express';
import { MutatedRequest, MutatedResponse } from '../types/module';
import { runWithTrace, trace } from '../utils/trace';

const header = (value: string | string[] | undefined) =>
  (typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : null);

export const traceContext = (req: MutatedRequest, res: MutatedResponse, next: NextFunction): void => {
  const ctx = {
    traceId: header(req.headers['x-trace-id']),
    fault:   header(req.headers['x-fault']),
  };

  if (req.method !== 'GET' && !req.path.startsWith('/events')) {
    const started = Date.now();
    res.once('finish', () => runWithTrace(ctx, () => {
      const userId = req.authUserId ?? Number(req.body?.userId || 0);
      const status = res.statusCode;
      trace(
        status >= 500 ? 'error' : status >= 400 ? 'warn' : 'success',
        'http',
        `${req.method} ${req.originalUrl} → ${status} (${Date.now() - started}ms)`,
        { users: userId ? [userId] : undefined, data: { status } }
      );
    }));
  }

  runWithTrace(ctx, next);
};
