# Recharge Subscription Flow Diagnosis (2026-04-16)

## Current integration type
- Mixed/hybrid integration.
- Product page uses Recharge app block (`shopify://apps/recharge-subscriptions/...`) in `templates/product.json`.
- Legacy Recharge snippets still exist for product/cart/theme/account (`subscription-*.liquid`), with cart/theme/account snippets still wired.
- `snippets/subscription-product.liquid` is legacy `rcWidget.js` code but is not rendered anywhere in active product templates.

## Root causes identified
- The Recharge app block was mounted in a standalone `apps` section, not inside `main-product` form block flow. This can desync subscription selection from the active product form and cause unreliable selling-plan submission.
- Legacy non-cart checkout interception in `snippets/subscription-theme-footer.liquid` was globally active on non-cart templates and can conflict with modern selling-plan checkout flow by force-redirecting checkout actions.
- Customer account links were still hardcoded to legacy `/tools/recurring/*` paths, mismatched with modern app-block rollout.

## Affected files
- `templates/product.json`
- `snippets/subscription-theme-footer.liquid`
- `sections/main-customers-account.liquid`
- `snippets/subscription-account-login.liquid`

## Chosen minimum-safe fix strategy
- Keep legacy snippets in place for backwards compatibility, but only run legacy non-cart interception when cart items actually include legacy `shipping_interval_frequency` properties.
- Move existing Recharge app block into `main-product` block order so subscription UI is rendered in the product form context.
- Update manual account subscription links to a single modern portal entry path.

## Follow-up checkout fix (2026-04-25)

### Root cause
- The active cart checkout button submits a form with `action="/cart"` and `name="checkout"`, which is valid Shopify behavior.
- `assets/custom.js` intercepted cart form submission to save notes and clear tracking attributes before checkout, then resumed with `submittedForm.submit()`.
- Programmatic `form.submit()` does not include the clicked submit button, so the `checkout` submitter was dropped. Shopify received a plain `/cart` POST and refreshed the cart page instead of continuing to checkout.
- This affected subscription carts most visibly because Candle Club customers reached checkout from `/cart`, but the root blocker was theme JavaScript submitter handling, not Recharge checkout configuration.

### Additional subscription safeguards
- Product forms now expose subscription-required metadata so required-selling-plan products can fall back to the first available selling plan if the app widget has not injected one yet.
- Product-card and compact wishlist quick-add no longer silently add subscription products without a selling plan; subscription products route to their product page.
- Cart and drawer Candle Cash surfaces now render only when the cart contains one-time items, and mixed-cart Candle Cash progress uses only the one-time eligible subtotal.
