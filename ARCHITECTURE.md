# Architecture notes

## Isolation level for the deposit transaction

`REPEATABLE READ`, set explicitly in `wallet-service/src/modules/deposits/service.ts`.

The row-level lock (`SELECT ... FOR UPDATE`) already prevents the classic
lost-update race by itself — a second concurrent deposit for the same user
simply blocks until the first transaction commits, even under the default
`READ COMMITTED`. `REPEATABLE READ` is layered on top as cheap insurance: it
freezes this transaction's own view of the data for its entire duration, so
if more reads get added around the balance update later (a daily-limit
check, a fraud-score lookup keyed on recent transactions, etc.) they can't
observe a different snapshot mid-transaction. It costs nothing extra here
and removes a whole class of future bugs.

## How idempotency prevents a duplicate deposit

`POST /deposit` requires an `Idempotency-Key` header. Before doing any work,
`idempotencyGuard` atomically claims `idempotency:<key>` in Redis with
`SET NX EX` — only the first request with a given key can win that claim.
A retry (same key, e.g. a client that timed out and resent) finds the key
already present: if the first attempt is still running, the retry gets
`409`; if it already finished, the retry gets back the *exact same cached
response* instead of triggering a second `BEGIN/UPDATE/INSERT/COMMIT`. On
failure, the claim is released so a genuinely new attempt with the same key
can proceed cleanly.

## Why a Worker Thread for report generation, not plain async

The report generation step includes a synchronous, CPU-bound calculation
(the simulated "heavy analytics" work). `async`/`await` and Promises only
help with I/O-bound waiting — they don't yield the event loop for CPU-bound
work, so a heavy synchronous loop on the main thread would freeze *every*
other request the process is serving (deposits, transaction reads, health
checks) for as long as it runs. A `worker_threads.Worker` runs on a genuinely
separate thread with its own event loop, so the main thread stays free to
keep handling HTTP traffic while the report renders in the background. The
worker reports back via `postMessage`; because the service runs under
Cluster (many OS processes), that status is written to Redis rather than an
in-memory map, so any cluster worker can answer `GET /reports/:id/status`
regardless of which process actually spawned the report.

## How the composite index speeds up the transaction history query

`idx_user_created` is a B-tree index on `(user_id, created_at)`. The history
query is always shaped `WHERE user_id = $1 ORDER BY created_at DESC`, which
matches the index's leftmost prefix exactly: Postgres can seek directly to
the `user_id`'s slice of the index and walk it in `created_at` order,
returning rows already sorted — no separate sort step, and no scan of any
row belonging to another user. Without the composite index (or with one on
`user_id` alone), the same query would still find the right rows via an
index but then have to sort them separately; without any index it degrades
to a full table scan filtered afterward, which gets linearly worse as the
table grows into the "tens of thousands of transactions per user" scale the
assignment calls out.

## Where Sequelize is deliberately not used

Everything else in `wallet-service` goes through Sequelize (the deposit
transaction, transaction history pagination) — it's a good fit for
transaction/lock/isolation-level control and for simple paginated reads.
`GET /transactions/:userId/export` is the one exception: Sequelize
materializes a full result set into a JS array before returning it, which
defeats the entire point of a streaming export for a user with tens of
thousands of rows. That one endpoint uses a raw `pg.Pool` + `pg-query-stream`
to hold a real server-side cursor open and fetch in small batches, piped
through a CSV `Transform` straight into the HTTP response. Because it's a
plain `.pipe()` chain, Node's stream backpressure applies automatically end
to end: if the client is downloading slowly, `res.write()` returns `false`,
which pauses the CSV transform, which pauses the query stream, which stops
issuing `FETCH` batches against the Postgres cursor — nothing upstream ever
buffers rows the client hasn't caught up to reading yet.

## Deadlock demo (bonus)

A single deposit only ever locks one account row, so two deposits — even
concurrent ones for the same user — can only block each other, never
deadlock (Postgres deadlocks require each side to hold a lock the other
wants while waiting for a lock it holds — that needs ≥2 locks per
transaction). `wallet-service/src/scripts/deadlock-demo.ts` manufactures
that scenario on purpose (two transactions locking two accounts in opposite
order) to demonstrate `withDeadlockRetry`: it catches Postgres error
`40P01` (deadlock detected — Postgres itself picks a victim and aborts it,
it never just hangs) and retries the aborted side with a small backoff.
The same helper wraps the real deposit flow, so if a deadlock ever is
introduced elsewhere in the system, it's handled the same way.

## Rate limiting

`POST /deposit` is limited to 10 requests/minute per `userId` via a Redis
fixed window: `INCR ratelimit:deposit:<userId>:<minuteBucket>`, with
`EXPIRE` armed only the first time a given window's key is created. Both
commands are simple, single-key Redis operations, so there's no race
between the increment and the expiry — a crash between them can't leave a
counter stuck without a TTL. Exceeding the limit returns `429`.

## Why two independent folders instead of a monorepo

`wallet-service/` and `notification-service/` each carry their own
`package.json`, `tsconfig.json`, and `Dockerfile`, and neither imports code
from the other. They communicate only asynchronously, through the
`deposit_exchange` topic exchange both sides declare identically. This means
either folder can be lifted into its own repository and deployed to its own
server later with zero code changes — the only shared contract is the shape
of the `deposit.created` message.
