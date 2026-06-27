#!/usr/bin/env bash
# Publish the built site to a personal hosting target.
#
# This script is generic; your target lives in `deploy.config` (git-ignored).
# Copy `deploy.config.example` to `deploy.config` and set DEPLOY_DEST to a
# directory inside a git repo you control (e.g. a GitHub Pages repo). The
# build uses a relative base, so DEPLOY_DEST may be a repo root or any subfolder.
#
# Usage: ./deploy.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SRC_DIR/deploy.config"

if [ ! -f "$CONFIG" ]; then
  echo "ERROR: no deploy.config. Copy deploy.config.example to deploy.config and set DEPLOY_DEST." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$CONFIG"
: "${DEPLOY_DEST:?Set DEPLOY_DEST in deploy.config}"

echo "==> Building"
cd "$SRC_DIR"
npm run build
[ -f "$SRC_DIR/dist/index.html" ] || { echo "ERROR: build produced no dist/index.html" >&2; exit 1; }

REPO="$(git -C "$(dirname "$DEPLOY_DEST")" rev-parse --show-toplevel)"

echo "==> Replacing $DEPLOY_DEST with the fresh build"
rm -rf "$DEPLOY_DEST"
mkdir -p "$DEPLOY_DEST"
cp -R "$SRC_DIR/dist/." "$DEPLOY_DEST/"

echo "==> Committing & pushing in $REPO"
git -C "$REPO" add "$DEPLOY_DEST"
if git -C "$REPO" diff --cached --quiet; then
  echo "No changes to publish."
  exit 0
fi
REV="$(git -C "$SRC_DIR" rev-parse --short HEAD)"
git -C "$REPO" commit -m "deploy fea-proof build from ${REV}"
git -C "$REPO" push

echo "==> Done."
