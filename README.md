# Modern Forestry Shopify Theme Backup

This repository is a **backup + version history** for the live Shopify theme.

## Purpose
- Keep a reliable GitHub history of the live theme code.
- Make rollback/recovery easy after bad edits.
- Stay lightweight: no build step, no framework migration, no heavy local workflow.

## Source Of Truth
Unless explicitly noted in a release note/PR, the source of truth is the **live Shopify theme** in the store admin.

- Store: `modernforestry.myshopify.com`
- Primary live theme tracked here: `review-cutover-staging-20260323` (`#159310446851`)
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
shopify theme pull --store modernforestry.myshopify.com --theme 159310446851

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
shopify theme pull --store modernforestry.myshopify.com --theme 159310446851
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
SHOPIFY_STORE=modernforestry.myshopify.com SHOPIFY_THEME_ID=159310446851 ./backup-live-theme.sh
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
1. Pull latest live theme: `shopify theme pull --store modernforestry.myshopify.com --theme 159310446851`
2. Commit snapshot: `git add . && git commit -m "Backup: live snapshot YYYY-MM-DD"`
3. Push: `git push`
4. If needed, restore from an older commit by re-pushing that version to Shopify.

## Notes
- Keep this repo focused on backup and safe rollback.
- Avoid adding build tooling unless intentionally moving to a development-first workflow.

## Native Reviews + Wishlist Cutover

Modern Forestry now uses Forestry-owned native reviews and wishlist storefront widgets backed by the Backstage app proxy.

Current expectations:
- Reviews:
  - `/apps/forestry/product-reviews/status`
  - `/apps/forestry/product-reviews/submit`
- Wishlist:
  - `/apps/forestry/wishlist/status`
  - `/apps/forestry/wishlist/add`
  - `/apps/forestry/wishlist/remove`
  - `/apps/forestry/wishlist/lists/create`

Theme/runtime rules:
- `native_reviews_enabled=true`
- `native_wishlist_enabled=true`
- Growave review/wishlist UI must remain disabled or removed from theme-rendered markup.
- Growave is historical import input only, not a runtime storefront dependency.

Recommended rollout flow:
1. Push app/backend changes to production and confirm app-proxy health.
2. Push theme changes to an unpublished preview theme and smoke-test review/wishlist UX there first.
3. Verify the preview HTML no longer contains Growave helper output or `ssw-empty.js`.
4. Promote/push the same theme changes to the live theme.
5. If Growave runtime still appears after the theme update, remove any remaining Shopify-side Growave app embeds/ScriptTags operationally.

Current live state as of 2026-03-31:
- The Backstage-owned review and wishlist proxy contract is live and verified.
- Guest wishlist add/status/remove works against the live app proxy with `guest_token`.
- Shopify admin marks `review-cutover-staging-20260323` (`159310446851`) as the live theme, and `modernforestry.myshopify.com` is serving that theme without Growave runtime output.
- `theforestrystudio.com` is fronted by Cloudflare (`meadow.ns.cloudflare.com`, `randy.ns.cloudflare.com`) and still serves stale HTML from the older `Prestige` theme (`136487764227`) even while Shopify response headers report live theme `159310446851`.
- The remaining issue is therefore not in the checked-in theme files; it is an operational custom-domain edge/cache or rewrite problem that must be purged or corrected outside this repo before public-domain sign-off.

Rollback:
- Revert/push the previous theme snapshot and restore the prior flag state if storefront smoke fails.
- Backstage review/wishlist tables remain canonical even during a temporary storefront rollback.
