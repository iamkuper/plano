#!/usr/bin/env bash
# First-time setup on your own machine (macOS / Linux / WSL): installs
# dependencies, creates the local .env files, starts the database under pm2,
# applies migrations and seeds test users. Safe to run again.
# Afterwards: pnpm pm2:start
set -euo pipefail
cd "$(dirname "$0")/.."

command -v node >/dev/null || { echo "Нужен Node.js 20+ (лучше 22): https://nodejs.org"; exit 1; }
corepack enable >/dev/null 2>&1 || npm i -g pnpm
pnpm install --frozen-lockfile

[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local

# The database runs under pm2 too; start only it for now.
pnpm exec pm2 start ecosystem.json --only plano-db
echo -n "Жду базу на :5433 "
for _ in $(seq 1 90); do
  (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null && break
  echo -n "."
  sleep 1
done
echo

pnpm --filter @plano/api exec prisma generate
pnpm --filter @plano/api exec prisma migrate deploy
pnpm db:seed

echo
echo "Готово. Запуск всего: pnpm pm2:start   |   Логи: pnpm pm2:logs   |   Остановка: pnpm pm2:stop"
echo "Сайт: http://localhost:3100   API: http://localhost:3101"
