#!/usr/bin/env bash
set -euo pipefail

theme_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rg -q 'render '\''forestry-floating-sidebars'\''' "$theme_root/layout/theme.liquid"
rg -q 'data-forestry-sitewide-reviews' "$theme_root/snippets/forestry-floating-sidebars.liquid"
rg -q 'data-action="forestry-sitewide-reviews-show-all"' "$theme_root/assets/forestry-product-reviews.js"
rg -q 'data-action="forestry-wishlist-floating-toggle"' "$theme_root/snippets/forestry-floating-sidebars.liquid"
rg -q 'ForestryFloatingDrawerStack' "$theme_root/assets/theme.css"

echo "Floating drawer smoke check passed."
