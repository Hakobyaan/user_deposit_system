import { MiddlewareHandler } from '../types/module';
import { Unauthorized } from '../utils/errors';
import { verifyToken } from '../utils/jwt';

// Verifies the Bearer token issued by POST /auth/login and attaches the
// authenticated userId to the request. Routes that need to know "who is
// calling" (viewing your own balance, transferring from your own account)
// trust req.authUserId instead of a userId the caller could put in the body.
// Swagger UI's "Authorize" dialog for an http/bearer scheme always prepends
// "Bearer " itself, so if the token pasted in there already had one (e.g.
// copied from a curl example), the header ends up "Bearer Bearer <token>".
// Stripping every leading "Bearer " (any casing/spacing, repeated) makes
// the guard tolerant of that instead of failing with a confusing
// "invalid signature" error.
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
    next(new Unauthorized('Missing Authorization header'));
    return;
  }

  try {
    const { userId } = verifyToken(token);
    req.authUserId = userId;
    next();
  } catch {
    next(new Unauthorized('Invalid or expired token'));
  }
};
