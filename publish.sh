#!/usr/bin/env bash
# Rebuild and publish one snapshot to the gh-pages branch.
# Run hourly by cron. Idempotent: if nothing changed there is no commit and no push.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

TOKEN_FILE="${TOKEN_FILE:-/opt/data/profiles/idea/secrets/ghtok.txt}"
[ -r "$TOKEN_FILE" ] || { echo "no token at $TOKEN_FILE"; exit 1; }
TOK="$(tr -d '\n\r ' < "$TOKEN_FILE")"

echo "[$(date -u +%FT%TZ)] fetching"
node build.mjs

STAMP="$(date -u +%Y-%m-%dT%H:%MZ)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r dist/. "$WORK/"
cd "$WORK"
git init -q
git config user.name "taskmarket-live"
git config user.email "taskmarket-live@users.noreply.github.com"
git checkout -q -b gh-pages
git add -A
git commit -q -m "Publish snapshot $STAMP"
# --force is required: gh-pages here is a generated build artifact, not history.
git push -q -f "https://x-access-token:${TOK}@github.com/ciperx/taskmarket-live.git" gh-pages
echo "[$(date -u +%FT%TZ)] published $STAMP"
