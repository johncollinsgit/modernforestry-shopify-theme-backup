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
