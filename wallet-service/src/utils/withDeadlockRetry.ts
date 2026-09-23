import logger from './logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Postgres detects deadlocks itself and aborts one of the two transactions
 * with error code 40P01 — it never hangs forever. Two deposits that lock
 * two accounts in opposite order can trigger this, so the aborted side is
 * simply retried a few times with a small backoff rather than surfaced to
 * the caller as a failure.
 */
export async function withDeadlockRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { original?: { code?: string }; parent?: { code?: string } })?.original?.code
        ?? (err as { parent?: { code?: string } })?.parent?.code;

      if (code === '40P01' && attempt < attempts) {
        logger.warn(`Deadlock detected, retrying (attempt ${attempt}/${attempts})`);
        await sleep(50 * attempt);
        continue;
      }
      throw err;
    }
  }
  /* istanbul ignore next — unreachable, loop always returns or throws */
  throw new Error('withDeadlockRetry: exhausted attempts');
}
