# Native Shopify Reviews + Wishlist Cutover

Last verified: 2026-03-31
Shopify-admin live theme: `review-cutover-staging-20260323` (`159310446851`)
Preview theme: `review-cutover-staging-20260323` (`159310446851`)
Storefront host: `https://theforestrystudio.com`

## Flag states

- Dual-mode safety state: `native_reviews_enabled=true`, `growave_reviews_enabled=true`
- Full native target: `native_reviews_enabled=true`, `growave_reviews_enabled=false`
- Instant rollback: `native_reviews_enabled=false`, `growave_reviews_enabled=true`

No code deploy is required for rollback. Changing the two theme settings is sufficient.

## Launch order

1. Confirm backend review/wishlist contract deploy is live and app-proxy requests return `200`.
2. Push the theme changes to the preview theme first.
3. Verify preview HTML no longer contains Growave helper markup or `ssw-empty.js`.
4. Run the storefront smoke matrix below on the preview theme.
5. Run one manual QA-safe review submit and one guest-token wishlist flow.
6. Promote/push the same theme state to the live theme.
7. Monitor review/wishlist signals for 30-60 minutes.
8. Roll back immediately if any rollback trigger is hit.

## Smoke-test matrix

Baseline expectations below were captured on 2026-03-23. If a real customer submits a new review after that point, the count may rise, but the product must still render correctly and match the native status payload.

| Product handle | Expected baseline | Expected average | Empty state | Notes |
| --- | --- | --- | --- | --- |
| `new-room-spray` | `17` reviews | `5.0` | No | Historical Growave-import continuity case |
| `almond-cream-cake` | `1` review | `5.0` | No | Single historical Growave-import case |
| `fire-pit-wax-melt-warmer` | `0` reviews | `0.0` / `No reviews yet` | Yes | No-review control |
| `winter-flight` | `3` reviews | `4.7` | No | Mixed legacy + native case |
| `spring-flight` | `2` reviews | `4.0` | No | Native-only QA baseline |

## Pass criteria

Each smoke-test product passes only if all of the following are true:

- Product summary rating matches the native review payload.
- Review tab/count badge matches the native review payload.
- Review cards render when reviews exist.
- Empty state renders only for `fire-pit-wax-melt-warmer`.
- Growave surfaces do not render in native-only mode.
- Native status request returns `200` from `/apps/forestry/product-reviews/status`.
- Response `meta.auth_mode` is `app_proxy`.
- Guest wishlist status/add/remove works through `/apps/forestry/wishlist/*` with `guest_token`.
- Preview/live HTML does not contain `socialshopwave-helper-v2`, `GW_BUNDLE_URL`, or `ssw-empty.js`.

## Manual submit check

Do this only with a QA-safe product/account approved for production verification.

1. Open the published product page for the QA-safe product.
2. Submit one valid review through the storefront form.
3. Confirm success UI appears and the page re-renders with the new review.
4. Refresh the page and confirm the review still appears through the native read path.
5. Attempt a second submit for the same product/account.
6. Confirm the duplicate is blocked with the existing "already reviewed" messaging.
7. Confirm the count does not increment on the duplicate attempt.

Expected backend signals for the manual submit check:

- One `widget_product_review_submit` event with `status=ok`
- One `product_review_submitted` event
- One duplicate-block event on the second attempt:
  - `widget_product_review_submit` with `status=error` and `issue_type=duplicate_review`
  - `product_review_duplicate_blocked`
- If the QA user resolves to a profile, exactly one persisted reward chain in logs/event metadata:
  - `award_state`
  - `task_event_id`
  - `task_completion_id`
  - `transaction_id`

## Monitoring signals

Use existing signals only. No extra launch code is required.

Primary signals:

- `marketing_storefront_events`
  - `widget_product_review_status_lookup`
  - `widget_product_review_submit`
  - `product_review_submitted`
  - `product_review_duplicate_blocked`
- Laravel app logs
  - `native product review submission received`
  - `native product review duplicate blocked`
  - `native product review submit failed`
  - `native product review persisted`
- App-proxy health
  - Representative products continue returning `200` from `/apps/forestry/product-reviews/status`

Launch-window watch items:

- unexpected drop to zero on a historical-review product
- repeated app-proxy failures under normal browsing
- submit succeeds in UI but no persisted review appears after refresh
- duplicate submit increments count or creates a second reward
- guest wishlist add/remove fails or gets stuck in loading state
- any remaining Growave helper/app snippet markup returns in preview or live HTML

## Rollback triggers

Roll back immediately if any of the following occur:

- `new-room-spray` or `almond-cream-cake` loses historical reviews in native-only mode
- `fire-pit-wax-melt-warmer` stops showing the empty state correctly
- `winter-flight` loses either native or legacy reviews unexpectedly
- published submit path fails for the QA-safe submit check
- duplicate submit is not blocked cleanly
- repeated app-proxy failures reproduce during normal browsing, not just rapid headless reloads

## Rollback steps

1. Set `native_reviews_enabled=false`
2. Set `growave_reviews_enabled=true`
3. Re-test:
   - `new-room-spray`
   - `almond-cream-cake`
   - one submit surface
4. Leave backend patch in place. The rollback is theme-flag based.

## Verification notes from 2026-03-23

- Live theme is currently in full native mode:
  - `native_reviews_enabled=true`
  - `growave_reviews_enabled=false`
- Published-storefront spot checks passed for:
  - `new-room-spray`
  - `almond-cream-cake`
  - `fire-pit-wax-melt-warmer`
  - `winter-flight`
  - `spring-flight`

## Verification notes from 2026-03-31

- App/backend cutover is live:
  - `/apps/forestry/product-reviews/status` returns `task.button_text = "Write a review"`
  - `/apps/forestry/product-reviews/status` returns `task.reward_amount = "1.00"`
  - `/apps/forestry/wishlist/add` succeeds for guests with `guest_token`
  - `/apps/forestry/wishlist/status` and `/apps/forestry/wishlist/remove` return promptly on the live store
- Theme work completed:
  - Growave app embed was removed from `settings_data.json`
  - Growave product app block was removed from `templates/product.json`
  - Native review + wishlist JS/CSS hardening remains in place
  - `layout/theme.liquid` now strips the `ssw-empty.js` loader entry from `content_for_header` and blocks late Growave script injection
- Operational storefront result:
  - `modernforestry.myshopify.com` serves the live theme `review-cutover-staging-20260323` (`159310446851`)
  - Headless browser verification on `modernforestry.myshopify.com` shows no Growave runtime requests and no Growave app block markup in the rendered DOM
  - `https://theforestrystudio.com` is Cloudflare-fronted and still serves stale storefront HTML that reports the older `Prestige` theme (`136487764227`) and still includes `socialshopwave-helper-v2`, `ssw-empty.js`, and `GW_BUNDLE_URL`
  - The custom-domain response headers still report Shopify live theme `159310446851`, so the remaining mismatch is at the public-domain edge/body path rather than in the checked-in live theme files
- Conclusion:
  - The checked-in theme and Shopify live theme assignment are cut over cleanly
  - Final alpha sign-off is blocked by the custom domain still serving stale old-theme HTML, which now appears to be a Cloudflare/custom-domain routing, cache, or rewrite issue outside this repo
