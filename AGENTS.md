# Theme delivery

- Use branches and PRs in this repository for Modern Forestry theme changes. Shopify tools are useful for reading current state and checking previews; keep theme source changes in GitHub.
- Read README.md and the relevant release note. Preserve the newer rewards runtime, customer authentication, task verification, gift-card/subscription admission and financial server checks.
- Compare a live snapshot with the repository before porting a change. Do not replace a newer source file just to match an older published runtime.
- Validate changed Liquid/JSON and run the relevant tests. The browser fixture uses fictional accounts and a local server; it must never make provider requests or create production rewards.
- Verify the connected Shopify theme received the merged files. The current GitHub theme is unpublished; synchronization and publication are separate outcomes.
- Use Safari for native browser review and WebKit for automated desktop/phone checks. Keep tests in isolated carts and stop checkout before payment.
- Store pages and shop policies are Shopify content. Keep reviewed public content snapshots under docs/storefront-content; those files are not published by theme synchronization.
