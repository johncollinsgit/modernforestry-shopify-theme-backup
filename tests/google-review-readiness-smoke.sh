#!/usr/bin/env bash
set -euo pipefail

theme_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fallback_file="$theme_root/snippets/forestry-rewards-root.liquid"
script_file="$theme_root/assets/forestry-rewards.js"

if rg -q '"handle": "google-review"' "$fallback_file"; then
  echo "Fallback rewards payload still contains a google-review task." >&2
  exit 1
fi

if rg -q 'g\\.page/r/|search\\.google\\.com/local/writereview' "$fallback_file"; then
  echo "Fallback rewards payload still contains a Google review URL." >&2
  exit 1
fi

rg -q 'data\.google_review' "$script_file"
rg -q 'manual_review_fallback' "$script_file"
rg -q 'Submit review details' "$script_file"
rg -q 'result\.error && result\.error\.message' "$script_file"
rg -q 'Google review matching is not live yet\.' "$script_file"

echo "Google review readiness smoke check passed."
