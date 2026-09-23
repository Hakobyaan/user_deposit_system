#!/usr/bin/env bash
# Launched by `npm run dev` from either wallet-service/ or notification-service/.
# Brings up the whole Docker stack (Postgres, Redis, RabbitMQ, both services),
# seeds the demo accounts once wallet-service is reachable, then streams logs.
# Ctrl+C stops watching logs and shuts the whole stack down (same as a plain
# `docker compose up --build`) — nothing needs to be remembered beyond this
# one command.
set -e
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Start Docker Desktop first, then re-run npm run dev." >&2
  exit 1
fi

(
  for _ in $(seq 1 40); do
    if docker compose exec -T wallet-service node ./dist/seeds/index.js >/dev/null 2>&1; then
      echo "==> demo accounts seeded (userId 1-5)"
      break
    fi
    sleep 1
  done
) &

docker compose up --build
