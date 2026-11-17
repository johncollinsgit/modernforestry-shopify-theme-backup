import assert from 'node:assert/strict';
import fs from 'node:fs';
const { webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const js = fs.readFileSync('assets/forestry-birthday-club.js', 'utf8');
const css = fs.readFileSync('assets/forestry-birthday-club.css', 'utf8');
const section = fs.readFileSync('sections/forestry-birthday-club.liquid', 'utf8')
  .replace(/{% comment %}[\s\S]*?{% endcomment %}/g, '')
  .replace(/{% schema %}[\s\S]*?{% endschema %}/g, '')
  .replace(/{% if customer %}true{% else %}false{% endif %}/g, 'true')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/{%[\s\S]*?%}|{{[\s\S]*?}}/g, '')
  .replace(/data-login-url="[^"]*"/, 'data-login-url="/customer_authentication/login?return_to=%2Fpages%2Fbirthday-club"');

const gift = (extra = {}) => ({ id: 1, cycle_year: 2026, reward_type: 'discount_code', reward_value: 10, status: 'claimed', is_usable: true, reward_code: 'BDAY-FICTIONAL-ONLY', discount_title: 'Fictional birthday gift', apply_path: '/discount/BDAY-FICTIONAL-ONLY?redirect=%2Fcart%3Fforestry_reward_kind%3Dbirthday', expires_at: '2099-10-31T23:59:59Z', ...extra });
const state = (gifts = [], extra = {}) => ({ profile_id: 1, state: 'birthday_saved', birthday: { birth_month: 10, birth_day: 28 }, email_opted_in: true, next_coupon_email_date: '2027-10-28', reward: { issuance: gifts[0] || null, issuances: gifts }, ...extra });
const scenarios = ['guest', 'missing', 'upcoming', 'ready', 'claim', 'expired', 'redeemed', 'legacy-credit', 'history', 'sync-retry', 'network-retry', 'applied'];
let passed = 0;
for (const engine of [webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [1280, 390]) {
      for (const scenario of scenarios) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        let claims = 0, captures = 0, reads = 0;
        let data = state();
        if (['ready', 'applied'].includes(scenario)) data = state([gift()]);
        if (['claim', 'sync-retry'].includes(scenario)) data = state([gift({ status: 'issued', is_usable: false })]);
        if (scenario === 'guest') data = state([], { profile_id: null, state: 'unknown_customer', birthday: null });
        if (scenario === 'missing') data = state([], { birthday: null });
        if (scenario === 'expired') data = state([gift({ status: 'issued', is_usable: false, expires_at: '2020-01-01T00:00:00Z' })]);
        if (scenario === 'redeemed') data = state([gift({ status: 'redeemed', is_usable: false, order_number: '#FICTIONAL' })]);
        if (scenario === 'legacy-credit') data = state([gift({ reward_type: 'candle_cash', is_usable: false, reward_code: null, apply_path: null })]);
        if (scenario === 'history') data = state([gift(), gift({ id: 2, cycle_year: 2025, status: 'expired', is_usable: false, expires_at: '2020-01-01T00:00:00Z' }), gift({ id: 3, status: 'redeemed', is_usable: false }), gift({ id: 4, is_usable: false, status: 'issued' })]);
        await page.route('**/*', async route => {
          const url = new URL(route.request().url());
          const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
          if (url.pathname === '/pages/birthday-club') {
            const html = scenario === 'guest' ? section.replace('data-signed-in="true"', 'data-signed-in="false"') : section;
            return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}' + css + '</style></head><body>' + html + '<script>' + js + '</script></body></html>' });
          }
          if (url.pathname.endsWith('/birthday/status')) {
            reads++;
            if (scenario === 'network-retry' && reads === 1) return json({ ok: false });
            return json({ ok: true, data });
          }
          if (url.pathname.endsWith('/birthday/claim')) {
            claims++;
            assert.equal(route.request().postDataJSON().issuance_id, 1);
            if (scenario === 'sync-retry' && claims === 1) return json({ ok: false });
            data = state([gift()]);
            return json({ ok: true, data });
          }
          if (url.pathname.endsWith('/birthday/capture')) {
            captures++;
            assert.deepEqual(route.request().postDataJSON(), { birth_month: 2, birth_day: 29, source: 'birthday_club_page' });
            data = state();
            return json({ ok: true, data });
          }
          if (url.pathname === '/cart.js') return json({ items: [], cart_level_discount_applications: scenario === 'applied' ? [{ title: 'Fictional birthday gift' }] : [] });
          return route.fulfill({ status: 204, body: '' });
        });
        await page.goto('https://birthday-club.test/pages/birthday-club');
        const panel = page.locator('.ForestryBirthday__panel');
        const expectState = async value => page.waitForFunction(expected => document.querySelector('.ForestryBirthday__panel').dataset.birthdayState === expected, value);
        if (scenario === 'guest') {
          await expectState('sign-in');
          assert.match(await page.locator('[data-birthday-login]').getAttribute('href'), /return_to=%2Fpages%2Fbirthday-club/);
        } else if (scenario === 'missing') {
          await expectState('setup');
          await page.locator('[name=birth_month]').fill('2');
          await page.locator('[name=birth_day]').fill('30');
          await page.locator('[data-birthday-form] button').click();
          assert.equal(captures, 0);
          assert.equal(await page.locator('[data-birthday-form-error]').isVisible(), true);
          await page.locator('[name=birth_day]').fill('29');
          await page.locator('[data-birthday-form] button').click();
          await expectState('scheduled');
          assert.equal(captures, 1);
        } else if (['expired', 'redeemed', 'legacy-credit'].includes(scenario)) {
          await expectState('unavailable');
          assert.equal(claims, 0);
          assert.equal(await page.locator('[data-birthday-shop]').isVisible(), false);
        } else if (['network-retry', 'sync-retry'].includes(scenario)) {
          await expectState('unavailable');
          await page.locator('[data-birthday-retry]').click();
          await expectState(scenario === 'sync-retry' ? 'success' : 'scheduled');
          assert.equal(claims, scenario === 'sync-retry' ? 2 : 0);
        } else if (scenario === 'upcoming') await expectState('scheduled');
        else {
          await expectState('success');
          if (scenario === 'applied') await page.waitForFunction(() => document.querySelector('[data-birthday-shop]').getAttribute('href') === '/checkout');
          else assert.equal(await page.locator('[data-birthday-shop]').getAttribute('href'), gift().apply_path);
          if (scenario === 'history') {
            await page.locator('[data-birthday-history] summary').click();
            assert.equal(await page.locator('[data-birthday-history-list] article').count(), 3);
            assert.equal(await page.locator('[data-birthday-history-list] button').count(), 1);
            assert.equal(await page.locator('[data-birthday-history-list] a').count(), 0);
            assert.equal(claims, 0);
          }
        }
        assert.equal(await page.locator('[data-forestry-birthday-club]').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, engine.name() + ':' + width + ':' + scenario + ' overflow');
        assert.deepEqual(errors, []);
        await page.close();
        passed++;
      }
    }
  } finally { await browser.close(); }
}
console.log('Birthday Club: ' + passed + ' browser scenarios passed (WebKit; desktop/phone).');
