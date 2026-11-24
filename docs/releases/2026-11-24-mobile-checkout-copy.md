# Mobile checkout and rewards wording

Live WebKit checks at 375, 390 and 430 pixel phone widths covered all eight
custom candle/melt bundles and retail cases. Every required scent was blocked
when missing, retained in the cart after a reload, and displayed in Shopify's
checkout order summary. No horizontal overflow was observed in cart or checkout.

Two 16oz bundles with different scent selections remained separate cart and
checkout lines. Adding another with identical choices increased the matching
line's quantity without changing either set of scents. An owner-authorized $10
Candle Cash code reduced the merchandise subtotal by exactly $10 in the cart,
after refresh, and in mobile checkout. Multiple bundles still received one $10
order discount. Testing stopped before payment, with no order placed.

Customer wording now distinguishes the required balance from the discount per
order, explains the full-balance requirement without increment jargon, and uses
the program's published expiration message instead of "Store rules apply."
Bundle help says to choose every scent and add the bundle to the cart; it does
not imply saving permanent scent preferences. Code-status messages direct the
shopper to saved codes instead of describing a cart-ready code being returned.
Referral fallback amounts match the current public API ($10 referrer/$5 friend).

The separately published Rewards Program FAQ names onsite product reviews,
removes obsolete signup/points instructions from the activity section, and
explains reopening an unused code without spending another $10. The source
snapshot is under `docs/storefront-content`; theme sync does not publish it.

Validation: changed runtime, root and locale files pass Shopify validation;
60 rewards WebKit scenarios and 26 cart continuity/wishlist checks pass.
