#!/usr/bin/env bash
# Ships the working tree to the server and rebuilds the stack.
#   deploy/deploy.sh            # root@$PLANO_HOST (default 5.129.255.95)
# Secrets (deploy/.env, deploy/api.env) stay on the server and are never copied.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${PLANO_HOST:-5.129.255.95}"
DIR=/opt/plano

rsync -az --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude '*.tsbuildinfo' \
  --exclude .git --exclude .claude --exclude 'apps/api/.pgdata' --exclude 'apps/api/uploads' \
  --exclude '.env' --exclude '.env.local' --exclude 'deploy/.env' --exclude 'deploy/api.env' --exclude 'deploy/certs' \
  ./ "root@$HOST:$DIR/"

ssh "root@$HOST" "cd $DIR/deploy && docker compose up -d --build --remove-orphans && docker image prune -f >/dev/null && docker compose ps"
