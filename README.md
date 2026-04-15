# Modern Forestry Shopify Theme Backup

This repository is a **backup + version history** for the live Shopify theme.

## Purpose
- Keep a reliable GitHub history of the live theme code.
- Make rollback/recovery easy after bad edits.
- Stay lightweight: no build step, no framework migration, no heavy local workflow.

## Source Of Truth
Unless explicitly noted in a release note/PR, the source of truth is the **live Shopify theme** in the store admin.

- Store: `modernforestry.myshopify.com`
- Primary live theme tracked here: `rewards-cache-reset-20260407` (`#159737250051`)
- Historical pre-cutover theme still visible on the stale custom-domain path: `Prestige` (`#136487764227`)

## Standard Theme Structure
This repo keeps Shopify's standard theme folders so it remains compatible with Shopify GitHub integration:
- `assets/`
- `config/`
- `layout/`
- `locales/`
- `sections/`
- `snippets/`
- `templates/`

## One-Time Setup
```bash
cd /path/to/modernforestry-live-theme

# 1) Authenticate Shopify CLI (if needed)
shopify auth login --store modernforestry.myshopify.com

# 2) Pull current live theme snapshot
shopify theme pull --store modernforestry.myshopify.com --theme 159737250051

# 3) Initialize git (if not already initialized)
git init -b main

# 4) First commit
git add .
git commit -m "Initial backup snapshot from live Shopify theme"
```

## Create And Push GitHub Repo
Option A (`gh` CLI):
```bash
# from repo root
gh auth login
gh repo create modernforestry-shopify-theme-backup --private --source=. --remote=origin --push
```

Option B (manual GitHub UI):
1. Create a new private repo named `modernforestry-shopify-theme-backup` in GitHub.
2. Then run:
```bash
git remote add origin git@github.com:<your-org-or-user>/modernforestry-shopify-theme-backup.git
git branch -M main
git push -u origin main
```

## Pull A Fresh Backup From Shopify
Use this whenever you want GitHub to reflect the latest live theme edits.

```bash
shopify theme pull --store modernforestry.myshopify.com --theme 159737250051
git add .
git commit -m "Backup: live theme snapshot YYYY-MM-DD"
git push
```

### One-Command Backup (Recommended)
From repo root:
```bash
./backup-live-theme.sh
```

Optional overrides:
```bash
SHOPIFY_STORE=modernforestry.myshopify.com SHOPIFY_THEME_ID=159737250051 ./backup-live-theme.sh
```

## Branch Strategy (Simple)
- `main` = production backup history (published theme tracking)
- Optional short-lived feature branches only for bigger edits
- Merge back to `main` after review or validation

## Connect Shopify Theme To GitHub
In Shopify Admin:
1. **Online Store → Themes**
2. Open the menu on the target theme (or **Add theme** area, depending on UI)
3. Click **Connect from GitHub**
4. Authorize GitHub account/app access
5. Select repo: `modernforestry-shopify-theme-backup`
6. Select branch: `main`
7. Confirm connect

After connection, merchant/admin theme edits can be tracked through the connected GitHub workflow.

## Tiny Ongoing Workflow (2 Minutes)
1. Pull latest live theme: `shopify theme pull --store modernforestry.myshopify.com --theme 159737250051`
2. Commit snapshot: `git add . && git commit -m "Backup: live snapshot YYYY-MM-DD"`
3. Push: `git push`
4. If needed, restore from an older commit by re-pushing that version to Shopify.

## Notes
- Keep this repo focused on backup and safe rollback.
- Avoid adding build tooling unless intentionally moving to a development-first workflow.

## Google Merchant Operations
- Merchant remediation runbook: `docs/google-merchant-remediation.md`
- Deterministic merchant audit script: `scripts/google-merchant-audit.rb`
- Typical usage:
  - `ruby scripts/google-merchant-audit.rb --store-domain theforestrystudio.com --issues-csv /path/to/product_issues.csv --missing-shipping-csv /path/to/missing_shipping.csv`

## New customer accounts migration end goal

We are adopting Shopify **new customer accounts** for authentication (Shopify-managed, independent from theme Liquid customer templates).

Candle Cash remains a **storefront-owned** experience. The canonical Candle Cash destination is:
- `/pages/rewards`

