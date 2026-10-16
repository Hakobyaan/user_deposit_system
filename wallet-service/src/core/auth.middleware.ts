import { MiddlewareHandler } from '../types/module';
import { Unauthorized } from '../utils/errors';
import { verifyToken } from '../utils/jwt';
import { trace } from '../utils/trace';


function extractToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  let token = header.trim();
  while (/^Bearer\s+/i.test(token)) {
    token = token.replace(/^Bearer\s+/i, '');
  }
  return token || undefined;
}

export const authGuard: MiddlewareHandler = async (req, _res, next) => {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    trace('warn', 'auth.rejected', `${req.method} ${req.originalUrl}: missing Authorization header → 401`);
    next(new Unauthorized('Missing Authorization header'));
    return;
  }

  try {
    const { userId } = verifyToken(token);
    req.authUserId = userId;
    next();
  } catch {
    trace('warn', 'auth.rejected', `${req.method} ${req.originalUrl}: invalid or expired token → 401`);
    next(new Unauthorized('Invalid or expired token'));
  }
};
