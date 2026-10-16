#!/usr/bin/env bash
# `npm run all` from the repo root: makes sure a Docker engine is running
# (starting Docker Desktop / OrbStack / Colima itself if needed), starts the
# backend stack (Postgres, Redis, RabbitMQ, wallet-service,
# notification-service) in the background, waits for wallet-service to be
# healthy, seeds the demo accounts, then runs the web frontend in the
# foreground. Ctrl+C stops the frontend and the whole stack.
set -eo pipefail
cd "$(dirname "$0")/.."

# Override drops host port publishing for Postgres/Redis/AMQP, so a local
# Homebrew Postgres/Redis on 5432/6379 doesn't block the stack.
export COMPOSE_FILE="docker-compose.yml:docker-compose.all.yml"

B=$'\e[1m'; D=$'\e[2m'; G=$'\e[38;5;155m'; Y=$'\e[33m'; R=$'\e[31m'; X=$'\e[0m'
step() { printf "${G}●${X} %s\n" "$1"; }
note() { printf "  ${D}%s${X}\n" "$1"; }
warn() { printf "${Y}!${X} %s\n" "$1"; }
fail() { printf "\n${R}✖ %s${X}\n" "$1" >&2; [ -n "$2" ] && printf "  ${D}%s${X}\n" "$2" >&2; exit 1; }

# wait_for <seconds> <label> <command...> — polls until the command succeeds,
# with a small spinner so long waits don't look frozen.
wait_for() {
  local timeout=$1 label=$2; shift 2
  local frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=0 start=$SECONDS
  until "$@" >/dev/null 2>&1; do
    if (( SECONDS - start >= timeout )); then printf "\r\e[K"; return 1; fi
    printf "\r  ${G}%s${X} ${D}%s (%ss)${X}" "${frames:i++%10:1}" "$label" "$((SECONDS - start))"
    sleep 1
  done
  printf "\r\e[K"
}

printf "\n  ${G}${B}▼ Vault${X} ${D}— user deposit system${X}\n\n"

# ---------- prerequisites ----------
command -v node >/dev/null || fail "Node.js is not installed." "Install it from https://nodejs.org (v20+), then re-run npm run all."
command -v curl >/dev/null || fail "curl is not installed."
command -v docker >/dev/null || fail "Docker is not installed." "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
docker compose version >/dev/null 2>&1 || fail "docker compose (v2) is not available." "Update Docker Desktop, or install the compose plugin."

# ---------- docker engine ----------
if ! docker info >/dev/null 2>&1; then
  if [[ "$OSTYPE" == darwin* ]]; then
    if [ -d /Applications/OrbStack.app ] && ! [ -d /Applications/Docker.app ]; then
      step "Docker engine is not running — starting OrbStack…"
      open -ga OrbStack
    elif [ -d /Applications/Docker.app ] || [ -d "$HOME/Applications/Docker.app" ]; then
      step "Docker engine is not running — starting Docker Desktop…"
      open -ga Docker
    elif command -v colima >/dev/null; then
      step "Docker engine is not running — starting Colima…"
      colima start >/dev/null
    else
      fail "Docker engine is not running and no Docker app was found to start." "Start your Docker engine manually, then re-run npm run all."
    fi
  else
    fail "Docker engine is not running." "Start it (e.g. sudo systemctl start docker), then re-run npm run all."
  fi
  wait_for 180 "waiting for Docker engine" docker info \
    || fail "Docker engine did not start within 3 minutes." "Open Docker Desktop and check it for errors, then re-run npm run all."
  step "Docker engine is up"
fi

# ---------- ports ----------
port_owner() { { lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; } | awk 'NR==2 {print $1" (pid "$2")"}'; }
for port in 3000 15672; do
  owner=$(port_owner "$port")
  # Our own containers holding the port (from a previous run) are fine.
  if [ -n "$owner" ] && ! { docker compose ps --format "{{.Ports}}" 2>/dev/null || true; } | grep -q ":$port->"; then
    case "$owner" in
      com.docke*|docker*|vpnkit*|OrbStack*) ;;  # another compose project — docker will report it clearly
      *) fail "Port $port is already used by $owner." "Stop it and re-run: kill $(echo "$owner" | tr -dc '0-9 ' | awk '{print $NF}')" ;;
    esac
  fi
done

WEB_PORT=5173
while [ -n "$(port_owner $WEB_PORT)" ]; do WEB_PORT=$((WEB_PORT + 1)); done
[ "$WEB_PORT" != 5173 ] && warn "Port 5173 is busy (old dev server?) — using $WEB_PORT for the app"

# ---------- backend ----------
cleanup() {
  # Ignore further Ctrl+C while stopping, so a double-press can't leave the
  # stack half-running.
  trap '' INT TERM
  trap - EXIT
  printf "\n"
  step "Stopping backend containers…"
  if docker compose stop > /tmp/vault-stop.log 2>&1; then
    note "Stopped. Data is kept — next npm run all starts where you left off."
  else
    sed "s/^/  ${D}/;s/$/${X}/" /tmp/vault-stop.log
    warn "Could not stop the containers — run: npm run stop"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

step "Starting backend containers ${D}(first run builds images — a few minutes)${X}"
if ! docker compose up -d --build --quiet-pull > /tmp/vault-compose.log 2>&1; then
  tail -n 25 /tmp/vault-compose.log | sed "s/^/  ${D}/;s/$/${X}/"
  fail "docker compose up failed (full log: /tmp/vault-compose.log)."
fi

health() { curl -sf http://localhost:3000/health; }
if ! wait_for 120 "waiting for wallet-service on :3000" health; then
  docker compose logs --tail 25 wallet-service 2>&1 | sed "s/^/  ${D}/;s/$/${X}/"
  fail "wallet-service did not become healthy within 2 minutes." "Full logs: npm run logs"
fi
step "wallet-service is healthy"

if docker compose exec -T wallet-service node ./dist/seeds/index.js >/dev/null 2>&1; then
  step "Demo accounts ready (user1–user5)"
else
  warn "Seeding failed — try later: docker compose exec wallet-service node ./dist/seeds/index.js"
fi

# ---------- frontend ----------
if [ ! -x web/node_modules/.bin/vite ]; then
  step "Installing frontend dependencies…"
  (cd web && npm install --no-fund --no-audit --loglevel=error) || fail "npm install failed in web/."
fi

cat <<BANNER

  ${B}Everything is up.${X}

  ${G}➜${X}  App         ${B}http://localhost:${WEB_PORT}${X}   ${D}login: user1 / user1${X}
  ${G}➜${X}  API docs    http://localhost:3000/docs
  ${G}➜${X}  RabbitMQ    http://localhost:15672   ${D}guest / guest${X}

  ${D}Ctrl+C stops everything.${X}

BANNER

# Subshell, so cleanup still runs from the repo root where the compose files live.
(cd web && exec ./node_modules/.bin/vite --port "$WEB_PORT" --strictPort --clearScreen false)
