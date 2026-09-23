import jwt from 'jsonwebtoken';

const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET ?? 'dev-only-demo-secret';
const TOKEN_TTL = '1h';

export interface AuthTokenPayload {
  userId: number;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, AUTH_JWT_SECRET, {
    expiresIn: TOKEN_TTL
  });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, AUTH_JWT_SECRET) as AuthTokenPayload;
}
