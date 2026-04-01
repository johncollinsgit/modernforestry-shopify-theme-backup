(function () {
  const ROOT_SELECTOR = '[data-forestry-wishlist-root]';
  const DRAWER_SELECTOR = '[data-forestry-wishlist-drawer]';
  const DRAWER_CONTENT_SELECTOR = '[data-forestry-wishlist-drawer-content]';
  const COUNT_SELECTOR = '[data-forestry-wishlist-count]';
  const RUNTIME_KEY = '__forestryWishlistRuntime';
  const GUEST_TOKEN_STORAGE_KEY = 'forestryWishlistGuestToken';
  const REQUEST_TIMEOUT_MS = 10000;

  const runtime = window[RUNTIME_KEY] || {
    roots: [],
    drawers: [],
    floatingDrawer: null,
    primaryNode: null,
    payload: null,
    productState: new Map(),
    ui: new WeakMap(),
    loading: false,
    loaded: false,
    floatingOpen: false,
    floatingLastFocused: null,
    pendingListId: null,
    notice: {
      message: '',
      tone: 'neutral',
    },
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

  function positiveInt(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function parseCount(value) {
    const parsed = Number.parseInt(String(value || 0), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function escapeSelector(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(String(value || ''));
    }

    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
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

  function bool(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function shortDate(value) {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  function rootUi(root) {
    return runtime.ui.get(root) || {
      busy: false,
      message: '',
      tone: 'neutral',
    };
  }

  function setRootUi(root, patch) {
    runtime.ui.set(root, Object.assign({}, rootUi(root), patch || {}));
  }

  function emptyPayload() {
    return {
      profile_id: null,
      guest_token: null,
      viewer: {
        profile_id: null,
        state: 'guest_ready',
        identity_status: 'missing_identity',
        guest_token: null,
      },
      summary: {
        active_count: 0,
        list_count: 0,
      },
      product: {
        id: null,
        in_wishlist: false,
      },
      active_list: null,
      default_list: null,
      lists: [],
      items: [],
      recent_items: [],
    };
  }

  function currentPayload() {
    return runtime.payload || emptyPayload();
  }

  function hasIdentityOnNode(node) {
    return !!(
      positiveInt(node && node.dataset && node.dataset.marketingProfileId) ||
      clean(node && node.dataset && node.dataset.customerEmail) ||
      clean(node && node.dataset && node.dataset.customerPhone) ||
      clean(node && node.dataset && node.dataset.shopifyCustomerId)
    );
  }

  function storedGuestToken() {
    try {
      return clean(window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY));
    } catch (error) {
      return '';
    }
  }

  function persistGuestToken(value) {
    const token = clean(value);
    if (!token) {
      return '';
    }

    try {
      window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
    } catch (error) {}

    return token;
  }

  function generatedGuestToken() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'gw-' + window.crypto.randomUUID();
    }

    return 'gw-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function ensureGuestToken() {
    const existing = storedGuestToken();
    if (existing) {
      return existing;
    }

    return persistGuestToken(generatedGuestToken());
  }

  function identityFromNode(node, options) {
    const identity = {};
    const opts = options || {};
    const marketingProfileId = positiveInt(node && node.dataset && node.dataset.marketingProfileId);
    const email = clean(node && node.dataset && node.dataset.customerEmail);
    const phone = clean(node && node.dataset && node.dataset.customerPhone);
    const shopifyCustomerId = clean(node && node.dataset && node.dataset.shopifyCustomerId);
    const shouldUseGuestToken = opts.forceGuestToken || !marketingProfileId;
    const guestToken = clean((opts && opts.guestToken) || storedGuestToken() || (shouldUseGuestToken ? ensureGuestToken() : ''));

    if (marketingProfileId) {
      identity.marketing_profile_id = marketingProfileId;
    }
    if (email) {
      identity.email = email;
    }
    if (phone) {
      identity.phone = phone;
    }
    if (shopifyCustomerId) {
      identity.shopify_customer_id = shopifyCustomerId;
    }
    if (guestToken) {
      identity.guest_token = guestToken;
    }

    return identity;
  }

  function variantIdFromRoot(root) {
    const datasetVariant = clean(root && root.dataset && root.dataset.productVariantId);
    const form = root && root.closest('form.ProductForm');
    if (!form) {
      return datasetVariant;
    }

    const variantField = form.querySelector('input[name="id"]');
    const variantValue = clean(variantField && variantField.value);
    if (variantValue) {
      root.dataset.productVariantId = variantValue;
      return variantValue;
    }

    return datasetVariant;
  }

  function productFromRoot(root) {
    return {
      product_id: clean(root && root.dataset && root.dataset.productId),
      product_variant_id: variantIdFromRoot(root),
      product_handle: clean(root && root.dataset && root.dataset.productHandle),
      product_title: clean(root && root.dataset && root.dataset.productTitle),
      product_url: clean(root && root.dataset && root.dataset.productUrl),
    };
  }

  function productFromButton(button) {
    return {
      product_id: clean(button && button.dataset && button.dataset.productId),
      product_variant_id: clean(button && button.dataset && button.dataset.productVariantId),
      product_handle: clean(button && button.dataset && button.dataset.productHandle),
      product_title: clean(button && button.dataset && button.dataset.productTitle),
      product_url: clean(button && button.dataset && button.dataset.productUrl),
    };
  }

  function queryForStatus(sourceNode, options) {
    const query = new URLSearchParams();
    const opts = options || {};
    const identity = identityFromNode(sourceNode, {
      forceGuestToken: true,
      guestToken: opts.guest_token,
    });

    Object.keys(identity).forEach(function (field) {
      query.set(field, String(identity[field]));
    });

    const limit = positiveInt(opts.limit || (sourceNode && sourceNode.dataset && sourceNode.dataset.wishlistLimit) || 25);
    if (limit) {
      query.set('limit', String(limit));
    }

    if (opts.includeProduct && opts.product) {
      ['product_id', 'product_variant_id', 'product_handle', 'product_title', 'product_url'].forEach(function (field) {
        const value = clean(opts.product[field]);
        if (value) {
          query.set(field, value);
        }
      });
    }

    const activeListId = positiveInt(opts.wishlist_list_id);
    if (activeListId) {
      query.set('wishlist_list_id', String(activeListId));
    }

    return query;
  }

  async function requestJson(url, options) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    return fetch(url, Object.assign({}, options, controller ? { signal: controller.signal } : {})).then(async function (response) {
      const text = await response.text();
      let parsed = null;

      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          parsed = null;
        }
      }

      if (response.ok && parsed && parsed.ok) {
        return {
          ok: true,
          data: parsed.data || {},
          payload: parsed,
        };
      }

      const error = (parsed && parsed.error) || {};

      return {
        ok: false,
        data: parsed && parsed.data ? parsed.data : {},
        payload: parsed,
        error: {
          code: clean(error.code) || (response.status === 401 ? 'unauthorized_storefront_request' : 'wishlist_request_failed'),
          message: clean(error.message) || 'Wishlist request failed.',
          status: response.status,
          details: error.details || {},
        },
      };
    }).catch(function (error) {
      return {
        ok: false,
        data: {},
        error: {
          code: error && error.name === 'AbortError' ? 'network_timeout' : 'network_error',
          message: error && error.name === 'AbortError'
            ? 'Wishlist request timed out.'
            : (clean(error && error.message) || 'Network request failed.'),
          status: 0,
          details: {},
        },
      };
    }).finally(function () {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    });
  }

  async function fetchStatus(sourceNode, options) {
    const endpoint = clean(sourceNode && sourceNode.dataset && sourceNode.dataset.endpointWishlistStatus);
    if (!endpoint) {
      return {
        ok: false,
        data: {},
        error: {
          code: 'missing_endpoint',
          message: 'Wishlist status endpoint is missing.',
          status: 0,
          details: {},
        },
      };
    }

    const query = queryForStatus(sourceNode, options);
    const url = new URL(endpoint, window.location.origin);
    query.forEach(function (value, key) {
      url.searchParams.set(key, value);
    });

    return requestJson(url.toString(), {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    });
  }

  async function postAction(sourceNode, endpoint, payload) {
    if (!endpoint) {
      return {
        ok: false,
        data: {},
        error: {
          code: 'missing_endpoint',
          message: 'Wishlist action endpoint is missing.',
          status: 0,
          details: {},
        },
      };
    }

    const form = new URLSearchParams();
    Object.keys(payload || {}).forEach(function (field) {
      appendFormValue(form, field, payload[field]);
    });

    return requestJson(new URL(endpoint, window.location.origin).toString(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: form.toString(),
    });
  }

  function mergePayload(data) {
    const normalized = Object.assign({}, currentPayload(), data || {});
    const summary = normalized.summary && typeof normalized.summary === 'object' ? normalized.summary : {};
    normalized.summary = Object.assign({}, summary, {
      active_count: parseCount(summary.active_count),
      list_count: parseCount(summary.list_count),
    });

    const viewer = normalized.viewer && typeof normalized.viewer === 'object' ? normalized.viewer : {};
    normalized.viewer = Object.assign({
      state: 'guest_ready',
      identity_status: 'missing_identity',
      guest_token: null,
    }, viewer);

    normalized.guest_token = clean(normalized.guest_token || normalized.viewer.guest_token || storedGuestToken()) || null;
    if (normalized.guest_token) {
      persistGuestToken(normalized.guest_token);
    }

    normalized.active_list = normalized.active_list && typeof normalized.active_list === 'object'
      ? normalizeList(normalized.active_list)
      : null;
    normalized.default_list = normalized.default_list && typeof normalized.default_list === 'object'
      ? normalizeList(normalized.default_list)
      : null;
    normalized.lists = Array.isArray(normalized.lists)
      ? normalized.lists.map(normalizeList).filter(Boolean)
      : [];
    normalized.items = Array.isArray(normalized.items)
      ? normalized.items.map(normalizeItem).filter(Boolean)
      : [];
    normalized.recent_items = Array.isArray(normalized.recent_items)
      ? normalized.recent_items.map(normalizeItem).filter(Boolean)
      : [];

    runtime.payload = normalized;
    runtime.pendingListId = positiveInt(normalized.active_list && normalized.active_list.id);

    const product = normalized.product && typeof normalized.product === 'object' ? normalized.product : null;
    const productId = clean(product && product.id);
    if (productId) {
      runtime.productState.set(productId, {
        in_wishlist: bool(product.in_wishlist),
        wishlist_item_id: product.wishlist_item_id || null,
        wishlist_list_id: positiveInt(product.wishlist_list_id) || null,
      });
    }
  }

  function normalizeList(list) {
    if (!list || typeof list !== 'object') {
      return null;
    }

    return {
      id: positiveInt(list.id),
      name: clean(list.name) || 'Wishlist',
      is_default: bool(list.is_default),
      status: clean(list.status) || 'active',
      store_key: clean(list.store_key) || null,
      item_count: parseCount(list.item_count),
      last_activity_at: clean(list.last_activity_at) || null,
    };
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    return {
      id: positiveInt(item.id),
      wishlist_list_id: positiveInt(item.wishlist_list_id),
      wishlist_list_name: clean(item.wishlist_list_name) || null,
      product_id: clean(item.product_id),
      product_variant_id: clean(item.product_variant_id) || null,
      product_handle: clean(item.product_handle) || null,
      product_title: clean(item.product_title) || 'Saved product',
      product_url: clean(item.product_url) || null,
      status: clean(item.status) || 'active',
      store_key: clean(item.store_key) || null,
      provider: clean(item.provider) || null,
      integration: clean(item.integration) || null,
      source: clean(item.source) || null,
      source_surface: clean(item.source_surface) || null,
      guest_token: clean(item.guest_token) || null,
      added_at: clean(item.added_at) || null,
      last_added_at: clean(item.last_added_at) || null,
      removed_at: clean(item.removed_at) || null,
      source_synced_at: clean(item.source_synced_at) || null,
    };
  }

  function productStateFor(root) {
    const productId = clean(root && root.dataset && root.dataset.productId);
    if (!productId) {
      return {
        in_wishlist: false,
        wishlist_item_id: null,
        wishlist_list_id: null,
      };
    }

    if (runtime.productState.has(productId)) {
      return runtime.productState.get(productId);
    }

    const payload = currentPayload();
    const payloadProduct = payload.product && clean(payload.product.id) === productId ? payload.product : null;

    if (payloadProduct) {
      const state = {
        in_wishlist: bool(payloadProduct.in_wishlist),
        wishlist_item_id: payloadProduct.wishlist_item_id || null,
        wishlist_list_id: payloadProduct.wishlist_list_id || null,
      };
      runtime.productState.set(productId, state);
      return state;
    }

    return {
      in_wishlist: false,
      wishlist_item_id: null,
      wishlist_list_id: null,
    };
  }

  function updateCountBadges() {
    const payload = currentPayload();
    const count = parseCount(payload.summary && payload.summary.active_count);

    document.querySelectorAll(COUNT_SELECTOR).forEach(function (node) {
      node.textContent = String(count);
      if (node.classList.contains('ForestryWishlistHeaderIcon__Count')) {
        node.classList.toggle('is-hidden', count <= 0);
      }
    });
  }

  function loginUrlFor(node) {
    const loginUrl = clean(node && node.dataset && node.dataset.loginUrl) || '/account/login';
    const url = new URL(loginUrl, window.location.origin);
    url.searchParams.set('return_url', window.location.pathname + window.location.search + window.location.hash);
    return url.toString();
  }

  function globalNoticeMarkup() {
    const message = clean(runtime.notice && runtime.notice.message);
    const tone = clean(runtime.notice && runtime.notice.tone) || 'neutral';
    if (!message) {
      return '';
    }

    return '<p class="ForestryWishlistDrawer__notice Text--subdued ForestryWishlistRoot__note--' + escapeHtml(tone) + '">' + escapeHtml(message) + '</p>';
  }

  function activeList(payload) {
    const current = payload || currentPayload();
    const active = current.active_list && typeof current.active_list === 'object' ? current.active_list : null;
    if (active && positiveInt(active.id)) {
      return active;
    }

    const fallback = current.default_list && typeof current.default_list === 'object' ? current.default_list : null;
    if (fallback && positiveInt(fallback.id)) {
      return fallback;
    }

    return Array.isArray(current.lists) && current.lists.length ? current.lists[0] : null;
  }

  function activeListId(payload) {
    const list = activeList(payload);
    return positiveInt(list && list.id);
  }

  function openDrawer(drawerId) {
    if (runtime.floatingDrawer) {
      openFloatingDrawer();
      return;
    }

    const id = clean(drawerId || 'sidebar-wishlist');
    const trigger = document.querySelector('[data-action="open-drawer"][data-drawer-id="' + escapeSelector(id) + '"]');
    if (trigger) {
      trigger.click();
      return;
    }

    const drawer = document.getElementById(id);
    if (drawer) {
      drawer.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('no-mobile-sticky');
    }
  }

  function maybeLoginPrompt(drawer) {
    const payload = currentPayload();
    if (positiveInt(payload.profile_id) || positiveInt(payload.viewer && payload.viewer.profile_id)) {
      return '';
    }

    return '' +
      '<div class="ForestryWishlistDrawer__identity">' +
        '<p class="Text--subdued">Saved on this device. Sign in whenever you want to keep your wishlist synced across devices.</p>' +
        '<a class="Link Link--primary" href="' + escapeHtml(loginUrlFor(drawer)) + '">Sign in to keep it forever</a>' +
      '</div>';
  }

  function listSwitcherMarkup(payload) {
    const lists = Array.isArray(payload.lists) ? payload.lists : [];
    if (!lists.length) {
      return '';
    }

    const currentListId = activeListId(payload);
    const buttons = lists.map(function (list) {
      const listId = positiveInt(list.id);
      const active = listId && currentListId === listId;
      const itemCount = parseCount(list.item_count);

      return '' +
        '<button' +
          ' type="button"' +
          ' class="ForestryWishlistDrawer__listPill' + (active ? ' is-active' : '') + '"' +
          ' data-action="forestry-wishlist-set-list"' +
          ' data-wishlist-list-id="' + escapeHtml(listId) + '"' +
        '>' +
          '<span>' + escapeHtml(list.name) + '</span>' +
          '<span class="ForestryWishlistDrawer__listPillCount">' + escapeHtml(String(itemCount)) + '</span>' +
        '</button>';
    }).join('');

    return '' +
      '<div class="ForestryWishlistDrawer__lists">' +
        '<div class="ForestryWishlistDrawer__listsHeader">' +
          '<p class="Heading u-h6">Your lists</p>' +
          '<span class="Text--subdued">' + escapeHtml(String(parseCount(payload.summary && payload.summary.list_count) || lists.length)) + ' saved list' + ((parseCount(payload.summary && payload.summary.list_count) || lists.length) === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<div class="ForestryWishlistDrawer__listPills">' + buttons + '</div>' +
      '</div>';
  }

  function createListFormMarkup(payload) {
    const listCount = parseCount(payload.summary && payload.summary.list_count);

    return '' +
      '<form class="ForestryWishlistDrawer__createList" data-action="forestry-wishlist-create-list-form">' +
        '<label class="ForestryWishlistDrawer__createListLabel" for="forestry-wishlist-create-list-input">Create a new list</label>' +
        '<div class="ForestryWishlistDrawer__createListRow">' +
          '<input id="forestry-wishlist-create-list-input" class="Input" type="text" name="name" maxlength="160" placeholder="' + escapeHtml(listCount > 0 ? 'Weekend restock ideas' : 'My first wishlist') + '">' +
          '<button type="submit" class="Button Button--secondary">Add list</button>' +
        '</div>' +
      '</form>';
  }

  function drawerItemMarkup(item) {
    const productId = clean(item.product_id);
    const productVariantId = clean(item.product_variant_id);
    const productHandle = clean(item.product_handle);
    const productTitle = clean(item.product_title) || 'Saved product';
    const productUrl = clean(item.product_url) || (productHandle ? '/products/' + productHandle : '#');
    const lastAddedAt = shortDate(clean(item.last_added_at || item.added_at));
    const listName = clean(item.wishlist_list_name);
    const hasVariant = !!productVariantId;

    return '' +
      '<li class="ForestryWishlistDrawer__item">' +
        '<div class="ForestryWishlistDrawer__itemTop">' +
          '<div>' +
            '<p class="ForestryWishlistDrawer__itemTitle Heading u-h6"><a href="' + escapeHtml(productUrl) + '" class="Link Link--primary">' + escapeHtml(productTitle) + '</a></p>' +
            ((lastAddedAt || listName) ? '<p class="ForestryWishlistDrawer__itemMeta Text--subdued">' + escapeHtml([
              listName ? listName : '',
              lastAddedAt ? 'Saved on ' + lastAddedAt : '',
            ].filter(Boolean).join(' · ')) + '</p>' : '') +
          '</div>' +
        '</div>' +
        '<div class="ForestryWishlistDrawer__itemActions">' +
          (hasVariant
            ? '<button' +
                ' type="button"' +
                ' class="Button Button--secondary ForestryWishlistDrawer__cartButton"' +
                ' data-action="forestry-wishlist-add-to-cart"' +
                ' data-product-id="' + escapeHtml(productId) + '"' +
                ' data-product-variant-id="' + escapeHtml(productVariantId) + '"' +
                ' data-product-handle="' + escapeHtml(productHandle) + '"' +
                ' data-product-title="' + escapeHtml(productTitle) + '"' +
                ' data-product-url="' + escapeHtml(productUrl) + '"' +
              '>Add to cart</button>'
            : '<a class="Button Button--secondary ForestryWishlistDrawer__cartButton" href="' + escapeHtml(productUrl) + '">View product</a>') +
          '<button' +
            ' type="button"' +
            ' class="ForestryWishlistDrawer__remove Link Link--primary Text--subdued"' +
            ' data-action="forestry-wishlist-remove-item"' +
            ' data-product-id="' + escapeHtml(productId) + '"' +
            ' data-product-variant-id="' + escapeHtml(productVariantId) + '"' +
            ' data-product-handle="' + escapeHtml(productHandle) + '"' +
            ' data-product-title="' + escapeHtml(productTitle) + '"' +
            ' data-product-url="' + escapeHtml(productUrl) + '"' +
            ' data-wishlist-list-id="' + escapeHtml(item.wishlist_list_id) + '"' +
          '>Remove</button>' +
        '</div>' +
      '</li>';
  }

  function guestDrawerMarkup(drawer) {
    return '' +
      '<p class="ForestryWishlistDrawer__empty Heading u-h6">Your wishlist is ready.</p>' +
      '<p class="Text--subdued">Save products now and keep them on this device. You can always sign in later to sync them.</p>' +
      maybeLoginPrompt(drawer);
  }

  function emptyDrawerMarkup(payload) {
    return '' +
      '<p class="ForestryWishlistDrawer__empty Heading u-h6">No saved products yet</p>' +
      '<p class="Text--subdued">Tap the heart on any product page to save it here.</p>' +
      createListFormMarkup(payload);
  }

  function floatingDrawerMarkup(drawer, payload) {
    const viewerState = clean(payload.viewer && payload.viewer.state);
    const items = Array.isArray(payload.items) ? payload.items : [];
    const notice = globalNoticeMarkup();
    const listUi = listSwitcherMarkup(payload);
    const listForm = createListFormMarkup(payload);
    const currentList = activeList(payload);

    return '' +
      '<div class="ForestryFloatingDrawer__panelHeader">' +
        '<div>' +
          '<p class="ForestryFloatingDrawer__panelEyebrow">Wishlist</p>' +
          '<h3 class="ForestryFloatingDrawer__panelTitle Heading u-h4">Saved for later</h3>' +
          '<p class="ForestryFloatingDrawer__panelSubtitle">' + escapeHtml(String(parseCount(payload.summary && payload.summary.active_count))) + ' saved product' + (parseCount(payload.summary && payload.summary.active_count) === 1 ? '' : 's') + '</p>' +
        '</div>' +
        '<button type="button" class="ForestryFloatingDrawer__close" data-action="forestry-wishlist-floating-close" aria-label="Close wishlist">Close</button>' +
      '</div>' +
      notice +
      listUi +
      (!items.length
        ? ((viewerState === 'guest_ready' ? guestDrawerMarkup(drawer) : '') + emptyDrawerMarkup(payload))
        : '' +
          '<div class="ForestryWishlistDrawer__summary">' +
            '<p class="Heading u-h6">' + escapeHtml(currentList ? currentList.name : 'Saved Items') + '</p>' +
            '<p class="Text--subdued">' + escapeHtml(String(items.length)) + ' saved product' + (items.length === 1 ? '' : 's') + ' ready for later.</p>' +
          '</div>' +
          '<ul class="ForestryWishlistDrawer__list">' +
            items.map(drawerItemMarkup).join('') +
          '</ul>') +
      listForm +
      (viewerState === 'guest_ready' ? maybeLoginPrompt(drawer) : '');
  }

  function renderRoot(root) {
    const button = root.querySelector('[data-action="forestry-wishlist-toggle"]');
    const label = root.querySelector('[data-forestry-wishlist-button-label]');
    const note = root.querySelector('[data-forestry-wishlist-note]');
    if (!button || !label || !note) {
      return;
    }

    const payload = currentPayload();
    const viewerState = clean(payload.viewer && payload.viewer.state);
    const productState = productStateFor(root);
    const ui = rootUi(root);
    const inWishlist = bool(productState.in_wishlist);
    const busy = bool(ui.busy);

    root.dataset.inWishlist = inWishlist ? 'true' : 'false';
    button.setAttribute('aria-pressed', inWishlist ? 'true' : 'false');
    button.disabled = busy;

    if (busy) {
      label.textContent = inWishlist ? 'Updating...' : 'Saving...';
    } else if (inWishlist) {
      label.textContent = 'Saved to wishlist';
    } else {
      label.textContent = 'Save to wishlist';
    }

    const noteMessage = clean(ui.message);
    const noteTone = clean(ui.tone) || 'neutral';
    note.textContent = noteMessage;
    note.classList.remove('ForestryWishlistRoot__note--danger', 'ForestryWishlistRoot__note--success');
    if (noteTone === 'danger') {
      note.classList.add('ForestryWishlistRoot__note--danger');
    }
    if (noteTone === 'success') {
      note.classList.add('ForestryWishlistRoot__note--success');
    }
  }

  function renderDrawer(drawer) {
    const container = drawer.querySelector(DRAWER_CONTENT_SELECTOR);
    if (!container) {
      return;
    }

    const payload = currentPayload();
    const viewerState = clean(payload.viewer && payload.viewer.state);
    const items = Array.isArray(payload.items) ? payload.items : [];
    const notice = globalNoticeMarkup();
    const listUi = listSwitcherMarkup(payload);
    const listForm = createListFormMarkup(payload);
    const currentList = activeList(payload);

    if (runtime.loading && !runtime.loaded) {
      container.innerHTML = '<p class="Text--subdued">Loading wishlist...</p>';
      return;
    }

    if (drawer.hasAttribute('data-forestry-wishlist-floating')) {
      container.innerHTML = floatingDrawerMarkup(drawer, payload);
      return;
    }

    if (!items.length) {
      container.innerHTML =
        notice +
        listUi +
        (viewerState === 'guest_ready' ? guestDrawerMarkup(drawer) : '') +
        emptyDrawerMarkup(payload);
      return;
    }

    container.innerHTML =
      notice +
      listUi +
      '<div class="ForestryWishlistDrawer__summary">' +
        '<p class="Heading u-h6">' + escapeHtml(currentList ? currentList.name : 'Saved Items') + '</p>' +
        '<p class="Text--subdued">' + escapeHtml(String(items.length)) + ' saved product' + (items.length === 1 ? '' : 's') + ' ready for later.</p>' +
      '</div>' +
      '<ul class="ForestryWishlistDrawer__list">' +
        items.map(drawerItemMarkup).join('') +
      '</ul>' +
      listForm +
      (viewerState === 'guest_ready' ? maybeLoginPrompt(drawer) : '');
  }

  function renderAll() {
    updateCountBadges();
    runtime.roots.forEach(renderRoot);
    runtime.drawers.forEach(renderDrawer);
    renderFloatingDrawerChrome();
  }

  function renderFloatingDrawerChrome() {
    const drawer = runtime.floatingDrawer;
    if (!drawer) {
      return;
    }

    const tab = drawer.querySelector('[data-action="forestry-wishlist-floating-toggle"]');
    const panel = drawer.querySelector('.ForestryFloatingDrawer__panel');
    const scrim = drawer.querySelector('.ForestryFloatingDrawer__scrim');

    drawer.classList.toggle('is-open', runtime.floatingOpen);
    if (tab) {
      tab.setAttribute('aria-expanded', runtime.floatingOpen ? 'true' : 'false');
    }
    if (panel) {
      panel.setAttribute('aria-hidden', runtime.floatingOpen ? 'false' : 'true');
    }
    if (scrim) {
      scrim.hidden = !runtime.floatingOpen;
    }
  }

  function openFloatingDrawer(trigger) {
    if (!runtime.floatingDrawer) {
      return;
    }

    runtime.floatingLastFocused = trigger || document.activeElement;
    runtime.floatingOpen = true;
    document.dispatchEvent(new CustomEvent('forestry:floating-drawer-open', {
      detail: { kind: 'wishlist' },
    }));
    renderAll();

    window.requestAnimationFrame(function () {
      const panel = runtime.floatingDrawer && runtime.floatingDrawer.querySelector('.ForestryFloatingDrawer__panel');
      if (panel) {
        panel.focus();
      }
    });
  }

  function closeFloatingDrawer(restoreFocus) {
    if (!runtime.floatingDrawer) {
      return;
    }

    runtime.floatingOpen = false;
    renderAll();

    if (restoreFocus !== false && runtime.floatingLastFocused && typeof runtime.floatingLastFocused.focus === 'function') {
      runtime.floatingLastFocused.focus();
    }
  }

  function endpointForAction(node, action) {
    if (!node || !node.dataset) {
      return '';
    }

    if (action === 'add') {
      return clean(node.dataset.endpointWishlistAdd);
    }
    if (action === 'remove') {
      return clean(node.dataset.endpointWishlistRemove);
    }
    if (action === 'create_list') {
      return clean(node.dataset.endpointWishlistCreateList);
    }

    return '';
  }

  function requestKey(action, productId) {
    return 'wishlist:' + action + ':' + clean(productId) + ':' + Date.now();
  }

  function payloadForAction(sourceNode, product, action, options) {
    const opts = options || {};
    const identity = identityFromNode(sourceNode, {
      forceGuestToken: true,
      guestToken: opts.guest_token || activeGuestToken(),
    });
    const payload = Object.assign({}, identity);

    ['product_id', 'product_variant_id', 'product_handle', 'product_title', 'product_url'].forEach(function (field) {
      const value = clean(product[field]);
      if (value) {
        payload[field] = value;
      }
    });

    payload.request_key = requestKey(action, payload.product_id || '');
    const listId = positiveInt(opts.wishlist_list_id || activeListId());
    if (listId) {
      payload.wishlist_list_id = listId;
    }
    if (clean(opts.list_name)) {
      payload.list_name = clean(opts.list_name);
    }

    return payload;
  }

  function activeGuestToken() {
    return clean(currentPayload().guest_token || currentPayload().viewer && currentPayload().viewer.guest_token || storedGuestToken() || ensureGuestToken());
  }

  function successMessage(state) {
    switch (clean(state)) {
      case 'wishlist_added':
        return 'Saved to your wishlist.';
      case 'wishlist_restored':
        return 'Added back to your wishlist.';
      case 'wishlist_already_saved':
        return 'Already saved in your wishlist.';
      case 'wishlist_removed':
        return 'Removed from your wishlist.';
      case 'wishlist_already_cleared':
        return 'That item is already removed.';
      default:
        return 'Wishlist updated.';
    }
  }

  function failureMessage(error) {
    const code = clean(error && error.code);
    const message = clean(error && error.message);

    switch (code) {
      case 'identity_review_required':
      case 'identity_missing':
      case 'identity_ambiguous':
      case 'login_required':
        return 'We could not prepare this wishlist session yet. Refresh and try again.';
      case 'unauthorized_storefront_request':
        return 'Storefront verification failed. Refresh and try again.';
      case 'missing_store_context':
        return 'Wishlist is not ready for this storefront context yet.';
      case 'network_timeout':
        return 'Wishlist took too long to respond. Please try again.';
      case 'network_error':
        return 'Network issue while updating wishlist. Please try again.';
      default:
        return message || 'We could not update your wishlist right now.';
    }
  }

  async function hydrateStatus(options) {
    if (!runtime.primaryNode) {
      return;
    }

    const opts = options || {};
    runtime.loading = true;
    if (positiveInt(opts.wishlist_list_id)) {
      runtime.pendingListId = positiveInt(opts.wishlist_list_id);
    }
    renderAll();

    const root = runtime.roots[0] || null;
    const source = root || runtime.primaryNode;
    const includeProduct = !!root;
    const product = root ? productFromRoot(root) : null;
    const result = await fetchStatus(source, {
      includeProduct: includeProduct,
      product: product,
      limit: positiveInt(clean(runtime.primaryNode.dataset && runtime.primaryNode.dataset.wishlistLimit)) || 50,
      wishlist_list_id: positiveInt(opts.wishlist_list_id || runtime.pendingListId),
      guest_token: clean(opts.guest_token || activeGuestToken()),
    });

    runtime.loading = false;
    runtime.loaded = true;

    if (!result.ok) {
      runtime.notice = {
        message: failureMessage(result.error),
        tone: 'danger',
      };
      renderAll();
      return;
    }

    runtime.notice = {
      message: '',
      tone: 'neutral',
    };
    mergePayload(result.data);
    renderAll();
  }

  async function toggleWishlist(root) {
    if (!root) {
      return;
    }

    const current = rootUi(root);
    if (current.busy) {
      return;
    }

    const product = productFromRoot(root);
    const productState = productStateFor(root);
    const removing = bool(productState.in_wishlist);
    const action = removing ? 'remove' : 'add';
    const endpoint = endpointForAction(root, action);
    if (!endpoint) {
      setRootUi(root, {
        busy: false,
        message: 'Wishlist endpoint is missing.',
        tone: 'danger',
      });
      renderAll();
      return;
    }

    setRootUi(root, {
      busy: true,
      message: '',
      tone: 'neutral',
    });
    renderAll();

    const requestPayload = payloadForAction(root, product, action, {
      wishlist_list_id: productState.wishlist_list_id || activeListId() || positiveInt(root.dataset.wishlistListId),
    });
    const result = await postAction(root, endpoint, requestPayload);

    setRootUi(root, {
      busy: false,
      message: '',
      tone: 'neutral',
    });

    if (!result.ok) {
      const message = failureMessage(result.error);
      setRootUi(root, {
        busy: false,
        message: message,
        tone: 'danger',
      });
      runtime.notice = {
        message: message,
        tone: 'danger',
      };
      renderAll();
      return;
    }

    mergePayload(result.data);
    const message = successMessage(result.data && result.data.state);
    if (!removing) {
      openDrawer('sidebar-wishlist');
    }
    setRootUi(root, {
      busy: false,
      message: message,
      tone: 'success',
    });
    runtime.notice = {
      message: '',
      tone: 'neutral',
    };
    renderAll();
  }

  async function removeFromDrawer(button) {
    const drawer = button.closest(DRAWER_SELECTOR) || runtime.drawers[0] || runtime.primaryNode;
    if (!drawer) {
      return;
    }

    const endpoint = endpointForAction(drawer, 'remove');
    if (!endpoint) {
      runtime.notice = {
        message: 'Wishlist endpoint is missing.',
        tone: 'danger',
      };
      renderAll();
      return;
    }

    const product = productFromButton(button);
    const requestPayload = payloadForAction(drawer, product, 'remove', {
      wishlist_list_id: positiveInt(button.dataset && button.dataset.wishlistListId) || activeListId(),
    });
    const result = await postAction(drawer, endpoint, requestPayload);

    if (!result.ok) {
      runtime.notice = {
        message: failureMessage(result.error),
        tone: 'danger',
      };
      renderAll();
      return;
    }

    mergePayload(result.data);
    runtime.notice = {
      message: '',
      tone: 'neutral',
    };
    renderAll();
  }

  async function createWishlistList(form) {
    const drawer = form.closest(DRAWER_SELECTOR) || runtime.drawers[0] || runtime.primaryNode;
    if (!drawer) {
      return;
    }

    const endpoint = endpointForAction(drawer, 'create_list');
    if (!endpoint) {
      runtime.notice = {
        message: 'Wishlist list endpoint is missing.',
        tone: 'danger',
      };
      renderAll();
      return;
    }

    const input = form.querySelector('input[name="name"]');
    const listName = clean(input && input.value);
    if (!listName) {
      runtime.notice = {
        message: 'Name your new wishlist before creating it.',
        tone: 'danger',
      };
      renderAll();
      return;
    }

    runtime.loading = true;
    renderAll();

    const identity = identityFromNode(drawer, {
      forceGuestToken: true,
      guestToken: activeGuestToken(),
    });

    const result = await postAction(drawer, endpoint, Object.assign({}, identity, {
      name: listName,
      request_key: requestKey('create-list', listName.toLowerCase()),
    }));

    runtime.loading = false;

    if (!result.ok) {
      runtime.notice = {
        message: failureMessage(result.error),
        tone: 'danger',
      };
      renderAll();
      return;
    }

    if (input) {
      input.value = '';
    }

    mergePayload(result.data);
    runtime.notice = {
      message: 'Created a new wishlist list.',
      tone: 'success',
    };
    renderAll();
  }

  async function setActiveList(button) {
    const listId = positiveInt(button.dataset && button.dataset.wishlistListId);
    if (!listId) {
      return;
    }

    runtime.notice = {
      message: '',
      tone: 'neutral',
    };
    await hydrateStatus({
      wishlist_list_id: listId,
    });
  }

  async function addToCart(button) {
    const variantId = clean(button.dataset && button.dataset.productVariantId);
    if (!variantId) {
      const url = clean(button.dataset && button.dataset.productUrl);
      if (url) {
        window.location.href = url;
      }
      return;
    }

    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Adding...';

    const endpoint = ((window.routes && window.routes.cartAddUrl) ? window.routes.cartAddUrl : '/cart/add') + '.js';
    const response = await fetch(new URL(endpoint, window.location.origin).toString(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        id: variantId,
        quantity: 1,
      }),
    }).then(async function (res) {
      return {
        ok: res.ok,
      };
    }).catch(function () {
      return {
        ok: false,
      };
    });

    button.disabled = false;
    button.textContent = original;

    if (!response.ok) {
      runtime.notice = {
        message: 'We could not add that item to cart right now.',
        tone: 'danger',
      };
      renderAll();
      return;
    }

    runtime.notice = {
      message: 'Added to cart.',
      tone: 'success',
    };
    renderAll();
    document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', {
      bubbles: true,
    }));
  }

  function syncVariantContext(event) {
    const detail = event && event.detail ? event.detail : {};
    const variant = detail.variant || {};
    const variantId = clean(variant.id);
    if (!variantId) {
      return;
    }

    runtime.roots.forEach(function (root) {
      root.dataset.productVariantId = variantId;
    });
  }

  function discover() {
    runtime.roots = Array.from(document.querySelectorAll(ROOT_SELECTOR));
    runtime.drawers = Array.from(document.querySelectorAll(DRAWER_SELECTOR));
    runtime.floatingDrawer = runtime.drawers.find(function (drawer) {
      return drawer.hasAttribute('data-forestry-wishlist-floating');
    }) || null;
    runtime.primaryNode = runtime.roots[0] || runtime.drawers[0] || null;
    runtime.payload = emptyPayload();
    runtime.productState.clear();
    runtime.loading = false;
    runtime.loaded = false;
    runtime.floatingOpen = false;
    runtime.floatingLastFocused = null;
    runtime.notice = { message: '', tone: 'neutral' };
  }

  function boot() {
    discover();
    if (!runtime.primaryNode) {
      return;
    }

    renderAll();
    hydrateStatus();
  }

  document.addEventListener('click', function (event) {
    const floatingToggle = event.target.closest('[data-action="forestry-wishlist-floating-toggle"]');
    if (floatingToggle) {
      event.preventDefault();
      if (runtime.floatingOpen) {
        closeFloatingDrawer();
      } else {
        openFloatingDrawer(floatingToggle);
      }
      return;
    }

    const floatingClose = event.target.closest('[data-action="forestry-wishlist-floating-close"]');
    if (floatingClose) {
      event.preventDefault();
      closeFloatingDrawer();
      return;
    }

    const toggle = event.target.closest('[data-action="forestry-wishlist-toggle"]');
    if (toggle) {
      event.preventDefault();
      const root = toggle.closest(ROOT_SELECTOR);
      if (root) {
        toggleWishlist(root);
      }
      return;
    }

    const remove = event.target.closest('[data-action="forestry-wishlist-remove-item"]');
    if (remove) {
      event.preventDefault();
      removeFromDrawer(remove);
      return;
    }

    const listButton = event.target.closest('[data-action="forestry-wishlist-set-list"]');
    if (listButton) {
      event.preventDefault();
      setActiveList(listButton);
      return;
    }

    const cartButton = event.target.closest('[data-action="forestry-wishlist-add-to-cart"]');
    if (cartButton) {
      event.preventDefault();
      addToCart(cartButton);
    }
  });

  document.addEventListener('submit', function (event) {
    const form = event.target.closest('[data-action="forestry-wishlist-create-list-form"]');
    if (!form) {
      return;
    }

    event.preventDefault();
    createWishlistList(form);
  });

  document.addEventListener('variant:changed', syncVariantContext);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && runtime.floatingOpen) {
      closeFloatingDrawer();
    }
  });
  document.addEventListener('forestry:floating-drawer-open', function (event) {
    const detail = event && event.detail ? event.detail : {};
    if (clean(detail.kind) !== 'wishlist') {
      closeFloatingDrawer(false);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
