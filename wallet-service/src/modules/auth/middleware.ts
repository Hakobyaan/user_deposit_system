// POST /auth/login is itself public (that's the point), so this module has
// no route-specific middleware of its own. authGuard (used by other
// modules to protect routes with the token this module issues) lives in
// core/auth.middleware.ts.
export {};
