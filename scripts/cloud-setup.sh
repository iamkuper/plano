#!/usr/bin/env bash
# One-shot setup for a fresh machine (Claude Code on the web / any Linux box):
# installs deps, writes local .env files, starts the embedded Postgres,
# applies migrations and seeds test users. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."

corepack enable >/dev/null 2>&1 || npm i -g pnpm
pnpm install --frozen-lockfile

[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local

# Postgres keeps running in the background after this script exits.
if ! (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null; then
  nohup pnpm db:up > /tmp/plano-postgres.log 2>&1 &
  for _ in $(seq 1 60); do
    (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null && break
    sleep 1
  done
fi

pnpm --filter @amo-kanban/api exec prisma migrate deploy
pnpm db:seed

echo "Ready. Start the apps with: pnpm api:dev  and  pnpm web:dev"
