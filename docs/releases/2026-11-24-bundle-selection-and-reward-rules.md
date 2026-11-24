# Bundle selection and Candle Cash correction

Collection, homepage and search product cards must send bundle and retail case
shoppers to the product page to choose their scents. These products cannot use a
direct add form that supplies only a variant ID. Featured product sections follow
the same rule. Product pages retain their existing required-scent validation and
Shopify's checkout validation remains enabled.

The reported products were five wax melts, the three candle bundles (4oz, 8oz,
16oz), and the three retail cases of twelve. All seven, plus the three-wax-melt
bundle, saved the required 3, 5 or 12 scent properties in isolated live WebKit carts.
All eight collection quick-add buttons also reproduced the exact Shopify 422
error from fresh empty carts; every rejected cart remained empty. A stale cart
entry is therefore not required to trigger the reported failure.

The owner confirmed the current Candle Cash policy:

- At least $10 available; redeem exactly $10 on a $40+ merchandise purchase,
  before taxes and shipping.
- Ordinary merchandise and mixed carts qualify, including merchandise-only carts.
- Subscription items and renewals remain excluded. Gift-card restrictions remain.
- One redemption per customer per Eastern calendar day and one code per order.

The live tenant policy's partial-redemption switch caused its status API to
advertise a $1 increment even when an issued code discounted $10. The switch was
disabled through the existing policy review/update service with audit/version
history (version 8 to 9). No theme hard-coded amount or customer balance repair
was needed. The public API now reports a $10 increment and a $10 reward cost.

The public `copy-of-online-store` page contained a collection tile linking to a
Shopify admin collection URL. Its Autumn destination was changed to the public
collection. The Spring tile also incorrectly linked to Winter and now links to
Spring. The reviewed HTML snapshot is in `docs/storefront-content`; publishing
this Shopify page content is separate from GitHub theme synchronization.

Validation: 22 rendered card/featured-product WebKit checks passed at desktop and
phone widths; the regression fails against the prior product-card source.
Liquid validation reports the same existing six image-dimension errors and
legacy warnings as the unchanged baseline, with no added findings. The locale
JSON passes validation. Live storefront link scanning and post-merge acceptance
are recorded in the task's audit evidence.
The changed runtime, rewards-root and FAQ snippet pass validation; the only
remaining errors are the unchanged six image-dimension findings in the two
legacy product templates. Sixty rewards WebKit scenarios passed across desktop
and phone views for page/cart/drawer; the three existing smoke scripts passed.

The rules card, wallet, cart/drawer and rewards FAQ display the shared online
eligibility message. The separately published Rewards Program FAQ explicitly
confirms ordinary merchandise-only carts as well as mixed carts, and names all
subscription items, renewals and gift cards as exclusions.

An old cart entry without scents must be removed and added again with every scent
selected. The new cards prevent creating that entry through collection quick add.

An expanded scan checked 983 theme/image/script/style resources. The only broken
resource was the legacy `/apps/wlm/js/wlm-1.1.js` script (HTTP 404), included on
every page. Its failed script reference was removed. The existing Liquid
wholesale restrictions, retail case exceptions and guarded optional WLM hooks
remain intact. The legacy WebKit cart-transition and WLM-present/absent checks
cover those retained hooks.
