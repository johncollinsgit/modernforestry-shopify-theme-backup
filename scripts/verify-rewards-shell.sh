#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-${STORE_DOMAIN:-theforestrystudio.com}}"
TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-12}"
VERIFY_SAMPLES="${VERIFY_SAMPLES:-4}"
SLEEP_SECONDS="${VERIFY_SLEEP_SECONDS:-0.8}"
SHOPIFY_EDGE_IP="${SHOPIFY_EDGE_IP:-}"

CURL_ARGS=(-fsS --max-time "$TIMEOUT_SECONDS")
if [ -n "$SHOPIFY_EDGE_IP" ]; then
  CURL_ARGS+=(--resolve "${DOMAIN}:443:${SHOPIFY_EDGE_IP}")
fi

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

fetch_body() {
  local path="$1"
  curl "${CURL_ARGS[@]}" "https://${DOMAIN}${path}"
}

fetch_headers() {
  local path="$1"
  curl "${CURL_ARGS[@]}" -I "https://${DOMAIN}${path}"
}

extract_rewards_js_url() {
  local html="$1"
  printf '%s' "$html" | grep -Eo "/cdn/shop/t/[0-9]+/assets/forestry-rewards.js[^\"' ]*" | head -n 1
}

extract_asset_family() {
  local asset_url="$1"
  printf '%s' "$asset_url" | sed -E 's#^/cdn/shop/t/([0-9]+)/assets/forestry-rewards.js.*#t/\1#'
}

count_unique() {
  if [ "$#" -eq 0 ]; then
    printf '0'
    return 0
  fi

  printf '%s\n' "$@" | sed '/^$/d' | sort -u | wc -l | tr -d ' '
}

assert_header_contains() {
  local headers="$1"
  local pattern="$2"
  local message="$3"
  printf '%s' "$headers" | grep -Eiq "$pattern" || fail "$message"
}

log "Verifying rewards shell parity on https://${DOMAIN} (samples=${VERIFY_SAMPLES})"
if [ -n "$SHOPIFY_EDGE_IP" ]; then
  log "Using fixed edge resolve: ${DOMAIN}:443:${SHOPIFY_EDGE_IP}"
fi

rewards_families=()
cart_families=()

for i in $(seq 1 "$VERIFY_SAMPLES"); do
  rewards_html="$(fetch_body "/pages/rewards")"
  cart_html="$(fetch_body "/cart")"

  rewards_js="$(extract_rewards_js_url "$rewards_html")"
  cart_js="$(extract_rewards_js_url "$cart_html")"

  [ -n "$rewards_js" ] || fail "/pages/rewards did not include forestry-rewards.js script tag."
  [ -n "$cart_js" ] || fail "/cart did not include forestry-rewards.js script tag."

  rewards_family="$(extract_asset_family "$rewards_js")"
  cart_family="$(extract_asset_family "$cart_js")"

  [ -n "$rewards_family" ] || fail "Could not parse rewards asset family from /pages/rewards."
  [ -n "$cart_family" ] || fail "Could not parse rewards asset family from /cart."

  rewards_families+=("$rewards_family")
  cart_families+=("$cart_family")

  if [ "$rewards_family" != "$cart_family" ]; then
    fail "Asset family mismatch in sample ${i}: /pages/rewards=${rewards_family}, /cart=${cart_family}"
  fi

  if [ "$rewards_js" != "$cart_js" ]; then
    fail "Asset URL mismatch in sample ${i}: /pages/rewards=${rewards_js}, /cart=${cart_js}"
  fi

  if printf '%s' "$rewards_js" | grep -q '\?build=' || printf '%s' "$cart_js" | grep -q '\?build='; then
    fail "Detected manual build query in live shell (${rewards_js} | ${cart_js})."
  fi

  if [ "$i" = "1" ]; then
    printf '%s' "$rewards_html" | grep -q 'data-rewards-build-version="' \
      || fail "/pages/rewards is missing data-rewards-build-version marker."
  fi

  log "sample ${i}: /pages/rewards=${rewards_family} | /cart=${cart_family}"
  sleep "$SLEEP_SECONDS"
done

rewards_unique_count="$(count_unique "${rewards_families[@]}")"
cart_unique_count="$(count_unique "${cart_families[@]}")"

[ "$rewards_unique_count" = "1" ] || fail "/pages/rewards served multiple asset families across samples."
[ "$cart_unique_count" = "1" ] || fail "/cart served multiple asset families across samples."

log "Checking app-proxy cache headers..."
for path in "/apps/forestry/candle-cash/status" "/apps/forestry/rewards/available" "/apps/forestry/health"; do
  headers="$(fetch_headers "$path")"
  assert_header_contains "$headers" '^HTTP/[0-9.]+[[:space:]]+200' "${path} did not return HTTP 200."
  assert_header_contains "$headers" '^cache-control:[[:space:]]*no-cache,[[:space:]]*private' "${path} cache-control is not no-cache, private."
  assert_header_contains "$headers" '^cf-cache-status:[[:space:]]*DYNAMIC' "${path} cf-cache-status is not DYNAMIC."
  log "ok: ${path} cache policy is dynamic/private."
done

log "Rewards shell verification passed."
