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

The homepage template passed Shopify theme validation. The exact candidate in unpublished theme `166782632195` passed native Safari review and desktop/phone WebKit checks for all four autumn images, links, collection order, featured product, shipping announcement and layout. Ten desktop/phone checks across rewards, Birthday Club, both FAQs and cart passed with zero page errors. Existing regressions also passed: 48 rewards scenarios, 24 Birthday Club scenarios, eight cart transitions, WLM availability and three smoke checks. The merged template checksum and fresh public storefront are verified after GitHub synchronization.

The unused Showcase trial (`134440517891`) was removed with explicit user authorization to free a preview slot. Shopify does not allow source export of that unpurchased DEMO theme; its metadata and that limitation were recorded. The current and recent rollback themes remain available.
