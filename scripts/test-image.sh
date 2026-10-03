#!/usr/bin/env bash
# Runs the image and checks it serves the page with the right headers, and
# that it refuses to start without a good API_ORIGIN.
#
#   scripts/test-image.sh <image>
set -euo pipefail

IMAGE="${1:?usage: scripts/test-image.sh <image>}"
API_ORIGIN="https://api.example.test"
PORT=18080
NAME="connect-test-$$"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok: $*"; }

# Refuses to start with a missing or bad API_ORIGIN
for bad in "" "http://api.example.test" "https://api.example.test; script-src *" "https://api.example.test/path"; do
  if docker run --rm -e API_ORIGIN="$bad" "$IMAGE" >/dev/null 2>&1; then
    fail "started with API_ORIGIN='$bad'"
  fi
done
pass "refuses to start without a good API_ORIGIN"

docker run -d --rm --name "$NAME" -e API_ORIGIN="$API_ORIGIN" -p "$PORT:8080" "$IMAGE" >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/" >/dev/null && break
  sleep 0.5
done

headers=$(curl -sfi "http://localhost:$PORT/" | tr -d '\r')
check() {
  echo "$headers" | grep -qiF "$1" || fail "missing header: $1"
  pass "$1"
}
check "content-security-policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src $API_ORIGIN; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
check "strict-transport-security: max-age=31536000"
check "x-content-type-options: nosniff"
check "referrer-policy: no-referrer"
check "permissions-policy: camera=(), microphone=(), geolocation=(), payment=()"
check "cache-control: no-store"
echo "$headers" | grep -qi '^server:' && fail "Server header is sent"
pass "no Server header"

# Read whole responses first - grep -q closing the pipe early trips pipefail
page=$(curl -sf "http://localhost:$PORT/")
asset=$(echo "$page" | grep -oE '/assets/[^"]+\.js' | head -1)
[ -n "$asset" ] || fail "no script in index.html"
asset_headers=$(curl -sfI "http://localhost:$PORT$asset" | tr -d '\r')
echo "$asset_headers" | grep -qi 'cache-control: public, max-age=31536000, immutable' || fail "assets are not cached"
pass "assets cached forever"

# No inline scripts or styles - the CSP would block them
echo "$page" | grep -qE '<script>|<style|style=' && fail "inline script or style in index.html"
pass "no inline scripts or styles"

echo "all good"
