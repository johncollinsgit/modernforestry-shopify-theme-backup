# Google Merchant Remediation (Forest Candles)

## 1) Current issue summary (as of 2026-04-15)

Source files reviewed:
- `/Users/johncollins/Downloads/product_issues_2026-04-15_10-10-18.csv`
- `/Users/johncollins/Downloads/issue_report_5763778175_Missing_shipping_information_2026-04-15_10-09-07.csv`

Observed status:
- 397 product issue rows total.
- 264 rows are `Missing shipping information`.
- 133 rows are `Pending initial review` (local inventory ads; informational unless they stall beyond review window).
- 132 unique item IDs are disapproved for online channels due to missing shipping.
- Missing-shipping rows are tied to `Shopify App API` feed data and `US` online destinations.

Interpretation:
- The primary blocker is shipping coverage configuration in Merchant Center for US online listings.
- Theme/schema improvements help machine readability and search surfaces, but they do not replace Merchant Center shipping services.

## 2) Root causes

### Root cause A (blocking approvals):
Merchant Center account/feed shipping for US online products is incomplete or missing.

Evidence:
- `Missing shipping information` only appears for `ONLINE` rows in Shopping ads and Free listings.
- `Pending initial review` rows are separate `LOCAL` channel rows.

### Root cause B (non-blocking but important):
The theme had no operational guardrails to detect merchant-critical gaps before submission.

Evidence:
- No deterministic merchant field audit script existed.
- No in-repo remediation runbook for Merchant Center shipping ownership and verification.

### Root cause C (search-surface quality):
Machine-readable shipping/returns data was not emitted in schema.

Evidence:
- Product schema had strong basics, but no `OfferShippingDetails` or `MerchantReturnPolicy` path.

## 3) Code changes made

### Theme/schema hardening
- `snippets/microdata-schema.liquid`
  - Preserved Product/Offer core schema and review support.
  - Added stronger product image handling (multiple HTTPS images when available).
  - Added `itemCondition` support on offers via theme setting.
  - Added optional `shippingDetails` emission with strict guardrails:
    - Emits only when shipping schema setting is enabled and required fields are configured.
    - Supports flat shipping or free-shipping-threshold representation.
    - Includes handling/transit windows.
  - Added optional `hasMerchantReturnPolicy` under Organization when return settings + refund policy URL are present.
  - Added Organization `sameAs` social profile support.
  - Kept SearchAction and canonical-aligned URLs.

- `config/settings_schema.json`
  - Added new **Merchant listings** settings group to control structured shipping/return data truthfully.

### Canonical/image consistency
- `snippets/social-meta-tags.liquid`
  - Switched `og:image` URLs from `http:` to `https:`.

- `snippets/product-item.liquid`
  - Standardized product links to `/products/{handle}` for cleaner canonical consistency.
  - Canonicalized swatch variant URLs to `/products/{handle}?variant={id}`.

- `sections/main-product.liquid`
  - Canonicalized social share URLs to product canonical URL instead of contextual product URL.

### SEO metadata fallback framework
- `layout/theme.liquid`
  - Added a maintainable fallback meta-description framework for product pages when explicit SEO description is missing.
  - Uses real attributes only (title, brand/vendor, soy-wax signal, woodland/rustic/hiking context when present in product data).

### Audit/reporting safeguards
- `scripts/google-merchant-audit.rb`
  - Fetches live published products from `/products.json` (or accepts local products JSON).
  - Audits critical merchant fields (title, description, link, image, availability, price, brand).
  - Flags recommended fields (product type, sku/barcode quality).
  - Ingests Merchant Center issue CSV exports and summarizes shipping disapprovals.
  - Generates deterministic reports:
    - `reports/google-merchant-critical-field-gaps.csv`
    - `reports/google-merchant-audit-summary.md`
  - Exit codes:
    - `0`: no critical gaps and no shipping disapprovals in issue CSV.
    - `1`: critical product metadata gaps detected.
    - `2`: missing shipping issues detected in Merchant CSV.

## 4) What still must be done manually in Merchant Center / Shopify admin

This is required to resolve the current disapprovals.

1. In Merchant Center, create/fix US shipping service for online products.
2. Ensure the service applies to destination `United States` and to relevant programs (Free listings + Shopping ads).
3. Configure real rates (flat/carrier/free-threshold) and delivery times that match checkout reality.
4. Confirm no account-level rule excludes these products from shipping coverage.
5. If using the Google & YouTube Shopify channel, verify target country/feed label alignment with Merchant Center shipping service (US feed label).
6. Wait for reprocessing, then re-check Diagnostics.

Shopify-side prerequisites:
1. In Shopify Admin → Settings → Shipping and delivery, confirm US shipping zones/rates are active and match the rates/timelines declared in Merchant Center.
2. Verify affected products are physical items (`requires shipping` enabled where applicable) and published to the Google & YouTube sales channel.

Notes:
- Theme JSON-LD cannot directly set Merchant Center account shipping services.
- Shipping account settings are authoritative for the issue currently shown in your exports.

## 5) Eligibility verification checklist

Run this from theme repo root:

```bash
ruby scripts/google-merchant-audit.rb \
  --store-domain theforestrystudio.com \
  --issues-csv "/Users/johncollins/Downloads/product_issues_2026-04-15_10-10-18.csv" \
  --missing-shipping-csv "/Users/johncollins/Downloads/issue_report_5763778175_Missing_shipping_information_2026-04-15_10-09-07.csv"
```

Pass criteria:
- Script reports `Missing shipping rows: 0`.
- Merchant Center Diagnostics no longer shows `Missing shipping information` for affected items.
- `reports/google-merchant-critical-field-gaps.csv` contains no critical-field rows (or only intentionally excluded products).
- Product pages still render and schema validates.

## 6) Product metadata pattern guidance (sustainable, non-stuffed)

For product title/meta copy updates in catalog data, use this order:
1. Core scent/style name
2. Format/size (wax melt, 4oz/8oz/16oz)
3. Material qualifier when true (`soy wax`)
4. Use-case/style qualifier when true (`woodland`, `rustic`, `hiking/outdoors`, `wholesale`)
5. Brand consistency (`Forest Candles` / existing store brand)

Examples (patterns, not forced templates):
- `Wild Thistle Soy Wax Candle – 8oz Cotton Wick`
- `Thru Hike Soy Wax Candle – 16oz Cedar Wick`
- `Rustic Woodland Soy Wax Candle – 4oz`

Keep qualifiers truthful to the visible product and avoid appending irrelevant keyword blocks.

## 7) Operational rollout order

1. Configure Merchant Center shipping service (blocking fix).
2. Re-fetch Diagnostics export after reprocessing.
3. Re-run `google-merchant-audit.rb` with the new exports.
4. Confirm missing-shipping count reaches zero.
5. Keep the audit script in ongoing release checks so shipping and merchant gaps are caught before approval loss.
