// Re-exported so router.ts can pull it from this module's own middleware.ts
// (same convention as modules/deposits/middleware.ts) instead of reaching
// into core/ directly.
export { authGuard } from '../../core/auth.middleware';