Theme responsibilities for this phase:
- Surface Candle Cash entry points across storefront UI (header, sidebar, cart, rewards surfaces).
- Route guests to Shopify authentication using `routes.account_login_url`.
- Ensure auth return paths land users back on `/pages/rewards` (including welcome/intent query params where used).
- Render + hydrate Candle Cash via existing Forestry/Backstage storefront integrations (app proxy endpoints + theme mounts).

Non-goal for this phase:
- Rebuilding Candle Cash inside Shopify’s new customer account UI.

Future option:
- If account-native Candle Cash is desired later, build it as a Backstage customer account extension (not via theme `templates/customers/*`).

Definition of done:
- No critical Candle Cash flow depends on legacy account templates or legacy password-based forms.
- Key Candle Cash CTAs no longer rely on legacy `/account` wallet anchors.
- Staging QA passes with Shopify new customer accounts enabled.

### Status (this branch)
- Implemented storefront-first Candle Cash routing to `/pages/rewards`; removed Candle Cash CTAs that sent users to legacy account wallet anchors.
- Guest Candle Cash login now uses `routes.account_login_url` with a default return path back to `/pages/rewards` (welcome/intent preserved where applicable).
- Updated Forestry widget mounts to consume `routes.account_login_url` via `data-login-url` rather than hard-coded legacy account URLs.

Manual QA still required:
- `/pages/rewards` as guest: log in + return to `/pages/rewards` (welcome/intent), Candle Cash loads, consent intent persists.
- Cart Candle Cash prompt as guest: sign in → return to `/pages/rewards`, then verify redemption still behaves correctly.
- Header/sidebar Candle Cash links: guest and logged-in behavior on desktop + mobile.

## Latest live change (2026-04-07)
- Theme `rewards-cache-reset-20260407` (`#159737250051`) is the active live theme.
- Rewards runtime/cache remediation shipped for Candle Cash status surfaces:
  - `assets/forestry-rewards.js`: pending state supports explicit retry (`data-action="refresh-status"`).
  - `layout/theme.liquid`: rewards script include now uses Shopify-native `asset_url` directly (no manual `?build` query suffix).
  - `sections/main-cart.liquid`: cache-bust touch marker added for cart shell refresh.
- Operational finding:
  - custom domain can still intermittently serve stale cached HTML/script references even when Shopify live theme is correct.
  - this is an operational CDN/custom-domain cache behavior, not a missing theme commit.

Behavior summary for this change:
- Before:
  - some users saw a pending card with `Check reward status` that behaved like a dead/disabled control.
  - stale shell HTML could pin older script versions and keep outdated fallback messaging visible.
- After:
  - pending state exposes explicit retry action (`refresh-status`) to force a fresh rewards status fetch.
  - shell markers reduce risk of old pinned rewards assets being reused across cart/rewards renders.
  - API response remains the source of truth for final redemption state.

## Latest live change (2026-04-08)
- Candle Cash GA hardening shipped in `snippets/forestry-rewards-root.liquid`.
- Removed the legacy single-email Candle Club fallback gate (`info@theforestrystudio.com`) so rewards-side Candle Club behavior is no longer pinned to a test email.
- Rewards root build marker advanced to `2026-04-08-ga-rollout-1` for faster shell/version diagnostics during cache drift checks.

## Latest live change (2026-04-09)
- AI/machine-readability hardening shipped for native product reviews + schema integrity.
- `snippets/microdata-schema.liquid` now emits stronger product schema with canonical URL consistency:
  - `@type: Product`
  - `name`, `description`, `brand`, `category`, `sku` (when present)
  - `gtin*` or `mpn` from barcode when present
  - `offers` with `price`, `priceCurrency`, `availability`, and canonical product `url`
- Native review rich-result fields were restored from Backstage-synced Shopify metafields (`forestry_reviews.*`):
  - `aggregateRating.ratingValue`
  - `aggregateRating.ratingCount`
  - optional `review[]` highlights from approved native review payloads
- `Organization` and `WebSite` JSON-LD entries are now emitted from real shop/theme data, plus breadcrumb output remains active.
- Product-page review summary/rating surfaces now server-render native review summary/count in HTML:
  - `snippets/forestry-product-review-summary.liquid`
  - `snippets/forestry-product-reviews-root.liquid`
  - `snippets/product-rating.liquid`
  - `snippets/product-tabs.liquid`
  - `sections/main-product.liquid`
