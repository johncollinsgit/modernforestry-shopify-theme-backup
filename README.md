# Modern Forestry Shopify Theme Backup

This repository is a **backup + version history** for the live Shopify theme.

## Purpose
- Keep a reliable GitHub history of the live theme code.
- Make rollback/recovery easy after bad edits.
- Stay lightweight: no build step, no framework migration, no heavy local workflow.

## Source Of Truth
Unless explicitly noted in a release note/PR, the source of truth is the **live Shopify theme** in the store admin.

- Store: `modernforestry.myshopify.com`
- Primary theme tracked here: `Prestige` (`#136487764227`)

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
shopify theme pull --store modernforestry.myshopify.com --theme 136487764227

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
shopify theme pull --store modernforestry.myshopify.com --theme 136487764227
git add .
git commit -m "Backup: live theme snapshot YYYY-MM-DD"
git push
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
1. Pull latest live theme: `shopify theme pull --store modernforestry.myshopify.com --theme 136487764227`
2. Commit snapshot: `git add . && git commit -m "Backup: live snapshot YYYY-MM-DD"`
3. Push: `git push`
4. If needed, restore from an older commit by re-pushing that version to Shopify.

## Notes
- Keep this repo focused on backup and safe rollback.
- Avoid adding build tooling unless intentionally moving to a development-first workflow.
