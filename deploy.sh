#!/usr/bin/env bash
# Deploy fea-proof to typedev.github.io/fea-proof/
#
# Builds the Vite app (base=/fea-proof/) and publishes dist/ into the
# GitHub Pages repo, then commits & pushes there. Development continues
# in THIS repo; only the build output is copied out.
#
# Usage: ./deploy.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAGES_REPO="${PAGES_REPO:-/home/alexander/WORK/typedev.github.io}"
TARGET="$PAGES_REPO/fea-proof"

echo "==> Building (base=/fea-proof/)"
cd "$SRC_DIR"
npm run build

if [ ! -f "$SRC_DIR/dist/index.html" ]; then
  echo "ERROR: dist/index.html not found — build produced no output." >&2
  exit 1
fi

if [ ! -d "$PAGES_REPO/.git" ]; then
  echo "ERROR: $PAGES_REPO is not a git repo." >&2
  exit 1
fi

echo "==> Replacing $TARGET with fresh build"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -R "$SRC_DIR/dist/." "$TARGET/"

echo "==> Committing & pushing in $PAGES_REPO"
cd "$PAGES_REPO"
git add fea-proof
if git diff --cached --quiet; then
  echo "No changes to publish — nothing to commit."
  exit 0
fi

REV="$(cd "$SRC_DIR" && git rev-parse --short HEAD)"
git commit -m "fea-proof: deploy build from fea-proof@${REV}"
git push

echo "==> Done. Live at https://typedev.github.io/fea-proof/"