- Legacy Growave runtime review helper surfaces were retired from active runtime output (historical import remains backend-only):
  - `snippets/ssw-widget-avg-rate-rich.liquid`
  - `snippets/ssw-widget-avg-rate-listing.liquid`
  - `snippets/ssw-helpers.liquid`
  - `snippets/ssw-login-helper.liquid`
  - `snippets/ssw-product-modal.liquid`
  - `templates/index.ssw-async.liquid`
- Live push completed to `rewards-cache-reset-20260407` (`#159737250051`).

## Latest live change (2026-04-01)
- Theme `review-cutover-staging-20260323` (`#159310446851`) updated and pushed.
- Birthday reward card is desktop-only (hidden <1024px).
- Referral card: no “Best growth move” pill; copy now “You earn $5 / Friend earns $10”; copy/share use native share when available and log analytics; builds a referral URL if only code exists.
- Product-review task: copy set to “Leave a product review on theforestrystudio.com”; CTA opens the onsite review drawer with anchor fallback; analytics event logged.
- Candle Club tasks gated to active Candle Club members only.
- Fallback referral amounts in `forestry-rewards-root.liquid` set to 5 / 10.
- Resolved warning (2026-04-08): `templates/search.json` now points to restored `sections/main-search.liquid`; JSON template/section consistency check passes with no missing section types.

## Native Reviews + Wishlist Cutover

Modern Forestry now uses Forestry-owned native reviews and wishlist storefront widgets backed by the Backstage app proxy.

Current expectations:
- Reviews:
  - `/apps/forestry/product-reviews/status`
  - `/apps/forestry/product-reviews/sitewide`
  - `/apps/forestry/product-reviews/submit`
- Wishlist:
  - `/apps/forestry/wishlist/status`
  - `/apps/forestry/wishlist/add`
  - `/apps/forestry/wishlist/remove`
  - `/apps/forestry/wishlist/lists/create`

Theme/runtime rules:
- `native_reviews_enabled=true`
- `native_wishlist_enabled=true`
- The floating left drawer stack is the persistent storefront entry point for reviews and wishlist.
- On product pages, the reviews drawer opens to the current product first and exposes a `See all reviews` action into the sitewide feed.
- Growave review/wishlist UI must remain disabled or removed from theme-rendered markup.
- Growave is historical import input only, not a runtime storefront dependency.

Recommended rollout flow:
1. Push app/backend changes to production and confirm app-proxy health.
2. Push theme changes to an unpublished preview theme and smoke-test review/wishlist UX there first.
3. Verify the preview HTML no longer contains Growave helper output or `ssw-empty.js`.
4. Promote/push the same theme changes to the live theme.
5. If Growave runtime still appears after the theme update, remove any remaining Shopify-side Growave app embeds/ScriptTags operationally.

Current live state as of 2026-04-07:
- The Backstage-owned review and wishlist proxy contract is live and verified.
- Guest wishlist add/status/remove works against the live app proxy with `guest_token`.
- Shopify admin marks `rewards-cache-reset-20260407` (`159737250051`) as the live theme.
- `theforestrystudio.com` is fronted by Cloudflare (`meadow.ns.cloudflare.com`, `randy.ns.cloudflare.com`) and can still intermittently serve stale cached HTML/script references even when Shopify response headers report live theme `159737250051`.
- That stale body persists under cache-busting query params, `Cache-Control: no-cache`, and a forced-host request directly to Shopify's edge IP (`curl --resolve theforestrystudio.com:443:23.227.38.65 ...`).
- The remaining issue is therefore not in the checked-in theme files and is not explained by a simple browser cache. It is an operational custom-host Shopify render/cache/routing problem that must be purged or corrected outside this repo before public-domain sign-off.
- Exact next action: purge or bypass the custom-domain cache layer and re-test `theforestrystudio.com`; if the body still reports theme `136487764227`, escalate to Shopify support with the host-specific mismatch evidence.

Rollback:
- Revert/push the previous theme snapshot and restore the prior flag state if storefront smoke fails.
- Backstage review/wishlist tables remain canonical even during a temporary storefront rollback.
