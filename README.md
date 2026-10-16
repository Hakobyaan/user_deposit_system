# User Deposit System

A wallet/deposit system split into two independently deployable services that
talk to each other only through RabbitMQ:

- **`wallet-service/`** — the HTTP API (deposits, transaction history, CSV
  export, PDF report generation), backed by PostgreSQL and Redis, running
  behind Node's `cluster` module.
- **`notification-service/`** — a RabbitMQ consumer that "sends" an email for
  every deposit, with retry + dead-letter handling.

Each folder is a fully self-contained Node project (own `package.json`,
`tsconfig.json`, `Dockerfile`). Neither imports from the other — they can be
split into separate repositories and deployed on separate machines with no
code changes, since the only coupling between them is the RabbitMQ exchange
they agree on (`deposit_exchange` / routing key `deposit.created`).

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the reasoning behind the key
design decisions, [`deposit-system-assignment.md`](./deposit-system-assignment.md)
for the original spec, and [`PROJECT_GUIDE.md`](./PROJECT_GUIDE.md) for a
file-by-file map of the codebase plus a step-by-step demo script for every
requirement (in Armenian).

## Running everything with Docker

```bash
docker compose up --build
```

This starts Postgres, Redis, RabbitMQ (management UI at
http://localhost:15672, guest/guest — handy for watching `deposit_dlq` fill
up), `wallet-service` (http://localhost:3000), and `notification-service`.

Seed a few demo accounts (userId 1–5, balance 0) once Postgres is up:

```bash
docker compose exec wallet-service node ./dist/seeds/index.js
```

## Running locally (without Docker for the app code)

```bash
docker compose up -d postgres redis rabbitmq

cd wallet-service
cp .env.example .env      # adjust if needed
npm install
npm run seed               # creates demo accounts 1-5
npm run dev

# in another terminal
cd notification-service
cp .env.example .env
npm install
npm run dev
```

## One command: `npm run all`

From the repo root (Docker Desktop must be running):

```bash
npm run all
```

Starts the whole backend stack in Docker, waits until wallet-service is
healthy, seeds user1–user5, then serves the web app at
http://localhost:5173. Ctrl+C stops everything. If Docker Desktop isn't
running, the script starts it and waits. In this mode Postgres/Redis/AMQP
ports aren't published on the host (`docker-compose.all.yml`), so a local
Homebrew Postgres/Redis on 5432/6379 doesn't conflict. `npm run logs` tails the
service logs, `npm run stop` stops the containers.

## Web frontend

A React + Vite dashboard lives in [`web/`](./web): demo login, animated
balance + chart, deposits (with an auto-generated `Idempotency-Key`),
transfers, filtered history, CSV export and PDF statements.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Requests to `/api/*` are proxied to wallet-service on `http://localhost:3000`
(override with `API_TARGET=http://host:port npm run dev`). Sign in as
`user1`…`user5` (password = username).

## Interactive docs (Swagger)

http://localhost:3000/docs — try every endpoint below from the browser instead of curl.

## API

All responses are wrapped as `{ ok, status, data }` unless noted otherwise.

### `POST /deposit`

Headers: `Idempotency-Key: <any unique string>` (required)

```bash
curl -X POST http://localhost:3000/deposit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 3f6e1c2a-demo-1" \
  -d '{"userId": 1, "amount": 100}'
```

Replaying the exact same `Idempotency-Key` returns the cached result instead
of depositing again. More than 10 requests/minute for the same `userId`
returns `429`.

### `GET /transactions/:userId?page=1&limit=20`

```bash
curl http://localhost:3000/transactions/1?page=1&limit=20
```

Page 1 is served from a 30s Redis cache.

### `GET /transactions/:userId/export`

Streams the user's full history as CSV, without buffering it in memory.

```bash
curl -OJ http://localhost:3000/transactions/1/export
```

### `POST /reports/generate` → `GET /reports/:reportId/status` → `GET /reports/:reportId/download`

```bash
curl -X POST http://localhost:3000/reports/generate \
  -H "Content-Type: application/json" -d '{"userId": 1}'
# => { "data": { "reportId": "..." } }

curl http://localhost:3000/reports/<reportId>/status
# => { "data": { "status": "processing" } }   ...then... "status": "done"

curl -OJ http://localhost:3000/reports/<reportId>/download
```

## Bonus: demo login & transfers (not part of the original assignment spec)

Added on top of the assignment for a login → see balance → transfer →
log in as the other user → see balance flow. Not real authentication —
username is `user<id>` for a seeded account (1-5), password equals the
username.

### `POST /auth/login`

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "user1", "password": "user1"}'
# => { "data": { "token": "...", "userId": 1 } }
```

### `GET /accounts/me`

```bash
curl http://localhost:3000/accounts/me -H "Authorization: Bearer <token>"
```

### `POST /transfer`

Debits the logged-in user (from the token) and credits `toUserId`,
atomically (same 2-row locked transaction pattern as `/deposit`).

```bash
curl -X POST http://localhost:3000/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"toUserId": 2, "amount": 30}'
```

## Verifying the interesting parts

- **Cluster self-healing**: `docker compose exec wallet-service ps aux`, then
  `kill -9 <one of the worker pids>` — the logs show the primary forking a
  replacement immediately, and the API keeps answering requests throughout.
- **Deadlock retry** (bonus): `npm run demo:deadlock` inside `wallet-service`
  manufactures a real two-transaction deadlock and shows the retry helper
  recovering from it automatically.
- **Rate limit**: fire 11 `POST /deposit` calls for the same `userId` inside
  a minute — the 11th comes back `429`.
- **Notification retry / DLQ**: watch the `notification-service` logs after a
  deposit — roughly 1 in 5 simulated sends fail and get retried (up to 3
  attempts) before landing in `deposit_dlq`, visible in the RabbitMQ
  management UI's Queues tab.
