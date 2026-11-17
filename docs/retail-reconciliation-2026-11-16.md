# Retail rewards, birthdays and shipping reconciliation

The November 16 live edits used Shopify draft themes. This change brings their intended behavior into the existing GitHub source without replacing its larger rewards runtime or its authentication, task, drawer and checkout protections.

## Published state

- Retail store: modernforestry.myshopify.com, public domain theforestrystudio.com.
- Current published theme: Retail shipping terms 2026-11-16, ID 165915361539.
- Prior reviewed rewards/birthday theme retained: ID 166696976643.
- GitHub-connected theme: modernforestry-shopify-theme-backup/main, ID 159295144195, unpublished.
- App/backend release and source fixtures: TimberLine PR 643, merged 4155476c07e007d0ce30e4ffac7ea3d84d72e950.

## Reconciled source

- Add the Birthday Club assets, section and page template used by /pages/birthday-club. The old birthday page records redirect to this canonical page; redirects remain Shopify store data.
- Preserve the existing rewards page tabs and runtime. The Status account card reuses the compact server-authorized redemption action; exact dollar balances are retained and birthday coupons are separate.
- A saved reward awaiting confirmation cannot be applied or cause another redemption. Its refresh action reuses the existing status endpoint. Usable codes, failures and retries retain the existing server contract.
- Keep birthday copy consistent with an annual $10 coupon and no new signup bonus. Original dates, codes, expiry, balances and ledger history remain owned by the backend.
- Clarify RETAILOVER75 in the announcement and both cart-threshold messages: eligible one-time U.S. retail orders require $75 and a selected shipping rate of $20 or less. Rates above $20 receive no shipping discount from this code. Customers can select a cheaper eligible rate when checkout offers one.
- Only the announcement content/link and two shipping translation values change in the existing merchant settings. Discount settings, available carrier rates and refunds are unchanged.

## Shopify content

The current public content is retained under docs/storefront-content:

- rewards-program-faq.html -> /pages/rewards-program-faq
- frequently-asked-questions.html -> /pages/frequently-asked-questions
- shipping-policy.html -> /policies/shipping-policy

Shopify owns these page and policy records. Theme integration does not publish these snapshots. The live records already contain the revised copy; preserve unrelated content when making a later CMS update.

## Validation and release boundary

Run node syntax checks, the existing three smoke scripts, theme validation, tests/retail-reconciliation.browser.mjs and tests/birthday-club.browser.mjs. Both browser tests import Playwright from PLAYWRIGHT_MODULE (or the normal playwright package). The retail fixture uses a local server and fictional data and blocks requests to external origins. It covers desktop/phone page, cart and drawer flows, balance precision, saved/pending codes, retries, one redemption and the cart discount total. The birthday fixture intercepts every request and covers guest access, date capture, annual gifts, history, expiry and retry behavior.

Reconciliation checks: 48 retail and 24 birthday WebKit scenarios passed. The new pending-code regression fails against the original repository runtime as expected. All three existing smoke scripts and syntax checks passed. Theme validation passed with existing route/CDN and deprecated-font warnings; the two missing birthday dependencies were added unchanged from the published theme.

The published smaller runtime was tested live in Safari/WebKit, including the birthday redirects, guest login return and four five-wax-melt checkout cases. That evidence does not establish live acceptance of the repository's larger rewards runtime. After merge, verify GitHub synchronization and review the connected preview before considering a separate publication.
