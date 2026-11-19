# Candle Cash daily redemption limit

Owner request: restrict Candle Cash to one redemption per customer per calendar
day, using Eastern Time, and state that rule throughout the storefront.

- Rewards status, wallet rules, FAQ, cart and drawer explain the daily limit.
- The daily-limit response disables a replacement redemption and explains the
  midnight reset. Existing unused-code recovery and separate birthday coupons
  remain available.
- The shared backend enforces the allowance under the canonical customer's lock.
  A code reserves the allowance on issuance; reuse does not spend again.
- The native rewards-program-faq page must receive the matching content snapshot
  separately from GitHub theme synchronization.
- This change does not alter balances, earning rates, sale prices or the approved
  product/shipping discount combination rules.

Validate the isolated WebKit retail fixtures at desktop and phone sizes. No test
may call a provider, create a production reward, or complete a payment.
