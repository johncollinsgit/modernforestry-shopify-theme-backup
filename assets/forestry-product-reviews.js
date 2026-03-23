(function () {
  const SUMMARY_SELECTOR = '[data-forestry-product-review-summary]';
  const PANEL_SELECTOR = '[data-forestry-product-reviews-root]';
  const COUNT_SELECTOR = '[data-forestry-product-review-count]';
  const RATING_SELECTOR = '[data-forestry-product-review-rating]';
  const RUNTIME_KEY = '__forestryProductReviewsRuntime';

  const runtime = window[RUNTIME_KEY] || {
    promises: new Map(),
    payloads: new Map(),
    ui: new WeakMap(),
    observer: null,
  };

  window[RUNTIME_KEY] = runtime;

  function clean(value) {
    return value == null ? '' : String(value).trim();
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shortDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  function currencyLabel(value) {
    const parsed = Number.parseFloat(String(value || '0'));
    if (!Number.isFinite(parsed)) return '';

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: parsed % 1 === 0 ? 0 : 2,
    }).format(parsed);
  }

  function escapeSelector(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function cacheKey(root) {
    return [
      clean(root.dataset.productId),
      clean(root.dataset.productHandle),
      clean(root.dataset.customerEmail),
      clean(root.dataset.shopifyCustomerId),
    ].join('|');
  }

  function productKey(root) {
    return clean(root.dataset.forestryProductReviewKey || root.dataset.productId || root.dataset.productHandle);
  }

  function summarySnapshot(data) {
    const summary = data && data.summary ? data.summary : {};
    const count = Number.parseInt(String(summary.review_count || 0), 10) || 0;
    const average = Number.parseFloat(String(summary.average_rating || 0));

    return {
      summary: summary,
      count: Math.max(0, count),
      average: Number.isFinite(average) ? Math.max(0, Math.min(5, average)) : 0,
    };
  }

  function reviewCountLabel(count) {
    const safe = Math.max(0, Number.parseInt(String(count || 0), 10) || 0);
    return safe + ' review' + (safe === 1 ? '' : 's');
  }

  function ratingAriaLabel(average) {
    const safe = Number.isFinite(average) ? Math.max(0, Math.min(5, average)) : 0;
    return safe > 0 ? safe.toFixed(1) + ' out of 5 stars' : 'No reviews yet';
  }

  function ratingStep(average) {
    return Math.round((Number.isFinite(average) ? average : 0) * 2) / 2;
  }

  function uiState(root) {
    return runtime.ui.get(root) || {
      busy: false,
      formOpen: false,
      message: '',
      tone: 'neutral',
    };
  }

  function setUiState(root, patch) {
    const next = Object.assign({}, uiState(root), patch || {});
    runtime.ui.set(root, next);
    return next;
  }

  function productQuery(root) {
    const query = new URLSearchParams();
    query.set('product_id', clean(root.dataset.productId));

    if (clean(root.dataset.productHandle)) query.set('product_handle', clean(root.dataset.productHandle));
    if (clean(root.dataset.productTitle)) query.set('product_title', clean(root.dataset.productTitle));
    if (clean(root.dataset.productUrl)) query.set('product_url', clean(root.dataset.productUrl));
    if (clean(root.dataset.customerEmail)) query.set('email', clean(root.dataset.customerEmail));
    if (clean(root.dataset.customerPhone)) query.set('phone', clean(root.dataset.customerPhone));
    if (clean(root.dataset.shopifyCustomerId)) query.set('shopify_customer_id', clean(root.dataset.shopifyCustomerId));

    return query;
  }

  async function fetchContract(root, bust) {
    const endpoint = clean(root.dataset.endpointProductReviewStatus);
    if (!endpoint) {
      return {
        ok: false,
        error: { code: 'missing_endpoint', message: 'Review endpoint is missing.' },
        data: {},
      };
    }

    const key = cacheKey(root);
    if (!bust && runtime.promises.has(key)) {
      return runtime.promises.get(key);
    }

    const url = new URL(endpoint, window.location.origin);
    productQuery(root).forEach(function (value, field) {
      if (clean(value)) {
        url.searchParams.set(field, value);
      }
    });

    const promise = fetch(url.toString(), {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(async function (response) {
      const text = await response.text();
      let payload = null;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (error) {
          payload = null;
        }
      }

      if (response.ok && payload && payload.ok) {
        runtime.payloads.set(key, payload.data || {});
        return { ok: true, data: payload.data || {}, error: null };
      }

      return {
        ok: false,
        data: payload && payload.data ? payload.data : {},
        error: (payload && payload.error) || {
          code: response.status === 404 ? 'not_ready' : 'request_failed',
          message: response.status === 404 ? 'Reviews are still connecting.' : 'The review request could not be completed.',
        },
      };
    }).catch(function (error) {
      return {
        ok: false,
        data: {},
        error: {
          code: 'network_error',
          message: error && error.message ? error.message : 'Network request failed.',
        },
      };
    });

    runtime.promises.set(key, promise);
    return promise;
  }

  function svgStarMarkup(type, className) {
    let fill = 'currentColor';

    if (type === 'half') {
      fill = 'url(#rating-star-gradient-half)';
    }

    return '' +
      '<svg fill="none" focusable="false" width="14" height="14" class="' + escapeHtml(className) + '" viewBox="0 0 14 13">' +
        '<path d="M7 0L8.6458 4.73475L13.6574 4.83688L9.66296 7.86525L11.1145 12.6631L7 9.8L2.8855 12.6631L4.33704 7.86525L0.342604 4.83688L5.3542 4.73475L7 0Z" fill="' + fill + '"></path>' +
      '</svg>';
  }

  function starMarkup(average, options) {
    const settings = Object.assign({
      containerClass: 'ForestryProductReviewStars',
      starBaseClass: 'ForestryProductReviewStar',
      fullClass: 'is-filled',
      halfClass: 'is-half',
      emptyClass: 'is-empty',
      ariaLabel: ratingAriaLabel(average),
    }, options || {});

    const rounded = ratingStep(average);
    let markup = '<span class="' + escapeHtml(settings.containerClass) + '" role="img" aria-label="' + escapeHtml(settings.ariaLabel) + '">';

    for (let index = 1; index <= 5; index += 1) {
      let type = 'empty';

      if (rounded >= index) {
        type = 'full';
      } else if (rounded === index - 0.5) {
        type = 'half';
      }

      const className = [
        settings.starBaseClass,
        type === 'full' ? settings.fullClass : '',
        type === 'half' ? settings.halfClass : '',
        type === 'empty' ? settings.emptyClass : '',
      ].filter(Boolean).join(' ');

      markup += svgStarMarkup(type, className);
    }

    markup += '</span>';
    return markup;
  }

  function updateCountBadges(key, count) {
    document.querySelectorAll(COUNT_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"]').forEach(function (node) {
      node.textContent = String(count || 0);
    });
  }

  function openReviewTabFor(root) {
    const panel = document.querySelector(PANEL_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(productKey(root)) + '"]');
    if (!panel) return;

    const collapsible = panel.closest('.Collapsible');
    const toggle = collapsible ? collapsible.querySelector('[data-action="toggle-collapsible"]') : null;

    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') {
      toggle.click();
    }

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function summaryMarkup(data) {
    const snapshot = summarySnapshot(data);
    const count = snapshot.count;
    const average = snapshot.average;
    const buttonLabel = count > 0 ? ((average ? average.toFixed(1) : '0.0') + ' · ' + reviewCountLabel(count)) : 'Be the first to review';

    return '' +
      '<button type="button" class="ForestryProductReviewSummary__button" data-action="open-review-tab">' +
        starMarkup(average) +
        '<span class="ForestryProductReviewSummary__copy">' + escapeHtml(buttonLabel) + '</span>' +
      '</button>';
  }

  function renderSummary(root, data) {
    const snapshot = summarySnapshot(data);
    updateCountBadges(productKey(root), snapshot.count);
    root.innerHTML = summaryMarkup(data);
  }

  function ratingMarkup(data) {
    const snapshot = summarySnapshot(data);

    return '' +
      '<div class="rating">' +
        starMarkup(snapshot.average, {
          containerClass: 'rating__stars',
          starBaseClass: 'rating__star',
          fullClass: 'rating__star--full',
          halfClass: 'rating__star--half',
          emptyClass: 'rating__star--empty',
          ariaLabel: ratingAriaLabel(snapshot.average),
        }) +
        '<span class="rating__caption">' + escapeHtml(reviewCountLabel(snapshot.count)) + '</span>' +
      '</div>';
  }

  function renderRating(root, data) {
    const snapshot = summarySnapshot(data);
    updateCountBadges(productKey(root), snapshot.count);
    root.innerHTML = ratingMarkup(data);
    root.style.visibility = '';
    root.setAttribute('aria-busy', 'false');
  }

  function renderRatingUnavailable(root) {
    root.innerHTML = '';
    root.style.visibility = '';
    root.setAttribute('aria-busy', 'false');
  }

  function renderSummaryUnavailable(root) {
    root.innerHTML = '<span class="Text--subdued">Reviews unavailable right now.</span>';
  }

  function reviewCardMarkup(review) {
    const title = clean(review.title);
    const byline = review.reviewer_name + (review.is_verified_buyer ? ' · Verified customer' : '');

    return '' +
      '<article class="spr-review">' +
        '<header class="spr-review-header">' +
          '<div class="spr-review-header-starratings">' + starMarkup(review.rating) + '</div>' +
          (title ? '<h3 class="spr-review-header-title">' + escapeHtml(title) + '</h3>' : '') +
          '<span class="spr-review-header-byline"><strong>' + escapeHtml(byline) + '</strong> · ' + escapeHtml(shortDate(review.approved_at || review.submitted_at) || 'Recently') + '</span>' +
        '</header>' +
        '<div class="spr-review-content"><p class="spr-review-content-body">' + escapeHtml(review.body || '') + '</p></div>' +
      '</article>';
  }

  function noticeMarkup(message, tone) {
    if (!clean(message)) return '';

    return '<div class="ForestryProductReviews__notice ForestryProductReviews__notice--' + escapeHtml(tone || 'neutral') + '">' + escapeHtml(message) + '</div>';
  }

  function formMarkup(root, data, state) {
    const viewer = data.viewer || {};
    const settings = data.settings || {};
    const task = data.task || {};
    const review = viewer.review || {};
    const canSubmit = viewer.can_submit === true;
    const loginUrl = clean(root.dataset.loginUrl);

    if (!canSubmit) {
      return '' +
        '<div class="ForestryProductReviews__formShell">' +
          '<p class="Text--subdued">Sign in to attach your review to the right account and keep your Candle Cash in one place.</p>' +
          '<a class="Button Button--primary" href="' + escapeHtml(loginUrl || '/account/login') + '">Sign in to review</a>' +
        '</div>';
    }

    const existingState = clean(viewer.state);
    const rewardCopy = task && task.reward_amount
      ? '<div class="ForestryProductReviews__reward">Earn ' + escapeHtml(currencyLabel(task.reward_amount) || task.reward_amount) + ' in Candle Cash when your review is saved.</div>'
      : '';
    const introCopy = existingState === 'reviewed'
      ? 'You already reviewed this product. Update it anytime and we will keep the latest version here.'
      : (existingState === 'pending'
        ? 'Your review is already in the queue. You can update it here if you need to.'
        : 'Leave a review and we will save it right back into your Forestry account.');
    const submitLabel = existingState === 'reviewed' || existingState === 'pending' ? 'Update review' : 'Submit review';
    const showGuestFields = !clean(root.dataset.customerEmail);
    const disabled = state.busy ? ' disabled aria-disabled="true"' : '';
    const selectedRating = Number.parseInt(String(review.rating || 0), 10) || 5;

    let ratingOptions = '';
    for (let value = 5; value >= 1; value -= 1) {
      ratingOptions += '' +
        '<label class="ForestryProductReviews__ratingOption">' +
          '<input type="radio" name="forestry-product-review-rating-' + escapeHtml(productKey(root)) + '" value="' + value + '"' + (value === selectedRating ? ' checked' : '') + '>' +
          '<span>' + starMarkup(value) + '</span>' +
        '</label>';
    }

    return '' +
      '<div class="ForestryProductReviews__formShell">' +
        '<div class="ForestryProductReviews__intro">' +
          '<p class="Text--subdued">' + escapeHtml(introCopy) + '</p>' +
          rewardCopy +
        '</div>' +
        '<div class="spr-form">' +
          '<div class="spr-form-review-rating">' +
            '<label class="spr-form-label">Rating</label>' +
            '<div class="ForestryProductReviews__ratingRow">' + ratingOptions + '</div>' +
          '</div>' +
          '<div class="spr-form-review-title">' +
            '<label class="spr-form-label" for="forestry-product-review-title-' + escapeHtml(productKey(root)) + '">Headline</label>' +
            '<input id="forestry-product-review-title-' + escapeHtml(productKey(root)) + '" class="spr-form-input spr-form-input-text" type="text" data-review-title value="' + escapeHtml(review.title || '') + '" maxlength="190" placeholder="Optional headline">' +
          '</div>' +
          '<div class="spr-form-review-body">' +
            '<label class="spr-form-label" for="forestry-product-review-body-' + escapeHtml(productKey(root)) + '">Review</label>' +
            '<textarea id="forestry-product-review-body-' + escapeHtml(productKey(root)) + '" class="spr-form-input spr-form-input-textarea" rows="5" data-review-body minlength="' + escapeHtml(settings.minimum_length || 24) + '" placeholder="How did it burn? How did it smell?">' + escapeHtml(review.body || '') + '</textarea>' +
          '</div>' +
          (showGuestFields ? '' +
            '<div class="ForestryProductReviews__guestGrid">' +
              '<div class="spr-form-contact-name"><label class="spr-form-label" for="forestry-product-review-name-' + escapeHtml(productKey(root)) + '">Name</label><input id="forestry-product-review-name-' + escapeHtml(productKey(root)) + '" class="spr-form-input spr-form-input-text" type="text" data-review-name placeholder="Your name"></div>' +
              '<div class="spr-form-contact-email"><label class="spr-form-label" for="forestry-product-review-email-' + escapeHtml(productKey(root)) + '">Email</label><input id="forestry-product-review-email-' + escapeHtml(productKey(root)) + '" class="spr-form-input spr-form-input-email" type="email" data-review-email placeholder="you@example.com"></div>' +
            '</div>' : '' +
            '<div class="ForestryProductReviews__accountLine">Reviewing as ' + escapeHtml([clean(root.dataset.customerFirstName), clean(root.dataset.customerLastName)].filter(Boolean).join(' ') || clean(root.dataset.customerEmail)) + '</div>') +
          '<div class="spr-form-actions">' +
            '<button class="Button Button--primary spr-button-primary" type="button" data-action="submit-product-review"' + disabled + '>' + escapeHtml(submitLabel) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function panelMarkup(root, data) {
    const state = uiState(root);
    const snapshot = summarySnapshot(data);
    const reviews = Array.isArray(data.reviews) ? data.reviews : [];
    const count = snapshot.count;
    const average = snapshot.average;

    return '' +
      '<div class="spr-container">' +
        '<div class="spr-header">' +
          '<div>' +
            '<h2 class="spr-header-title Heading u-h4">Customer reviews</h2>' +
            '<div class="spr-summary">' +
              '<div class="spr-summary-starrating">' + starMarkup(average) + '</div>' +
              '<span class="spr-summary-caption">' + escapeHtml(count > 0 ? ((average ? average.toFixed(1) : '0.0') + ' from ' + reviewCountLabel(count)) : 'No reviews yet') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="spr-summary-actions"><button class="spr-summary-actions-newreview Button Button--secondary" type="button" data-action="toggle-review-form">' + escapeHtml(state.formOpen ? 'Hide form' : (count > 0 ? 'Write a review' : 'Be the first to review')) + '</button></div>' +
        '</div>' +
        noticeMarkup(state.message, state.tone) +
        (state.formOpen ? formMarkup(root, data, state) : '') +
        '<div class="spr-content">' +
          '<div class="spr-reviews">' +
            (reviews.length
              ? reviews.map(reviewCardMarkup).join('')
              : '<div class="ForestryProductReviews__empty"><p class="Heading u-h6">No reviews yet</p><p class="Text--subdued">Be the first to share how this one burns, throws, and lingers at home.</p></div>') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderPanel(root, data) {
    const snapshot = summarySnapshot(data);
    updateCountBadges(productKey(root), snapshot.count);
    root.innerHTML = panelMarkup(root, data);
  }

  function allRootsForProduct(key) {
    return document.querySelectorAll(
      SUMMARY_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"], ' +
      PANEL_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"], ' +
      RATING_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"]'
    );
  }

  async function hydrate(root, bust) {
    const result = await fetchContract(root, bust);
    const key = productKey(root);
    const roots = allRootsForProduct(key);

    roots.forEach(function (node) {
      if (!result.ok) {
        if (node.matches(RATING_SELECTOR)) {
          renderRatingUnavailable(node);
        } else if (node.matches(SUMMARY_SELECTOR)) {
          renderSummaryUnavailable(node);
        } else {
          node.innerHTML = '<div class="ForestryProductReviews__notice ForestryProductReviews__notice--danger">' + escapeHtml((result.error && result.error.message) || 'Reviews are not ready yet.') + '</div>';
        }
        return;
      }

      if (node.matches(SUMMARY_SELECTOR)) {
        renderSummary(node, result.data);
      } else if (node.matches(RATING_SELECTOR)) {
        renderRating(node, result.data);
      } else {
        renderPanel(node, result.data);
      }
    });

    return result;
  }

  async function submitReview(root) {
    const endpoint = clean(root.dataset.endpointProductReviewSubmit);
    if (!endpoint) return;

    const bodyField = root.querySelector('[data-review-body]');
    const ratingField = root.querySelector('input[name="forestry-product-review-rating-' + escapeSelector(productKey(root)) + '"]:checked');
    const titleField = root.querySelector('[data-review-title]');
    const nameField = root.querySelector('[data-review-name]');
    const emailField = root.querySelector('[data-review-email]');
    const minimumLength = Number.parseInt(String((bodyField && bodyField.getAttribute('minlength')) || '24'), 10) || 24;
    const reviewBody = clean(bodyField && bodyField.value);

    if (!ratingField) {
      setUiState(root, { message: 'Choose a star rating first.', tone: 'danger' });
      renderPanel(root, runtime.payloads.get(cacheKey(root)) || { summary: {}, reviews: [], viewer: {}, task: {}, settings: {} });
      return;
    }

    if (reviewBody.length < minimumLength) {
      setUiState(root, { message: 'Tell us a little more before you submit your review.', tone: 'danger' });
      renderPanel(root, runtime.payloads.get(cacheKey(root)) || { summary: {}, reviews: [], viewer: {}, task: {}, settings: {} });
      return;
    }

    setUiState(root, { busy: true, message: '', tone: 'neutral' });
    renderPanel(root, runtime.payloads.get(cacheKey(root)) || { summary: {}, reviews: [], viewer: {}, task: {}, settings: {} });

    const payload = {
      product_id: clean(root.dataset.productId),
      product_handle: clean(root.dataset.productHandle),
      product_title: clean(root.dataset.productTitle),
      product_url: clean(root.dataset.productUrl),
      rating: Number.parseInt(String(ratingField.value || ''), 10) || 0,
      title: clean(titleField && titleField.value),
      body: reviewBody,
      name: clean(nameField && nameField.value) || clean([clean(root.dataset.customerFirstName), clean(root.dataset.customerLastName)].filter(Boolean).join(' ')),
      email: clean(emailField && emailField.value) || clean(root.dataset.customerEmail),
      phone: clean(root.dataset.customerPhone),
      shopify_customer_id: clean(root.dataset.shopifyCustomerId),
      request_key: 'product-review:' + productKey(root) + ':' + Date.now(),
    };

    const response = await fetch(new URL(endpoint, window.location.origin).toString(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).then(async function (res) {
      const text = await res.text();
      let parsed = null;

      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          parsed = null;
        }
      }

      return {
        ok: res.ok && parsed && parsed.ok,
        payload: parsed,
      };
    }).catch(function () {
      return { ok: false, payload: null };
    });

    if (!response.ok) {
      const error = response.payload && response.payload.error ? response.payload.error : null;
      setUiState(root, {
        busy: false,
        message: error && error.message ? error.message : 'We could not save that review right now.',
        tone: 'danger',
      });
      renderPanel(root, runtime.payloads.get(cacheKey(root)) || { summary: {}, reviews: [], viewer: {}, task: {}, settings: {} });
      return;
    }

    const state = clean(response.payload && response.payload.data && response.payload.data.state);
    setUiState(root, {
      busy: false,
      formOpen: state === 'review_pending',
      message: state === 'review_pending'
        ? 'Thanks. Your review is saved and waiting for approval.'
        : 'Thanks. Your review is live now.',
      tone: 'success',
    });

    runtime.promises.delete(cacheKey(root));
    await hydrate(root, true);
  }

  function observeRatings() {
    if (runtime.observer || !('IntersectionObserver' in window)) {
      return runtime.observer;
    }

    runtime.observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        const root = entry.target;
        runtime.observer.unobserve(root);
        hydrate(root, false);
      });
    }, { rootMargin: '240px 0px' });

    return runtime.observer;
  }

  function boot(root) {
    if (root.matches(RATING_SELECTOR)) {
      const observer = observeRatings();

      if (observer) {
        observer.observe(root);
        return;
      }
    }

    hydrate(root, false);
  }

  document.addEventListener('click', function (event) {
    const toggle = event.target.closest('[data-action="toggle-review-form"]');
    if (toggle) {
      const root = toggle.closest(PANEL_SELECTOR);
      if (!root) return;

      const state = setUiState(root, { formOpen: !uiState(root).formOpen, message: '', tone: 'neutral' });
      renderPanel(root, runtime.payloads.get(cacheKey(root)) || { summary: {}, reviews: [], viewer: {}, task: {}, settings: {} });
      if (state.formOpen) {
        const textarea = root.querySelector('[data-review-body]');
        if (textarea) textarea.focus();
      }
      return;
    }

    const openButton = event.target.closest('[data-action="open-review-tab"]');
    if (openButton) {
      const root = openButton.closest('[data-forestry-product-review-summary]');
      if (root) {
        openReviewTabFor(root);
      }
      return;
    }

    const submit = event.target.closest('[data-action="submit-product-review"]');
    if (submit) {
      const root = submit.closest(PANEL_SELECTOR);
      if (root) {
        submitReview(root);
      }
    }
  });

  document.querySelectorAll(SUMMARY_SELECTOR + ',' + PANEL_SELECTOR + ',' + RATING_SELECTOR).forEach(boot);
})();
