# Autumn homepage restoration — November 18, 2026

## Cause

The November 16 Codex chat **Find Becky’s website action emails** published the GitHub-connected theme (`159295144195`) at approximately 8:40 p.m. Eastern. That publication retained the repository's April homepage template instead of the newer October 28 seasonal homepage from the previous live theme. Release checks covered rewards, Birthday Club, FAQs, shipping and checkout, but missed the homepage comparison.

## Focused restoration

Restore only `templates/index.json` from the retained **Retail shipping terms 2026-11-16** theme (`165915361539`, homepage checksum `17e28ccbc3e9cf2229905d2a9f212413`):

- Four autumn slides, including desktop/mobile images and their original links.
- Autumn, winter and holiday collections first in the collection list.
- The `new-autumn-no-9` featured product.
- Remove the outdated Easter signup slide.

## Becky’s website fixes are preserved

This change does not roll back the theme. The existing rewards runtime, customer authentication, Birthday Club, annual birthday coupon behavior, shipping announcement and cart wording, reviewed FAQ content, and legacy cart/WLM script corrections remain in place. No reward balances, redemption history, birthdays, discounts, orders or customer records are changed.

## Change notifications

The requested hourly Codex monitor compares the published theme, homepage settings/photos, published pages, navigation and policies. It emails `modernforestryevents@gmail.com` and `modernforestryshipping@gmail.com` from `johncollinsemail@gmail.com` only when a change is found. Alerts list the differences, detection time, links and attributable commit/editor evidence. Direct editing remains available. The monitor reports changes; it does not prevent authorized edits, and scheduled checks require the local Codex scheduler to run.

## Validation

The homepage template passed Shopify theme validation. Before release, review the unpublished candidate in Safari and desktop/mobile WebKit, verify all four autumn slides and links, collection order and featured product, and rerun the existing rewards, Birthday Club and legacy-script regressions. Verify the merged template checksum and fresh public storefront after GitHub synchronization.
