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

# A file is good when it holds at least one certificate and every one of them
# parses (a cut-off or mixed-up file is what Node rejects as "bad end line").
valid() {
  [ "$(grep -c 'BEGIN CERTIFICATE' "$1" 2>/dev/null || true)" -ge 1 ] || return 1
  [ "$(grep -c 'BEGIN CERTIFICATE' "$1")" = "$(grep -c 'END CERTIFICATE' "$1")" ] || return 1
  openssl crl2pkcs7 -nocrl -certfile "$1" 2>/dev/null | openssl pkcs7 -print_certs -noout >/dev/null 2>&1
}

mkdir -p certs
if [ -s "$OUT" ] && [ "${1:-}" != "--force" ]; then
  if valid "$OUT"; then
    echo "certificates: $OUT is there ($(grep -c 'BEGIN CERTIFICATE' "$OUT") certificates)"
    exit 0
  fi
  echo "certificates: $OUT is damaged, fetching it again"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# 1. The official files of the Ministry of Digital Development.
if curl -fsSL --max-time 30 "$ROOT_URL" -o "$tmp/root.pem" && curl -fsSL --max-time 30 "$SUB_URL" -o "$tmp/sub.pem" && valid "$tmp/root.pem" && valid "$tmp/sub.pem"; then
  # The files may lack a final newline or have Windows line endings; glued
  # together as they are, "-----END CERTIFICATE----------BEGIN CERTIFICATE-----"
  # makes Node reject the whole bundle ("bad end line").
  for f in "$tmp/root.pem" "$tmp/sub.pem"; do tr -d '\r' < "$f"; echo; done | grep -v '^[[:space:]]*$' > "$tmp/bundle.pem"
  valid "$tmp/bundle.pem" || { echo "certificates: the downloaded files are not valid PEM" >&2; exit 1; }
  echo "certificates: took the root and issuing certificates from gu-st.ru"
else
  # 2. The chain the bank itself sends (usually includes the root).
  echo "certificates: gu-st.ru is not reachable, taking the chain of $BANK_HOST"
  # (a failing pipeline must not stop the script here: the result is checked below)
  { echo | timeout 20 openssl s_client -connect "$BANK_HOST:443" -servername "$BANK_HOST" -showcerts 2>/dev/null | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p' > "$tmp/bundle.pem"; } || true
  if ! valid "$tmp/bundle.pem"; then
    echo "certificates: could not get any certificate; put the PEM file into deploy/$OUT by hand (see README)" >&2
    exit 1
  fi
fi
install -m 644 "$tmp/bundle.pem" "$OUT"
echo "certificates: wrote $OUT ($(grep -c 'BEGIN CERTIFICATE' "$OUT") certificates)"
