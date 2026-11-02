# Retail case scent selection repair — November 2, 2026

The 8oz case page rendered an Everbranch scent-options app block, but both app-extension asset URLs returned HTTP 404. The block stayed hidden, so customers could submit a case without the 12 `Scent N` line-item properties required by checkout. The theme also failed to classify `bulk-discount` handles as bundles and displayed accelerated checkout on those cases.

The product section now loads a theme-hosted renderer and stylesheet and provides its own options mount before the buy buttons. It reads the existing `/apps/forestry/product-options` service, preserving the configured scent list, selection counts and distinct-scent requirements. Existing app mounts are deduplicated. Required selections are copied to hidden `properties[Scent N]` inputs in the product form so native and Prestige AJAX submissions include them. Loading failures block expected bundles with a visible refresh message; ordinary products remain purchasable when that service is unavailable. `bulk-discount` cases receive bundle validation and have product-page accelerated checkout hidden. English labels live in the theme locale file.

## Deployment scope

Store: `modernforestry.myshopify.com` / `theforestrystudio.com`. Live theme: `159737250051`.

Only these four files are uploaded:

- `assets/forestry-product-scent-options.js`
- `assets/forestry-product-scent-options.css`
- `sections/main-product.liquid`
- `locales/en.default.json`

The live product section and locale had pre-existing differences from repository main. The same small patch was applied separately to a fresh live download for deployment and to repository main for version history. No unrelated section or locale differences are deployed. The existing app block may still request its missing extension assets; selection no longer depends on those requests. This repair does not release a new app version or change server validation, prices, inventory or orders.

## Verification

- Reproduced the original live page with zero scent selectors.
- Tested an unpublished copy of the live theme before deployment.
- Twelve selectors render on 4oz, 8oz and 16oz cases; one mount per product form.
- Empty and partially completed 8oz cases cannot submit; repeated scents are allowed for cases.
- A completed mixed 8oz case retains all twelve properties in the cart and reaches Shopify Checkout with all twelve visible in its order summary.
- No purchase is submitted; each test cart is cleared afterward.
- Mobile width 390px has all twelve controls with no horizontal overflow.
- Simulated a failed options endpoint: cases display an error and cannot submit; a normal single-scent candle remains unaffected.
- JavaScript syntax passes. Shopify's validator passes the new assets and locale. The product section adds no diagnostics over the live baseline; four pre-existing image-dimension errors and nine pre-existing warnings remain.
