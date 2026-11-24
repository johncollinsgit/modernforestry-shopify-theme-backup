import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
const { webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(process.env.REWARDS_ASSET || 'assets/forestry-rewards.js', 'utf8');
const eligibility = 'Candles, wax melts, and other retail merchandise qualify, including mixed carts. Subscriptions (including Candle Club), renewal charges, and gift cards are excluded.';
const scenarios = (process.env.SCENARIOS || 'wallet,empty,disabled,saved,pending,pending-no-code,birthday-only,retry,daily,daily-birthday').split(',');
const browser = await webkit.launch({ headless: true });
let passed = 0;
try {
 for (const width of [1280, 390]) for (const surface of ['page', 'cart', 'drawer']) for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let redeemed = 0, attempts = 0, applied = false, qualifyingCents = 5000;
  const pending = scenario.startsWith('pending');
  const daily = scenario.startsWith('daily');
  const code = { redemption_code: scenario === 'pending-no-code' ? '' : 'FICTIONAL-REWARD-ONLY', discount_title: 'FICTIONAL-REWARD-ONLY', is_usable: !pending, apply_path: '/discount/FICTIONAL-REWARD-ONLY?redirect=%2Fcart', reward: { name: 'Candle Cash', reward_value: 10 } };
  const root = `<div data-forestry-rewards-root data-surface="${surface}" data-shopify-customer-id="771" data-endpoint-candle-cash-status="/apps/forestry/candle-cash/status" data-endpoint-rewards-redeem="/apps/forestry/rewards/redeem" data-endpoint-rewards-event="/apps/forestry/rewards/event"></div>`;
  const server = http.createServer(async (req, res) => {
   const path = new URL(req.url, 'http://localhost').pathname;
   const reply = (status, type, body, headers = {}) => { res.writeHead(status, { 'Content-Type': type, ...headers }); res.end(body); };
   const json = data => reply(200, 'application/json', JSON.stringify(data));
   if (path === '/pages/rewards' || path === '/cart') return reply(200, 'text/html', `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${path === '/cart' && surface === 'page' ? root.replace('data-surface="page"', 'data-surface="cart"') : root}<div class="Cart__TotalPrice">$50.00</div><script>${source}</script></body></html>`);
   if (path.endsWith('/candle-cash/status')) return json({ ok: true, data: {
    profile_id: 1, state: 'linked_customer', balance: { amount: scenario === 'birthday-only' ? 0 : scenario === 'empty' ? 5 : redeemed ? 70.5 : 80.5 },
    redemption_access: { redeem_enabled: scenario !== 'disabled' && !daily, mode: daily ? 'daily_limit_reached' : 'live', cta_label: daily ? 'Available tomorrow' : 'Redeem Candle Cash', message: daily ? 'Candle Cash can only be redeemed once per customer per day (Eastern Time). Please try again after midnight Eastern Time.' : '' }, redemption_rules: { redeem_increment_dollars: 10, online_minimum_subtotal_cents: 4000, online_eligibility_message: eligibility },
    cart_reward_available: ['wallet', 'retry', 'saved'].includes(scenario),
    available_rewards: [{ id: 1, candle_cash_cost: 10, reward_value: 10 }],
    reward_codes: redeemed || ['saved', 'pending', 'pending-no-code'].includes(scenario) ? [code] : [],
    birthday: ['birthday-only', 'daily-birthday'].includes(scenario) ? { state: 'birthday_reward_ready', issuance: { reward_name: 'Birthday coupon', reward_value: 10, reward_code: 'FICTIONAL-BIRTHDAY-ONLY', is_usable: true, apply_path: '/discount/FICTIONAL-BIRTHDAY-ONLY?redirect=%2Fcart' } } : {},
   } });
   if (path === '/cart.js') return json({ total_price: qualifyingCents - (applied ? 1000 : 0), original_total_price: qualifyingCents, total_discount: applied ? 1000 : 0, item_count: qualifyingCents ? 1 : 0, currency: 'USD', items: qualifyingCents ? [{ original_line_price: qualifyingCents }] : [], cart_level_discount_applications: applied ? [{ title: code.discount_title, total_allocated_amount: 1000 }] : [] });
   if (path.endsWith('/rewards/redeem')) {
    attempts++;
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    assert.equal(request.reward_id, 1); assert.equal(request.reuse_existing_code, true);
    if (scenario === 'retry' && attempts === 1) return json({ ok: false, error: { message: 'Temporary failure' } });
    redeemed++; return json({ ok: true, data: code });
   }
   if (path.startsWith('/discount/')) { applied = true; return reply(302, 'text/plain', '', { location: '/cart' }); }
   return json({ ok: true, data: {} });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  try {
   await page.goto(origin + (surface === 'page' ? '/pages/rewards' : '/cart'));
   await page.waitForFunction(() => document.querySelector('[data-forestry-rewards-root]')?.dataset.forestryRewardsState === 'loaded');
   if (surface === 'page') await page.locator('[data-action="set-tab"][data-tab-target="status"]').click();
   const rootEl = page.locator('[data-forestry-rewards-root]');
   assert.ok((await rootEl.textContent()).includes(eligibility), `${surface}/${scenario}: public eligibility wording`);
   const redeem = rootEl.locator('[data-action="redeem-reward"]');
   assert.match(await rootEl.textContent(), /once per (customer per )?day|once per day/);
   if (scenario === 'daily') {
    assert.match(await rootEl.textContent(), /after midnight Eastern Time/);
    assert.equal(await rootEl.getByRole('button', { name: 'Available tomorrow' }).isDisabled(), true);
   }
   if (scenario === 'daily-birthday') assert.ok(await rootEl.locator('[data-action="apply-reward"][data-reward-kind="birthday"]').count() > 0);
   if (surface === 'page') {
    assert.equal(await rootEl.locator('.ForestryRewardsStatLabel').first().textContent(), 'Candle Cash balance');
    assert.equal(await rootEl.locator('.ForestryRewardsStatValue').first().textContent(), scenario === 'birthday-only' ? '$0' : scenario === 'empty' ? '$5' : '$80.50');
   }
   if (['wallet', 'retry'].includes(scenario)) {
    assert.equal(await redeem.count(), 1, `${surface}/${scenario}: funded wallet has redemption action`);
    await redeem.click();
    if (scenario === 'retry') { await page.waitForFunction(() => document.querySelector('[data-action="redeem-reward"]')?.disabled === false); await redeem.click(); }
    await page.waitForFunction(() => document.querySelector('[data-forestry-rewards-root]')?.textContent.includes('Candle Cash Redeemed'));
    assert.equal(redeemed, 1); assert.equal(applied, true);
    assert.equal((await (await page.request.get(origin + '/cart.js')).json()).total_price, 4000);
   } else {
    assert.equal(await redeem.count(), 0, `${surface}/${scenario}: no replacement redemption`);
    if (pending) { assert.equal(await rootEl.locator('[data-action="apply-reward"]').count(), 0); assert.match(await rootEl.textContent(), /still being confirmed/); }
    if (scenario === 'saved') assert.ok(await rootEl.locator('[data-action="apply-reward"]').count() > 0);
    assert.equal(redeemed, 0);
   }
   if (surface !== 'page') {
    const progress = rootEl.locator('[data-candle-cash-redemption-progress]');
    if (scenario === 'saved') {
     for (const subtotal of [0, 1500, 2995, 3250, 3500, 3999, 4000, 4001, 7500, 3500]) {
      qualifyingCents = subtotal;
      await page.evaluate(() => document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true })));
      const message = subtotal < 4000
       ? 'Add $' + ((4000 - subtotal) / 100).toFixed(2) + ' to unlock your $10 Candle Cash!'
       : 'Your $10 Candle Cash is unlocked! Apply it at checkout.';
      await progress.getByRole('status').filter({ hasText: message }).waitFor();
      assert.equal(await progress.getByRole('progressbar').getAttribute('aria-valuenow'), String(Math.min(subtotal, 4000)));
      assert.equal(await rootEl.locator('[data-action="apply-reward"][data-reward-kind="candle_cash"]').count(), subtotal >= 4000 ? 1 : 0);
     }
    } else if (!['wallet', 'retry'].includes(scenario)) {
     assert.equal(await progress.count(), 0);
    }
   }
   assert.deepEqual(errors, []);
   passed++;
  } catch (error) { throw new Error(`${width}/${surface}/${scenario}: ${error.message}`); }
  finally { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
 }
} finally { await browser.close(); }
console.log(`Retail reconciliation: ${passed} WebKit scenarios passed (desktop/phone; page/cart/drawer).`);
