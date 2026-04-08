(function () {
  const SUMMARY_SELECTOR = '[data-forestry-product-review-summary]';
  const PANEL_SELECTOR = '[data-forestry-product-reviews-root]';
  const COUNT_SELECTOR = '[data-forestry-product-review-count]';
  const RATING_SELECTOR = '[data-forestry-product-review-rating]';
  const SHELL_SELECTOR = '[data-forestry-product-review-shell]';
  const SITEWIDE_SELECTOR = '[data-forestry-sitewide-reviews]';
  const ROOT_LOCK_CLASS = 'forestry-product-reviews-open';
  const RUNTIME_KEY = '__forestryProductReviewsRuntime';
  const FLOATING_MODAL_HOST_SELECTOR = '[data-forestry-sitewide-review-modal-global-host]';
  const REQUEST_TIMEOUT_MS = 10000;
  const FLOATING_REVIEW_SEARCH_DEBOUNCE_MS = 140;
  const FLOATING_REVIEW_SEARCH_LIMIT = 12;

  const runtime = window[RUNTIME_KEY] || {
    promises: new Map(),
    payloads: new Map(),
    ui: new Map(),
    observer: null,
    sitewide: null,
    sitewideModalHost: null,
    pendingFloatingPrefetch: null,
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
      return window.CSS.escape(String(value || ''));
    }

    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function positiveInt(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function slugify(value) {
    return clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function titleFromHandle(value) {
    const normalized = clean(value)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ');

    if (!normalized) {
      return '';
    }

    return normalized.split(' ').map(function (part) {
      if (!part) {
        return '';
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' ');
  }

  function normalizedModalSize(value) {
    const size = clean(value).toLowerCase();

    if (size === 'small' || size === 'large') {
      return size;
    }

    return 'medium';
  }

  function modalSizeClass(value) {
    return 'ForestryProductReviews__modal--' + normalizedModalSize(value);
  }

  function floatingGlobalModalHost(createIfMissing) {
    const shouldCreate = createIfMissing !== false;

    if (runtime.sitewideModalHost && document.body && document.body.contains(runtime.sitewideModalHost)) {
      return runtime.sitewideModalHost;
    }

    const existing = document.querySelector(FLOATING_MODAL_HOST_SELECTOR);
    if (existing) {
      runtime.sitewideModalHost = existing;
      return existing;
    }

    if (!shouldCreate || !document.body) {
      return null;
    }

    const host = document.createElement('div');
    host.className = 'ForestryProductReviews__globalModalHost';
    host.setAttribute('data-forestry-sitewide-review-modal-global-host', '');
    document.body.appendChild(host);
    runtime.sitewideModalHost = host;
    return host;
  }

  function reducedMotionPreferred() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function parseCount(value) {
    const parsed = Number.parseInt(String(value || 0), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function mergeArray(primary, fallback) {
    if (Array.isArray(primary)) {
      return primary;
    }

    if (Array.isArray(fallback)) {
      return fallback;
    }

    return [];
  }

  function appendFormValue(params, key, value) {
    if (value == null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(function (item, index) {
        appendFormValue(params, key + '[' + index + ']', item);
      });
      return;
    }

    if (typeof value === 'object') {
      Object.keys(value).forEach(function (field) {
        appendFormValue(params, key + '[' + field + ']', value[field]);
      });
      return;
    }

    params.append(key, String(value));
  }

  function cacheKey(root) {
    return [
      clean(root.dataset.productId),
      clean(root.dataset.productHandle),
      clean(root.dataset.productVariantId),
      clean(root.dataset.customerEmail),
      clean(root.dataset.shopifyCustomerId),
    ].join('|');
  }

  function productKey(root) {
    return clean(root.dataset.forestryProductReviewKey || root.dataset.productId || root.dataset.productHandle);
  }

  function allRootsForProduct(key) {
    return document.querySelectorAll(
      SUMMARY_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"], ' +
      PANEL_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"], ' +
      RATING_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"]'
    );
  }

  function primaryRootForKey(key) {
    return document.querySelector(SUMMARY_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"]')
      || document.querySelector(PANEL_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"]')
      || document.querySelector(RATING_SELECTOR + '[data-forestry-product-review-key="' + escapeSelector(key) + '"]');
  }

  function emptyPayload() {
    return {
      product: {
        id: null,
        variant_id: null,
        handle: null,
        title: null,
        url: null,
      },
      summary: {
        average_rating: 0,
        review_count: 0,
        rating_label: 'No reviews yet',
      },
      task: null,
      settings: {},
      viewer: {
        can_submit: false,
        state: 'login_required',
        recent_order_candidates: [],
        eligibility: {},
        review: null,
      },
      sort_options: [],
      reviews: [],
    };
  }

  function emptySitewidePayload() {
    return {
      summary: {
        average_rating: 0,
        review_count: 0,
        rating_label: 'No reviews yet',
      },
      viewer: {
        profile_id: null,
        state: 'guest_ready',
      },
      sort_options: [
        { value: 'most_recent', label: 'Most Recent' },
        { value: 'highest_rating', label: 'Highest Rating' },
        { value: 'lowest_rating', label: 'Lowest Rating' },
      ],
      current_sort: 'most_recent',
      pagination: {
        limit: 24,
        has_more: false,
        returned: 0,
      },
      reviews: [],
    };
  }

  function summarySnapshot(data) {
    const payload = data || emptyPayload();
    const summary = payload.summary && typeof payload.summary === 'object' ? payload.summary : {};
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

  function stateForKey(key) {
    return runtime.ui.get(key) || {
      busy: false,
      drawerOpen: false,
      modalOpen: false,
      step: 0,
      sort: 'most_relevant',
      message: '',
      tone: 'neutral',
      mediaBusy: false,
      draft: null,
      submitResult: null,
    };
  }

  function syncViewportLock() {
    const open = Array.from(runtime.ui.values()).some(function (state) {
      return !!(state && (state.drawerOpen || state.modalOpen));
    });
    const floatingModalOpen = !!(runtime.sitewide && runtime.sitewide.reviewModalOpen);

    document.documentElement.classList.toggle(ROOT_LOCK_CLASS, open || floatingModalOpen);
  }

  function setStateForKey(key, patch) {
    const next = Object.assign({}, stateForKey(key), patch || {});
    runtime.ui.set(key, next);
    syncViewportLock();
    return next;
  }

  function productQuery(root) {
    const query = new URLSearchParams();
    query.set('product_id', clean(root.dataset.productId));

    if (clean(root.dataset.productVariantId)) query.set('variant_id', clean(root.dataset.productVariantId));
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

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    const promise = fetch(url.toString(), Object.assign({
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }, controller ? { signal: controller.signal } : {})).then(async function (response) {
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
        runtime.payloads.set(key, payload.data || emptyPayload());
        return { ok: true, data: payload.data || emptyPayload(), error: null };
      }

      return {
        ok: false,
        data: payload && payload.data ? payload.data : emptyPayload(),
        error: (payload && payload.error) || {
          code: response.status === 404 ? 'not_ready' : 'request_failed',
          message: response.status === 404 ? 'Reviews are still connecting.' : 'The review request could not be completed.',
        },
      };
    }).catch(function (error) {
      return {
        ok: false,
        data: emptyPayload(),
        error: {
          code: error && error.name === 'AbortError' ? 'network_timeout' : 'network_error',
          message: error && error.name === 'AbortError'
            ? 'Review request timed out.'
            : (error && error.message ? error.message : 'Network request failed.'),
        },
      };
    }).finally(function () {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
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

  function reviewSortValue(data, key) {
    const state = stateForKey(key);
    const available = Array.isArray(data.sort_options) && data.sort_options.length ? data.sort_options : [];
    const selected = clean(state.sort);

    if (available.some(function (option) { return clean(option && option.value) === selected; })) {
      return selected;
    }

    return available.length ? clean(available[0].value) : 'most_relevant';
  }

  function sortedReviews(data, key) {
    const reviews = Array.isArray(data.reviews) ? data.reviews.slice() : [];
    const sortValue = reviewSortValue(data, key);

    function reviewDate(review) {
      return new Date(review.approved_at || review.published_at || review.submitted_at || 0).getTime() || 0;
    }

    if (sortValue === 'newest' || sortValue === 'most_recent') {
      return reviews.sort(function (left, right) {
        return reviewDate(right) - reviewDate(left);
      });
    }

    if (sortValue === 'highest_rating') {
      return reviews.sort(function (left, right) {
        if ((right.rating || 0) !== (left.rating || 0)) {
          return (right.rating || 0) - (left.rating || 0);
        }

        return reviewDate(right) - reviewDate(left);
      });
    }

    if (sortValue === 'lowest_rating') {
      return reviews.sort(function (left, right) {
        if ((left.rating || 0) !== (right.rating || 0)) {
          return (left.rating || 0) - (right.rating || 0);
        }

        return reviewDate(right) - reviewDate(left);
      });
    }

    return reviews.sort(function (left, right) {
      if (!!right.is_verified_buyer !== !!left.is_verified_buyer) {
        return right.is_verified_buyer ? 1 : -1;
      }

      if ((right.helpful_count || 0) !== (left.helpful_count || 0)) {
        return (right.helpful_count || 0) - (left.helpful_count || 0);
      }

      return reviewDate(right) - reviewDate(left);
    });
  }

  function mediaUrl(asset) {
    if (!asset || typeof asset !== 'object') {
      return '';
    }

    return clean(asset.data_url || asset.url || asset.src || asset.preview_url || asset.image_url);
  }

  function mediaName(asset) {
    if (!asset || typeof asset !== 'object') {
      return '';
    }

    return clean(asset.name || asset.filename || asset.alt || 'Photo');
  }

  function reviewMediaMarkup(review) {
    const assets = Array.isArray(review && review.media_assets) ? review.media_assets : [];
    if (!assets.length) {
      return '';
    }

    const media = assets.map(function (asset) {
      const url = mediaUrl(asset);
      const label = mediaName(asset);

      if (url) {
        return '' +
          '<figure class="ForestryProductReviews__mediaItem">' +
            '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(label || 'Review photo') + '" loading="lazy">' +
          '</figure>';
      }

      if (label) {
        return '<span class="ForestryProductReviews__mediaBadge">' + escapeHtml(label) + '</span>';
      }

      return '';
    }).filter(Boolean).join('');

    if (!media) {
      return '';
    }

    return '<div class="ForestryProductReviews__media">' + media + '</div>';
  }

  function reviewCardMarkup(review, options) {
    const settings = Object.assign({
      showProduct: false,
    }, options || {});
    const title = clean(review.title);
    const reviewerName = clean(review.reviewer_name) || 'Verified customer';
    const bylineBits = [reviewerName];
    const productTitle = clean(review.product_title) || clean(review.product_handle).replace(/-/g, ' ');
    const productUrl = clean(review.product_url) || (clean(review.product_handle) ? '/products/' + clean(review.product_handle) : '');

    if (review.is_verified_buyer || review.verified_purchase) {
      bylineBits.push('Verified purchaser');
    }

    return '' +
      '<article class="ForestryProductReviews__card">' +
        '<header class="ForestryProductReviews__cardHeader">' +
          '<div class="ForestryProductReviews__cardStars">' + starMarkup(review.rating) + '</div>' +
          '<div class="ForestryProductReviews__cardMeta">' +
            '<p class="ForestryProductReviews__cardByline">' + escapeHtml(bylineBits.join(' · ')) + '</p>' +
            '<p class="ForestryProductReviews__cardDate Text--subdued">' + escapeHtml(shortDate(review.approved_at || review.published_at || review.submitted_at) || 'Recently') + '</p>' +
          '</div>' +
        '</header>' +
        (settings.showProduct && productTitle ? '<p class="ForestryProductReviews__cardProduct"><a href="' + escapeHtml(productUrl || '#') + '" class="Link Link--primary">' + escapeHtml(productTitle) + '</a></p>' : '') +
        (title ? '<h3 class="ForestryProductReviews__cardTitle Heading u-h6">' + escapeHtml(title) + '</h3>' : '') +
        '<div class="ForestryProductReviews__cardBody">' + escapeHtml(review.body || '') + '</div>' +
        reviewMediaMarkup(review) +
      '</article>';
  }

  function renderRating(root, data) {
    const snapshot = summarySnapshot(data);
    const key = productKey(root);

    updateCountBadges(key, snapshot.count);
    root.innerHTML = '' +
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
    root.style.visibility = '';
    root.setAttribute('aria-busy', 'false');
  }

  function renderRatingUnavailable(root) {
    root.innerHTML = '';
    root.style.visibility = '';
    root.setAttribute('aria-busy', 'false');
  }

  function reviewLocked(viewer) {
    const viewerState = clean(viewer && viewer.state);
    return viewerState === 'reviewed' || viewerState === 'pending';
  }

  function viewerLockCopy(viewer) {
    const viewerState = clean(viewer && viewer.state);

    if (viewerState === 'reviewed') {
      return 'You already reviewed this product. Additional submissions are disabled for this item.';
    }

    if (viewerState === 'pending') {
      return 'Your review is pending approval. Additional submissions are disabled until moderation finishes.';
    }

    return '';
  }

  function rootProduct(root, data) {
    const payloadProduct = data && data.product ? data.product : {};

    return {
      id: clean(root.dataset.productId || payloadProduct.id),
      variant_id: clean(root.dataset.productVariantId || payloadProduct.variant_id),
      handle: clean(root.dataset.productHandle || payloadProduct.handle),
      title: clean(root.dataset.productTitle || payloadProduct.title),
      url: clean(root.dataset.productUrl || payloadProduct.url),
    };
  }

  function fallbackCandidate(root, data) {
    const product = rootProduct(root, data);

    return {
      candidate_key: 'current-product',
      order_id: null,
      order_line_id: null,
      order_external_id: null,
      ordered_at: null,
      order_status: null,
      store_key: null,
      product_id: product.id,
      variant_id: product.variant_id || null,
      product_title: product.title || 'Current product',
      product_handle: product.handle || null,
      product_url: product.url || null,
      matches_current_product: true,
      is_fallback: true,
    };
  }

  function reviewCandidates(root, data) {
    const viewer = data && data.viewer ? data.viewer : {};
    const recent = Array.isArray(viewer.recent_order_candidates) ? viewer.recent_order_candidates : [];
    const normalized = recent.map(function (candidate) {
      return Object.assign({}, candidate, {
        candidate_key: clean(candidate.candidate_key),
        order_id: positiveInt(candidate.order_id),
        order_line_id: positiveInt(candidate.order_line_id),
        product_id: clean(candidate.product_id),
        variant_id: clean(candidate.variant_id) || null,
        product_title: clean(candidate.product_title) || clean(root.dataset.productTitle),
        product_handle: clean(candidate.product_handle) || clean(root.dataset.productHandle),
        product_url: clean(candidate.product_url) || clean(root.dataset.productUrl),
        matches_current_product: candidate.matches_current_product === true || candidate.matches_current_product === '1',
        is_fallback: false,
      });
    }).filter(function (candidate) {
      return clean(candidate.candidate_key);
    });

    if (!normalized.length) {
      return [fallbackCandidate(root, data)];
    }

    if (!normalized.some(function (candidate) { return candidate.matches_current_product; })) {
      normalized.unshift(fallbackCandidate(root, data));
    }

    return normalized;
  }

  function defaultDraft(root, data) {
    const viewer = data && data.viewer ? data.viewer : {};
    const existingReview = viewer.review && typeof viewer.review === 'object' ? viewer.review : {};
    const candidates = reviewCandidates(root, data);
    const selected = candidates.find(function (candidate) {
      return candidate.matches_current_product;
    }) || candidates[0];
    const defaultName = clean(existingReview.reviewer_name || [clean(root.dataset.customerFirstName), clean(root.dataset.customerLastName)].filter(Boolean).join(' '));

    return {
      rating: positiveInt(existingReview.rating) || 0,
      selected_candidate_key: clean(selected && selected.candidate_key),
      order_id: positiveInt(selected && selected.order_id),
      order_line_id: positiveInt(selected && selected.order_line_id),
      variant_id: clean(selected && selected.variant_id || root.dataset.productVariantId),
      title: clean(existingReview.title),
      body: clean(existingReview.body),
      name: defaultName,
      email: clean(root.dataset.customerEmail),
      media_assets: Array.isArray(existingReview.media_assets) ? existingReview.media_assets.slice(0, 3) : [],
    };
  }

  function ensureDraft(root, data) {
    const key = productKey(root);
    const state = stateForKey(key);

    if (state.draft) {
      return state.draft;
    }

    return setStateForKey(key, { draft: defaultDraft(root, data) }).draft;
  }

  function selectedCandidate(root, data, draft) {
    const candidates = reviewCandidates(root, data);
    const candidateKey = clean(draft && draft.selected_candidate_key);

    return candidates.find(function (candidate) {
      return clean(candidate.candidate_key) === candidateKey;
    }) || candidates[0];
  }

  function wizardSteps() {
    return ['Rate', 'Product', 'Review', 'About'];
  }

  function stepIndicatorMarkup(step) {
    const steps = wizardSteps();

    return '' +
      '<div class="ForestryProductReviews__steps">' +
        steps.map(function (label, index) {
          const state = index < step ? 'is-complete' : (index === step ? 'is-active' : '');
          return '' +
            '<div class="ForestryProductReviews__step ' + state + '">' +
              '<span class="ForestryProductReviews__stepIndex">' + escapeHtml(String(index + 1)) + '</span>' +
              '<span class="ForestryProductReviews__stepLabel">' + escapeHtml(label) + '</span>' +
            '</div>';
        }).join('') +
      '</div>';
  }

  function selectedRatingMarkup(rating) {
    return '' +
      '<div class="ForestryProductReviews__ratingChoices">' +
        [1, 2, 3, 4, 5].map(function (value) {
          const active = value === rating;

          return '' +
            '<button type="button" class="ForestryProductReviews__ratingChoice' + (active ? ' is-active' : '') + '" data-action="forestry-review-set-rating" data-rating="' + value + '">' +
              '<span class="ForestryProductReviews__ratingChoiceStars">' + starMarkup(value) + '</span>' +
              '<span class="ForestryProductReviews__ratingChoiceLabel">' + escapeHtml(value + ' star' + (value === 1 ? '' : 's')) + '</span>' +
            '</button>';
        }).join('') +
      '</div>';
  }

  function productCandidateMarkup(candidate, selected) {
    const meta = [];
    if (candidate.order_status) meta.push(candidate.order_status.replace(/_/g, ' '));
    if (candidate.ordered_at) meta.push(shortDate(candidate.ordered_at));

    return '' +
      '<button type="button" class="ForestryProductReviews__candidate' + (selected ? ' is-selected' : '') + '" data-action="forestry-review-select-candidate" data-candidate-key="' + escapeHtml(candidate.candidate_key) + '">' +
        '<span class="ForestryProductReviews__candidateTitle">' + escapeHtml(candidate.product_title || 'Current product') + '</span>' +
        '<span class="ForestryProductReviews__candidateMeta Text--subdued">' + escapeHtml(meta.length ? meta.join(' · ') : 'Current product selection') + '</span>' +
        (candidate.order_external_id ? '<span class="ForestryProductReviews__candidateOrder Text--subdued">Order #' + escapeHtml(candidate.order_external_id) + '</span>' : '') +
      '</button>';
  }

  function draftMediaMarkup(draft) {
    const assets = Array.isArray(draft && draft.media_assets) ? draft.media_assets : [];
    if (!assets.length) {
      return '';
    }

    return '' +
      '<div class="ForestryProductReviews__draftMedia">' +
        assets.map(function (asset, index) {
          const url = mediaUrl(asset);
          const label = mediaName(asset) || 'Photo ' + (index + 1);

          return '' +
            '<div class="ForestryProductReviews__draftMediaItem">' +
              (url ? '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(label) + '">' : '<span class="ForestryProductReviews__mediaBadge">' + escapeHtml(label) + '</span>') +
              '<button type="button" class="ForestryProductReviews__removeMedia" data-action="forestry-review-remove-media" data-media-index="' + index + '" aria-label="Remove media">Remove</button>' +
            '</div>';
        }).join('') +
      '</div>';
  }

  function modalBodyMarkup(root, data, key) {
    const state = stateForKey(key);
    const draft = ensureDraft(root, data);
    const viewer = data && data.viewer ? data.viewer : {};
    const eligibility = viewer.eligibility && typeof viewer.eligibility === 'object' ? viewer.eligibility : {};
    const selected = selectedCandidate(root, data, draft);
    const minimumLength = positiveInt(data && data.settings && data.settings.minimum_length) || 24;

    if (state.step >= wizardSteps().length && state.submitResult) {
      const result = state.submitResult;
      const publicationCopy = clean(result.state) === 'review_pending'
        ? 'Your review is saved and waiting for moderation.'
        : 'Your review is live on this product page now.';
      const rewardCopy = result.award && result.award.eligible && clean(result.award.reward_amount)
        ? 'Candle Cash on this review: ' + currencyLabel(result.award.reward_amount) + '.'
        : clean(result.award && result.award.message);

      return '' +
        '<div class="ForestryProductReviews__success">' +
          '<p class="Heading u-h3">Thanks for reviewing.</p>' +
          '<p class="Text--subdued">' + escapeHtml(publicationCopy) + '</p>' +
          (rewardCopy ? '<p class="ForestryProductReviews__successReward">' + escapeHtml(rewardCopy) + '</p>' : '') +
          '<div class="ForestryProductReviews__modalActions">' +
            '<button type="button" class="Button Button--primary" data-action="forestry-review-close-surfaces">Done</button>' +
          '</div>' +
        '</div>';
    }

    if (state.step === 0) {
      return '' +
        '<div class="ForestryProductReviews__modalBody">' +
          '<p class="ForestryProductReviews__modalEyebrow">Rate your experience</p>' +
          '<h3 class="Heading u-h3">How did it burn, throw, and linger?</h3>' +
          '<p class="Text--subdued">Pick a star rating first so we can tailor the rest of the review flow.</p>' +
          selectedRatingMarkup(positiveInt(draft.rating) || 0) +
        '</div>';
    }

    if (state.step === 1) {
      const candidates = reviewCandidates(root, data);
      const rewardMessage = clean(eligibility.message || '');

      return '' +
        '<div class="ForestryProductReviews__modalBody">' +
          '<p class="ForestryProductReviews__modalEyebrow">Select the product</p>' +
          '<h3 class="Heading u-h3">Pick the best review match</h3>' +
          '<p class="Text--subdued">' + escapeHtml(rewardMessage || 'Choose the recent order that matches this product when you can.') + '</p>' +
          '<div class="ForestryProductReviews__candidateList">' +
            candidates.map(function (candidate) {
              return productCandidateMarkup(candidate, clean(candidate.candidate_key) === clean(draft.selected_candidate_key));
            }).join('') +
          '</div>' +
        '</div>';
    }

    if (state.step === 2) {
      return '' +
        '<div class="ForestryProductReviews__modalBody">' +
          '<p class="ForestryProductReviews__modalEyebrow">Write the review</p>' +
          '<h3 class="Heading u-h3">Tell other shoppers what stood out</h3>' +
          '<label class="ForestryProductReviews__field">' +
            '<span class="ForestryProductReviews__fieldLabel">Headline</span>' +
            '<input class="Input" type="text" maxlength="190" value="' + escapeHtml(draft.title || '') + '" data-review-draft-field="title" placeholder="Optional headline">' +
          '</label>' +
          '<label class="ForestryProductReviews__field">' +
            '<span class="ForestryProductReviews__fieldLabel">Review</span>' +
            '<textarea class="Input ForestryProductReviews__textarea" rows="6" minlength="' + minimumLength + '" data-review-draft-field="body" placeholder="How did it smell? How strong was the throw? How did it feel in your space?">' + escapeHtml(draft.body || '') + '</textarea>' +
          '</label>' +
          '<div class="ForestryProductReviews__field">' +
            '<span class="ForestryProductReviews__fieldLabel">Add photos</span>' +
            '<input type="file" accept="image/*" multiple data-action="forestry-review-upload-media">' +
            '<p class="Text--subdued">Add up to 3 photos. We compress them before upload for storefront display.</p>' +
            (state.mediaBusy ? '<p class="Text--subdued">Processing your photo selection...</p>' : '') +
            draftMediaMarkup(draft) +
          '</div>' +
        '</div>';
    }

    return '' +
      '<div class="ForestryProductReviews__modalBody">' +
        '<p class="ForestryProductReviews__modalEyebrow">About you</p>' +
        '<h3 class="Heading u-h3">Who should this review appear under?</h3>' +
        '<label class="ForestryProductReviews__field">' +
          '<span class="ForestryProductReviews__fieldLabel">Name</span>' +
          '<input class="Input" type="text" maxlength="160" value="' + escapeHtml(draft.name || '') + '" data-review-draft-field="name" placeholder="Your name">' +
        '</label>' +
        '<label class="ForestryProductReviews__field">' +
          '<span class="ForestryProductReviews__fieldLabel">Email</span>' +
          '<input class="Input" type="email" maxlength="255" value="' + escapeHtml(draft.email || '') + '" data-review-draft-field="email" placeholder="you@example.com">' +
        '</label>' +
        '<div class="ForestryProductReviews__confirmation">' +
          '<p class="Text--subdued">' + escapeHtml(clean(eligibility.message || 'We will link this review back to the right product and rewards profile when we can verify the order.')) + '</p>' +
          (selected && selected.order_external_id ? '<p class="Text--subdued">Selected order: #' + escapeHtml(selected.order_external_id) + '</p>' : '') +
        '</div>' +
      '</div>';
  }

  function modalFooterMarkup(data, key) {
    const state = stateForKey(key);

    if (state.step >= wizardSteps().length && state.submitResult) {
      return '';
    }

    const primaryLabel = state.step === wizardSteps().length - 1
      ? (state.busy ? 'Submitting...' : 'Submit review')
      : 'Next';

    return '' +
      '<div class="ForestryProductReviews__modalActions">' +
        (state.step > 0 ? '<button type="button" class="Button Button--secondary" data-action="forestry-review-step-back">Back</button>' : '<span></span>') +
        '<button type="button" class="Button Button--primary" data-action="forestry-review-step-next"' + (state.busy || state.mediaBusy ? ' disabled aria-disabled="true"' : '') + '>' + escapeHtml(primaryLabel) + '</button>' +
      '</div>';
  }

  function modalMarkup(root, data, key) {
    const state = stateForKey(key);
    const locked = reviewLocked(data && data.viewer);
    const lockedCopy = viewerLockCopy(data && data.viewer);
    const sizeClass = modalSizeClass(clean(root.dataset.reviewModalSize));

    return '' +
      '<div class="ForestryProductReviews__modalWrap' + (state.modalOpen ? ' is-visible' : '') + '"' + (state.modalOpen ? '' : ' aria-hidden="true"') + '>' +
        '<div class="ForestryProductReviews__modal ' + escapeHtml(sizeClass) + '">' +
          '<button type="button" class="ForestryProductReviews__close" data-action="forestry-review-close-surfaces" aria-label="Close review modal">Close</button>' +
          (locked && !state.submitResult ? '' +
            '<div class="ForestryProductReviews__modalBody">' +
              '<p class="ForestryProductReviews__modalEyebrow">Review status</p>' +
              '<h3 class="Heading u-h3">Submission unavailable</h3>' +
              '<p class="Text--subdued">' + escapeHtml(lockedCopy || 'This review is currently unavailable.') + '</p>' +
            '</div>' +
            '<div class="ForestryProductReviews__modalActions">' +
              '<button type="button" class="Button Button--primary" data-action="forestry-review-close-surfaces">Close</button>' +
            '</div>' : '' +
            stepIndicatorMarkup(state.step) +
            modalBodyMarkup(root, data, key) +
            modalFooterMarkup(data, key)) +
        '</div>' +
      '</div>';
  }

  function drawerMarkup(root, data, key) {
    const state = stateForKey(key);
    const snapshot = summarySnapshot(data);
    const reviews = sortedReviews(data, key);
    const viewer = data && data.viewer ? data.viewer : {};
    const sortOptions = Array.isArray(data.sort_options) ? data.sort_options : [];
    const selectedSort = reviewSortValue(data, key);

    return '' +
      '<aside class="ForestryProductReviews__drawer' + (state.drawerOpen ? ' is-visible' : '') + '" aria-hidden="' + (state.drawerOpen ? 'false' : 'true') + '">' +
        '<div class="ForestryProductReviews__drawerHeader">' +
          '<div>' +
            '<p class="ForestryProductReviews__drawerEyebrow">Reviews</p>' +
            '<h3 class="Heading u-h4">Customer reviews</h3>' +
            '<div class="ForestryProductReviews__drawerSummary">' +
              starMarkup(snapshot.average) +
              '<span>' + escapeHtml(snapshot.count > 0 ? ((snapshot.average ? snapshot.average.toFixed(1) : '0.0') + ' from ' + reviewCountLabel(snapshot.count)) : 'No reviews yet') + '</span>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="ForestryProductReviews__close" data-action="forestry-review-close-surfaces" aria-label="Close review drawer">Close</button>' +
        '</div>' +
        '<div class="ForestryProductReviews__drawerTools">' +
          '<label class="ForestryProductReviews__sortLabel">' +
            '<span>Sort</span>' +
            '<select data-action="forestry-review-sort">' +
              sortOptions.map(function (option) {
                const value = clean(option && option.value);
                return '<option value="' + escapeHtml(value) + '"' + (value === selectedSort ? ' selected' : '') + '>' + escapeHtml(clean(option && option.label) || value) + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<button type="button" class="Button Button--primary" data-action="forestry-review-open-modal"' + ((viewer.can_submit !== true || reviewLocked(viewer)) ? ' disabled aria-disabled="true"' : '') + '>Write a review</button>' +
        '</div>' +
        (state.message ? '<div class="ForestryProductReviews__notice ForestryProductReviews__notice--' + escapeHtml(clean(state.tone) || 'neutral') + '">' + escapeHtml(state.message) + '</div>' : '') +
        (reviews.length ? '<div class="ForestryProductReviews__cards">' + reviews.map(reviewCardMarkup).join('') + '</div>' :
          '<div class="ForestryProductReviews__empty"><p class="Heading u-h6">No reviews yet</p><p class="Text--subdued">Be the first to tell other shoppers how this scent lives in your space.</p></div>') +
      '</aside>';
  }

  function experienceShellMarkup(root, data) {
    const key = productKey(root);
    const state = stateForKey(key);
    const snapshot = summarySnapshot(data);
    const viewer = data && data.viewer ? data.viewer : {};

    updateCountBadges(key, snapshot.count);

    return '' +
      '<div class="ForestryProductReviews__summaryRow">' +
        '<button type="button" class="ForestryProductReviewSummary__button" data-action="forestry-sitewide-reviews-show-product">' +
          starMarkup(snapshot.average) +
          '<span class="ForestryProductReviewSummary__copy">' + escapeHtml(snapshot.count > 0 ? ((snapshot.average ? snapshot.average.toFixed(1) : '0.0') + ' · ' + reviewCountLabel(snapshot.count)) : 'Be the first to review') + '</span>' +
        '</button>' +
        ((viewer.can_submit === true && !reviewLocked(viewer))
          ? '<button type="button" class="ForestryProductReviewSummary__link Link Link--primary" data-action="forestry-review-open-modal">Write a review</button>'
          : '') +
      '</div>' +
      '<div class="ForestryProductReviews__shell" data-forestry-product-review-shell data-forestry-product-review-key="' + escapeHtml(key) + '">' +
        '<div class="ForestryProductReviews__backdrop' + (state.modalOpen ? ' is-visible' : '') + '" data-action="forestry-review-close-surfaces"></div>' +
        modalMarkup(root, data, key) +
      '</div>';
  }

  function inlinePanelMarkup(root, data) {
    const key = productKey(root);
    const snapshot = summarySnapshot(data);
    const reviews = sortedReviews(data, key).slice(0, 6);
    const viewer = data && data.viewer ? data.viewer : {};
    const rewardAmount = clean(data && data.task && data.task.reward_amount);
    const publicationMode = clean(data && data.settings && data.settings.publication_mode).replace(/_/g, ' ');

    updateCountBadges(key, snapshot.count);

    return '' +
      '<div class="ForestryProductReviews__inline">' +
        '<div class="ForestryProductReviews__inlineHeader">' +
          '<div>' +
            '<p class="ForestryProductReviews__drawerEyebrow">Customer reviews</p>' +
            '<h2 class="Heading u-h4">What people are saying</h2>' +
            '<div class="ForestryProductReviews__drawerSummary">' +
              starMarkup(snapshot.average) +
              '<span>' + escapeHtml(snapshot.count > 0 ? ((snapshot.average ? snapshot.average.toFixed(1) : '0.0') + ' from ' + reviewCountLabel(snapshot.count)) : 'No reviews yet') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="ForestryProductReviews__inlineActions">' +
            '<button type="button" class="Button Button--secondary" data-action="forestry-review-open-drawer">Browse all</button>' +
            '<button type="button" class="Button Button--primary" data-action="forestry-review-open-modal"' + ((viewer.can_submit !== true || reviewLocked(viewer)) ? ' disabled aria-disabled="true"' : '') + '>Write a review</button>' +
          '</div>' +
        '</div>' +
        '<div class="ForestryProductReviews__inlineMeta">' +
          (rewardAmount ? '<span>Earn ' + escapeHtml(currencyLabel(rewardAmount) || rewardAmount) + ' in Candle Cash on eligible verified reviews.</span>' : '') +
          (publicationMode ? '<span>Publication: ' + escapeHtml(publicationMode) + '</span>' : '') +
        '</div>' +
        (viewerLockCopy(viewer) ? '<div class="ForestryProductReviews__notice ForestryProductReviews__notice--neutral">' + escapeHtml(viewerLockCopy(viewer)) + '</div>' : '') +
        (reviews.length ? '<div class="ForestryProductReviews__cards">' + reviews.map(reviewCardMarkup).join('') + '</div>' :
          '<div class="ForestryProductReviews__empty"><p class="Heading u-h6">No reviews yet</p><p class="Text--subdued">Be the first to describe the scent, the throw, and the mood it creates at home.</p></div>') +
      '</div>';
  }

  function renderSummary(root, data) {
    root.innerHTML = experienceShellMarkup(root, data);
  }

  function renderPanel(root, data) {
    root.innerHTML = inlinePanelMarkup(root, data);
  }

  function renderSummaryUnavailable(root) {
    root.innerHTML = '<span class="Text--subdued">Reviews unavailable right now.</span>';
  }

  function renderPanelUnavailable(root, message) {
    root.innerHTML = '<div class="ForestryProductReviews__notice ForestryProductReviews__notice--danger">' + escapeHtml(message || 'Reviews are not ready yet.') + '</div>';
  }

  function rerenderProduct(key) {
    const roots = allRootsForProduct(key);
    if (!roots.length) {
      return;
    }

    roots.forEach(function (root) {
      const data = runtime.payloads.get(cacheKey(root)) || emptyPayload();

      if (root.matches(SUMMARY_SELECTOR)) {
        renderSummary(root, data);
      } else if (root.matches(PANEL_SELECTOR)) {
        renderPanel(root, data);
      } else if (root.matches(RATING_SELECTOR)) {
        renderRating(root, data);
      }
    });
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
          renderPanelUnavailable(node, (result.error && result.error.message) || 'Reviews are not ready yet.');
        }
        return;
      }

      if (node.matches(SUMMARY_SELECTOR)) {
        renderSummary(node, result.data);
      } else if (node.matches(PANEL_SELECTOR)) {
        renderPanel(node, result.data);
      } else if (node.matches(RATING_SELECTOR)) {
        renderRating(node, result.data);
      }
    });

    return result;
  }

  function validationMessage(root, data, key) {
    const state = stateForKey(key);
    const draft = ensureDraft(root, data);
    const minimumLength = positiveInt(data && data.settings && data.settings.minimum_length) || 24;

    if (state.step === 0 && !positiveInt(draft.rating)) {
      return 'Choose a star rating before continuing.';
    }

    if (state.step === 1 && !clean(draft.selected_candidate_key)) {
      return 'Pick the product or order that best matches this review.';
    }

    if (state.step === 2 && clean(draft.body).length < minimumLength) {
      return 'Tell us a little more before continuing.';
    }

    if (state.step === 3 && !clean(draft.name)) {
      return 'Add your name before submitting.';
    }

    if (state.step === 3 && !clean(draft.email)) {
      return 'Add your email before submitting.';
    }

    return '';
  }

  async function nextStep(key) {
    const root = primaryRootForKey(key);
    if (!root) {
      return;
    }

    const data = runtime.payloads.get(cacheKey(root)) || emptyPayload();
    const state = stateForKey(key);
    const message = validationMessage(root, data, key);
    if (message) {
      setStateForKey(key, {
        message: message,
        tone: 'danger',
      });
      rerenderProduct(key);
      return;
    }

    if (state.step >= wizardSteps().length - 1) {
      await submitReview(key);
      return;
    }

    setStateForKey(key, {
      step: state.step + 1,
      message: '',
      tone: 'neutral',
    });
    rerenderProduct(key);
  }

  function previousStep(key) {
    const state = stateForKey(key);
    setStateForKey(key, {
      step: Math.max(0, state.step - 1),
      message: '',
      tone: 'neutral',
    });
    rerenderProduct(key);
  }

  function draftForKey(key) {
    const root = primaryRootForKey(key);
    if (!root) {
      return null;
    }

    const data = runtime.payloads.get(cacheKey(root)) || emptyPayload();
    return ensureDraft(root, data);
  }

  function patchDraft(key, patch) {
    const current = draftForKey(key);
    if (!current) {
      return null;
    }

    const next = Object.assign({}, current, patch || {});
    setStateForKey(key, {
      draft: next,
      message: '',
      tone: 'neutral',
      submitResult: null,
    });
    return next;
  }

  function openDrawer(key) {
    setStateForKey(key, {
      drawerOpen: true,
      modalOpen: false,
      message: '',
      tone: 'neutral',
    });
    rerenderProduct(key);
  }

  function openModal(key) {
    const root = primaryRootForKey(key);
    if (!root) {
      return;
    }

    const data = runtime.payloads.get(cacheKey(root)) || emptyPayload();
    ensureDraft(root, data);

    setStateForKey(key, {
      drawerOpen: false,
      modalOpen: true,
      step: 0,
      message: '',
      tone: 'neutral',
      submitResult: null,
    });
    rerenderProduct(key);
  }

  function closeSurfaces(key) {
    setStateForKey(key, {
      drawerOpen: false,
      modalOpen: false,
      step: 0,
      mediaBusy: false,
      message: '',
      tone: 'neutral',
      submitResult: null,
    });
    rerenderProduct(key);
  }

  function submitFailureMessage(payload) {
    const error = payload && payload.error ? payload.error : null;
    const errorCode = clean(error && error.code);
    const errorMessage = clean(error && error.message);

    switch (errorCode) {
      case 'duplicate_review':
        return 'You already reviewed this product.';
      case 'identity_review_required':
        return 'We could not safely match this review to a customer profile yet.';
      case 'login_required':
        return 'Sign in before leaving a product review.';
      case 'review_too_short':
        return 'Tell us a little more before you submit your review.';
      case 'email_required':
        return 'Please provide an email address so we can save your review.';
      case 'invalid_rating':
        return 'Choose a valid star rating before submitting.';
      default:
        return errorMessage || 'We could not save that review right now. Please try again in a moment.';
    }
  }

  async function submitReview(key) {
    const root = primaryRootForKey(key);
    if (!root) {
      return;
    }

    const data = runtime.payloads.get(cacheKey(root)) || emptyPayload();
    const draft = ensureDraft(root, data);
    const selected = selectedCandidate(root, data, draft);
    const endpoint = clean(root.dataset.endpointProductReviewSubmit);

    if (!endpoint) {
      setStateForKey(key, {
        message: 'Review endpoint is missing.',
        tone: 'danger',
      });
      rerenderProduct(key);
      return;
    }

    setStateForKey(key, {
      busy: true,
      message: '',
      tone: 'neutral',
    });
    rerenderProduct(key);

    const payload = {
      product_id: clean(root.dataset.productId),
      product_handle: clean(root.dataset.productHandle),
      product_title: clean(root.dataset.productTitle),
      product_url: clean(root.dataset.productUrl),
      variant_id: clean(draft.variant_id || root.dataset.productVariantId),
      rating: positiveInt(draft.rating) || 0,
      title: clean(draft.title),
      body: clean(draft.body),
      name: clean(draft.name),
      email: clean(draft.email),
      order_id: positiveInt(selected && selected.order_id),
      order_line_id: positiveInt(selected && selected.order_line_id),
      media_assets: Array.isArray(draft.media_assets) ? draft.media_assets : [],
      phone: clean(root.dataset.customerPhone),
      shopify_customer_id: clean(root.dataset.shopifyCustomerId),
      request_key: 'product-review:' + key + ':' + Date.now(),
    };

    const form = new URLSearchParams();
    Object.keys(payload).forEach(function (field) {
      appendFormValue(form, field, payload[field]);
    });

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    const response = await fetch(new URL(endpoint, window.location.origin).toString(), Object.assign({
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: form.toString(),
    }, controller ? { signal: controller.signal } : {})).then(async function (res) {
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
      return {
        ok: false,
        payload: null,
      };
    }).finally(function () {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    });

    if (!response.ok) {
      setStateForKey(key, {
        busy: false,
        message: submitFailureMessage(response.payload),
        tone: 'danger',
      });
      rerenderProduct(key);
      return;
    }

    setStateForKey(key, {
      busy: false,
      modalOpen: true,
      step: wizardSteps().length,
      message: '',
      tone: 'neutral',
      submitResult: response.payload && response.payload.data ? response.payload.data : null,
      draft: null,
    });

    runtime.promises.delete(cacheKey(root));
    await hydrate(root, true);
    rerenderProduct(key);
  }

  function dataUrlFromCanvas(image, fileType) {
    const maxDimension = 1200;
    const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Image canvas unavailable.');
    }

    context.drawImage(image, 0, 0, width, height);
    const mimeType = clean(fileType).toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
    const quality = mimeType === 'image/png' ? undefined : 0.82;

    return {
      mimeType: mimeType,
      dataUrl: canvas.toDataURL(mimeType, quality),
      width: width,
      height: height,
    };
  }

  function imageAssetFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('Only image uploads are supported right now.'));
        return;
      }

      const reader = new FileReader();
      reader.onload = function (event) {
        const image = new Image();
        image.onload = function () {
          try {
            const result = dataUrlFromCanvas(image, file.type);
            resolve({
              name: clean(file.name) || 'review-photo',
              mime_type: result.mimeType,
              size_bytes: file.size,
              width: result.width,
              height: result.height,
              data_url: result.dataUrl,
            });
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = function () {
          reject(new Error('One of your images could not be processed.'));
        };
        image.src = clean(event && event.target && event.target.result);
      };
      reader.onerror = function () {
        reject(new Error('We could not read one of your images.'));
      };
      reader.readAsDataURL(file);
    });
  }

  async function processMediaUpload(key, input) {
    const root = primaryRootForKey(key);
    if (!root) {
      return;
    }

    const files = Array.from((input && input.files) || []).slice(0, 3);
    if (!files.length) {
      return;
    }

    setStateForKey(key, {
      mediaBusy: true,
      message: '',
      tone: 'neutral',
    });
    rerenderProduct(key);

    try {
      const assets = await Promise.all(files.map(imageAssetFromFile));
      patchDraft(key, {
        media_assets: assets,
      });
      setStateForKey(key, {
        mediaBusy: false,
      });
    } catch (error) {
      setStateForKey(key, {
        mediaBusy: false,
        message: clean(error && error.message) || 'We could not process those photos.',
        tone: 'danger',
      });
    }

    rerenderProduct(key);
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

  function syncVariantContext(event) {
    const detail = event && event.detail ? event.detail : {};
    const variant = detail.variant || {};
    const variantId = clean(variant.id);
    if (!variantId) {
      return;
    }

    document.querySelectorAll(SUMMARY_SELECTOR + ',' + PANEL_SELECTOR + ',' + RATING_SELECTOR).forEach(function (root) {
      root.dataset.productVariantId = variantId;
    });

    document.querySelectorAll(SITEWIDE_SELECTOR).forEach(function (root) {
      root.dataset.currentProductVariantId = variantId;
    });
  }

  function floatingReviewState() {
    if (!runtime.sitewide) {
      runtime.sitewide = {
        node: null,
        open: false,
        scope: 'sitewide',
        sitewideSort: 'most_recent',
        productData: null,
        sitewideData: null,
        productLoading: false,
        sitewideLoading: false,
        lastFocused: null,
        entrySource: '',
        reviewModalOpen: false,
        reviewModalBusy: false,
        reviewDataLoading: false,
        reviewDataReady: false,
        reviewDataError: '',
        reviewModalMessage: '',
        reviewModalTone: 'neutral',
        reviewNotice: '',
        reviewNoticeTone: 'neutral',
        reviewDraft: null,
        reviewCandidates: [],
        reviewSearchResults: [],
        reviewSearchLoading: false,
        reviewSearchQuery: '',
        reviewSearchToken: 0,
        reviewSearchTimer: null,
        reviewSearchCache: new Map(),
        reviewSettings: {
          minimumLength: 24,
          allowGuest: true,
          canSubmit: true,
        },
        reviewLastFocused: null,
      };
    }

    return runtime.sitewide;
  }

  function floatingReviewSeedProduct(node, state) {
    const currentProductId = clean(node && node.dataset && node.dataset.currentProductId);
    if (currentProductId) {
      return {
        product_id: currentProductId,
        product_handle: clean(node.dataset.currentProductHandle),
        product_title: clean(node.dataset.currentProductTitle),
        product_url: clean(node.dataset.currentProductUrl),
        variant_id: clean(node.dataset.currentProductVariantId),
      };
    }

    const sitewideReviews = Array.isArray(state && state.sitewideData && state.sitewideData.reviews)
      ? state.sitewideData.reviews
      : [];
    const firstSitewide = sitewideReviews.find(function (review) {
      return clean(review && review.product_id);
    });
    if (firstSitewide) {
      return {
        product_id: clean(firstSitewide.product_id),
        product_handle: clean(firstSitewide.product_handle),
        product_title: clean(firstSitewide.product_title),
        product_url: clean(firstSitewide.product_url),
        variant_id: '',
      };
    }

    return {
      product_id: 'sitewide-review',
      product_handle: '',
      product_title: 'Candle review',
      product_url: '',
      variant_id: '',
    };
  }

  function normalizeFloatingCandidate(candidate, index) {
    const title = clean(candidate && candidate.product_title);
    const productId = clean(candidate && candidate.product_id);
    const fallbackHandle = title ? slugify(title) : '';
    const handle = clean(candidate && candidate.product_handle) || fallbackHandle;
    const displayTitle = title || titleFromHandle(handle);
    const orderLineId = positiveInt(candidate && candidate.order_line_id);
    const orderId = positiveInt(candidate && candidate.order_id);
    const key = clean(candidate && candidate.candidate_key)
      || ('candidate-' + (orderLineId || orderId || productId || handle || index));

    if (!displayTitle) {
      return null;
    }

    return {
      candidate_key: key,
      order_id: orderId,
      order_line_id: orderLineId,
      order_external_id: clean(candidate && candidate.order_external_id),
      ordered_at: clean(candidate && candidate.ordered_at),
      order_status: clean(candidate && candidate.order_status),
      product_id: productId,
      variant_id: clean(candidate && candidate.variant_id),
      product_title: displayTitle,
      product_handle: handle,
      product_url: clean(candidate && candidate.product_url) || (handle ? '/products/' + handle : ''),
      source: clean(candidate && candidate.source) || (orderLineId ? 'order' : 'product'),
    };
  }

  function floatingFallbackCandidates(node, state) {
    const rows = [];
    const seen = new Set();
    const currentProductId = clean(node && node.dataset && node.dataset.currentProductId);
    const currentProductTitle = clean(node && node.dataset && node.dataset.currentProductTitle);
    const currentProductHandle = clean(node && node.dataset && node.dataset.currentProductHandle);
    const currentProductUrl = clean(node && node.dataset && node.dataset.currentProductUrl);

    if (currentProductId) {
      seen.add(currentProductId);
      rows.push({
        product_id: currentProductId,
        product_title: currentProductTitle || 'Current product',
        product_handle: currentProductHandle,
        product_url: currentProductUrl,
        source: 'current_product',
      });
    }

    [state && state.productData, state && state.sitewideData].forEach(function (payload) {
      const reviews = Array.isArray(payload && payload.reviews) ? payload.reviews : [];
      reviews.forEach(function (review) {
        const productId = clean(review && review.product_id);
        const title = clean(review && review.product_title);
        const handle = clean(review && review.product_handle);
        const dedupeKey = productId || handle || slugify(title);

        if (!dedupeKey || seen.has(dedupeKey)) {
          return;
        }

        seen.add(dedupeKey);
        rows.push({
          product_id: productId,
          product_title: title,
          product_handle: handle,
          product_url: clean(review && review.product_url),
          source: 'sitewide_feed',
        });
      });
    });

    return rows.map(function (row, index) {
      const normalized = normalizeFloatingCandidate(Object.assign({}, row, {
        candidate_key: clean(row.candidate_key) || ('product-' + (clean(row.product_id) || slugify(clean(row.product_title)) || index)),
      }), index);

      if (!normalized) {
        return null;
      }

      return Object.assign({}, normalized, {
        order_id: null,
        order_line_id: null,
      });
    }).filter(Boolean);
  }

  function mergedFloatingCandidates(primary, fallback) {
    const combined = [];
    const seen = new Set();

    mergeArray(primary, []).concat(mergeArray(fallback, [])).forEach(function (candidate) {
      const normalized = normalizeFloatingCandidate(candidate, combined.length);
      if (!normalized) {
        return;
      }

      const dedupeKey = normalized.order_line_id
        ? ('order-line:' + normalized.order_line_id)
        : (normalized.product_id || normalized.product_handle || normalized.candidate_key);

      if (!dedupeKey || seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);
      combined.push(normalized);
    });

    return combined;
  }

  function floatingReviewDefaultDraft(node, state) {
    return {
      selected_candidate_key: '',
      search: '',
      rating: 0,
      body: '',
    };
  }

  function ensureFloatingReviewDraft(node, state) {
    if (state.reviewDraft && typeof state.reviewDraft === 'object') {
      return state.reviewDraft;
    }

    const draft = floatingReviewDefaultDraft(node, state);
    state.reviewDraft = draft;
    return draft;
  }

  function selectedFloatingReviewCandidate(state) {
    const draft = state && state.reviewDraft ? state.reviewDraft : {};
    const selectedKey = clean(draft && draft.selected_candidate_key);
    const candidates = Array.isArray(state && state.reviewCandidates) ? state.reviewCandidates : [];

    return candidates.find(function (candidate) {
      return clean(candidate && candidate.candidate_key) === selectedKey;
    }) || null;
  }

  function filteredFloatingCandidates(state) {
    const draft = state && state.reviewDraft ? state.reviewDraft : {};
    const query = clean(draft.search).toLowerCase();
    const candidates = Array.isArray(state && state.reviewCandidates) ? state.reviewCandidates : [];
    const searchResults = Array.isArray(state && state.reviewSearchResults) ? state.reviewSearchResults : [];

    if (!query) {
      return [];
    }

    const compactQuery = query.replace(/[^a-z0-9]+/g, '');
    const matchCandidate = function (candidate) {
      const haystack = [
        clean(candidate && candidate.product_title),
        clean(candidate && candidate.product_handle),
      ].join(' ').toLowerCase();

      if (haystack.indexOf(query) >= 0) {
        return true;
      }

      if (!compactQuery) {
        return false;
      }

      return haystack.replace(/[^a-z0-9]+/g, '').indexOf(compactQuery) >= 0;
    };

    if (searchResults.length) {
      return searchResults.filter(matchCandidate);
    }

    return candidates.filter(matchCandidate);
  }

  function floatingCatalogSearchUrl(query) {
    const url = new URL('/search/suggest.json', window.location.origin);
    url.searchParams.set('q', clean(query));
    url.searchParams.set('resources[type]', 'product');
    url.searchParams.set('resources[limit]', String(FLOATING_REVIEW_SEARCH_LIMIT));
    url.searchParams.set('resources[options][unavailable_products]', 'hide');
    return url;
  }

  function normalizeCatalogProductCandidate(product, index) {
    const productId = clean(product && product.id);
    const title = clean(product && product.title);
    const handle = clean(product && product.handle) || slugify(title);
    const rawUrl = clean(product && product.url);
    let productUrl = '';

    if (rawUrl) {
      try {
        productUrl = new URL(rawUrl, window.location.origin).pathname;
      } catch (_error) {
        productUrl = rawUrl.split('?')[0];
      }
    }

    return normalizeFloatingCandidate({
      candidate_key: 'catalog:' + (productId || handle || index),
      product_id: productId,
      product_handle: handle,
      product_title: title,
      product_url: productUrl || (handle ? '/products/' + handle : ''),
      variant_id: '',
      source: 'catalog_search',
    }, index);
  }

  function runFloatingCatalogSearch(query, options) {
    const state = floatingReviewState();
    const node = state.node;
    if (!node) {
      return;
    }

    const normalizedQuery = clean(query);
    const queryKey = normalizedQuery.toLowerCase();

    if (state.reviewSearchTimer) {
      window.clearTimeout(state.reviewSearchTimer);
      state.reviewSearchTimer = null;
    }

    const searchToken = state.reviewSearchToken + 1;
    state.reviewSearchToken = searchToken;

    if (!queryKey) {
      state.reviewSearchQuery = '';
      state.reviewSearchLoading = false;
      state.reviewSearchResults = [];
      renderFloatingReviews();
      return;
    }

    const execute = function () {
      const cache = state.reviewSearchCache instanceof Map ? state.reviewSearchCache : new Map();
      state.reviewSearchCache = cache;

      if (cache.has(queryKey)) {
        const cachedResults = mergeArray(cache.get(queryKey), []);
        state.reviewSearchQuery = queryKey;
        state.reviewSearchLoading = false;
        state.reviewSearchResults = cachedResults;
        state.reviewCandidates = mergedFloatingCandidates(cachedResults, state.reviewCandidates);
        renderFloatingReviews();
        return;
      }

      state.reviewSearchQuery = queryKey;
      state.reviewSearchLoading = true;
      state.reviewSearchResults = [];

      fetch(floatingCatalogSearchUrl(normalizedQuery).toString(), {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      }).then(function (response) {
        if (!response.ok) {
          return null;
        }
        return response.json().catch(function () {
          return null;
        });
      }).then(function (payload) {
        if (state.reviewSearchToken !== searchToken) {
          return;
        }

        const products = mergeArray(
          payload && payload.resources && payload.resources.results && payload.resources.results.products,
          []
        );
        const catalogResults = products.map(function (product, index) {
          return normalizeCatalogProductCandidate(product, index);
        }).filter(Boolean);

        cache.set(queryKey, catalogResults);
        state.reviewSearchLoading = false;
        state.reviewSearchQuery = queryKey;
        state.reviewSearchResults = catalogResults;
        state.reviewCandidates = mergedFloatingCandidates(catalogResults, state.reviewCandidates);
        renderFloatingReviews();
      }).catch(function () {
        if (state.reviewSearchToken !== searchToken) {
          return;
        }

        state.reviewSearchLoading = false;
        state.reviewSearchQuery = queryKey;
        state.reviewSearchResults = [];
        renderFloatingReviews();
      });
    };

    if (options && options.immediate) {
      execute();
      return;
    }

    state.reviewSearchTimer = window.setTimeout(execute, FLOATING_REVIEW_SEARCH_DEBOUNCE_MS);
  }

  function floatingReviewIdentity(node) {
    const email = clean(node && node.dataset && node.dataset.customerEmail);
    const firstName = clean(node && node.dataset && node.dataset.customerFirstName);
    const lastName = clean(node && node.dataset && node.dataset.customerLastName);
    const displayName = [firstName, lastName].filter(Boolean).join(' ');
    const fallbackName = email ? clean(email.split('@')[0]).replace(/[._-]+/g, ' ') : '';

    return {
      email: email,
      name: displayName || fallbackName || 'Customer',
    };
  }

  function reviewRequest(node, endpoint, params, fallbackData) {
    if (!endpoint) {
      return Promise.resolve({
        ok: false,
        data: fallbackData,
        error: {
          code: 'missing_endpoint',
          message: 'Review endpoint is missing.',
        },
      });
    }

    const url = new URL(endpoint, window.location.origin);
    Object.keys(params || {}).forEach(function (field) {
      const value = params[field];
      if (value != null && clean(value) !== '') {
        url.searchParams.set(field, clean(value));
      }
    });

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    return fetch(url.toString(), Object.assign({
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }, controller ? { signal: controller.signal } : {})).then(async function (response) {
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
        return {
          ok: true,
          data: payload.data || fallbackData,
          error: null,
        };
      }

      return {
        ok: false,
        data: payload && payload.data ? payload.data : fallbackData,
        error: (payload && payload.error) || {
          code: response.status === 404 ? 'not_ready' : 'request_failed',
          message: response.status === 404 ? 'Reviews are still connecting.' : 'The review request could not be completed.',
        },
      };
    }).catch(function (error) {
      return {
        ok: false,
        data: fallbackData,
        error: {
          code: error && error.name === 'AbortError' ? 'network_timeout' : 'network_error',
          message: error && error.name === 'AbortError'
            ? 'Review request timed out.'
            : (error && error.message ? error.message : 'Network request failed.'),
        },
      };
    }).finally(function () {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    });
  }

  function floatingReviewHasProduct(node) {
    return !!clean(node && node.dataset && node.dataset.currentProductId);
  }

  function floatingReviewQuery(node) {
    return {
      email: clean(node && node.dataset && node.dataset.customerEmail),
      phone: clean(node && node.dataset && node.dataset.customerPhone),
      shopify_customer_id: clean(node && node.dataset && node.dataset.shopifyCustomerId),
    };
  }

  function floatingProductQuery(node) {
    const query = floatingReviewQuery(node);
    query.product_id = clean(node && node.dataset && node.dataset.currentProductId);
    query.variant_id = clean(node && node.dataset && node.dataset.currentProductVariantId);
    query.product_handle = clean(node && node.dataset && node.dataset.currentProductHandle);
    query.product_title = clean(node && node.dataset && node.dataset.currentProductTitle);
    query.product_url = clean(node && node.dataset && node.dataset.currentProductUrl);
    return query;
  }

  function floatingSitewideQuery(node) {
    const state = floatingReviewState();
    const query = floatingReviewQuery(node);
    query.limit = positiveInt(clean(node && node.dataset && node.dataset.reviewLimit)) || 24;
    query.sort = clean(state.sitewideSort) || 'most_recent';
    return query;
  }

  function normalizedReviewDate(review) {
    return new Date(review.approved_at || review.published_at || review.submitted_at || 0).getTime() || 0;
  }

  function sortedFloatingReviews(reviews, sortValue) {
    const items = Array.isArray(reviews) ? reviews.slice() : [];
    const sort = clean(sortValue) || 'most_recent';

    if (sort === 'highest_rating') {
      return items.sort(function (left, right) {
        if ((right.rating || 0) !== (left.rating || 0)) {
          return (right.rating || 0) - (left.rating || 0);
        }

        return normalizedReviewDate(right) - normalizedReviewDate(left);
      });
    }

    if (sort === 'lowest_rating') {
      return items.sort(function (left, right) {
        if ((left.rating || 0) !== (right.rating || 0)) {
          return (left.rating || 0) - (right.rating || 0);
        }

        return normalizedReviewDate(right) - normalizedReviewDate(left);
      });
    }

    return items.sort(function (left, right) {
      return normalizedReviewDate(right) - normalizedReviewDate(left);
    });
  }

  function floatingReviewContentMarkup(node) {
    const state = floatingReviewState();
    const identity = floatingReviewIdentity(node);
    const showingProduct = state.scope === 'product' && floatingReviewHasProduct(node);
    const loading = showingProduct ? state.productLoading : state.sitewideLoading;
    const payload = showingProduct
      ? (state.productData || emptyPayload())
      : (state.sitewideData || emptySitewidePayload());
    const snapshot = summarySnapshot(payload);
    const reviewSort = showingProduct ? 'most_recent' : (clean(state.sitewideSort) || clean(payload.current_sort) || 'most_recent');
    const reviews = sortedFloatingReviews(payload.reviews, reviewSort);
    const currentProductTitle = clean(node.dataset.currentProductTitle) || 'This product';
    const browseProductsUrl = '/collections/all';
    const hasSubmitEndpoint = !!clean(node.dataset.endpointProductReviewSubmit);
    const canLaunchModal = hasSubmitEndpoint;
    const launchLabel = state.reviewDataLoading ? 'Loading review flow...' : 'Leave a review';
    const launchDisabled = canLaunchModal ? '' : ' disabled aria-disabled="true"';
    const lockCopy = hasSubmitEndpoint && (state.reviewSettings.canSubmit === false || !identity.email)
      ? 'Sign in to leave a review.'
      : '';

    return '' +
      '<div class="ForestryFloatingDrawer__panelHeader">' +
        '<div>' +
          '<p class="ForestryFloatingDrawer__panelEyebrow">Reviews</p>' +
          '<h3 class="ForestryFloatingDrawer__panelTitle Heading u-h4">' + escapeHtml(showingProduct ? currentProductTitle : 'Latest from the studio') + '</h3>' +
          '<p class="ForestryFloatingDrawer__panelSubtitle">' + escapeHtml(snapshot.count > 0 ? ((snapshot.average ? snapshot.average.toFixed(1) : '0.0') + ' from ' + reviewCountLabel(snapshot.count)) : 'No reviews yet') + '</p>' +
        '</div>' +
        '<button type="button" class="ForestryFloatingDrawer__close" data-action="forestry-sitewide-reviews-close" aria-label="Close reviews">Close</button>' +
      '</div>' +
      '<div class="ForestryProductReviews__drawerLead">' +
        '<button type="button" class="Button Button--primary Button--full" data-action="forestry-sitewide-review-open-modal"' + launchDisabled + '>' + escapeHtml(launchLabel) + '</button>' +
      '</div>' +
      (lockCopy ? '<div class="ForestryProductReviews__notice ForestryProductReviews__notice--neutral">' + escapeHtml(lockCopy) + '</div>' : '') +
      (state.reviewNotice ? '<div class="ForestryProductReviews__notice ForestryProductReviews__notice--' + escapeHtml(clean(state.reviewNoticeTone) || 'success') + '">' + escapeHtml(state.reviewNotice) + '</div>' : '') +
      (!showingProduct ? '' +
        '<label class="ForestryProductReviews__sortLabel ForestryProductReviews__sortLabel--floating">' +
          '<span>Sort</span>' +
          '<select data-action="forestry-sitewide-reviews-sort">' +
            (Array.isArray(payload.sort_options) ? payload.sort_options : []).map(function (option) {
              const value = clean(option && option.value);
              return '<option value="' + escapeHtml(value) + '"' + (value === reviewSort ? ' selected' : '') + '>' + escapeHtml(clean(option && option.label) || value) + '</option>';
            }).join('') +
          '</select>' +
        '</label>' : '') +
      (loading && !reviews.length
        ? '<p class="Text--subdued">Loading reviews...</p>'
        : reviews.length
        ? '<div class="ForestryProductReviews__cards ForestryProductReviews__cards--floating">' + reviews.map(function (review) {
            return reviewCardMarkup(review, {
              showProduct: !showingProduct,
            });
          }).join('') + '</div>'
        : '<div class="ForestryProductReviews__empty"><p class="Heading u-h6">No reviews yet</p><p class="Text--subdued">' + escapeHtml(showingProduct ? 'This product has not been reviewed yet.' : 'Sitewide reviews will appear here as soon as they are approved.') + '</p></div>') +
      (showingProduct && floatingReviewHasProduct(node)
        ? '<div class="ForestryFloatingDrawer__panelFooter">' +
            '<button type="button" class="Button Button--secondary" data-action="forestry-sitewide-reviews-show-all">See all reviews</button>' +
          '</div>'
        : '') +
      (!showingProduct && floatingReviewHasProduct(node)
        ? '<div class="ForestryFloatingDrawer__panelFooter"><button type="button" class="Button Button--secondary" data-action="forestry-sitewide-reviews-show-product">Back to this product</button></div>'
        : '') +
      (!floatingReviewHasProduct(node)
        ? '<div class="ForestryFloatingDrawer__panelFooter"><a class="Button Button--primary" href="' + escapeHtml(browseProductsUrl) + '">Browse products to review</a></div>'
        : '');
  }

  function floatingReviewRatingMarkup(rating) {
    const value = positiveInt(rating) || 0;

    return '<div class="ForestryProductReviews__floatingRating" role="radiogroup" aria-label="Star rating">' +
      [1, 2, 3, 4, 5].map(function (item) {
        const active = item <= value;
        const selected = item === value;
        return '<button type="button" class="ForestryProductReviews__floatingRatingButton' + (active ? ' is-active' : '') + '"' +
          ' data-action="forestry-sitewide-review-set-rating"' +
          ' data-rating="' + item + '"' +
          ' aria-label="' + escapeHtml(item + ' stars') + '"' +
          ' aria-pressed="' + (selected ? 'true' : 'false') + '">' +
          starMarkup(item, {
            ariaLabel: item + ' stars',
          }) +
        '</button>';
      }).join('') +
    '</div>';
  }

  function floatingReviewCandidateMarkup(candidate, selected) {
    const meta = [];
    if (candidate.order_external_id) {
      meta.push('Order #' + candidate.order_external_id);
    }
    if (candidate.ordered_at) {
      meta.push(shortDate(candidate.ordered_at));
    }
    if (candidate.order_status) {
      meta.push(candidate.order_status.replace(/_/g, ' '));
    }

    return '<button type="button" class="ForestryProductReviews__candidate' + (selected ? ' is-selected' : '') + '"' +
      ' data-action="forestry-sitewide-review-select-product"' +
      ' data-candidate-key="' + escapeHtml(candidate.candidate_key) + '">' +
        '<span class="ForestryProductReviews__candidateTitle">' + escapeHtml(candidate.product_title || 'Scent') + '</span>' +
        (meta.length ? '<span class="ForestryProductReviews__candidateMeta Text--subdued">' + escapeHtml(meta.join(' · ')) + '</span>' : '') +
      '</button>';
  }

  function floatingReviewModalMarkup(node) {
    const state = floatingReviewState();
    const open = !!state.reviewModalOpen;
    const modalSize = modalSizeClass(clean(node && node.dataset && node.dataset.reviewModalSize));
    const draft = ensureFloatingReviewDraft(node, state);
    const candidates = filteredFloatingCandidates(state);
    const identity = floatingReviewIdentity(node);
    const hasIdentity = !!identity.email;
    const canSubmit = !!(state.reviewSettings && state.reviewSettings.canSubmit !== false && hasIdentity);
    const loginUrl = clean(node && node.dataset && node.dataset.loginUrl) || '/account/login';
    const submitDisabled = state.reviewModalBusy || !canSubmit;
    const hasSearchQuery = !!clean(draft.search);
    const searchLoading = hasSearchQuery && !!state.reviewSearchLoading;

    return '' +
      '<div class="ForestryProductReviews__floatingModalWrap' + (open ? ' is-visible' : '') + '"' + (open ? '' : ' aria-hidden="true"') + '>' +
        '<button type="button" class="ForestryProductReviews__floatingModalBackdrop" data-action="forestry-sitewide-review-close-modal" aria-label="Close review modal"></button>' +
        '<section class="ForestryProductReviews__floatingModal ForestryProductReviews__modal ' + escapeHtml(modalSize) + '" data-forestry-sitewide-review-modal role="dialog" aria-modal="true" aria-labelledby="ForestrySitewideReviewModalTitle">' +
          '<div class="ForestryProductReviews__floatingModalHeader">' +
            '<div>' +
              '<p class="ForestryProductReviews__modalEyebrow">Leave a review</p>' +
              '<h3 class="Heading u-h4" id="ForestrySitewideReviewModalTitle">Review your scent</h3>' +
            '</div>' +
            '<button type="button" class="ForestryProductReviews__close" data-action="forestry-sitewide-review-close-modal" aria-label="Close review modal">Close</button>' +
          '</div>' +
          (!canSubmit
            ? '<div class="ForestryProductReviews__modalBody">' +
                '<p class="Text--subdued">Sign in to search scents and leave your review.</p>' +
              '</div>'
            : '' +
              '<div class="ForestryProductReviews__modalBody">' +
                '<label class="ForestryProductReviews__field">' +
                  '<span class="ForestryProductReviews__fieldLabel">Search scent</span>' +
                  '<input class="Form__Input ForestryProductReviews__searchInput" type="search" value="' + escapeHtml(draft.search || '') + '" data-floating-review-field="search" placeholder="Search scents">' +
                '</label>' +
                (hasSearchQuery
                  ? '<div class="ForestryProductReviews__field">' +
                      '<span class="ForestryProductReviews__fieldLabel">Scent results</span>' +
                      (searchLoading
                        ? '<p class="Text--subdued">Searching scents...</p>'
                        : candidates.length
                        ? '<div class="ForestryProductReviews__candidateList ForestryProductReviews__candidateList--modal">' +
                            candidates.map(function (candidate) {
                              return floatingReviewCandidateMarkup(candidate, clean(candidate.candidate_key) === clean(draft.selected_candidate_key));
                            }).join('') +
                          '</div>'
                        : '<p class="Text--subdued">No matching scents found.</p>') +
                    '</div>'
                  : '') +
                '<div class="ForestryProductReviews__field">' +
                  '<span class="ForestryProductReviews__fieldLabel">Star rating</span>' +
                  floatingReviewRatingMarkup(draft.rating) +
                '</div>' +
                '<label class="ForestryProductReviews__field">' +
                  '<span class="ForestryProductReviews__fieldLabel">Review</span>' +
                  '<textarea class="Input ForestryProductReviews__textarea" rows="6" data-floating-review-field="body" placeholder="Tell us how it smelled, threw, and felt in your space.">' + escapeHtml(draft.body || '') + '</textarea>' +
                '</label>' +
                (state.reviewDataError ? '<p class="Text--subdued">' + escapeHtml(state.reviewDataError) + '</p>' : '') +
              '</div>') +
          (state.reviewModalMessage
            ? '<div class="ForestryProductReviews__notice ForestryProductReviews__notice--' + escapeHtml(clean(state.reviewModalTone) || 'danger') + '">' + escapeHtml(state.reviewModalMessage) + '</div>'
            : '') +
          (!canSubmit
            ? '<div class="ForestryProductReviews__modalActions">' +
                '<a class="Button Button--primary" href="' + escapeHtml(loginUrl) + '">Sign in to review</a>' +
              '</div>'
            : '<div class="ForestryProductReviews__modalActions">' +
                '<button type="button" class="Button Button--primary" data-action="forestry-sitewide-review-submit"' + (submitDisabled ? ' disabled aria-disabled="true"' : '') + '>' + escapeHtml(state.reviewModalBusy ? 'Submitting...' : 'Submit review') + '</button>' +
              '</div>') +
        '</section>' +
      '</div>';
  }

  function floatingModalElement() {
    const host = floatingGlobalModalHost(false);
    return host ? host.querySelector('[data-forestry-sitewide-review-modal]') : null;
  }

  function floatingModalFocusables(modal) {
    if (!modal) {
      return [];
    }

    return Array.from(modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(function (element) {
        return !element.hasAttribute('hidden');
      });
  }

  function focusFloatingReviewModal() {
    const modal = floatingModalElement();
    if (!modal) {
      return;
    }

    const preferred = modal.querySelector('[data-floating-review-field="search"]');
    if (preferred && typeof preferred.focus === 'function') {
      preferred.focus();
      return;
    }

    const focusables = floatingModalFocusables(modal);
    if (focusables.length && typeof focusables[0].focus === 'function') {
      focusables[0].focus();
    }
  }

  function floatingSearchFocusSnapshot() {
    const modal = floatingModalElement();
    const field = modal && modal.querySelector('[data-floating-review-field="search"]');
    if (!field || document.activeElement !== field) {
      return null;
    }

    return {
      selectionStart: typeof field.selectionStart === 'number' ? field.selectionStart : null,
      selectionEnd: typeof field.selectionEnd === 'number' ? field.selectionEnd : null,
    };
  }

  function restoreFloatingSearchFocus(snapshot) {
    if (!snapshot) {
      return;
    }

    const modal = floatingModalElement();
    const field = modal && modal.querySelector('[data-floating-review-field="search"]');
    if (!field) {
      return;
    }

    if (typeof field.focus === 'function') {
      try {
        field.focus({ preventScroll: true });
      } catch (_error) {
        field.focus();
      }
    }

    if (snapshot.selectionStart == null || typeof field.setSelectionRange !== 'function') {
      return;
    }

    const valueLength = String(field.value || '').length;
    const start = Math.min(snapshot.selectionStart, valueLength);
    const end = snapshot.selectionEnd == null
      ? start
      : Math.min(snapshot.selectionEnd, valueLength);
    field.setSelectionRange(start, end);
  }

  function renderFloatingReviews() {
    const state = floatingReviewState();
    const node = state.node;
    const stack = document.querySelector('[data-forestry-floating-drawer-stack]');
    if (!node) {
      const staleModalHost = floatingGlobalModalHost(false);
      if (staleModalHost) {
        staleModalHost.innerHTML = '';
      }
      if (stack) {
        delete stack.dataset.reviewsOpen;
      }
      return;
    }

    const searchFocus = floatingSearchFocusSnapshot();
    const panel = node.querySelector('.ForestryFloatingDrawer__panel');
    const content = node.querySelector('[data-forestry-sitewide-reviews-content]');
    const modalHost = floatingGlobalModalHost();
    const tab = node.querySelector('[data-action="forestry-sitewide-reviews-toggle"]');
    const scrim = node.querySelector('.ForestryFloatingDrawer__scrim');
    const count = node.querySelector('[data-forestry-sitewide-review-count]');
    const payload = state.scope === 'product' && floatingReviewHasProduct(node)
      ? (state.productData || emptyPayload())
      : (state.sitewideData || emptySitewidePayload());
    const snapshot = summarySnapshot(payload);

    node.classList.toggle('is-open', !!state.open);
    if (tab) {
      tab.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    }
    if (panel) {
      panel.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    }
    if (scrim) {
      scrim.hidden = !state.open;
    }
    if (count) {
      count.textContent = String(snapshot.count || 0);
    }
    if (stack) {
      if (state.open) {
        stack.dataset.reviewsOpen = 'true';
      } else {
        delete stack.dataset.reviewsOpen;
      }
    }
    if (content) {
      content.innerHTML = floatingReviewContentMarkup(node);
    }
    if (modalHost) {
      modalHost.innerHTML = floatingReviewModalMarkup(node);
    }
    restoreFloatingSearchFocus(searchFocus);

    syncViewportLock();
  }

  async function hydrateFloatingProductReviews() {
    const state = floatingReviewState();
    const node = state.node;
    if (!node || !floatingReviewHasProduct(node)) {
      return;
    }

    state.productLoading = true;
    renderFloatingReviews();

    const result = await reviewRequest(
      node,
      clean(node.dataset.endpointProductReviewStatus),
      floatingProductQuery(node),
      emptyPayload()
    );

    state.productLoading = false;
    state.productData = result.data || emptyPayload();
    renderFloatingReviews();
  }

  async function hydrateFloatingSitewideReviews() {
    const state = floatingReviewState();
    const node = state.node;
    if (!node) {
      return;
    }

    state.sitewideLoading = true;
    renderFloatingReviews();

    const result = await reviewRequest(
      node,
      clean(node.dataset.endpointProductReviewSitewideStatus),
      floatingSitewideQuery(node),
      emptySitewidePayload()
    );

    state.sitewideLoading = false;
    state.sitewideData = result.data || emptySitewidePayload();
    renderFloatingReviews();
  }

  function patchFloatingReviewDraft(patch, rerender) {
    const state = floatingReviewState();
    const node = state.node;
    if (!node) {
      return;
    }

    const draft = ensureFloatingReviewDraft(node, state);
    state.reviewDraft = Object.assign({}, draft, patch || {});
    state.reviewModalMessage = '';
    state.reviewModalTone = 'neutral';
    if (rerender !== false) {
      renderFloatingReviews();
    }
  }

  async function hydrateFloatingReviewComposer(force) {
    const state = floatingReviewState();
    const node = state.node;
    if (!node) {
      return;
    }

    if (state.reviewDataLoading) {
      return;
    }

    if (state.reviewDataReady && !force) {
      if (!Array.isArray(state.reviewCandidates) || !state.reviewCandidates.length) {
        state.reviewCandidates = floatingFallbackCandidates(node, state);
      }
      if (!state.reviewDraft) {
        state.reviewDraft = floatingReviewDefaultDraft(node, state);
      }
      return;
    }

    const seedProduct = floatingReviewSeedProduct(node, state);
    const fallbackPayload = emptyPayload();
    const fallbackCandidates = floatingFallbackCandidates(node, state);
    state.reviewDataLoading = true;
    state.reviewDataError = '';
    renderFloatingReviews();

    const result = await reviewRequest(
      node,
      clean(node.dataset.endpointProductReviewStatus),
      Object.assign({}, floatingReviewQuery(node), {
        product_id: clean(seedProduct.product_id) || 'sitewide-review',
        variant_id: clean(seedProduct.variant_id),
        product_handle: clean(seedProduct.product_handle),
        product_title: clean(seedProduct.product_title),
        product_url: clean(seedProduct.product_url),
      }),
      fallbackPayload
    );

    const payload = result.data || fallbackPayload;
    const statusCandidates = mergeArray(payload && payload.viewer && payload.viewer.recent_order_candidates, []);
    const mergedCandidates = mergedFloatingCandidates(statusCandidates, fallbackCandidates);
    const minimumLength = positiveInt(payload && payload.settings && payload.settings.minimum_length) || 24;
    const canSubmit = payload && payload.viewer ? payload.viewer.can_submit !== false : true;
    const allowGuest = payload && payload.settings ? payload.settings.allow_guest !== false : true;

    state.reviewCandidates = mergedCandidates;
    state.reviewSettings = {
      minimumLength: minimumLength,
      canSubmit: canSubmit,
      allowGuest: allowGuest,
    };
    state.reviewDataLoading = false;
    state.reviewDataReady = true;
    state.reviewDataError = result.ok ? '' : clean(result.error && result.error.message);

    if (!state.reviewDraft) {
      state.reviewDraft = floatingReviewDefaultDraft(node, state);
    } else {
      const selected = selectedFloatingReviewCandidate(state);
      if (selected) {
        state.reviewDraft.selected_candidate_key = clean(selected.candidate_key);
      } else {
        state.reviewDraft.selected_candidate_key = '';
      }
    }

    renderFloatingReviews();
  }

  function floatingReviewValidationMessage(state) {
    const draft = state && state.reviewDraft ? state.reviewDraft : {};
    const selected = selectedFloatingReviewCandidate(state);
    const minimumLength = positiveInt(state && state.reviewSettings && state.reviewSettings.minimumLength) || 24;

    if (!selected || !clean(selected.product_id)) {
      return 'Search and choose a scent before submitting.';
    }

    if (!positiveInt(draft.rating)) {
      return 'Choose a star rating before submitting.';
    }

    if (clean(draft.body).length < minimumLength) {
      return 'Tell us a little more before submitting your review.';
    }

    return '';
  }

  async function submitFloatingReviewRequest(node, payload) {
    const endpoint = clean(node && node.dataset && node.dataset.endpointProductReviewSubmit);
    if (!endpoint) {
      return {
        ok: false,
        payload: {
          error: {
            code: 'missing_endpoint',
            message: 'Review endpoint is missing.',
          },
        },
      };
    }

    const form = new URLSearchParams();
    Object.keys(payload || {}).forEach(function (field) {
      appendFormValue(form, field, payload[field]);
    });

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    return fetch(new URL(endpoint, window.location.origin).toString(), Object.assign({
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: form.toString(),
    }, controller ? { signal: controller.signal } : {})).then(async function (response) {
      const text = await response.text();
      let parsed = null;

      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          parsed = null;
        }
      }

      return {
        ok: response.ok && parsed && parsed.ok,
        payload: parsed,
      };
    }).catch(function () {
      return {
        ok: false,
        payload: null,
      };
    }).finally(function () {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    });
  }

  function launchFloatingReviewConfetti(node) {
    if (!node || reducedMotionPreferred()) {
      return;
    }

    const host = floatingGlobalModalHost(false) || node;
    const burst = document.createElement('div');
    burst.className = 'ForestryProductReviews__confetti';
    burst.setAttribute('aria-hidden', 'true');
    const colors = ['#f2d58b', '#f6b4ce', '#d9c7ff', '#cfeadc', '#f2c074'];

    for (let index = 0; index < 24; index += 1) {
      const piece = document.createElement('span');
      piece.style.setProperty('--x', (Math.random() * 220 - 110).toFixed(0) + 'px');
      piece.style.setProperty('--r', (Math.random() * 520 - 260).toFixed(0) + 'deg');
      piece.style.setProperty('--delay', (Math.random() * 130).toFixed(0) + 'ms');
      piece.style.setProperty('--bg', colors[index % colors.length]);
      burst.appendChild(piece);
    }

    host.appendChild(burst);
    window.setTimeout(function () {
      burst.remove();
    }, 1800);
  }

  function closeFloatingReviewModal(restoreFocus) {
    const state = floatingReviewState();
    if (!state.node) {
      return;
    }

    state.reviewModalOpen = false;
    state.reviewModalBusy = false;
    state.reviewModalMessage = '';
    state.reviewModalTone = 'neutral';
    renderFloatingReviews();

    if (restoreFocus !== false && state.reviewLastFocused && typeof state.reviewLastFocused.focus === 'function') {
      state.reviewLastFocused.focus();
    }
  }

  async function openFloatingReviewModal(trigger) {
    const state = floatingReviewState();
    const node = state.node;
    if (!node) {
      return;
    }

    state.reviewModalOpen = true;
    state.reviewModalBusy = false;
    state.reviewModalMessage = '';
    state.reviewModalTone = 'neutral';
    state.reviewNotice = '';
    state.reviewLastFocused = trigger || document.activeElement;
    ensureFloatingReviewDraft(node, state);
    renderFloatingReviews();

    hydrateFloatingReviewComposer();
    runFloatingCatalogSearch(clean(state.reviewDraft && state.reviewDraft.search), { immediate: true });

    window.requestAnimationFrame(function () {
      focusFloatingReviewModal();
    });
  }

  async function submitFloatingReview() {
    const state = floatingReviewState();
    const node = state.node;
    if (!node || state.reviewModalBusy) {
      return;
    }

    const identity = floatingReviewIdentity(node);
    if ((state.reviewSettings && state.reviewSettings.canSubmit === false) || !identity.email) {
      state.reviewModalMessage = 'Sign in to leave a review first.';
      state.reviewModalTone = 'danger';
      renderFloatingReviews();
      return;
    }

    const draft = ensureFloatingReviewDraft(node, state);
    const selected = selectedFloatingReviewCandidate(state);
    const validationMessage = floatingReviewValidationMessage(state);
    if (validationMessage) {
      state.reviewModalMessage = validationMessage;
      state.reviewModalTone = 'danger';
      renderFloatingReviews();
      return;
    }

    state.reviewModalBusy = true;
    state.reviewModalMessage = '';
    state.reviewModalTone = 'neutral';
    renderFloatingReviews();

    const productTitle = clean(selected && selected.product_title);
    const productHandle = clean(selected && selected.product_handle) || slugify(productTitle);
    const productUrl = clean(selected && selected.product_url) || (productHandle ? '/products/' + productHandle : '');
    const requestKey = 'sitewide-review:' + Date.now();
    const response = await submitFloatingReviewRequest(node, {
      product_id: clean(selected && selected.product_id),
      product_handle: productHandle,
      product_title: productTitle,
      product_url: productUrl,
      variant_id: clean(selected && selected.variant_id),
      rating: positiveInt(draft.rating) || 0,
      body: clean(draft.body),
      name: clean(identity.name),
      email: clean(identity.email),
      order_id: positiveInt(selected && selected.order_id),
      order_line_id: positiveInt(selected && selected.order_line_id),
      phone: clean(node.dataset.customerPhone),
      shopify_customer_id: clean(node.dataset.shopifyCustomerId),
      request_key: requestKey,
    });

    if (!response.ok) {
      state.reviewModalBusy = false;
      state.reviewModalMessage = submitFailureMessage(response.payload);
      state.reviewModalTone = 'danger';
      renderFloatingReviews();
      return;
    }

    const result = response.payload && response.payload.data ? response.payload.data : {};
    const publicationCopy = clean(result.state) === 'review_pending'
      ? 'Your review is saved and waiting for moderation.'
      : 'Your review is live on the site now.';
    const rewardCopy = result.award && result.award.eligible && clean(result.award.reward_amount)
      ? 'Candle Cash on this review: ' + currencyLabel(result.award.reward_amount) + '.'
      : clean(result.award && result.award.message);

    state.reviewModalBusy = false;
    state.reviewModalOpen = false;
    state.reviewModalMessage = '';
    state.reviewModalTone = 'neutral';
    state.reviewNotice = rewardCopy ? (publicationCopy + ' ' + rewardCopy) : publicationCopy;
    state.reviewNoticeTone = 'success';
    state.reviewDraft = Object.assign({}, draft, {
      rating: 0,
      body: '',
      search: '',
    });
    renderFloatingReviews();
    const panel = node.querySelector('.ForestryFloatingDrawer__panel');
    if (panel && typeof panel.focus === 'function') {
      panel.focus();
    }
    launchFloatingReviewConfetti(node);

    hydrateFloatingSitewideReviews();
    if (floatingReviewHasProduct(node)) {
      hydrateFloatingProductReviews();
    }
  }

  function closeFloatingReviews(restoreFocus) {
    const state = floatingReviewState();
    if (!state.node) {
      return;
    }

    state.open = false;
    state.entrySource = '';
    state.reviewModalOpen = false;
    state.reviewModalBusy = false;
    state.reviewModalMessage = '';
    state.reviewModalTone = 'neutral';
    renderFloatingReviews();

    if (restoreFocus !== false && state.lastFocused && typeof state.lastFocused.focus === 'function') {
      state.lastFocused.focus();
    }
  }

  function prefetchFloatingReviews(options) {
    const state = floatingReviewState();
    const node = state.node;
    if (!node) {
      runtime.pendingFloatingPrefetch = Object.assign({}, options || {});
      return;
    }

    const scope = clean(options && options.scope) || state.scope || clean(node.dataset.defaultScope) || 'sitewide';

    if (!state.sitewideData && !state.sitewideLoading) {
      hydrateFloatingSitewideReviews();
    }

    if (scope === 'product' && floatingReviewHasProduct(node) && !state.productData && !state.productLoading) {
      hydrateFloatingProductReviews();
    }

    if (!state.reviewDataReady && !state.reviewDataLoading) {
      hydrateFloatingReviewComposer();
    }
  }

  async function openFloatingReviews(scope, trigger, options) {
    const state = floatingReviewState();
    const node = state.node;
    if (!node) {
      return;
    }

    state.lastFocused = trigger || document.activeElement;
    state.entrySource = clean(options && options.source);
    state.scope = clean(scope) || state.scope || clean(node.dataset.defaultScope) || (floatingReviewHasProduct(node) ? 'product' : 'sitewide');
    state.open = true;
    document.dispatchEvent(new CustomEvent('forestry:floating-drawer-open', {
      detail: { kind: 'reviews' },
    }));
    renderFloatingReviews();

    if (state.scope === 'product' && floatingReviewHasProduct(node) && !state.productData) {
      await hydrateFloatingProductReviews();
    }

    if (state.scope !== 'product' && !state.sitewideData) {
      await hydrateFloatingSitewideReviews();
    }

    prefetchFloatingReviews({ scope: state.scope });

    window.requestAnimationFrame(function () {
      const panel = node.querySelector('.ForestryFloatingDrawer__panel');
      if (panel) {
        panel.focus();
      }
    });
  }

  async function bootFloatingReviews() {
    const node = document.querySelector(SITEWIDE_SELECTOR);
    const state = floatingReviewState();
    state.node = node || null;
    state.scope = node
      ? (clean(node.dataset.defaultScope) || (floatingReviewHasProduct(node) ? 'product' : 'sitewide'))
      : 'sitewide';

    if (!node) {
      return;
    }

    renderFloatingReviews();

    if (runtime.pendingFloatingPrefetch) {
      prefetchFloatingReviews(runtime.pendingFloatingPrefetch);
      runtime.pendingFloatingPrefetch = null;
    }

    if (state.scope === 'product' && floatingReviewHasProduct(node)) {
      await hydrateFloatingProductReviews();
      return;
    }

    await hydrateFloatingSitewideReviews();
  }

  function keyFromEventNode(node) {
    const keyed = node && node.closest('[data-forestry-product-review-key]');
    return clean(keyed && keyed.getAttribute('data-forestry-product-review-key'));
  }

  document.addEventListener('click', function (event) {
    const floatingToggle = event.target.closest('[data-action="forestry-sitewide-reviews-toggle"]');
    if (floatingToggle) {
      event.preventDefault();
      const state = floatingReviewState();
      if (state.open) {
        closeFloatingReviews();
      } else {
        openFloatingReviews(clean(state.node && state.node.dataset && state.node.dataset.defaultScope) || state.scope, floatingToggle);
      }
      return;
    }

    const floatingClose = event.target.closest('[data-action="forestry-sitewide-reviews-close"]');
    if (floatingClose) {
      event.preventDefault();
      closeFloatingReviews();
      return;
    }

    const showAllReviews = event.target.closest('[data-action="forestry-sitewide-reviews-show-all"]');
    if (showAllReviews) {
      event.preventDefault();
      openFloatingReviews('sitewide', showAllReviews);
      return;
    }

    const showProductReviews = event.target.closest('[data-action="forestry-sitewide-reviews-show-product"]');
    if (showProductReviews) {
      event.preventDefault();
      openFloatingReviews('product', showProductReviews);
      return;
    }

    const openDrawerButton = event.target.closest('[data-action="forestry-review-open-drawer"]');
    if (openDrawerButton) {
      event.preventDefault();
      if (document.querySelector(PANEL_SELECTOR)) {
        openDrawer(keyFromEventNode(openDrawerButton));
      } else {
        openFloatingReviews('product', openDrawerButton);
      }
      return;
    }

    const openFloatingModalButton = event.target.closest('[data-action="forestry-sitewide-review-open-modal"]');
    if (openFloatingModalButton) {
      event.preventDefault();
      openFloatingReviewModal(openFloatingModalButton);
      return;
    }

    const closeFloatingModalButton = event.target.closest('[data-action="forestry-sitewide-review-close-modal"]');
    if (closeFloatingModalButton) {
      event.preventDefault();
      closeFloatingReviewModal();
      return;
    }

    const selectFloatingCandidate = event.target.closest('[data-action="forestry-sitewide-review-select-product"]');
    if (selectFloatingCandidate) {
      event.preventDefault();
      patchFloatingReviewDraft({
        selected_candidate_key: clean(selectFloatingCandidate.dataset.candidateKey),
      });
      return;
    }

    const setFloatingRating = event.target.closest('[data-action="forestry-sitewide-review-set-rating"]');
    if (setFloatingRating) {
      event.preventDefault();
      patchFloatingReviewDraft({
        rating: positiveInt(setFloatingRating.dataset.rating) || 0,
      });
      return;
    }

    const submitFloating = event.target.closest('[data-action="forestry-sitewide-review-submit"]');
    if (submitFloating) {
      event.preventDefault();
      submitFloatingReview();
      return;
    }

    const openModalButton = event.target.closest('[data-action="forestry-review-open-modal"]');
    if (openModalButton) {
      event.preventDefault();
      openModal(keyFromEventNode(openModalButton));
      return;
    }

    const closeButton = event.target.closest('[data-action="forestry-review-close-surfaces"]');
    if (closeButton) {
      event.preventDefault();
      closeSurfaces(keyFromEventNode(closeButton));
      return;
    }

    const ratingButton = event.target.closest('[data-action="forestry-review-set-rating"]');
    if (ratingButton) {
      event.preventDefault();
      patchDraft(keyFromEventNode(ratingButton), {
        rating: positiveInt(ratingButton.dataset.rating) || 0,
      });
      rerenderProduct(keyFromEventNode(ratingButton));
      return;
    }

    const candidateButton = event.target.closest('[data-action="forestry-review-select-candidate"]');
    if (candidateButton) {
      event.preventDefault();
      const key = keyFromEventNode(candidateButton);
      const root = primaryRootForKey(key);
      if (!root) {
        return;
      }

      const data = runtime.payloads.get(cacheKey(root)) || emptyPayload();
      const draft = ensureDraft(root, data);
      const candidate = reviewCandidates(root, data).find(function (row) {
        return clean(row.candidate_key) === clean(candidateButton.dataset.candidateKey);
      });

      if (!candidate) {
        return;
      }

      patchDraft(key, Object.assign({}, draft, {
        selected_candidate_key: clean(candidate.candidate_key),
        order_id: positiveInt(candidate.order_id),
        order_line_id: positiveInt(candidate.order_line_id),
        variant_id: clean(candidate.variant_id || root.dataset.productVariantId),
      }));
      rerenderProduct(key);
      return;
    }

    const nextButton = event.target.closest('[data-action="forestry-review-step-next"]');
    if (nextButton) {
      event.preventDefault();
      nextStep(keyFromEventNode(nextButton));
      return;
    }

    const backButton = event.target.closest('[data-action="forestry-review-step-back"]');
    if (backButton) {
      event.preventDefault();
      previousStep(keyFromEventNode(backButton));
      return;
    }

    const removeMediaButton = event.target.closest('[data-action="forestry-review-remove-media"]');
    if (removeMediaButton) {
      event.preventDefault();
      const key = keyFromEventNode(removeMediaButton);
      const draft = draftForKey(key);
      const index = Number.parseInt(String(removeMediaButton.dataset.mediaIndex || '-1'), 10);
      if (!draft || !Array.isArray(draft.media_assets) || index < 0) {
        return;
      }

      patchDraft(key, {
        media_assets: draft.media_assets.filter(function (_asset, itemIndex) {
          return itemIndex !== index;
        }),
      });
      rerenderProduct(key);
    }
  });

  document.addEventListener('change', function (event) {
    const floatingSortField = event.target.closest('[data-action="forestry-sitewide-reviews-sort"]');
    if (floatingSortField) {
      const state = floatingReviewState();
      state.sitewideSort = clean(floatingSortField.value) || 'most_recent';
      hydrateFloatingSitewideReviews();
      return;
    }

    const sortField = event.target.closest('[data-action="forestry-review-sort"]');
    if (sortField) {
      const key = keyFromEventNode(sortField);
      setStateForKey(key, {
        sort: clean(sortField.value) || 'most_relevant',
      });
      rerenderProduct(key);
      return;
    }

    const uploadField = event.target.closest('[data-action="forestry-review-upload-media"]');
    if (uploadField) {
      processMediaUpload(keyFromEventNode(uploadField), uploadField);
    }
  });

  document.addEventListener('input', function (event) {
    const floatingField = event.target.closest('[data-floating-review-field]');
    if (floatingField) {
      const name = clean(floatingField.getAttribute('data-floating-review-field'));
      if (name) {
        const patch = {};
        patch[name] = floatingField.value;
        if (name === 'search') {
          patchFloatingReviewDraft(patch, false);
          runFloatingCatalogSearch(patch[name], { immediate: false });
        } else {
          patchFloatingReviewDraft(patch, true);
        }
      }
      return;
    }

    const field = event.target.closest('[data-review-draft-field]');
    if (!field) {
      return;
    }

    const key = keyFromEventNode(field);
    const name = clean(field.getAttribute('data-review-draft-field'));
    if (!name) {
      return;
    }

    const patch = {};
    patch[name] = field.value;
    patchDraft(key, patch);
  });

  document.addEventListener('keydown', function (event) {
    const floatingState = floatingReviewState();
    const floatingRatingButton = event.target.closest('[data-action="forestry-sitewide-review-set-rating"]');
    if (floatingRatingButton) {
      const currentRating = positiveInt(floatingRatingButton.dataset.rating) || 0;
      let nextRating = currentRating;

      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        nextRating = Math.min(5, currentRating + 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        nextRating = Math.max(1, currentRating - 1);
      } else if (event.key === 'Home') {
        nextRating = 1;
      } else if (event.key === 'End') {
        nextRating = 5;
      }

      if (nextRating !== currentRating) {
        event.preventDefault();
        patchFloatingReviewDraft({ rating: nextRating });
      }
    }

    if (floatingState.reviewModalOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFloatingReviewModal();
        return;
      }

      if (event.key === 'Tab') {
        const modal = floatingModalElement();
        const focusables = floatingModalFocusables(modal);
        if (!focusables.length) {
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
          return;
        }
      }
    }

    if (event.key === 'Escape') {
      if (floatingState.open) {
        closeFloatingReviews();
        return;
      }

      Array.from(runtime.ui.entries()).forEach(function (entry) {
        const key = entry[0];
        const state = entry[1];

        if (state && (state.drawerOpen || state.modalOpen)) {
          closeSurfaces(key);
        }
      });
    }
  });

  document.addEventListener('variant:changed', syncVariantContext);
  document.addEventListener('forestry:floating-drawer-open', function (event) {
    const detail = event && event.detail ? event.detail : {};
    if (clean(detail.kind) !== 'reviews') {
      closeFloatingReviews(false);
    }
  });
  document.addEventListener('forestry:open-reviews-drawer', function (event) {
    const detail = event && event.detail ? event.detail : {};
    const requestedScope = clean(detail.scope) || 'sitewide';
    prefetchFloatingReviews({
      source: clean(detail.source),
      scope: requestedScope,
    });
    openFloatingReviews(requestedScope, null, {
      source: clean(detail.source),
    });
  });
  document.addEventListener('forestry:prefetch-reviews', function (event) {
    const detail = event && event.detail ? event.detail : {};
    prefetchFloatingReviews(detail);
  });

  document.querySelectorAll(SUMMARY_SELECTOR + ',' + PANEL_SELECTOR + ',' + RATING_SELECTOR).forEach(boot);
  bootFloatingReviews();
})();
