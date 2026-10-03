#!/usr/bin/env bash
# Checks that the page at connect.shipth.is is the page this repo built.
#
#   scripts/verify.sh <commit from the page footer> [page URL]
#
# 1. Finds the image built from that commit and checks its GitHub attestation:
#    it must have been built by this repo's workflow, on main, from that commit.
# 2. Copies the built files out of the image.
# 3. Downloads the same files from the live page and compares their SHA-256.
#
# Needs: docker, gh (logged in), curl, sha256sum (or shasum).
set -euo pipefail

REPO="shipth-is/connect"
IMAGE="ghcr.io/$REPO"

COMMIT="${1:?usage: scripts/verify.sh <commit> [page URL]}"
URL="${2:-https://connect.shipth.is}"
URL="${URL%/}"

fail() { echo "FAIL: $*" >&2; exit 1; }

for tool in docker gh curl; do
  command -v "$tool" >/dev/null || fail "$tool is not installed"
done
if command -v sha256sum >/dev/null; then sha() { sha256sum | cut -d' ' -f1; }
else sha() { shasum -a 256 | cut -d' ' -f1; }; fi

# The footer shows a short commit - get the full one
FULL=$(gh api "repos/$REPO/commits/$COMMIT" --jq .sha 2>/dev/null) || fail "commit $COMMIT is not in $REPO"
echo "commit:  $FULL"

docker pull -q "$IMAGE:sha-$FULL" >/dev/null || fail "no image for commit $FULL"
DIGEST=$(docker inspect --format '{{index .RepoDigests 0}}' "$IMAGE:sha-$FULL" | cut -d@ -f2)
echo "image:   $IMAGE@$DIGEST"

# The attestation must say: this repo's workflow, on main, built this commit
ATTESTED=$(gh attestation verify "oci://$IMAGE@$DIGEST" --owner "${REPO%%/*}" \
  --signer-workflow "$REPO/.github/workflows/build.yml" --source-ref refs/heads/main \
  --format json --jq '.[0].verificationResult.signature.certificate.sourceRepositoryDigest') \
  || fail "the attestation for $DIGEST did not verify"
[ "$ATTESTED" = "$FULL" ] || fail "the image was built from $ATTESTED, not $FULL"
echo "attested: built by .github/workflows/build.yml on main from $FULL"

# Copy the built files out of the image
WORK=$(mktemp -d)
CONTAINER=$(docker create "$IMAGE@$DIGEST")
trap 'docker rm "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
docker cp -q "$CONTAINER:/srv/." "$WORK/"

# Compare each one with the live page. No Accept-Encoding, so we get the plain bytes.
echo "page:    $URL"
count=0
while IFS= read -r file; do
  path="/${file#./}"
  expected=$(sha < "$WORK/$file")
  actual=$(curl -sf "$URL$path" | sha) || fail "could not download $URL$path"
  [ "$expected" = "$actual" ] || fail "$path is different from the image"
  echo "  same:  $path"
  count=$((count + 1))
done < <(cd "$WORK" && find . -type f | sort)

# "/" is what you actually open - it must be the same as index.html
[ "$(curl -sf "$URL/" | sha)" = "$(sha < "$WORK/index.html")" ] || fail "/ is not the same as index.html"
echo "  same:  / (index.html)"

echo
echo "verified: all $count files at $URL match the image built from $FULL"
