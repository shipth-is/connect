#!/bin/sh
# Refuse to start without a sane API_ORIGIN - it goes straight into the CSP
set -eu

case "${API_ORIGIN:-}" in
  https://*) ;;
  *) echo "API_ORIGIN must be set to an https:// origin, for example https://api.shipth.is" >&2; exit 1 ;;
esac

# Only scheme + host (+ port). Nothing that could break out of the header.
if ! echo "$API_ORIGIN" | grep -Eq '^https://[a-z0-9.-]+(:[0-9]+)?$'; then
  echo "API_ORIGIN must be just an origin, for example https://api.shipth.is" >&2
  exit 1
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
