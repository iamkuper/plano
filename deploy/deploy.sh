#!/usr/bin/env bash
# Ships the working tree to the server and rebuilds the stack.
#   deploy/deploy.sh                 # root@$PLANO_HOST (default 5.129.255.95)
#   NO_BACKUP=1 deploy/deploy.sh     # skip the database backup
# Secrets (deploy/.env, deploy/api.env) and deploy/certs stay on the server and
# are never copied. Steps: backup of the database, sync, trusted certificates
# for the bank (install-ca.sh), checks of the compose file, build and start,
# then a check that the API answers and can reach the bank.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST="${PLANO_HOST:-5.129.255.95}"
DIR=/opt/plano

rsync -az --delete \
  --exclude node_modules --exclude .next --exclude dist --exclude '*.tsbuildinfo' \
  --exclude .git --exclude .claude --exclude 'apps/api/.pgdata' --exclude 'apps/api/uploads' \
  --exclude 'apps/api/bench/last-run.md' \
  --exclude '.env' --exclude '.env.local' --exclude 'deploy/.env' --exclude 'deploy/api.env' --exclude 'deploy/certs' --exclude 'deploy/backups' \
  ./ "root@$HOST:$DIR/"

ssh "root@$HOST" NO_BACKUP="${NO_BACKUP:-}" DIR="$DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$DIR/deploy"

# A copy of the database before migrations run (the last ten are kept).
if [ -z "$NO_BACKUP" ] && docker compose ps --status running db 2>/dev/null | grep -q db; then
  mkdir -p backups
  file="backups/plano-$(date +%Y%m%d-%H%M%S).sql.gz"
  docker compose exec -T db pg_dump -U plano plano | gzip > "$file"
  echo "backup: $file ($(du -h "$file" | cut -f1))"
  ls -1t backups/plano-*.sql.gz | tail -n +11 | xargs -r rm --
fi

./install-ca.sh
docker compose config -q
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose ps

# The API has applied its migrations and answers.
for i in $(seq 1 30); do
  if docker compose exec -T api node -e "fetch('http://localhost:3101/billing/plans').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "check: the API answers"
    break
  fi
  [ "$i" = 30 ] && { echo "check: the API does not answer; see: docker compose logs api" >&2; exit 1; }
  sleep 2
done

# The bank: any HTTP status means the connection and the certificate are fine.
if docker compose exec -T api node -e "fetch('https://securepay.tinkoff.ru/v2/Init',{method:'POST'}).then(r=>console.log('check: the bank answers (HTTP '+r.status+')')).catch(e=>{console.log('check: the bank is NOT reachable: '+(e.cause?.code||e.message));process.exit(1)})"; then :; else
  echo "warning: card payments will fail until this is fixed (see README: SELF_SIGNED_CERT_IN_CHAIN)" >&2
fi
REMOTE
