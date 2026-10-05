#!/usr/bin/env bash
# Puts the root certificates the API must trust into deploy/certs/extra-ca.pem.
#
# T-Bank's certificate chains to the Russian Trusted Root CA (НУЦ Минцифры),
# which Node does not know, so payments fail with SELF_SIGNED_CERT_IN_CHAIN.
# docker-compose.yml mounts deploy/certs into the API container and points
# NODE_EXTRA_CA_CERTS at the file. Run on the server (deploy.sh does it):
#   ./install-ca.sh           # only if the file is missing
#   ./install-ca.sh --force   # fetch again
set -euo pipefail
cd "$(dirname "$0")"
OUT=certs/extra-ca.pem
ROOT_URL="${CA_ROOT_URL:-https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt}"
SUB_URL="${CA_SUB_URL:-https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt}"
BANK_HOST="${CA_FALLBACK_HOST:-securepay.tinkoff.ru}"

mkdir -p certs
if [ -s "$OUT" ] && [ "${1:-}" != "--force" ]; then
  echo "certificates: $OUT is there ($(grep -c 'BEGIN CERTIFICATE' "$OUT") certificates)"
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
valid() { [ "$(grep -c 'BEGIN CERTIFICATE' "$1" 2>/dev/null || true)" -ge 1 ] && openssl x509 -in "$1" -noout 2>/dev/null; }

# 1. The official files of the Ministry of Digital Development.
if curl -fsSL --max-time 30 "$ROOT_URL" -o "$tmp/root.pem" && curl -fsSL --max-time 30 "$SUB_URL" -o "$tmp/sub.pem" && valid "$tmp/root.pem" && valid "$tmp/sub.pem"; then
  cat "$tmp/root.pem" "$tmp/sub.pem" > "$tmp/bundle.pem"
  echo "certificates: took the root and issuing certificates from gu-st.ru"
else
  # 2. The chain the bank itself sends (usually includes the root).
  echo "certificates: gu-st.ru is not reachable, taking the chain of $BANK_HOST"
  echo | openssl s_client -connect "$BANK_HOST:443" -servername "$BANK_HOST" -showcerts 2>/dev/null | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p' > "$tmp/bundle.pem"
  if ! valid "$tmp/bundle.pem"; then
    echo "certificates: could not get any certificate; put the PEM file into deploy/$OUT by hand (see README)" >&2
    exit 1
  fi
fi
install -m 644 "$tmp/bundle.pem" "$OUT"
echo "certificates: wrote $OUT ($(grep -c 'BEGIN CERTIFICATE' "$OUT") certificates)"
