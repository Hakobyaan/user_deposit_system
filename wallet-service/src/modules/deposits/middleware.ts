// Route-specific middleware for POST /deposit. Both implementations are
// generic and Redis-backed, so they live in core/ (rate limiting and
// idempotency aren't unique to deposits), but they're re-exported here so
// router.ts can import them from this module's own middleware.ts instead of
// reaching into core/ directly.
export { depositRateLimiter } from '../../core/rateLimiter.middleware';
export { idempotencyGuard, saveIdempotentResult, releaseIdempotencyClaim } from '../../core/idempotency.middleware';
