(function () {
  'use strict';
  var root = document.querySelector('[data-forestry-birthday-club]');
  if (!root) return;
  var views = {};
  ['loading', 'sign-in', 'claiming', 'setup', 'scheduled', 'success', 'unavailable'].forEach(function (name) {
    views[name] = root.querySelector('[data-birthday-' + name + ']');
  });
  var busy = false;
  var generation = 0;
  var currentId = null;
  function show(name) {
    Object.keys(views).forEach(function (key) { views[key].hidden = key !== name; });
    root.querySelector('.ForestryBirthday__panel').setAttribute('data-birthday-state', name);
  }
  async function request(url, method, body) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var response = await fetch(url, { method: method, credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      var payload = await response.json();
      return { ok: response.ok && payload.ok === true, data: url === '/cart.js' ? payload : payload.data || {} };
    } catch (_) { return { ok: false, data: {} }; }
    finally { clearTimeout(timer); }
  }
  function dateLabel(value) {
    var date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(date) : '';
  }
  function expired(gift) {
    if (gift.status === 'expired') return true;
    if (typeof gift.is_expired === 'boolean') return gift.is_expired;
    return gift.status !== 'redeemed' && gift.expires_at && new Date(gift.expires_at).getTime() < Date.now();
  }
  function claimable(gift) {
    return gift && ['issued', 'claimed'].indexOf(gift.status) >= 0 && !expired(gift) && gift.reward_type !== 'candle_cash';
  }
  function usable(gift) {
    return claimable(gift) && gift.is_usable === true && typeof gift.reward_code === 'string' && gift.reward_code.length > 0 && safeApplyPath(gift.apply_path);
  }
  function safeApplyPath(path) {
    return typeof path === 'string' && /^\/discount\/[^/?#]+\?/.test(path);
  }
  function append(parent, tag, text, className) {
    var element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
  }
  function renderHistory(gifts) {
    var details = root.querySelector('[data-birthday-history]');
    var list = root.querySelector('[data-birthday-history-list]');
    list.replaceChildren();
    var previous = gifts.filter(function (gift) { return gift.id !== currentId; });
    details.hidden = previous.length === 0;
    previous.forEach(function (gift) {
      var article = append(list, 'article');
      append(article, 'h3', gift.cycle_year + ' birthday gift');
      var state = gift.status === 'redeemed' ? 'Used' : gift.status === 'cancelled' ? 'Cancelled' : gift.reward_type === 'candle_cash' && gift.status === 'claimed' ? 'Previously credited to your account' : expired(gift) ? 'Expired' : usable(gift) ? 'Ready to use' : 'Available to claim';
      append(article, 'p', state + (gift.order_number ? ' · Order ' + gift.order_number : ''));
      if (gift.reward_type !== 'candle_cash' && gift.reward_value) append(article, 'p', '$' + Number(gift.reward_value).toFixed(2) + ' birthday coupon');
      if (gift.expires_at) append(article, 'p', 'Original expiry: ' + dateLabel(gift.expires_at));
      if (usable(gift)) {
        append(article, 'p', 'Code: ' + gift.reward_code);
        append(article, 'a', 'Use this previously issued gift', 'ForestryBirthday__button').href = gift.apply_path;
      } else if (claimable(gift)) {
        var button = append(article, 'button', 'Claim this previously issued gift', 'ForestryBirthday__button');
        button.type = 'button';
        button.addEventListener('click', function () { claim(gift.id); });
      } else if (gift.reward_type === 'candle_cash') {
        append(article, 'a', 'View your existing Candle Cash', 'ForestryBirthday__text-link').href = '/pages/rewards';
      }
    });
  }
  function unavailable(title, message, retry) {
    root.querySelector('[data-birthday-unavailable-title]').textContent = title;
    root.querySelector('[data-birthday-unavailable-message]').textContent = message;
    root.querySelector('[data-birthday-retry]').hidden = !retry;
    show('unavailable');
  }
  function showCoupon(gift) {
    root.querySelector('[data-birthday-code]').textContent = gift.reward_code;
    root.querySelector('[data-birthday-expiry]').textContent = gift.expires_at ? 'Use by ' + dateLabel(gift.expires_at) : 'Your original coupon terms apply';
    root.querySelector('[data-birthday-shop]').href = gift.apply_path;
    root.querySelector('[data-birthday-shop]').textContent = 'Use my birthday coupon';
    root.querySelector('[data-birthday-ready-title]').textContent = 'Your birthday gift is ready!';
    show('success');
    request('/cart.js', 'GET').then(function (cart) {
      if (currentId !== gift.id) return;
      var discounts = (cart.data.cart_level_discount_applications || []).concat.apply(cart.data.cart_level_discount_applications || [], (cart.data.items || []).map(function (item) { return (item.discount_allocations || []).map(function (row) { return row.discount_application || {}; }); }));
      if (discounts.some(function (row) { return row.title === gift.reward_code || row.title === gift.discount_title; })) {
        root.querySelector('[data-birthday-ready-title]').textContent = 'Your birthday coupon is applied';
        root.querySelector('[data-birthday-shop]').textContent = 'Continue to checkout';
        root.querySelector('[data-birthday-shop]').href = '/checkout';
      }
    });
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var mount = root.querySelector('[data-birthday-animation]');
      if (!mount.querySelector('lottie-player')) {
        var player = document.createElement('lottie-player');
        player.setAttribute('src', root.dataset.animationUrl);
        player.setAttribute('background', 'transparent');
        player.setAttribute('autoplay', '');
        player.setAttribute('aria-hidden', 'true');
        mount.appendChild(player);
      }
    }
  }
  async function claim(id) {
    if (busy) return;
    busy = true;
    show('claiming');
    var result = await request(root.dataset.claimUrl, 'POST', { issuance_id: id });
    busy = false;
    if (result.ok) await load(false);
    else unavailable('Your gift needs one more moment.', 'Your gift is saved. We could not confirm its coupon is ready yet. Try again, or contact us for help.', true);
  }
  async function load(autoClaim) {
    var version = ++generation;
    show('loading');
    var result = await request(root.dataset.statusUrl, 'GET');
    if (version !== generation) return;
    if (!result.ok) { unavailable('We could not reach your gift just yet.', 'Please try again in a moment.', true); return; }
    if (!result.data.profile_id || result.data.state === 'unknown_customer') {
      root.querySelector('[data-birthday-history]').hidden = true;
      if (root.dataset.signedIn === 'true') unavailable('We are connecting your account.', 'Please try again in a moment. If your gift still does not appear, contact us and we will help.', true);
      else show('sign-in');
      return;
    }
    var reward = result.data.reward || {};
    var gifts = Array.isArray(reward.issuances) && reward.issuances.length ? reward.issuances : reward.issuance ? [reward.issuance] : [];
    var gift = gifts.find(claimable) || reward.issuance || gifts[0];
    currentId = gift ? gift.id : null;
    renderHistory(gifts);
    root.querySelector('[data-birthday-edit]').hidden = false;
    if (result.data.birthday) {
      var form = root.querySelector('[data-birthday-form]');
      form.elements.birth_month.value = result.data.birthday.birth_month || '';
      form.elements.birth_day.value = result.data.birthday.birth_day || '';
    }
    root.querySelector('[data-birthday-intro]').textContent = gift && gift.presentation === 'belated' ? 'A little belated birthday magic. Your original gift and its original terms are waiting here.' : 'Save your birthday for a $10 coupon each year. Find your birthday gifts in one place.';
    if (usable(gift)) showCoupon(gift);
    else if (claimable(gift)) {
      if (autoClaim !== false) await claim(gift.id);
      else unavailable('Your gift is saved.', 'Shopify has not confirmed the coupon is ready yet. Try again in a moment.', true);
    } else if (gift && gift.status === 'redeemed') unavailable('Your birthday gift has been used.', gift.order_number ? 'Used on order ' + gift.order_number + '. Your next annual gift will appear when it is ready.' : 'Your redemption is recorded. Your next annual gift will appear when it is ready.', false);
    else if (gift && gift.reward_type === 'candle_cash' && gift.status === 'claimed') unavailable('Your birthday credit is already in your account.', 'Previously awarded Candle Cash is preserved. View your balance and history in Your Rewards.', false);
    else if (gift && expired(gift)) unavailable('This birthday coupon has expired.', 'Its original expiry was ' + dateLabel(gift.expires_at) + '. Your history is saved; this does not reactivate the coupon.' + (result.data.next_coupon_email_date ? ' Your next birthday is ' + dateLabel(result.data.next_coupon_email_date + 'T12:00:00-05:00') + '.' : ''), false);
    else if (!result.data.birthday || !result.data.birthday.birth_month || !result.data.birthday.birth_day) show('setup');
    else if (result.data.next_coupon_email_date) {
      root.querySelector('[data-birthday-scheduled-message]').textContent = result.data.email_opted_in ? 'We plan to email your next $10 birthday coupon on ' + dateLabel(result.data.next_coupon_email_date + 'T12:00:00-05:00') + '.' : 'Your next birthday is ' + dateLabel(result.data.next_coupon_email_date + 'T12:00:00-05:00') + '. Turn on marketing emails in your account if you would like to receive your birthday email.';
      show('scheduled');
    } else unavailable('Your birthday gift is not available yet.', 'Your saved birthday and previous gifts are kept in your account. Contact us if you need help.', false);
  }
  root.querySelector('[data-birthday-form]').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    var month = Number(event.currentTarget.elements.birth_month.value);
    var day = Number(event.currentTarget.elements.birth_day.value);
    var error = root.querySelector('[data-birthday-form-error]');
    if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > new Date(2028, month, 0).getDate()) {
      error.textContent = 'Please enter a valid month and day.'; error.hidden = false; return;
    }
    busy = true;
    var result = await request(root.dataset.captureUrl, 'POST', { birth_month: month, birth_day: day, source: 'birthday_club_page' });
    busy = false;
    error.hidden = result.ok;
    if (result.ok) await load();
    else { error.textContent = 'We could not save your birthday yet. Please try again.'; error.hidden = false; }
  });
  root.querySelector('[data-birthday-retry]').addEventListener('click', function () { if (!busy) load(); });
  root.querySelector('[data-birthday-edit]').addEventListener('click', function () { if (!busy) show('setup'); });
  root.querySelector('[data-birthday-login]').href = root.dataset.loginUrl;
  load();
})();
