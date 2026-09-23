// No route-specific middleware for /transactions — both endpoints are
// read-only GETs with no rate limiting or idempotency requirement. This
// file exists only so every modules/* folder has the same five files.
export {};
