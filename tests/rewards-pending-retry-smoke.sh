#!/usr/bin/env bash
set -euo pipefail

theme_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
js_file="$theme_root/assets/forestry-rewards.js"

if ! grep -q 'data-action="refresh-status"' "$js_file"; then
  echo "missing refresh-status action markup"
  exit 1
fi

if ! grep -q "if (action === 'refresh-status')" "$js_file"; then
  echo "missing refresh-status action handler"
  exit 1
fi

if ! grep -q 'await loadAndRender(root, { force: true });' "$js_file"; then
  echo "missing forced reload call for refresh-status"
  exit 1
fi

echo "rewards pending retry smoke passed"
