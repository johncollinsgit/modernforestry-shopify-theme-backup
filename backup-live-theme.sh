#!/usr/bin/env bash
set -euo pipefail

STORE="${SHOPIFY_STORE:-modernforestry.myshopify.com}"
THEME_ID="${SHOPIFY_THEME_ID:-}"
COMMIT_STAMP="$(date '+%Y-%m-%d %H:%M %Z')"

if ! command -v shopify >/dev/null 2>&1; then
  echo "Error: Shopify CLI is not installed or not in PATH."
  exit 1
fi

if [ -z "$THEME_ID" ]; then
  echo "Error: SHOPIFY_THEME_ID is required. Example:"
  echo "  SHOPIFY_STORE=modernforestry.myshopify.com SHOPIFY_THEME_ID=159737250051 ./backup-live-theme.sh"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: Run this script from inside the theme git repo."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" = "HEAD" ]; then
  echo "Error: You are in a detached HEAD state. Checkout a branch first."
  exit 1
fi

echo "Pulling live theme $THEME_ID from $STORE..."
shopify theme pull --store "$STORE" --theme "$THEME_ID"

if git diff --quiet && git diff --cached --quiet; then
  echo "No changes after pull. Backup already current."
  exit 0
fi

echo "Committing snapshot..."
git add .
git commit -m "Backup: live snapshot $COMMIT_STAMP"

echo "Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo "Done."
