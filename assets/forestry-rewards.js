(function () {
  const ROOT_SELECTOR = '[data-forestry-rewards-root]';
  const DEFAULT_CANDLE_CLUB_URL = '/products/modern-forestry-candle-club-16oz-subscription-with-gifts?selling_plan=11300438275';
  const DEFAULT_THEME = 'cognac-reserve';
  const DEFAULT_REWARDS_BUILD_VERSION = '2026-04-07-cachefix-1';
  const THEME_OPTIONS = [
    { id: 'cognac-reserve', label: 'Cognac Reserve' },
    { id: 'midnight-ledger', label: 'Midnight Ledger' },
    { id: 'evergreen-club', label: 'Evergreen Club' },
  ];
  const RUNTIME_KEY = '__forestryRewardsRuntime';
  const RESPONSE_CACHE_TTLS = {
    status: 15000,
    available: 12000,
    cart: 2500,
  };
  const CART_DISCOUNT_SYNC_TIMEOUT_MS = 2500;
  const CART_DISCOUNT_SYNC_POLL_MS = 200;
  const AUTH_RETURN_PARAM = 'return_url';
  const AUTH_PORTAL_PARAM = 'candle_cash_portal';
  const AUTH_WELCOME_PARAM = 'candle_cash_welcome';
  const REVIEW_PREFETCH_EVENT = 'forestry:prefetch-reviews';
  const CLASSIC_LOGIN_PATH = '/account/login';
  const CLASSIC_REGISTER_PATH = '/account/register';
  const runtime = window[RUNTIME_KEY] || {
    mounted: new Set(),
    state: new WeakMap(),
    domObserver: null,
    responseCache: new Map(),
    responseInflight: new Map(),
    nextDomId: 1,
    reviewPrefetchObserver: null,
    reviewPrefetchTargets: new WeakMap(),
    rewardsPrefetchObserver: null,
    rewardsPrefetchTargets: new WeakMap(),
  };

  window[RUNTIME_KEY] = runtime;

  function cleanString(value) {
    return value == null ? '' : String(value).trim();
  }

  function authPathFor(kind) {
    return cleanString(kind).toLowerCase() === 'register' ? CLASSIC_REGISTER_PATH : CLASSIC_LOGIN_PATH;
  }

  function normalizeReturnUrl(value) {
    const source = cleanString(value);
    if (!source) {
      return '';
    }

    try {
      const url = new URL(source, window.location.origin);
      if (url.origin !== window.location.origin) {
        return '';
      }

      return url.pathname + url.search + url.hash;
    } catch (error) {
      return '';
    }
  }

  function currentPageUrl() {
    return normalizeReturnUrl(window.location.pathname + window.location.search + window.location.hash) || '/';
  }

  function currentAuthReturnUrl(fallback) {
    const url = new URL(window.location.href);
    const explicitReturn = normalizeReturnUrl(url.searchParams.get(AUTH_RETURN_PARAM));

    if (explicitReturn) {
      return explicitReturn;
    }

    const normalizedFallback = normalizeReturnUrl(fallback);
    if (normalizedFallback) {
      return normalizedFallback;
    }

    return currentPageUrl();
  }

  function returnUrlForAuthTarget(target, fallback) {
    const kind = cleanString(target).toLowerCase();
    const normalized = normalizeReturnUrl(currentAuthReturnUrl(fallback));

    if (!normalized) {
      return currentPageUrl();
    }

    try {
      const url = new URL(normalized, window.location.origin);
      url.searchParams.delete(AUTH_PORTAL_PARAM);

      if (url.pathname === '/pages/rewards' && (kind === 'login' || kind === 'register' || kind === 'home')) {
        url.searchParams.set(AUTH_WELCOME_PARAM, kind);
      }

      return url.pathname + url.search + url.hash;
    } catch (error) {
      return normalized;
    }
  }

  function buildAuthUrl(base, options) {
    const settings = options || {};
    const kind = cleanString(settings.kind).toLowerCase();
    const portal = cleanString(settings.portal).toLowerCase();
    const hash = cleanString(settings.hash);
    const fallbackBase = authPathFor(kind);

    try {
      const url = new URL(cleanString(base) || fallbackBase, window.location.origin);
      const returnUrl = normalizeReturnUrl(
        settings.returnUrl == null
          ? currentAuthReturnUrl()
          : settings.returnUrl
      );

      if (returnUrl) {
        url.searchParams.set(AUTH_RETURN_PARAM, returnUrl);
      } else {
        url.searchParams.delete(AUTH_RETURN_PARAM);
      }

      if (portal === 'login' || portal === 'register' || portal === 'minimized') {
        url.searchParams.set(AUTH_PORTAL_PARAM, portal);
      } else if (settings.portal === null) {
        url.searchParams.delete(AUTH_PORTAL_PARAM);
      }

      if (settings.hash != null) {
        url.hash = hash ? (hash.charAt(0) === '#' ? hash : '#' + hash) : '';
      }

      return url.pathname + url.search + url.hash;
    } catch (error) {
      return cleanString(base) || fallbackBase;
    }
  }

  function applyManagedAuthLinks(scope) {
    const root = scope && typeof scope.querySelectorAll === 'function' ? scope : document;

    root.querySelectorAll('[data-forestry-auth-link]').forEach(function (link) {
      const kind = cleanString(link.getAttribute('data-forestry-auth-link')).toLowerCase();
      const returnMode = cleanString(link.getAttribute('data-forestry-auth-return')).toLowerCase();
      const hash = cleanString(link.getAttribute('data-forestry-auth-hash'));
      const portalTarget = cleanString(
        link.getAttribute('data-forestry-auth-portal') ||
        link.getAttribute('data-portal-target') ||
        link.getAttribute('data-candle-cash-portal-open')
      ).toLowerCase();
      let returnUrl = '';

      if (returnMode === 'rewards-login') {
        returnUrl = returnUrlForAuthTarget('login');
      } else if (returnMode === 'rewards-register') {
        returnUrl = returnUrlForAuthTarget('register');
      } else if (returnMode === 'account') {
        returnUrl = '/account';
      } else {
        returnUrl = currentAuthReturnUrl();
      }

      link.href = buildAuthUrl(link.getAttribute('href') || authPathFor(kind), {
        kind: kind,
        portal: portalTarget || undefined,
        hash: hash || undefined,
        returnUrl: returnUrl,
      });
    });
  }

  function guestLoginUrl(root) {
    const loginUrl = cleanString(root && root.dataset && root.dataset.loginUrl) || CLASSIC_LOGIN_PATH;

    return buildAuthUrl(loginUrl, {
      kind: 'login',
      returnUrl: returnUrlForAuthTarget('login'),
    });
  }

  window.ForestryAuthUrls = Object.assign({}, window.ForestryAuthUrls, {
    loginPath: CLASSIC_LOGIN_PATH,
    registerPath: CLASSIC_REGISTER_PATH,
    normalizeReturnUrl: normalizeReturnUrl,
    currentPageUrl: currentPageUrl,
    currentAuthReturnUrl: currentAuthReturnUrl,
    returnUrlForTarget: returnUrlForAuthTarget,
    buildAuthUrl: buildAuthUrl,
    applyManagedLinks: applyManagedAuthLinks,
  });

  function escapeHtml(value) {
    return cleanString(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeState(value) {
    return cleanString(value).toLowerCase().replace(/[\s-]+/g, '_');
  }

  function positiveInt(value) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function bool(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function currencyLabel(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      return '';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: parsed % 1 === 0 ? 0 : 2,
    }).format(parsed);
  }

  function moneyWithCurrencyLabel(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
      return '';
    }

    const currency = cleanString(window.Shopify && Shopify.currency && Shopify.currency.active) || 'USD';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(parsed);

    return formatted + ' ' + currency;
  }

  function amountNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
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

  function titleCaseSlug(value) {
    return cleanString(value)
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  }

  function formatBalance(value) {
    const parsed = Number.parseFloat(String(value || 0));
    return Number.isFinite(parsed)
      ? parsed.toLocaleString('en-US', {
          minimumFractionDigits: parsed % 1 === 0 ? 0 : 2,
          maximumFractionDigits: 2,
        })
      : '0';
  }

  function redemptionRules(model) {
    const rules = (model && model.redemptionRules) || {};
    const redeemAmount = amountNumber(
      rules.redeem_increment_candle_cash ||
      rules.redeemIncrementCandleCash ||
      rules.redeem_increment_dollars ||
      rules.redeemIncrementDollars ||
      10
    ) || 10;
    const maxPerOrder = amountNumber(rules.max_redeemable_per_order_dollars || rules.maxRedeemablePerOrderDollars || redeemAmount) || redeemAmount;

    return {
      redeemAmount: redeemAmount,
      redeemAmountLabel: cleanString(rules.redeem_increment_formatted || rules.redeemIncrementFormatted) || (currencyLabel(redeemAmount) || '$10.00'),
      maxPerOrder: maxPerOrder,
      maxPerOrderLabel: cleanString(rules.max_redeemable_per_order_formatted || rules.maxRedeemablePerOrderFormatted) || (currencyLabel(maxPerOrder) || '$10.00'),
    };
  }

  function redeemAmountLabel(model) {
    return redemptionRules(model).redeemAmountLabel;
  }

  function readJsonScript(root, selector) {
    const el = root.querySelector(selector);
    if (!el) {
      return {};
    }

    try {
      return JSON.parse(el.textContent || '{}');
    } catch (error) {
      return {};
    }
  }

  function fallbackModel(root) {
    const fallback = readJsonScript(root, '[data-forestry-rewards-fallback]');

    if (!fallback || typeof fallback !== 'object') {
      return {};
    }

    return Object.assign({}, fallback, {
      redemption_access: normalizeFallbackRedemptionAccess(fallback.redemption_access),
    });
  }

  function mergeObject(primary, fallback) {
    return Object.assign({}, fallback || {}, primary || {});
  }

  function mergeArray(primary, fallback) {
    if (Array.isArray(primary)) {
      return primary;
    }

    return Array.isArray(fallback) ? fallback : [];
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function emptyModel() {
    return {
      profileId: null,
      state: 'unknown_customer',
      consentSms: false,
      consentEmail: false,
      balance: 0,
      balanceAmount: 0,
      expirationDate: '',
      expirationDays: null,
      expiringBalanceAmount: 0,
      birthdayState: 'unavailable',
      birthday: null,
      birthdayIssuance: null,
      otherRewards: [],
      availableRewards: [],
      rewardCodes: [],
      thresholds: [],
      candleClub: {
        member: false,
        multiplier: 1,
        memberHeadline: 'Candle Club Members earn 2x Candle Cash',
        memberCopy: 'Members unlock bonus rewards and exclusive voting perks.',
        guestHeadline: 'Candle Club Members earn 2x Candle Cash',
        guestCopy: 'Members unlock bonus rewards and exclusive voting perks.',
        ctaUrl: DEFAULT_CANDLE_CLUB_URL,
        ctaText: 'Explore Candle Club',
      },
      celebrationState: {
        enabled: false,
        headline: '',
        body: '',
        amount: 0,
      },
      cartTotalAmount: 0,
      orderContext: {
        number: '',
        totalAmount: 0,
        createdAt: 0,
      },
      copy: {},
      summary: {},
      referral: null,
      googleReview: {
        enabled: false,
        ready: false,
        reason: '',
        message: '',
        fallbackMode: '',
        reviewUrl: '',
        lastSyncAt: '',
      },
      tasks: [],
      taskHistory: [],
      ledgerHistory: [],
      cartAppliedBirthday: false,
      cartDiscounts: [],
      cartDiscountCodes: [],
      redemptionRules: {
        redeem_increment_dollars: 10,
        redeem_increment_formatted: '$10.00',
        redeem_increment_candle_cash: 10,
        max_redeemable_per_order_dollars: 10,
        max_redeemable_per_order_formatted: '$10.00',
        max_redemptions_per_order: 1,
      },
      futureHooks: {},
    };
  }

  function rewardsLabel(model, root) {
    const explicit = cleanString(model && model.copy && model.copy.rewards_label);
    if (explicit) {
      return explicit;
    }

    const wallet = cleanString(model && model.copy && model.copy.wallet_label);
    if (wallet) {
      return wallet.replace(/\s+wallet$/i, '') || wallet;
    }

    const title = cleanString(model && model.copy && model.copy.title) || cleanString(root && root.dataset && root.dataset.title);
    if (title) {
      return title.replace(/\s+(central|wallet)$/i, '') || title;
    }

    return 'Rewards';
  }

  function walletLabel(model, root) {
    return cleanString(model && model.copy && model.copy.wallet_label) || (rewardsLabel(model, root) + ' Wallet');
  }

  function earnMoreRewardsLabel(model, root) {
    return 'Earn More ' + rewardsLabel(model, root);
  }

  function buildIdentity(root) {
    return {
      marketing_profile_id: positiveInt(root.dataset.marketingProfileId),
      email: cleanString(root.dataset.customerEmail),
      phone: cleanString(root.dataset.customerPhone),
      shopify_customer_id: cleanString(root.dataset.shopifyCustomerId),
      first_name: cleanString(root.dataset.customerFirstName),
      last_name: cleanString(root.dataset.customerLastName),
    };
  }

  function bodyFromIdentity(identity) {
    const body = {};

    if (identity.marketing_profile_id) {
      body.marketing_profile_id = identity.marketing_profile_id;
    }
    if (identity.email) {
      body.email = identity.email;
    }
    if (identity.phone) {
      body.phone = identity.phone;
    }
    if (identity.shopify_customer_id) {
      body.shopify_customer_id = identity.shopify_customer_id;
    }
    if (identity.first_name) {
      body.first_name = identity.first_name;
    }
    if (identity.last_name) {
      body.last_name = identity.last_name;
    }

    return body;
  }

  function queryFromIdentity(identity) {
    const query = new URLSearchParams();

    if (identity.marketing_profile_id) {
      query.set('marketing_profile_id', String(identity.marketing_profile_id));
    }
    if (identity.email) {
      query.set('email', identity.email);
    }
    if (identity.phone) {
      query.set('phone', identity.phone);
    }
    if (identity.shopify_customer_id) {
      query.set('shopify_customer_id', identity.shopify_customer_id);
    }

    return query;
  }

  function hasIdentity(identity) {
    return !!(
      identity &&
      (
        identity.marketing_profile_id ||
        identity.email ||
        identity.phone ||
        identity.shopify_customer_id
      )
    );
  }

  function rootState(root) {
    return runtime.state.get(root) || {
      busy: false,
      activeTab: 'tasks',
      formOpen: false,
      openTaskHandle: '',
      openOpportunityId: '',
      themePanelOpen: false,
      theme: DEFAULT_THEME,
      toast: '',
      toastTone: 'neutral',
      loadState: 'idle',
    };
  }

  function setRootState(root, patch) {
    const next = Object.assign({}, rootState(root), patch || {});
    runtime.state.set(root, next);
    return next;
  }

  function normalizedPageTab(value) {
    return cleanString(value).toLowerCase() === 'status' ? 'status' : 'tasks';
  }

  function pageTabState(uiState) {
    return normalizedPageTab(uiState && uiState.activeTab);
  }

  function rootDomId(root) {
    if (root && root.__forestryDomId) {
      return root.__forestryDomId;
    }

    const nextId = runtime.nextDomId || 1;
    const domId = 'forestry-rewards-' + nextId;
    runtime.nextDomId = nextId + 1;

    if (root) {
      root.__forestryDomId = domId;
    }

    return domId;
  }

  function pageTabIds(root) {
    const base = rootDomId(root);

    return {
      tasksTab: base + '-tab-tasks',
      statusTab: base + '-tab-status',
      tasksPanel: base + '-panel-tasks',
      statusPanel: base + '-panel-status',
    };
  }

  function focusPageTab(root, tab) {
    const nextTab = normalizedPageTab(tab);
    window.requestAnimationFrame(function () {
      const selector = '[data-action="set-tab"][data-tab-target="' + nextTab + '"]';
      const button = root && root.querySelector ? root.querySelector(selector) : null;

      if (button && typeof button.focus === 'function') {
        button.focus();
      }
    });
  }

  function switchPageTab(root, tab, options) {
    const settings = options || {};
    const nextTab = normalizedPageTab(tab);
    const state = rootState(root);

    if (pageTabState(state) === nextTab && !state.themePanelOpen) {
      if (settings.focus) {
        focusPageTab(root, nextTab);
      }
      return;
    }

    setRootState(root, {
      activeTab: nextTab,
      themePanelOpen: false,
    });
    rerender(root);

    if (settings.focus) {
      focusPageTab(root, nextTab);
    }
  }

  function pageTabsMarkup(root, activeTab) {
    const tab = normalizedPageTab(activeTab);
    const ids = pageTabIds(root);
    const buttons = [
      {
        key: 'tasks',
        label: 'Tasks',
        tabId: ids.tasksTab,
        panelId: ids.tasksPanel,
      },
      {
        key: 'status',
        label: 'Status',
        tabId: ids.statusTab,
        panelId: ids.statusPanel,
      },
    ];

    return '<div class="ForestryRewardsTabs">' +
      '<div class="ForestryRewardsTabs__list" role="tablist" aria-label="Rewards page sections">' +
        buttons.map(function (button) {
          const selected = button.key === tab;

          return '<button class="ForestryRewardsTab' + (selected ? ' is-active' : '') + '" type="button" id="' + escapeHtml(button.tabId) + '" role="tab" aria-selected="' + (selected ? 'true' : 'false') + '" aria-controls="' + escapeHtml(button.panelId) + '" tabindex="' + (selected ? '0' : '-1') + '" data-action="set-tab" data-tab-target="' + escapeHtml(button.key) + '">' + escapeHtml(button.label) + '</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function computeLastModel(root) {
    return root.__forestryLastModel || emptyModel();
  }

  function storageSafe() {
    try {
      const key = '__forestryRewardsStorage';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function sessionStorageSafe() {
    try {
      const key = '__forestryRewardsSessionStorage';
      window.sessionStorage.setItem(key, '1');
      window.sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function referralStorageKey() {
    return 'forestryRewardsReferralCode';
  }

  function themeStorageKey() {
    return 'forestryRewardsTheme';
  }

  function normalizeThemeName(value) {
    return cleanString(value).toLowerCase().replace(/[\s_]+/g, '-');
  }

  function themeExists(value) {
    const normalized = normalizeThemeName(value);
    return THEME_OPTIONS.some(function (option) {
      return option.id === normalized;
    });
  }

  function normalizeThemeChoice(value) {
    const normalized = normalizeThemeName(value);
    return themeExists(normalized) ? normalized : DEFAULT_THEME;
  }

  function readStoredTheme() {
    if (!storageSafe()) {
      return DEFAULT_THEME;
    }

    return normalizeThemeChoice(window.localStorage.getItem(themeStorageKey()));
  }

  function writeStoredTheme(theme) {
    if (!storageSafe()) {
      return;
    }

    window.localStorage.setItem(themeStorageKey(), normalizeThemeChoice(theme));
  }

  function activeRewardsTheme(root) {
    if (root) {
      const rootTheme = normalizeThemeChoice(root.getAttribute('data-theme'));
      if (themeExists(rootTheme)) {
        return rootTheme;
      }
    }

    return readStoredTheme();
  }

  function applyRewardsTheme(root, theme) {
    if (!root) {
      return DEFAULT_THEME;
    }

    const next = normalizeThemeChoice(theme);
    root.setAttribute('data-theme', next);
    setRootState(root, { theme: next });
    return next;
  }

  function themeBirdIconMarkup() {
    return '' +
      '<svg class="ForestryRewardsThemeControl__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
        '<path d="M2.3 8.8c0-2.5 2-4.5 4.5-4.5 1.3 0 2.5.5 3.3 1.4.8.8 1.2 1.8 1.2 2.9 0 2.4-1.9 4.3-4.3 4.3-1.6 0-3-.8-3.8-2.2h2.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<path d="M9.8 6.3h3.9l-1.8 1.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>';
  }

  function themeToggleMarkup(root, uiState) {
    const activeTheme = activeRewardsTheme(root);
    const panelOpen = !!(uiState && uiState.themePanelOpen);

    return '<div class="ForestryRewardsThemeControl' + (panelOpen ? ' is-open' : '') + '">' +
      '<button class="ForestryRewardsThemeControl__toggle" type="button" data-action="toggle-theme-panel" aria-expanded="' + (panelOpen ? 'true' : 'false') + '" aria-haspopup="true">' +
        themeBirdIconMarkup() +
        '<span>Theme</span>' +
      '</button>' +
      '<div class="ForestryRewardsThemeControl__panel" aria-hidden="' + (panelOpen ? 'false' : 'true') + '">' +
        '<p class="ForestryRewardsThemeControl__title">Choose your rewards view</p>' +
        '<div class="ForestryRewardsThemeToggle" role="group" aria-label="Rewards theme selector">' +
          THEME_OPTIONS.map(function (option) {
            const active = option.id === activeTheme;
            return '<button class="ForestryRewardsThemeButton' + (active ? ' is-active' : '') + '" type="button" data-action="set-theme" data-theme-choice="' + escapeHtml(option.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' + escapeHtml(option.label) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function syncMountedThemes(theme) {
    const next = normalizeThemeChoice(theme);
    writeStoredTheme(next);

    Array.from(runtime.mounted).forEach(function (root) {
      if (!root || !document.body.contains(root)) {
        return;
      }

      applyRewardsTheme(root, next);

      if (root.getAttribute('data-forestry-rewards-state') === 'loaded') {
        rerender(root);
      }
    });
  }

  function readStoredReferralCode() {
    if (!storageSafe()) {
      return '';
    }

    return cleanString(window.localStorage.getItem(referralStorageKey()));
  }

  function writeStoredReferralCode(code) {
    if (!storageSafe()) {
      return;
    }

    if (cleanString(code) === '') {
      window.localStorage.removeItem(referralStorageKey());
      return;
    }

    window.localStorage.setItem(referralStorageKey(), cleanString(code));
  }

  function activeReferralCode() {
    const params = new URLSearchParams(window.location.search || '');
    const fromUrl = cleanString(params.get('ref'));
    if (fromUrl) {
      writeStoredReferralCode(fromUrl);
      return fromUrl;
    }

    return readStoredReferralCode();
  }

  function requestedTaskHandleFromUrl() {
    const params = new URLSearchParams(window.location.search || '');
    return cleanString(params.get('task'));
  }

  function cacheKey(parts) {
    return parts.map(function (part) {
      return cleanString(part) || 'none';
    }).join('|');
  }

  function rewardsBuildVersion(root) {
    return cleanString(root && root.dataset && root.dataset.rewardsBuildVersion) || DEFAULT_REWARDS_BUILD_VERSION;
  }

  function cacheEntryAge(entry) {
    return entry ? (Date.now() - Number(entry.fetchedAt || 0)) : Number.POSITIVE_INFINITY;
  }

  function cacheEntryFresh(entry, ttl) {
    return !!entry && cacheEntryAge(entry) <= ttl;
  }

  function responseSessionStorageKey(key) {
    return 'forestryRewardsResponse:' + key;
  }

  function readResponseCache(key, options) {
    const allowSession = !!(options && options.allowSession);
    const memoryEntry = runtime.responseCache.get(key);

    if (memoryEntry) {
      return memoryEntry;
    }

    if (!allowSession || !sessionStorageSafe()) {
      return null;
    }

    try {
      const raw = window.sessionStorage.getItem(responseSessionStorageKey(key));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.value) {
        return null;
      }

      runtime.responseCache.set(key, parsed);
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function writeResponseCache(key, value, options) {
    const allowSession = !!(options && options.allowSession);
    const entry = {
      fetchedAt: Date.now(),
      value: value,
    };

    runtime.responseCache.set(key, entry);

    if (!allowSession || !sessionStorageSafe()) {
      return entry;
    }

    try {
      window.sessionStorage.setItem(responseSessionStorageKey(key), JSON.stringify(entry));
    } catch (error) {
      // Ignore cache persistence failures.
    }

    return entry;
  }

  function clearResponseCache(key, options) {
    const allowSession = !!(options && options.allowSession);
    runtime.responseCache.delete(key);

    if (!allowSession || !sessionStorageSafe()) {
      return;
    }

    try {
      window.sessionStorage.removeItem(responseSessionStorageKey(key));
    } catch (error) {
      // Ignore cache cleanup failures.
    }
  }

  function fetchCachedResponse(key, loader, options) {
    const ttl = Number(options && options.ttl) || 0;
    const force = !!(options && options.force);
    const allowSession = !!(options && options.allowSession);

    if (!force) {
      const cachedEntry = readResponseCache(key, { allowSession: allowSession });
      if (cacheEntryFresh(cachedEntry, ttl)) {
        return Promise.resolve(cachedEntry.value);
      }
    }

    if (runtime.responseInflight.has(key)) {
      return runtime.responseInflight.get(key);
    }

    const promise = Promise.resolve()
      .then(loader)
      .then(function (value) {
        if (value && value.ok) {
          writeResponseCache(key, value, { allowSession: allowSession });
        }

        return value;
      })
      .finally(function () {
        runtime.responseInflight.delete(key);
      });

    runtime.responseInflight.set(key, promise);
    return promise;
  }

  function rewardsScopeKey(root) {
    const identity = buildIdentity(root);
    const query = queryFromIdentity(identity);
    const referralCode = activeReferralCode();

    if (referralCode) {
      query.set('ref', referralCode);
    }

    return query.toString() || 'guest';
  }

  function shouldLoadAvailableRewardsForRoot(root) {
    const surface = cleanString(root.dataset.surface || '');
    return (surface === 'cart' || surface === 'drawer')
      && hasIdentity(buildIdentity(root))
      && cleanString(root.dataset.endpointRewardsAvailable) !== '';
  }

  function statusResponseCacheKey(root, query) {
    return cacheKey(['status', cleanString(root.dataset.endpointCandleCashStatus), rewardsBuildVersion(root), query.toString()]);
  }

  function availableRewardsResponseCacheKey(root, query) {
    return cacheKey(['available', cleanString(root.dataset.endpointRewardsAvailable), rewardsBuildVersion(root), query.toString()]);
  }

  function cartResponseCacheKey() {
    return cacheKey(['cart', window.location.origin]);
  }

  function invalidateRewardsScope(root) {
    const identity = buildIdentity(root);
    const query = queryFromIdentity(identity);
    const referralCode = activeReferralCode();

    if (referralCode) {
      query.set('ref', referralCode);
    }

    clearResponseCache(statusResponseCacheKey(root, query), { allowSession: true });
    clearResponseCache(availableRewardsResponseCacheKey(root, query), { allowSession: false });
  }

  function invalidateCartCache() {
    clearResponseCache(cartResponseCacheKey(), { allowSession: false });
  }

  function snapshotResponseValue(key, options) {
    const entry = readResponseCache(key, options);
    return entry ? entry.value : null;
  }

  async function fetchContract(root, endpoint, options) {
    const method = cleanString(options && options.method).toUpperCase() || 'GET';
    const url = new URL(endpoint, window.location.origin);
    const init = {
      method: method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    };

    if (options && options.query) {
      options.query.forEach(function (value, key) {
        if (cleanString(value) !== '') {
          url.searchParams.set(key, value);
        }
      });
    }

    if (method !== 'GET' && options && options.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url.toString(), init);
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
          status: response.status,
          data: payload.data || {},
          meta: payload.meta || {},
          error: null,
        };
      }

      const errorPayload = (payload && payload.error) || {};
      return {
        ok: false,
        status: response.status,
        data: payload && payload.data ? payload.data : {},
        meta: payload && payload.meta ? payload.meta : {},
        error: {
          code: errorPayload.code || (response.status === 404 ? 'proxy_not_available' : 'request_failed'),
          message: errorPayload.message || (response.status === 404 ? 'Rewards are still connecting.' : 'The request could not be completed.'),
          details: errorPayload.details || {},
        },
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: {},
        meta: {},
        error: {
          code: 'network_error',
          message: error && error.message ? error.message : 'Network request failed.',
          details: {},
        },
      };
    }
  }

  async function fetchCartStateNetwork() {
    try {
      const response = await fetch('/cart.js', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return { ok: false, data: {} };
      }

      return { ok: true, data: await response.json() };
    } catch (error) {
      return { ok: false, data: {} };
    }
  }

  function fetchCartState(options) {
    return fetchCachedResponse(cartResponseCacheKey(), fetchCartStateNetwork, {
      ttl: RESPONSE_CACHE_TTLS.cart,
      force: !!(options && options.force),
      allowSession: false,
    });
  }

  async function persistReferralCodeToCart() {
    const referralCode = activeReferralCode();
    if (!referralCode) {
      return;
    }

    const cartState = await fetchCartState();
    const attributes = Object.assign({}, (cartState.data && cartState.data.attributes) || {});
    if (cleanString(attributes.forestry_referral_code) === referralCode) {
      return;
    }

    attributes.forestry_referral_code = referralCode;

    try {
      await fetch('/cart/update.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attributes: attributes }),
      });
      invalidateCartCache();
    } catch (error) {
      // Ignore cart attribute sync failures. The referral code still persists locally.
    }
  }

  function getApplyMarker() {
    try {
      const raw = sessionStorage.getItem('forestryRewardsApply');
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function setApplyMarker(marker) {
    try {
      sessionStorage.setItem('forestryRewardsApply', JSON.stringify(marker));
    } catch (error) {
      // ignore
    }
  }

  function clearApplyMarker() {
    try {
      sessionStorage.removeItem('forestryRewardsApply');
    } catch (error) {
      // ignore
    }
  }

  function oncePerSession(key) {
    try {
      if (sessionStorage.getItem(key)) {
        return false;
      }
      sessionStorage.setItem(key, '1');
      return true;
    } catch (error) {
      return true;
    }
  }

  function badge(text, tone) {
    return '<span class="ForestryRewardsBadge ForestryRewardsBadge--' + tone + '">' + escapeHtml(text) + '</span>';
  }

  async function logRewardEvent(root, payload) {
    const endpoint = root.dataset.endpointRewardsEvent;
    if (!endpoint) {
      return;
    }

    const identity = buildIdentity(root);
    await fetchContract(root, endpoint, {
      method: 'POST',
      body: Object.assign({}, bodyFromIdentity(identity), payload || {}),
    });
  }

  function normalizeFallbackRedemptionAccess(access) {
    const payload = access && typeof access === 'object' ? Object.assign({}, access) : {};
    const mode = cleanString(payload.mode || payload.state).toLowerCase();
    const ctaLabel = cleanString(payload.cta_label || payload.ctaLabel);
    const message = cleanString(payload.message);
    const selectedAccountsCopy = /selected accounts only/i.test(message);

    if (mode !== 'coming_soon' && ctaLabel !== 'COMING SOON!' && !selectedAccountsCopy) {
      return payload;
    }

    return Object.assign({}, payload, {
      redeem_enabled: false,
      cta_label: 'Check reward status',
      message: 'Checking Candle Cash redemption access.',
      mode: 'pending_status',
    });
  }

  function maybeTrackFallbackRender(root, fallback, status) {
    const statusCode = cleanString(status && status.error && status.error.code) || 'request_failed';
    const requestKey = cacheKey([
      'fallback-render',
      rewardsBuildVersion(root),
      cleanString(root && root.dataset && root.dataset.surface) || 'page',
      cleanString(root && root.dataset && root.dataset.endpointCandleCashStatus),
      statusCode,
    ]);

    if (!oncePerSession(requestKey)) {
      return;
    }

    logRewardEvent(root, {
      event_type: 'reward_status_fallback_rendered',
      request_key: requestKey,
      reward_kind: 'surface',
      surface: root.dataset.surface || 'page',
      state: cleanString(fallback && fallback.state) || 'unknown_customer',
      fallback_access_mode: cleanString(fallback && fallback.redemption_access && fallback.redemption_access.mode) || 'pending_status',
      status_error_code: statusCode,
    });
  }

  function rewardCodeValue(reward) {
    return cleanString(reward && (reward.redemption_code || reward.reward_code || reward.code));
  }

  function rewardApplyPath(reward) {
    return cleanString(reward && (reward.apply_path || reward.applyPath));
  }

  function rewardRemovePath(reward) {
    return cleanString(reward && (
      reward.remove_path ||
      reward.clear_path ||
      reward.remove_discount_path ||
      reward.clear_discount_path ||
      reward.remove_discount_url
    ));
  }

  function rewardAmountValue(reward) {
    if (!reward) {
      return 0;
    }

    return amountNumber(
      (reward.reward && reward.reward.candle_cash_amount) ||
      reward.candle_cash_amount ||
      (reward.reward && reward.reward.reward_value) ||
      reward.reward_value ||
      reward.amount ||
      0
    );
  }

  function rewardDisplayName(reward) {
    return cleanString(
      (reward && reward.reward && (reward.reward.name || reward.reward.reward_name)) ||
      (reward && (reward.name || reward.reward_name || reward.discount_title || reward.title)) ||
      'Candle Cash'
    );
  }

  function rewardCandleCashCost(reward) {
    return amountNumber(
      (reward && (reward.candle_cash_cost || reward.candleCashCost || reward.points_cost || reward.pointsCost)) ||
      (reward && reward.reward && (
        reward.reward.candle_cash_cost ||
        reward.reward.candleCashCost ||
        reward.reward.points_cost ||
        reward.reward.pointsCost
      )) ||
      rewardAmountValue(reward) ||
      0
    );
  }

  function rewardTypeKey(reward) {
    return cleanString(
      (reward && (reward.reward_type || reward.rewardType)) ||
      (reward && reward.reward && (reward.reward.reward_type || reward.reward.rewardType))
    ).toLowerCase();
  }

  function rewardTypePriority(reward) {
    const type = rewardTypeKey(reward);

    if (type === 'coupon') {
      return 0;
    }
    if (type === 'percent_discount') {
      return 1;
    }
    if (type === 'product') {
      return 2;
    }

    return 3;
  }

  function rewardCatalogRows(rows, balanceAmount) {
    return mergeArray(rows, []).map(function (reward) {
      const candleCashCost = rewardCandleCashCost(reward);

      return Object.assign({}, reward, {
        candle_cash_cost: candleCashCost,
        is_redeemable_now: candleCashCost > 0 && balanceAmount >= candleCashCost,
      });
    });
  }

  function rewardDiscountLabels(reward) {
    const labels = [
      rewardCodeValue(reward),
      rewardDisplayName(reward),
      cleanString(reward && (reward.discount_title || reward.title)),
      cleanString(reward && reward.reward && reward.reward.discount_title),
    ];

    return labels
      .map(function (label) { return label.toUpperCase(); })
      .filter(Boolean);
  }

  function rewardMatchesCart(reward, cartDiscountTitles) {
    return rewardDiscountLabels(reward).some(function (label) {
      return cartDiscountTitles.indexOf(label) >= 0;
    });
  }

  function redemptionAccess(model) {
    const access = model && model.redemptionAccess ? model.redemptionAccess : {};
    const enabled = bool(access.redeemEnabled);

    return {
      enabled: enabled,
      ctaLabel: cleanString(access.ctaLabel) || (enabled ? 'Redeem Candle Cash' : 'Check reward status'),
      message: cleanString(access.message) || (enabled ? 'Candle Cash is live for this account.' : 'Checking Candle Cash redemption access.'),
      mode: cleanString(access.mode) || (enabled ? 'live' : 'coming_soon'),
    };
  }

  function recommendedAvailableReward(model) {
    const rules = redemptionRules(model);
    const redeemable = (model.availableRewards || [])
      .filter(function (reward) {
        return reward && reward.is_redeemable_now;
      });
    const fixedRewards = redeemable.filter(function (reward) {
      return Math.abs(rewardAmountValue(reward) - rules.redeemAmount) < 0.01;
    });

    return (fixedRewards.length ? fixedRewards : redeemable)
      .sort(function (left, right) {
        const priorityDelta = rewardTypePriority(left) - rewardTypePriority(right);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        const costDelta = rewardCandleCashCost(right) - rewardCandleCashCost(left);
        if (costDelta !== 0) {
          return costDelta;
        }

        return rewardDisplayName(left).localeCompare(rewardDisplayName(right));
      })[0] || null;
  }

  function birthdayRewardRecord(model) {
    const issuance = model.birthdayIssuance;

    if (!issuance) {
      return null;
    }

    return {
      reward_name: issuance.reward_name || 'Birthday Candle Cash',
      reward_value: issuance.reward_value || 0,
      reward_code: issuance.reward_code || '',
      redemption_code: issuance.reward_code || '',
      discount_title: issuance.discount_title || issuance.reward_name || 'Birthday Candle Cash',
      apply_path: issuance.apply_path || '',
      remove_path: issuance.remove_path || issuance.clear_path || '',
      expires_at: issuance.expires_at || '',
      is_usable: bool(issuance.is_usable),
      is_applied: bool(model.cartAppliedBirthday),
    };
  }

  function primaryRewardCode(model) {
    const firstReward = model.otherRewards.find(function (reward) {
      return reward && reward.is_usable && !reward.is_applied;
    });

    if (firstReward) {
      return firstReward;
    }

    const firstNotApplied = model.otherRewards.find(function (reward) {
      return reward && !reward.is_applied;
    });

    return firstNotApplied || model.otherRewards[0] || null;
  }

  function appliedCandleCashReward(model) {
    if (model.cartAppliedBirthday) {
      return birthdayRewardRecord(model);
    }

    return model.otherRewards.find(function (reward) {
      return reward && reward.is_applied;
    }) || null;
  }

  function compactHelperState(model) {
    const viewState = birthdayViewState(model);
    const appliedReward = appliedCandleCashReward(model);
    const primaryCode = primaryRewardCode(model);
    const birthdayReward = birthdayRewardRecord(model);
    const redeemableReward = recommendedAvailableReward(model);

    if (!model.profileId) {
      return {
        name: 'guest',
        reward: null,
      };
    }

    if (!redemptionAccess(model).enabled) {
      return {
        name: 'coming_soon',
        reward: redeemableReward || primaryCode || birthdayReward || appliedReward || null,
        rewardKind: 'candle_cash',
      };
    }

    if (appliedReward) {
      return {
        name: 'applied',
        reward: appliedReward,
        rewardKind: model.cartAppliedBirthday ? 'birthday' : 'candle_cash',
      };
    }

    if (viewState === 'available' && model.birthdayIssuance) {
      return {
        name: 'birthday_activation',
        reward: birthdayReward,
        rewardKind: 'birthday',
      };
    }

    if (viewState === 'activated' && birthdayReward && rewardApplyPath(birthdayReward)) {
      return {
        name: 'ready',
        reward: birthdayReward,
        rewardKind: 'birthday',
      };
    }

    if (primaryCode && rewardApplyPath(primaryCode)) {
      return {
        name: 'ready',
        reward: primaryCode,
        rewardKind: 'candle_cash',
      };
    }

    if (primaryCode && rewardCodeValue(primaryCode)) {
      return {
        name: 'code_only',
        reward: primaryCode,
        rewardKind: 'candle_cash',
      };
    }

    if (redeemableReward) {
      return {
        name: 'redeemable',
        reward: redeemableReward,
        rewardKind: 'candle_cash',
      };
    }

    if (amountNumber(model.balanceAmount) > 0) {
      return {
        name: 'balance_only',
        reward: null,
      };
    }

    if (model.otherRewards.length > 0 || model.birthdayIssuance) {
      return {
        name: 'review_rewards',
        reward: primaryCode || birthdayReward,
      };
    }

    return {
      name: 'empty',
      reward: null,
    };
  }

  function compactSuccessBanner(state, model) {
    if (state.name !== 'applied') {
      return '';
    }

    const reward = state.reward || {};
    const appliedAmount = currencyLabel(rewardAmountValue(reward) || redemptionRules(model).redeemAmount || 0) || redeemAmountLabel(model);

    return '<div class="ForestryRewardsHelper__status ForestryRewardsHelper__status--success">' +
      '<span class="ForestryRewardsHelper__status-icon" aria-hidden="true"></span>' +
      '<div>' +
        '<strong>Candle Cash redeemed!</strong>' +
        '<p>Your reward has been applied to this order' + (appliedAmount ? ' for ' + escapeHtml(appliedAmount) : '') + '. Enjoy the glow.</p>' +
      '</div>' +
    '</div>';
  }

  function birthdayViewState(model) {
    const issuance = model.birthdayIssuance;

    if (!issuance) {
      if (model.birthdayState === 'add_birthday_unlock_reward') {
        return 'missing_birthday';
      }
      return 'unavailable';
    }

    if (issuance.is_redeemed) {
      return 'redeemed';
    }

    if (issuance.status === 'expired' || (issuance.expires_at && new Date(issuance.expires_at).getTime() < Date.now())) {
      return 'expired';
    }

    if (model.cartAppliedBirthday) {
      return 'applied';
    }

    if (issuance.is_usable) {
      return 'activated';
    }

    if (issuance.discount_sync_status === 'failed') {
      return 'sync_failed';
    }

    if (model.birthdayState === 'birthday_reward_ready' || model.birthdayState === 'already_claimed') {
      return issuance.is_usable ? 'activated' : 'available';
    }

    return 'unavailable';
  }

  function renderMoneySummary(otherRewards, birthdayIssuance) {
    let total = 0;

    if (birthdayIssuance && birthdayIssuance.is_usable) {
      const value = Number.parseFloat(birthdayIssuance.reward_value || '0');
      if (Number.isFinite(value)) {
        total += value;
      }
    }

    otherRewards.forEach(function (reward) {
      const value = Number.parseFloat((reward.reward && reward.reward.reward_value) || '0');
      if (Number.isFinite(value)) {
        total += value;
      }
    });

    return total > 0 ? currencyLabel(total.toFixed(2)) : null;
  }

  function rewardCardDescription(model, viewState) {
    if (viewState === 'missing_birthday') {
      return 'Add your birthday once and we will keep your yearly reward waiting inside your account.';
    }
    if (viewState === 'available') {
      return 'Your birthday reward is ready. Activate it once, then use it at checkout in one calm click.';
    }
    if (viewState === 'activated') {
      return 'Activated and ready to travel with your cart.';
    }
    if (viewState === 'applied') {
      return 'We found it in your cart already, so you can head straight to checkout.';
    }
    if (viewState === 'redeemed') {
      return 'Used successfully and saved back into your rewards history.';
    }
    if (viewState === 'expired') {
      return 'This year\'s birthday reward has expired, but next year\'s will show up here when it is ready.';
    }
    if (viewState === 'sync_failed') {
      return 'We saved the reward, but Shopify still needs a moment to finish syncing the code.';
    }
    return 'Your birthday reward will appear here as soon as it is available.';
  }

  function helperMessage(model, viewState) {
    const state = compactHelperState(model);
    const rewardAmount = redeemAmountLabel(model);
    const progress = nextThresholdProgress(model);
    const access = redemptionAccess(model);

    if (state.name === 'guest') {
      return 'Sign in to view and redeem your Candle Cash.';
    }
    if (state.name === 'coming_soon') {
      return access.message;
    }
    if (state.name === 'applied') {
      return 'Your Candle Cash is already attached to this order.';
    }
    if (state.name === 'birthday_activation') {
      return 'Your birthday reward is waiting. Activate it to use it on this order.';
    }
    if (state.name === 'ready') {
      return rewardAmount + ' is ready to apply to this order.';
    }
    if (state.name === 'redeemable') {
      return 'Redeem ' + rewardAmount + ' at a time, with a limit of ' + redemptionRules(model).maxPerOrderLabel + ' per order.';
    }
    if (state.name === 'code_only') {
      return 'Your ' + rewardAmount + ' reward code is ready.';
    }
    if (state.name === 'balance_only') {
      if (amountNumber(model.balanceAmount) >= redemptionRules(model).redeemAmount) {
        return 'You have enough Candle Cash to redeem ' + rewardAmount + '.';
      }
      if (progress && progress.done) {
        return 'You are not missing spend on this order.';
      }

      return 'You have ' + (currencyLabel(model.balanceAmount || 0) || '$0.00') + ' available. Candle Cash is redeemed in ' + rewardAmount + ' increments.';
    }
    if (model.otherRewards.length > 0) {
      return 'You have saved Candle Cash ready to review.';
    }
    return 'No Candle Cash is ready just yet.';
  }

  function summaryHeadline(model, viewState) {
    if (viewState === 'activated' || viewState === 'applied') {
      return 'Birthday Candle Cash is ready';
    }
    if (viewState === 'available') {
      return 'Your birthday reward is waiting';
    }
    if (model.otherRewards.length > 0) {
      return 'You have reward codes ready';
    }
    if (model.balanceAmount > 0) {
      return 'You have ' + (currencyLabel(model.balanceAmount || 0) || '$0.00') + ' Candle Cash';
    }
    return 'Rewards live here once they are ready';
  }

  function renderBirthdayMeta(model, viewState) {
    const issuance = model.birthdayIssuance;
    const parts = [];

    parts.push('<li><span>Reward type</span><strong>Birthday Candle Cash</strong></li>');
    parts.push('<li><span>Verification</span><strong>Birthday date capture</strong></li>');
    parts.push('<li><span>Cadence</span><strong>One reward each birthday cycle</strong></li>');

    if (issuance && issuance.reward_value) {
      parts.push('<li><span>Value</span><strong>' + escapeHtml(currencyLabel(issuance.reward_value) || issuance.reward_value) + '</strong></li>');
    }
    if (issuance && issuance.expires_at) {
      parts.push('<li><span>Expires</span><strong>' + escapeHtml(shortDate(issuance.expires_at)) + '</strong></li>');
    }
    if ((viewState === 'activated' || viewState === 'applied') && issuance && issuance.reward_code) {
      parts.push('<li><span>Code</span><strong>' + escapeHtml(issuance.reward_code) + '</strong></li>');
    }
    if (viewState === 'redeemed' && issuance && issuance.order_number) {
      parts.push('<li><span>Used on</span><strong>' + escapeHtml(issuance.order_number) + '</strong></li>');
    }

    return parts.length ? '<ul class="ForestryRewardsMeta">' + parts.join('') + '</ul>' : '';
  }

  function birthdayActionMarkup(model, viewState, uiState) {
    const issuance = model.birthdayIssuance;
    const disabled = uiState.busy ? ' disabled aria-disabled="true"' : '';

    if (viewState === 'missing_birthday') {
      return '<button class="Button Button--secondary" type="button" data-action="toggle-birthday-form"' + disabled + '>Add Birthday</button>';
    }
    if (viewState === 'available') {
      return '<button class="Button Button--primary" type="button" data-action="activate-birthday"' + disabled + '>Activate Reward</button>';
    }
    if (viewState === 'activated' && issuance && issuance.apply_path) {
      return '<button class="Button Button--primary" type="button" data-action="apply-reward" data-reward-kind="birthday" data-code="' + escapeHtml(issuance.reward_code || '') + '" data-apply-path="' + escapeHtml(issuance.apply_path) + '"' + disabled + '>Use My Birthday Coupon!</button>';
    }
    if (viewState === 'applied') {
      return '<span class="ForestryRewardsApplied">Birthday Candle Cash applied</span>';
    }
    if (viewState === 'redeemed') {
      return '<span class="ForestryRewardsApplied">Used' + (issuance && issuance.order_number ? ' on ' + escapeHtml(issuance.order_number) : '') + '</span>';
    }
    if (viewState === 'expired') {
      return '<span class="ForestryRewardsMuted">Expired</span>';
    }
    if (viewState === 'sync_failed') {
      return '<button class="Button Button--secondary" type="button" data-action="activate-birthday"' + disabled + '>Try Again</button>';
    }

    return '<span class="ForestryRewardsMuted">Not available yet</span>';
  }

  function birthdayFormMarkup(model, uiState) {
    const birthday = model.birthday || {};
    const show = uiState.formOpen || birthdayViewState(model) === 'missing_birthday';

    return '<div class="ForestryRewardsBirthdayForm' + (show ? ' is-open' : '') + '">' +
      '<div class="ForestryRewardsBirthdayForm__grid">' +
        '<label><span>Month</span><input data-field="birth-month" type="number" min="1" max="12" value="' + escapeHtml(birthday.birth_month || '') + '" placeholder="MM"></label>' +
        '<label><span>Day</span><input data-field="birth-day" type="number" min="1" max="31" value="' + escapeHtml(birthday.birth_day || '') + '" placeholder="DD"></label>' +
        '<label><span>Year</span><input data-field="birth-year" type="number" min="1900" max="2100" value="' + escapeHtml(birthday.birth_year || '') + '" placeholder="Optional"></label>' +
      '</div>' +
      '<div class="ForestryRewardsBirthdayForm__actions">' +
        '<button class="Button Button--secondary" type="button" data-action="save-birthday"' + (uiState.busy ? ' disabled aria-disabled="true"' : '') + '>Save Birthday</button>' +
      '</div>' +
    '</div>';
  }

  function rewardAmountLabel(task) {
    const amount = amountNumber(task && task.reward_amount);
    if (amount > 0) {
      return currencyLabel(amount) || '$0';
    }

    return cleanString(task && task.reward_label);
  }

  function taskState(task) {
    return normalizeState(task && task.eligibility && task.eligibility.state);
  }

  function taskResolvedState(task, model) {
    if (cleanString(task && task.handle) === 'email-signup' && model && model.consentEmail) {
      return 'completed';
    }

    if (cleanString(task && task.handle) === 'sms-signup' && model && model.consentSms) {
      return 'completed';
    }

    return taskState(task);
  }

  function taskMaxCompletions(task) {
    const explicit = positiveInt(task && (task.max_completions_per_customer || task.maxCompletionsPerCustomer));
    if (explicit) {
      return explicit;
    }

    if (taskVerificationMode(task) === 'referral_conversion' || cleanString(task && task.handle).indexOf('refer') >= 0) {
      return 999;
    }

    return 1;
  }

  function taskIsRepeatable(task) {
    return taskMaxCompletions(task) > 1;
  }

  function productReviewTask(task) {
    return cleanString(task && task.handle) === 'product-review';
  }

  function productReviewRewardWindowDays(task) {
    const days = positiveInt(task && task.metadata && task.metadata.reward_window_days);
    return days || 7;
  }

  function productReviewRewardWindowCopy(task) {
    const days = productReviewRewardWindowDays(task);

    if (days === 7) {
      return 'The first eligible website review in each 7-day window earns Candle Cash. You can still leave more reviews anytime.';
    }

    return 'The first eligible website review every ' + days + ' days earns Candle Cash. You can still leave more reviews anytime.';
  }

  function taskIsCompleted(task, model) {
    const state = taskResolvedState(task, model);
    const completedCount = positiveInt(task && task.eligibility && task.eligibility.completed_count) || 0;

    return completedCount > 0 || state === 'completed' || state === 'awarded' || state === 'approved';
  }

  function taskShouldDisplay(task, model) {
    const state = taskResolvedState(task, model);

    if (productReviewTask(task)) {
      return true;
    }

    if (state === 'pending' || state === 'completed' || state === 'awarded' || state === 'approved') {
      return false;
    }

    return true;
  }

  function visibleTasks(model) {
    return mergeArray(model && model.tasks, []).filter(function (task) {
      const handle = cleanString(task && task.handle);

      if (handle === 'birthday-signup' || handle === 'referred-friend-bonus') {
        return false;
      }

      if (handle === 'candle-club-vote' && !(model.candleClub && model.candleClub.member)) {
        return false;
      }

      return taskShouldDisplay(task, model);
    });
  }

  function taskDisplayTitle(task) {
    const handle = cleanString(task && task.handle);

    if (handle === 'product-review') {
      return 'Review on Modern Forestry Website';
    }

    return cleanString(task && task.title);
  }

  function taskRepeatabilityLabel(task) {
    if (productReviewTask(task)) {
      const days = productReviewRewardWindowDays(task);
      return days === 7 ? 'First eligible review each week' : ('First eligible review every ' + days + ' days');
    }

    const max = taskMaxCompletions(task);

    if (max > 1) {
      return max >= 999 ? 'Repeatable reward' : ('Up to ' + max + ' times');
    }

    return 'One-time reward';
  }

  function taskVerificationMode(task) {
    return cleanString(task && task.verification_mode);
  }

  function taskIsOnsiteAction(task) {
    return taskVerificationMode(task) === 'onsite_action';
  }

  function taskIsAutomatic(task) {
    if (!bool(task && task.auto_award)) {
      return false;
    }

    return [
      'system_event',
      'subscription_event',
      'referral_conversion',
      'google_business_review',
      'product_review_platform_event',
      'external_campaign_comment',
    ].indexOf(taskVerificationMode(task)) >= 0;
  }

  function taskNeedsProof(task) {
    return taskVerificationMode(task) === 'manual_review_fallback' || bool(task.requires_customer_submission) || bool(task.requires_manual_approval);
  }

  function googleReviewManualFallbackTask(task) {
    return cleanString(task && task.handle) === 'google-review' && taskVerificationMode(task) === 'manual_review_fallback';
  }

  function taskNeedsInlineEmailSignup(task, model) {
    return cleanString(task.handle) === 'email-signup' && !model.consentEmail;
  }

  function taskNeedsInlineSmsSignup(task, model) {
    return cleanString(task.handle) === 'sms-signup' && !model.consentSms;
  }

  function taskDetailCopy(task, state, model) {
    if (candleClubTask(task) && model && model.candleClub && model.candleClub.previewOnly) {
      return model.candleClub.lockMessage || 'Candle Cash';
    }
    if (productReviewTask(task)) {
      return productReviewRewardWindowCopy(task);
    }
    if (state === 'login_required') {
      return 'Sign in first and we will save your progress to the right account.';
    }
    if (state === 'locked') {
      return cleanString(task.eligibility && task.eligibility.locked_message) || 'This reward is not available on your account yet.';
    }
    if (state === 'members_only') {
      return cleanString(task.eligibility && task.eligibility.locked_message) || 'This reward is reserved for Candle Club members.';
    }
    if (state === 'pending') {
      if (googleReviewManualFallbackTask(task)) {
        return 'We saved your review details. Candle Cash lands after the team reviews it.';
      }
      return 'We recorded the action. Candle Cash lands as soon as the matching event clears.';
    }
    if (state === 'completed' || state === 'awarded' || state === 'approved') {
      return 'Already earned. We saved the Candle Cash in your account.';
    }

    if (task.handle === 'refer-a-friend') {
      const referralCount = positiveInt(model && model.referral && model.referral.count) || 0;
      const suffix = referralCount > 0
        ? ' ' + referralCount + ' referral' + (referralCount === 1 ? ' is' : 's are') + ' already tracked.'
        : '';

      return 'Share your link and you earn once a friend places a qualifying first order.' + suffix;
    }
    if (task.handle === 'birthday-signup') {
      return model.birthdayState === 'add_birthday_unlock_reward'
        ? 'Save your birthday once and we will add Candle Cash when it is complete.'
        : 'Your birthday reward card handles this for you.';
    }
    if (task.handle === 'email-signup') {
      return model.consentEmail
        ? 'You are already on the list, so this one is handled.'
        : 'Join our email list here and we will add $5 in Candle Cash once it is saved.';
    }
    if (task.handle === 'sms-signup') {
      return model.consentSms
        ? 'Text deals are already on for your account.'
        : 'Turn on text deals here and we will add Candle Cash automatically when the signup is confirmed.';
    }
    if (task.handle === 'google-review') {
      const googleReview = model && model.googleReview ? model.googleReview : {};

      if (googleReviewManualFallbackTask(task)) {
        return cleanString(googleReview.message) || 'Leave your Google review, then submit the name shown on the review plus a short snippet or the date posted. Candle Cash lands after the team reviews it.';
      }

      if (task.action_url) {
        return 'Open Google, leave your review, and we will match it automatically once it posts. Only the first Google review reward each week earns Candle Cash.';
      }

      return cleanString(googleReview.message) || 'Google review matching is not live yet.';
    }
    if (task.handle === 'product-review') {
      return 'Leave a review on the Modern Forestry website. Only the first website review reward each week earns Candle Cash.';
    }
    if (task.handle === 'second-order') {
      return 'This one lands automatically after your second order is complete.';
    }
    if (task.handle === 'candle-club-join') {
      return 'Join Candle Club and the reward lands automatically as soon as your membership is active.';
    }
    if (task.handle === 'candle-club-vote') {
      return 'Vote in the live Candle Club poll and we will add the reward as soon as your vote is recorded.';
    }
    if (taskIsAutomatic(task)) {
      return 'This reward is handled automatically when the verified trigger happens.';
    }

    return cleanString(task.description);
  }

  function taskSystemActionMarkup(root, model, task) {
    if (candleClubTask(task) && candleClubPreviewOnly(root, model)) {
      return candleClubComingSoonMarkup(root, model);
    }

    if (task.handle === 'refer-a-friend') {
      if (!model.profileId) {
        return '<a class="Button Button--secondary" href="' + escapeHtml(guestLoginUrl(root)) + '">Sign in to share</a>';
      }

      const referral = model.referral || {};
      const referralLink = cleanString(referral.link || (referral.code ? window.location.origin + '/?ref=' + encodeURIComponent(referral.code) : ''));

      if (!referralLink) {
        return '<span class="ForestryRewardsMuted">Referral link is getting ready.</span>';
      }

      return '<button class="Button Button--primary" type="button" data-action="copy-referral" data-referral-value="' + escapeHtml(referralLink) + '">Copy link</button>' +
        '<button class="Button Button--secondary" type="button" data-action="share-referral" data-referral-value="' + escapeHtml(referralLink) + '">Share</button>';
    }

    if (task.handle === 'birthday-signup') {
      return '<a class="Button Button--secondary" href="#candle-cash-birthday">Birthday reward</a>';
    }

    if (task.handle === 'google-review' && task.action_url) {
      return '<button class="Button Button--primary" type="button" data-action="start-google-review" data-task-handle="' + escapeHtml(task.handle) + '" data-open-url="' + escapeHtml(task.action_url) + '"' + (rootState(root).busy ? ' disabled aria-disabled="true"' : '') + '>' + escapeHtml(task.button_text || 'Leave a review') + '</button>';
    }

    if (task.handle === 'google-review') {
      const googleReview = model && model.googleReview ? model.googleReview : {};
      return '<span class="ForestryRewardsMuted">' + escapeHtml(cleanString(googleReview.message) || 'Google review matching is not live yet.') + '</span>';
    }

    if (task.handle === 'product-review') {
      return '<button class="Button Button--primary" type="button" data-action="open-product-review-drawer" data-task-handle="' + escapeHtml(task.handle) + '"' + (rootState(root).busy ? ' disabled aria-disabled="true"' : '') + '>Leave a product review</button>';
    }

    if (task.action_url) {
      const isAnchor = cleanString(task.action_url).charAt(0) === '#';
      return '<a class="Button Button--primary" ' + (isAnchor ? 'href="' + escapeHtml(task.action_url) + '"' : 'href="' + escapeHtml(task.action_url) + '" target="_blank" rel="noopener"') + '>' + escapeHtml(task.button_text || 'Open task') + '</a>';
    }

    return '<span class="ForestryRewardsMuted">Handled automatically</span>';
  }

  function taskProofFormMarkup(task, uiState) {
    if (uiState.openTaskHandle !== task.handle) {
      return '';
    }

    const disabled = uiState.busy ? ' disabled aria-disabled="true"' : '';
    const manualGoogleReview = googleReviewManualFallbackTask(task);
    const openLink = task.action_url
      ? '<a class="Button Button--secondary" href="' + escapeHtml(task.action_url) + '" target="_blank" rel="noopener">' + escapeHtml(manualGoogleReview ? 'Open Google review' : 'Open task') + '</a>'
      : '';

    return '<div class="ForestryRewardsTaskProof">' +
      '<div class="ForestryRewardsTaskProof__grid">' +
        '<label class="ForestryRewardsInlineField"><span>' + escapeHtml(manualGoogleReview ? 'Optional proof link' : 'Proof link') + '</span><input type="url" data-task-proof-url="' + escapeHtml(task.handle) + '" placeholder="' + escapeHtml(manualGoogleReview ? 'Paste the review link if Google gives you one' : 'Paste a review or proof link') + '"></label>' +
        '<label class="ForestryRewardsInlineField"><span>' + escapeHtml(manualGoogleReview ? 'Review details' : 'Note') + '</span><textarea rows="3" data-task-proof-text="' + escapeHtml(task.handle) + '" placeholder="' + escapeHtml(manualGoogleReview ? 'Enter the name shown on the review plus a short snippet or the date posted' : 'Anything you want the team to review?') + '"></textarea></label>' +
      '</div>' +
      '<div class="ForestryRewardsTaskProof__actions">' + openLink + '<button class="Button Button--primary" type="button" data-action="submit-task" data-task-handle="' + escapeHtml(task.handle) + '" data-task-requires-proof="1"' + disabled + '>' + escapeHtml(manualGoogleReview ? 'Submit review details' : 'Submit for review') + '</button></div>' +
    '</div>';
  }

  function emailSignupFormMarkup(root, task, uiState) {
    if (uiState.openTaskHandle !== task.handle) {
      return '';
    }

    const identity = buildIdentity(root);

    return '<div class="ForestryRewardsTaskProof">' +
      '<div class="ForestryRewardsTaskProof__grid">' +
        '<label class="ForestryRewardsInlineField"><span>Email</span><input type="email" data-task-email="' + escapeHtml(task.handle) + '" value="' + escapeHtml(identity.email || '') + '" placeholder="you@example.com"></label>' +
        '<label class="ForestryRewardsInlineField"><span>First name</span><input type="text" data-task-first-name="' + escapeHtml(task.handle) + '" value="' + escapeHtml(identity.first_name || '') + '" placeholder="First name"></label>' +
        '<label class="ForestryRewardsInlineField"><span>Last name</span><input type="text" data-task-last-name="' + escapeHtml(task.handle) + '" value="' + escapeHtml(identity.last_name || '') + '" placeholder="Last name"></label>' +
      '</div>' +
      '<div class="ForestryRewardsTaskProof__actions">' +
        '<button class="Button Button--primary" type="button" data-action="submit-email-signup" data-task-handle="' + escapeHtml(task.handle) + '"' + (uiState.busy ? ' disabled aria-disabled="true"' : '') + '>Join and get $5</button>' +
      '</div>' +
    '</div>';
  }

  function smsSignupFormMarkup(root, task, uiState) {
    if (uiState.openTaskHandle !== task.handle) {
      return '';
    }

    const identity = buildIdentity(root);

    return '<div class="ForestryRewardsTaskProof">' +
      '<div class="ForestryRewardsTaskProof__grid">' +
        '<label class="ForestryRewardsInlineField"><span>Phone</span><input type="tel" data-task-phone="' + escapeHtml(task.handle) + '" value="' + escapeHtml(identity.phone || '') + '" placeholder="(555) 555-5555"></label>' +
        '<label class="ForestryRewardsInlineField"><span>First name</span><input type="text" data-task-first-name="' + escapeHtml(task.handle) + '" value="' + escapeHtml(identity.first_name || '') + '" placeholder="First name"></label>' +
        '<label class="ForestryRewardsInlineField"><span>Last name</span><input type="text" data-task-last-name="' + escapeHtml(task.handle) + '" value="' + escapeHtml(identity.last_name || '') + '" placeholder="Last name"></label>' +
      '</div>' +
      '<div class="ForestryRewardsTaskProof__actions">' +
        '<button class="Button Button--primary" type="button" data-action="submit-sms-signup" data-task-handle="' + escapeHtml(task.handle) + '"' + (uiState.busy ? ' disabled aria-disabled="true"' : '') + '>Join texts</button>' +
      '</div>' +
    '</div>';
  }

  function taskSupplementalMarkup(root, model, task, uiState) {
    if (taskNeedsInlineEmailSignup(task, model)) {
      return emailSignupFormMarkup(root, task, uiState);
    }

    if (taskNeedsInlineSmsSignup(task, model)) {
      return smsSignupFormMarkup(root, task, uiState);
    }

    if (taskNeedsProof(task)) {
      return taskProofFormMarkup(task, uiState);
    }

    return '';
  }

  function taskActionMarkup(root, model, task, uiState) {
    const state = taskState(task);
    const disabled = uiState.busy ? ' disabled aria-disabled="true"' : '';
    const loginUrl = guestLoginUrl(root);
    const lockedUrl = cleanString(task.eligibility && task.eligibility.locked_cta_url);
    const lockedText = cleanString(task.eligibility && task.eligibility.locked_cta_text) || 'Learn more';

    if (candleClubTask(task) && candleClubPreviewOnly(root, model)) {
      return candleClubComingSoonMarkup(root, model);
    }

    if (productReviewTask(task)) {
      return taskSystemActionMarkup(root, model, task);
    }

    if (cleanString(task.handle) === 'email-signup' && model.consentEmail) {
      return '<span class="ForestryRewardsApplied">Completed</span>';
    }
    if (cleanString(task.handle) === 'sms-signup' && model.consentSms) {
      return '<span class="ForestryRewardsApplied">Completed</span>';
    }
    if (taskNeedsInlineEmailSignup(task, model)) {
      const label = uiState.openTaskHandle === task.handle ? 'Hide form' : (task.button_text || 'Join and get $5');
      return '<button class="Button Button--primary" type="button" data-action="toggle-task-form" data-task-handle="' + escapeHtml(task.handle) + '"' + disabled + '>' + escapeHtml(label) + '</button>';
    }
    if (taskNeedsInlineSmsSignup(task, model)) {
      const label = uiState.openTaskHandle === task.handle ? 'Hide form' : (task.button_text || 'Join text deals');
      return '<button class="Button Button--primary" type="button" data-action="toggle-task-form" data-task-handle="' + escapeHtml(task.handle) + '"' + disabled + '>' + escapeHtml(label) + '</button>';
    }
    if (state === 'login_required') {
      return '<a class="Button Button--secondary" href="' + escapeHtml(loginUrl) + '">Sign in</a>';
    }
    if (state === 'locked' || state === 'members_only') {
      if (lockedUrl) {
        const isAnchor = lockedUrl.charAt(0) === '#';
        return '<a class="Button Button--secondary" ' + (isAnchor ? 'href="' + escapeHtml(lockedUrl) + '"' : 'href="' + escapeHtml(lockedUrl) + '" target="_blank" rel="noopener"') + '>' + escapeHtml(lockedText) + '</a>';
      }
      return '<span class="ForestryRewardsMuted">' + escapeHtml(state === 'members_only' ? 'Members only' : 'Locked') + '</span>';
    }
    if (state === 'pending') {
      return '<span class="ForestryRewardsMuted">Waiting on verification</span>';
    }
    if (state === 'completed' || state === 'awarded' || state === 'approved') {
      return '<span class="ForestryRewardsApplied">Completed</span>';
    }

    if (taskIsAutomatic(task)) {
      return taskSystemActionMarkup(root, model, task);
    }

    if (taskNeedsProof(task)) {
      const manualGoogleReview = googleReviewManualFallbackTask(task);
      const label = uiState.openTaskHandle === task.handle
        ? 'Hide form'
        : (manualGoogleReview ? 'Submit review details' : 'Submit proof');
      const openLink = task.action_url
        ? '<a class="Button Button--secondary" href="' + escapeHtml(task.action_url) + '" target="_blank" rel="noopener">' + escapeHtml(manualGoogleReview ? 'Open Google review' : 'Open task') + '</a>'
        : '';
      return openLink + '<button class="Button Button--primary" type="button" data-action="toggle-task-form" data-task-handle="' + escapeHtml(task.handle) + '"' + disabled + '>' + escapeHtml(label) + '</button>';
    }

    if (taskIsOnsiteAction(task)) {
      return '<button class="Button Button--primary" type="button" data-action="submit-task" data-task-handle="' + escapeHtml(task.handle) + '" data-open-url="' + escapeHtml(task.action_url || '') + '"' + disabled + '>' + escapeHtml(task.button_text || 'Complete task') + '</button>';
    }

    if (task.action_url) {
      return taskSystemActionMarkup(root, model, task);
    }

    return '<span class="ForestryRewardsMuted">Handled automatically</span>';
  }

  function taskOpportunityId(task) {
    return 'task:' + cleanString(task && task.handle);
  }

  function opportunityIsExpanded(uiState, opportunityId, fallbackExpanded) {
    const activeOpportunity = cleanString(uiState && uiState.openOpportunityId);
    if (activeOpportunity) {
      return activeOpportunity === cleanString(opportunityId);
    }

    return !!fallbackExpanded;
  }

  function taskCardMarkup(root, model, task, uiState) {
    const state = taskResolvedState(task, model);
    const count = positiveInt(task.eligibility && task.eligibility.completed_count) || 0;
    const pending = positiveInt(task.eligibility && task.eligibility.pending_count) || 0;
    const rewardLabel = rewardAmountLabel(task);
    const rewardAmount = cleanString(rewardLabel);
    const repeatable = taskIsRepeatable(task);
    const completed = taskIsCompleted(task, model);
    const collapsible = cleanString(root && root.dataset && root.dataset.surface) === 'page';
    const opportunityId = taskOpportunityId(task);
    const togglePanelId = 'candle-cash-task-panel-' + cleanString(task.handle).replace(/[^a-z0-9_-]+/gi, '-');
    const summaryClass = 'ForestryRewardsOpportunitySummary ForestryRewardsOpportunitySummary--single reward-summary';
    const expanded = collapsible
      ? opportunityIsExpanded(uiState, opportunityId, cleanString(uiState.openTaskHandle) === cleanString(task.handle))
      : true;
    const cardClass = 'ForestryRewardsTaskCard ForestryRewardsTaskCard--' + escapeHtml(state || 'available') + ' reward-card' + (expanded ? ' is-open' : '');

    return '<article class="' + cardClass + '" id="candle-cash-task-' + escapeHtml(task.handle) + '" data-task-card="' + escapeHtml(task.handle) + '" data-opportunity-id="' + escapeHtml(opportunityId) + '" data-completed="' + (completed ? 'true' : 'false') + '" data-repeatable="' + (repeatable ? 'true' : 'false') + '"' + (collapsible ? ' role="button" tabindex="0" aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-controls="' + escapeHtml(togglePanelId) + '"' : '') + '>' +
      '<div class="' + summaryClass + '">' +
        '<div class="ForestryRewardsOpportunitySummary__main">' +
          '<h3 class="Heading u-h4">' + escapeHtml(taskDisplayTitle(task)) + '</h3>' +
          (rewardAmount ? '<p class="ForestryRewardsOpportunitySummary__amount">' + escapeHtml(rewardAmount) + '</p>' : '') +
        '</div>' +
      '</div>' +
      '<div class="ForestryRewardsOpportunityPanel reward-details"' + (collapsible ? ' id="' + escapeHtml(togglePanelId) + '"' : '') + '>' +
        '<p class="ForestryRewardsCard__description">' + escapeHtml(taskDetailCopy(task, state, model)) + '</p>' +
        '<div class="ForestryRewardsTaskMeta">' +
          '<span>' + escapeHtml(count > 0 ? count + ' earned' : (pending > 0 ? 'Waiting on verification' : (taskIsAutomatic(task) ? 'Tracks automatically' : 'Ready when you are'))) + '</span>' +
          '<span>' + escapeHtml(taskRepeatabilityLabel(task)) + '</span>' +
        '</div>' +
        '<div class="ForestryRewardsCard__actions">' + taskActionMarkup(root, model, task, uiState) + '</div>' +
        taskSupplementalMarkup(root, model, task, uiState) +
      '</div>' +
    '</article>';
  }

  function otherRewardItem(reward, uiState) {
    const amount = rewardAmountValue(reward)
      ? currencyLabel(rewardAmountValue(reward))
      : 'Reward code';
    const rewardCode = rewardCodeValue(reward);
    const rewardReference = rewardCode || cleanString(reward.discount_title || rewardDisplayName(reward));
    const disabled = uiState.busy ? ' disabled aria-disabled="true"' : '';
    const actions = [];

    if (reward.is_applied) {
      actions.push('<span class="ForestryRewardsApplied">Applied</span>');
      if (rewardRemovePath(reward)) {
        actions.push('<button class="Button Button--secondary" type="button" data-action="remove-reward" data-reward-kind="candle_cash" data-code="' + escapeHtml(rewardReference) + '" data-remove-path="' + escapeHtml(rewardRemovePath(reward)) + '"' + disabled + '>Remove</button>');
      }
    } else if (rewardApplyPath(reward) && reward.is_usable) {
      actions.push('<button class="Button Button--secondary" type="button" data-action="apply-reward" data-reward-kind="candle_cash" data-code="' + escapeHtml(rewardReference) + '" data-apply-path="' + escapeHtml(rewardApplyPath(reward)) + '"' + disabled + '>Apply reward</button>');
    }
    if (rewardCode) {
      actions.push('<button class="Button Button--secondary" type="button" data-action="copy-code" data-code="' + escapeHtml(rewardCode) + '">Copy code</button>');
    }

    return '<li class="ForestryRewardsList__item">' +
      '<div>' +
        '<p class="ForestryRewardsList__title">' + escapeHtml(rewardDisplayName(reward) || 'Saved Candle Cash') + '</p>' +
        '<p class="ForestryRewardsList__meta">' + escapeHtml(amount) + (reward.expires_at ? ' · Expires ' + escapeHtml(shortDate(reward.expires_at)) : '') + '</p>' +
      '</div>' +
      '<div class="ForestryRewardsList__actions">' +
        (rewardCode ? '<code>' + escapeHtml(rewardCode) + '</code>' : '') +
        actions.join('') +
      '</div>' +
    '</li>';
  }

  function helperActionMarkup(root, model, viewState, uiState) {
    const state = compactHelperState(model);
    const reward = state.reward || {};
    const rewardCode = rewardCodeValue(reward);
    const rewardReference = rewardCode || cleanString(reward.discount_title || rewardDisplayName(reward));
    const disabled = uiState.busy ? ' disabled aria-disabled="true"' : '';
    const access = redemptionAccess(model);
    const loginUrl = guestLoginUrl(root);
    const rewardsUrl = cleanString(root.dataset.rewardsUrl) || '/pages/rewards';
    const redeemLabel = 'Redeem ' + redeemAmountLabel(model) + ' Candle Cash';

    if (state.name === 'guest') {
      return '<a class="Button Button--secondary Button--full" href="' + escapeHtml(loginUrl) + '">Sign in to view Candle Cash</a>';
    }

    if (state.name === 'birthday_activation') {
      return '<button class="Button Button--primary Button--full" type="button" data-action="activate-birthday"' + disabled + '>Activate Candle Cash</button>';
    }
    if (state.name === 'coming_soon') {
      const accessMode = cleanString(access.mode).toLowerCase();
      const isPendingStatus = accessMode === 'pending_status' || cleanString(access.ctaLabel).toLowerCase() === 'check reward status';
      if (isPendingStatus) {
        return '<button class="Button Button--secondary Button--full" type="button" data-action="refresh-status"' + disabled + '>' + escapeHtml(access.ctaLabel || 'Check reward status') + '</button>';
      }

      return '<button class="Button Button--secondary Button--full" type="button" disabled aria-disabled="true" tabindex="-1">' + escapeHtml(access.ctaLabel) + '</button>';
    }
    if (state.name === 'ready') {
      return '<button class="Button Button--primary Button--full" type="button" data-action="apply-reward" data-reward-kind="' + escapeHtml(state.rewardKind || 'candle_cash') + '" data-code="' + escapeHtml(rewardReference) + '" data-apply-path="' + escapeHtml(rewardApplyPath(reward)) + '"' + disabled + '>' + escapeHtml(redeemLabel) + '</button>';
    }
    if (state.name === 'redeemable') {
      return '<button class="Button Button--primary Button--full" type="button" data-action="redeem-reward" data-reward-id="' + escapeHtml(reward.id || '') + '"' + disabled + '>' + escapeHtml(redeemLabel) + '</button>';
    }
    if (state.name === 'applied') {
      if (rewardRemovePath(reward)) {
        return '<div class="ForestryRewardsHelper__actions-wrap">' +
          '<div class="ForestryRewardsHelper__applied">Candle Cash Redeemed</div>' +
          '<button class="Button Button--secondary Button--full" type="button" data-action="remove-reward" data-reward-kind="' + escapeHtml(state.rewardKind || 'candle_cash') + '" data-code="' + escapeHtml(rewardReference) + '" data-remove-path="' + escapeHtml(rewardRemovePath(reward)) + '"' + disabled + '>Remove reward</button>' +
        '</div>';
      }
      return '<div class="ForestryRewardsHelper__applied">Candle Cash Redeemed</div>';
    }
    if (state.name === 'code_only' && rewardCode) {
      return '<button class="Button Button--secondary Button--full" type="button" data-action="copy-code" data-code="' + escapeHtml(rewardCode) + '">Copy ' + escapeHtml(redeemAmountLabel(model)) + ' code</button>';
    }
    if (state.name === 'balance_only' || state.name === 'review_rewards') {
      return '<a class="Button Button--secondary Button--full" href="' + escapeHtml(rewardsUrl) + '">Review Candle Cash</a>';
    }
    return '<a class="Button Button--secondary Button--full" href="' + escapeHtml(rewardsUrl) + '">See ways to earn</a>';
  }

  function renderUnavailable(root, title, detail) {
    const surface = cleanString(root.dataset.surface || 'page');
    const rewardsUrl = cleanString(root.dataset.rewardsUrl || root.dataset.accountUrl || '/pages/rewards');

    if (surface === 'header' || surface === 'sidebar') {
      root.innerHTML = '' +
        '<a class="ForestryRewardsHeaderLink ForestryRewardsHeaderLink--' + escapeHtml(surface) + ' ForestryRewardsHeaderLink--fallback" href="' + escapeHtml(rewardsUrl) + '">' +
          '<span class="ForestryRewardsHeaderLink__eyebrow">Candle Cash</span>' +
          '<span class="ForestryRewardsHeaderLink__value">Open rewards</span>' +
          '<span class="ForestryRewardsHeaderLink__meta">View balance</span>' +
          comingSoonNoticeMarkup(surface) +
        '</a>';
      return;
    }

    if (surface === 'cart' || surface === 'drawer') {
      root.innerHTML = '' +
        '<section class="ForestryRewardsHelper ForestryRewardsHelper--' + escapeHtml(surface) + ' ForestryRewardsHelper--fallback">' +
          comingSoonNoticeMarkup(surface) +
          '<div class="ForestryRewardsHelper__copy">' +
            '<p class="ForestryRewardsEyebrow">Candle Cash</p>' +
            '<h3 class="Heading u-h4">' + escapeHtml(title) + '</h3>' +
            '<p class="ForestryRewardsLead ForestryRewardsLead--compact">' + escapeHtml(detail) + '</p>' +
          '</div>' +
        '</section>';
      return;
    }

    root.innerHTML = '' +
      '<section class="ForestryRewardsSurface ForestryRewardsSurface--fallback">' +
        '<div class="ForestryRewardsFallback">' +
          comingSoonNoticeMarkup('page') +
          '<p class="ForestryRewardsEyebrow">Rewards</p>' +
          '<h3 class="Heading u-h3">' + escapeHtml(title) + '</h3>' +
          '<p class="ForestryRewardsLead ForestryRewardsLead--compact">' + escapeHtml(detail) + '</p>' +
        '</div>' +
      '</section>';
  }

  function centralStatsMarkup(model) {
    const rules = redemptionRules(model);
    const cards = [
      {
        label: 'Available now',
        value: model.balanceAmount > 0 ? currencyLabel(model.balanceAmount) : renderMoneySummary(model.rewardCodes, model.birthdayIssuance) || '$0',
        note: model.balanceAmount > 0 ? ('Redeem in ' + rules.redeemAmountLabel + ' steps.') : 'Ready-to-use rewards.',
      },
      {
        label: 'Saved codes',
        value: String(mergeArray(model.rewardCodes, []).length),
        note: 'Active reward codes.',
      },
      {
        label: 'Pending',
        value: String(model.summary.pending_rewards || 0),
        note: (model.summary.pending_rewards || 0) > 0 ? 'Awaiting review.' : 'Nothing pending.',
      },
      {
        label: 'Lifetime earned',
        value: currencyLabel(model.summary.lifetime_earned_amount || 0) || '$0',
        note: 'All-time rewards earned.',
      },
    ];

    return '<div class="ForestryRewardsStatGrid">' + cards.map(function (card) {
      return '<article class="ForestryRewardsStatCard">' +
        '<p class="ForestryRewardsStatLabel">' + escapeHtml(card.label) + '</p>' +
        '<p class="ForestryRewardsStatValue">' + escapeHtml(card.value) + '</p>' +
        '<p class="ForestryRewardsStatNote">' + escapeHtml(card.note) + '</p>' +
      '</article>';
    }).join('') + '</div>';
  }

  function referralCardMarkup(root, model) {
    const loginUrl = guestLoginUrl(root);
    const referral = model.referral || {};
    const referralLink = cleanString(referral.link || (referral.code ? window.location.origin + '/?ref=' + encodeURIComponent(referral.code) : ''));

    if (!model.profileId) {
      return '<article class="ForestryRewardsCard ForestryRewardsCard--referral" id="candle-cash-referrals">' +
        '<p class="ForestryRewardsCard__eyebrow">Referral rewards</p>' +
        '<h3 class="Heading u-h3">Share Candle Cash with a friend</h3>' +
        '<p class="ForestryRewardsCard__description">Sign in and we will give you a personal link you can copy in one click.</p>' +
        '<div class="ForestryRewardsCard__actions"><a class="Button Button--primary" href="' + escapeHtml(loginUrl) + '">Sign in to share</a></div>' +
      '</article>';
    }

    return '<article class="ForestryRewardsCard ForestryRewardsCard--referral" id="candle-cash-referrals">' +
      '<div class="ForestryRewardsCard__header">' +
        '<div>' +
          '<p class="ForestryRewardsCard__eyebrow">Referral rewards</p>' +
          '<h3 class="Heading u-h3">' + escapeHtml(referral.headline || 'Share Candle Cash with a friend') + '</h3>' +
        '</div>' +
      '</div>' +
      '<p class="ForestryRewardsCard__description">' + escapeHtml(referral.copy || 'Share your link and earn Candle Cash when a friend places a qualifying first order.') + '</p>' +
      '<div class="ForestryRewardsReferralSplit">' +
        '<div><span>You earn</span><strong>$5</strong></div>' +
        '<div><span>Friend earns</span><strong>$10</strong></div>' +
      '</div>' +
      '<div class="ForestryRewardsReferralCode">' +
        '<code>' + escapeHtml(referralLink || referral.code || '') + '</code>' +
        '<button class="Button Button--secondary" type="button" data-action="copy-referral" data-referral-value="' + escapeHtml(referralLink || referral.code || '') + '">Copy link</button>' +
        '<button class="Button Button--secondary" type="button" data-action="share-referral" data-referral-value="' + escapeHtml(referralLink || referral.code || '') + '">Share</button>' +
      '</div>' +
      '<div class="ForestryRewardsReferralFoot">' + escapeHtml((referral.count || 0) + ' referral' + ((referral.count || 0) === 1 ? '' : 's') + ' tracked so far') + '</div>' +
    '</article>';
  }

  function guestCalloutMarkup(root) {
    const loginUrl = guestLoginUrl(root);

    return '<div class="ForestryRewardsGuestCallout">' +
      '<div>' +
        '<p class="ForestryRewardsCard__eyebrow">Sign in</p>' +
        '<p class="ForestryRewardsCard__description">Unlock your live balance and next reward actions.</p>' +
      '</div>' +
      '<a class="Button Button--primary" href="' + escapeHtml(loginUrl) + '">Sign in</a>' +
    '</div>';
  }

  function statusSignInCardMarkup(root) {
    const loginUrl = guestLoginUrl(root);

    return '<article class="ForestryRewardsCard ForestryRewardsCard--balance">' +
      '<div class="ForestryRewardsCard__header">' +
        '<div><p class="ForestryRewardsCard__eyebrow">Account snapshot</p><h3 class="Heading u-h4">Sign in to view status</h3></div>' +
      '</div>' +
      '<p class="ForestryRewardsCard__description">Balance, saved codes, and activity appear here after sign-in.</p>' +
      '<div class="ForestryRewardsCard__actions"><a class="Button Button--primary" href="' + escapeHtml(loginUrl) + '">Sign in</a></div>' +
    '</article>';
  }

  function statusSnapshotCardMarkup(model, root) {
    const wallet = walletLabel(model, root);

    return '<article class="ForestryRewardsCard ForestryRewardsCard--balance">' +
      '<div class="ForestryRewardsCard__header">' +
        '<div><p class="ForestryRewardsCard__eyebrow">Account snapshot</p><h3 class="Heading u-h4">' + escapeHtml(wallet) + '</h3></div>' +
      '</div>' +
      '<p class="ForestryRewardsCard__amount">' + escapeHtml(currencyLabel(model.balanceAmount || 0) || '$0') + '</p>' +
      '<div class="ForestryRewardsSnapshot">' +
        '<div><span>Email</span><strong>' + escapeHtml(model.consentEmail ? 'On' : 'Off') + '</strong></div>' +
        '<div><span>Texts</span><strong>' + escapeHtml(model.consentSms ? 'On' : 'Off') + '</strong></div>' +
        '<div><span>Pending</span><strong>' + escapeHtml(String(model.summary.pending_rewards || 0)) + '</strong></div>' +
      '</div>' +
    '</article>';
  }

  function statusRulesCardMarkup(root, model) {
    const rules = redemptionRules(model);
    const expiration = expirationDetails(model);
    const approval = cleanString(model.copy.faq_approval_copy).replace(/\.$/, '') || '1 to 3 business days';
    const expirationLabel = expiration && expiration.days
      ? (expiration.days + ' day' + (expiration.days === 1 ? '' : 's') + ' after earned')
      : (expiration && expiration.date ? shortDate(expiration.date) : 'Store rules apply');

    return '<article class="ForestryRewardsCard ForestryRewardsCard--history">' +
      '<div class="ForestryRewardsCard__header">' +
        '<div><p class="ForestryRewardsCard__eyebrow">Program rules</p><h3 class="Heading u-h4">How it works</h3></div>' +
      '</div>' +
      '<ul class="ForestryRewardsMeta">' +
        '<li><span>Redeem at a time</span><strong>' + escapeHtml(rules.redeemAmountLabel) + '</strong></li>' +
        '<li><span>Per order limit</span><strong>' + escapeHtml(rules.maxPerOrderLabel) + '</strong></li>' +
        '<li><span>Approvals</span><strong>' + escapeHtml(approval) + '</strong></li>' +
        '<li><span>Expiration</span><strong>' + escapeHtml(expirationLabel) + '</strong></li>' +
      '</ul>' +
    '</article>';
  }

  function statusSavedCodesCardMarkup(model, uiState) {
    return '<article class="ForestryRewardsCard ForestryRewardsCard--list">' +
      '<div class="ForestryRewardsCard__header">' +
        '<div><p class="ForestryRewardsCard__eyebrow">Saved rewards</p><h3 class="Heading u-h4">Saved reward codes</h3></div>' +
      '</div>' +
      '<ul class="ForestryRewardsList">' +
        (model.rewardCodes.length ? model.rewardCodes.map(function (reward) { return otherRewardItem(reward, uiState); }).join('') : '<li class="ForestryRewardsList__empty">No active codes.</li>') +
      '</ul>' +
    '</article>';
  }

  function statusReferralCardMarkup(model) {
    const referral = model.referral || {};
    const referrerReward = currencyLabel(referral.referrer_reward_amount || 5) || '$5';
    const referredReward = currencyLabel(referral.referred_reward_amount || 10) || '$10';
    const tracked = positiveInt(referral.count) || 0;
    const description = model.profileId
      ? 'Use the refer-a-friend task in Tasks to copy or share your link.'
      : 'Sign in to view your referral progress.';

    return '<article class="ForestryRewardsCard ForestryRewardsCard--referral">' +
      '<div class="ForestryRewardsCard__header">' +
        '<div><p class="ForestryRewardsCard__eyebrow">Referral status</p><h3 class="Heading u-h4">Friend rewards</h3></div>' +
      '</div>' +
      '<div class="ForestryRewardsReferralSplit">' +
        '<div><span>You earn</span><strong>' + escapeHtml(referrerReward) + '</strong></div>' +
        '<div><span>Friend earns</span><strong>' + escapeHtml(referredReward) + '</strong></div>' +
      '</div>' +
      '<div class="ForestryRewardsReferralFoot">' + escapeHtml(String(tracked) + ' tracked referral' + (tracked === 1 ? '' : 's')) + '</div>' +
      '<p class="ForestryRewardsCard__description">' + escapeHtml(description) + '</p>' +
    '</article>';
  }

  function statusLedgerCardMarkup(model) {
    return '<article class="ForestryRewardsCard ForestryRewardsCard--history">' +
      '<div class="ForestryRewardsCard__header">' +
        '<div><p class="ForestryRewardsCard__eyebrow">History</p><h3 class="Heading u-h4">Earned and used</h3></div>' +
      '</div>' +
      '<div class="ForestryRewardsHistoryStack">' + historyLedgerMarkup(model) + '</div>' +
    '</article>';
  }

  function statusTaskHistoryCardMarkup(model) {
    return '<article class="ForestryRewardsCard ForestryRewardsCard--history">' +
      '<div class="ForestryRewardsCard__header">' +
        '<div><p class="ForestryRewardsCard__eyebrow">Task activity</p><h3 class="Heading u-h4">Pending and completed</h3></div>' +
      '</div>' +
      '<div class="ForestryRewardsHistoryStack">' + historyTasksMarkup(model) + '</div>' +
    '</article>';
  }

  function historyTasksMarkup(model) {
    if (!model.taskHistory.length) {
      return '<div class="ForestryRewardsHistoryEmpty">No task history yet.</div>';
    }

    return model.taskHistory.slice(0, 8).map(function (row) {
      const status = titleCaseSlug(row.status || 'pending');
      const date = row.awarded_at || row.created_at;
      return '<div class="ForestryRewardsHistoryItem">' +
        '<div>' +
          '<strong>' + escapeHtml(row.task_title || 'Task') + '</strong>' +
          '<p>' + escapeHtml(status) + (date ? ' · ' + shortDate(date) : '') + '</p>' +
        '</div>' +
        '<span>' + escapeHtml(row.reward_amount ? currencyLabel(row.reward_amount) || row.reward_amount : '') + '</span>' +
      '</div>';
    }).join('');
  }

  function historyLedgerMarkup(model) {
    if (!model.ledgerHistory.length) {
      return '<div class="ForestryRewardsHistoryEmpty">No earned or redeemed history yet.</div>';
    }

    return model.ledgerHistory.slice(0, 8).map(function (row) {
      const rawPoints = Number.parseInt(String(row.raw_points || row.points || 0), 10) || 0;
      const label = cleanString(row.signed_candle_cash_amount_formatted) || ((rawPoints >= 0 ? '+' : '-') + (currencyLabel(amountNumber(row.candle_cash_amount || row.amount || 0)) || '$0.00'));
      return '<div class="ForestryRewardsHistoryItem">' +
        '<div>' +
          '<strong>' + escapeHtml(row.description || 'Candle Cash activity') + '</strong>' +
          '<p>' + escapeHtml(shortDate(row.created_at)) + '</p>' +
        '</div>' +
        '<span>' + escapeHtml(label) + '</span>' +
      '</div>';
    }).join('');
  }

  function faqMarkup(model) {
    const rules = redemptionRules(model);
    const items = [
      {
        q: 'How long do approvals take?',
        a: cleanString(model.copy.faq_approval_copy) || 'Manual approvals usually land within 1 to 3 business days.',
      },
      {
        q: 'How does redemption work?',
        a: cleanString(model.copy.faq_stack_copy) || ('Candle Cash is redeemed in ' + rules.redeemAmountLabel + ' increments, with a limit of ' + rules.maxPerOrderLabel + ' per order.'),
      },
      {
        q: 'Where do pending tasks show up?',
        a: cleanString(model.copy.faq_pending_copy) || 'Pending tasks stay in your history until they are approved or declined.',
      },
    ];

    return '<div class="ForestryRewardsFaq">' + items.map(function (item) {
      return '<article class="ForestryRewardsFaq__item"><h3 class="Heading u-h5">' + escapeHtml(item.q) + '</h3><p class="ForestryRewardsCard__description">' + escapeHtml(item.a) + '</p></article>';
    }).join('') + '</div>';
  }

  function serializedHistoryEntry(row) {
    if (!row || typeof row !== 'object') {
      return '';
    }

    try {
      return JSON.stringify(row).toLowerCase();
    } catch (error) {
      return '';
    }
  }

  function isStorefrontHiddenHistoryEntry(row) {
    // Storefront customers should not see migration bookkeeping. Backstage keeps the raw ledger.
    if (!row || typeof row !== 'object') {
      return false;
    }

    const haystack = serializedHistoryEntry(row);
    const internalAudience = bool(row.internal_only) || normalizeState(row.visibility) === 'internal' || normalizeState(row.audience) === 'internal';
    const negativeValue = amountNumber(row.points) < 0 || amountNumber(row.amount) < 0 || amountNumber(row.delta) < 0;
    const bookkeepingKeywords = [
      'rebase',
      'legacy',
      'migration',
      'conversion',
      'bookkeeping',
      'bank style',
      'bank-style',
      'factor 0.333',
    ];

    if (internalAudience) {
      return true;
    }

    if (bookkeepingKeywords.some(function (keyword) { return haystack.indexOf(keyword) >= 0; })) {
      return true;
    }

    if (negativeValue && (
      haystack.indexOf('adjustment') >= 0 ||
      haystack.indexOf('balance correction') >= 0 ||
      haystack.indexOf('balance update') >= 0 ||
      haystack.indexOf('legacy candle cash') >= 0
    )) {
      return true;
    }

    return false;
  }

  function storefrontVisibleRows(rows) {
    return mergeArray(rows, []).filter(function (row) {
      return !isStorefrontHiddenHistoryEntry(row);
    });
  }

  function expirationDetails(model) {
    const amount = amountNumber(model.expiringBalanceAmount || model.balanceAmount);
    const days = positiveInt(model.expirationDays);
    const date = cleanString(model.expirationDate);

    if (!(amount > 0) || (!days && !date)) {
      return null;
    }

    return {
      amount: amount,
      amountLabel: currencyLabel(amount),
      days: days,
      date: date,
    };
  }

  function expirationNoticeMarkup(model, tone) {
    const detail = expirationDetails(model);
    if (!detail) {
      return '';
    }

    const suffix = detail.days
      ? 'expires in ' + detail.days + ' day' + (detail.days === 1 ? '' : 's')
      : 'expires on ' + shortDate(detail.date);

    return '<p class="ForestryRewardsNotice ForestryRewardsNotice--' + escapeHtml(tone || 'default') + '">Your ' +
      escapeHtml(detail.amountLabel || '$0') + ' Candle Cash ' + escapeHtml(suffix) +
    '</p>';
  }

  function walletRulesCopy(model, root) {
    const rules = redemptionRules(model);
    const label = rewardsLabel(model, root);
    const detail = expirationDetails(model);
    const parts = [
      label + ' can be redeemed in ' + rules.redeemAmountLabel + ' increments, with a limit of ' + rules.maxPerOrderLabel + ' per order.',
    ];

    if (detail && detail.days) {
      parts.push(label + ' expires ' + detail.days + ' day' + (detail.days === 1 ? '' : 's') + ' after you earn it.');
    } else if (detail && detail.date) {
      parts.push('Some available ' + label.toLowerCase() + ' expires on ' + shortDate(detail.date) + '.');
    } else {
      parts.push(label + ' expiration follows your store settings from the day it is earned.');
    }

    return parts.join(' ');
  }

  function filteredTaskHistory(model) {
    return mergeArray(model && model.taskHistory, []).filter(function (row) {
      const status = normalizeState(row && row.status);
      return status === 'pending' || status === 'awarded' || status === 'approved' || status === 'completed';
    });
  }

  function compactTaskHistoryMarkup(model) {
    const rows = filteredTaskHistory(model).slice(0, 6);
    if (!rows.length) {
      return '<div class="ForestryRewardsHistoryEmpty">No recent task activity yet.</div>';
    }

    return '<div class="ForestryRewardsTaskTimeline">' + rows.map(function (row) {
      const when = shortDate(row.awarded_at || row.created_at);
      const pending = normalizeState(row.status) === 'pending';
      const reward = amountNumber(row.reward_amount);
      const rewardText = pending
        ? 'Pending review'
        : (reward > 0 ? ('+' + (currencyLabel(reward) || '$0')) : 'Completed');

      return '<div class="ForestryRewardsTaskTimeline__item">' +
        '<strong>' + escapeHtml(row.task_title || 'Task') + '</strong>' +
        '<span>' + escapeHtml(rewardText + (when ? ' · ' + when : '')) + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function candleClubPreviewOnly(root, model) {
    const datasetValue = cleanString(root && root.dataset && root.dataset.candleClubPreviewOnly);

    if (datasetValue) {
      return datasetValue.toLowerCase() === 'true';
    }

    return !!(model && model.candleClub && model.candleClub.previewOnly);
  }

  function candleClubLockMessage(root, model) {
    return cleanString((model && model.candleClub && model.candleClub.lockMessage) || (root && root.dataset && root.dataset.candleClubLockMessage) || 'Candle Cash') || 'Candle Cash';
  }

  function candleClubTask(task) {
    const handle = cleanString(task && task.handle);
    return handle === 'candle-club-join' || handle === 'candle-club-vote';
  }

  function candleClubComingSoonMarkup(root, model) {
    return '<span class="CandleClubAccessNotice CandleClubAccessNotice--compact"><span class="CandleClubAccessNotice__label">' + escapeHtml(candleClubLockMessage(root, model)) + '</span></span>';
  }

  function clubBannerMarkup(root, model, tone) {
    const membership = model.candleClub || {};
    const member = !!membership.member;
    const previewOnly = candleClubPreviewOnly(root, model);
    const title = member
      ? cleanString(membership.memberHeadline) || 'Candle Club Members earn 2x Candle Cash'
      : cleanString(membership.guestHeadline) || 'Candle Club Members earn 2x Candle Cash';
    const copy = member
      ? cleanString(membership.memberCopy) || 'Members unlock bonus rewards and exclusive voting perks.'
      : cleanString(membership.guestCopy) || 'Members unlock bonus rewards and exclusive voting perks.';
    const ctaUrl = cleanString(membership.ctaUrl || root.dataset.candleClubUrl || DEFAULT_CANDLE_CLUB_URL);
    const ctaText = cleanString(membership.ctaText) || 'Explore Candle Club';

    return '<div class="ForestryRewardsClub ForestryRewardsClub--' + escapeHtml(tone || 'default') + '">' +
      '<div>' +
        '<p class="ForestryRewardsClub__eyebrow">Candle Club</p>' +
        '<p class="ForestryRewardsClub__headline">' + escapeHtml(title) + '</p>' +
        '<p class="ForestryRewardsClub__copy">' + escapeHtml(copy) + '</p>' +
      '</div>' +
      (!member ? (previewOnly ? candleClubComingSoonMarkup(root, model) : '<a class="ForestryRewardsClub__cta" href="' + escapeHtml(ctaUrl) + '">' + escapeHtml(ctaText) + '</a>') : '<span class="ForestryRewardsClub__badge">2x member</span>') +
    '</div>';
  }

  function normalizedThresholds(model) {
    return (Array.isArray(model.thresholds) ? model.thresholds : [])
      .map(function (threshold) {
        return Object.assign({}, threshold, {
          spendAmount: amountNumber(threshold.spend_amount || threshold.spendAmount),
          rewardAmount: amountNumber(threshold.reward_amount || threshold.rewardAmount),
          rewardType: cleanString(threshold.reward_type || threshold.rewardType || 'candle_cash') || 'candle_cash',
          rewardLabel: cleanString(threshold.reward_label || threshold.rewardLabel),
        });
      })
      .filter(function (threshold) {
        return threshold.spendAmount > 0;
      })
      .sort(function (left, right) {
        return left.spendAmount - right.spendAmount;
      });
  }

  function thresholdRewardLabel(threshold) {
    if (!threshold) {
      return '';
    }

    if (cleanString(threshold.rewardType) === 'gift') {
      return cleanString(threshold.rewardLabel) || 'free wax melt';
    }

    if (threshold.rewardAmount > 0) {
      return (currencyLabel(threshold.rewardAmount) || '$0') + ' Candle Cash';
    }

    return cleanString(threshold.rewardLabel);
  }

  function nextThresholdProgress(model) {
    const thresholds = normalizedThresholds(model);
    const total = amountNumber(model.cartTotalAmount);

    if (!thresholds.length) {
      return null;
    }

    const next = thresholds.find(function (threshold) {
      return total < threshold.spendAmount;
    });

    if (!next) {
      return {
        done: true,
        total: total,
        last: thresholds[thresholds.length - 1],
      };
    }

    const currentIndex = thresholds.indexOf(next);
    const previous = currentIndex > 0 ? thresholds[currentIndex - 1] : null;
    const floor = previous ? previous.spendAmount : 0;
    const span = Math.max(next.spendAmount - floor, 1);
    const progress = Math.max(0, Math.min(100, ((total - floor) / span) * 100));

    return {
      done: false,
      total: total,
      next: next,
      previous: previous,
      remaining: Math.max(next.spendAmount - total, 0),
      progress: progress,
    };
  }

  function progressMarkup(model) {
    const progress = nextThresholdProgress(model);
    if (!progress) {
      return '<div class="ForestryRewardsProgress ForestryRewardsProgress--fallback"><p class="ForestryRewardsProgress__message">No active Candle Cash thresholds right now.</p></div>';
    }

    if (progress.done) {
      return '<div class="ForestryRewardsProgress ForestryRewardsProgress--complete">' +
        '<p class="ForestryRewardsProgress__message">You unlocked every active Candle Cash reward in this cart.</p>' +
        '<div class="ForestryRewardsProgress__bar" aria-hidden="true"><span style="width:100%"></span></div>' +
      '</div>';
    }

    const rewardLabel = thresholdRewardLabel(progress.next);
    const remainingLabel = currencyLabel(progress.remaining) || '$0';
    let message = 'You’re ' + remainingLabel + ' away from earning ' + rewardLabel + '.';

    if (cleanString(progress.next.rewardType) === 'gift') {
      if (amountNumber(model.balanceAmount) > 0) {
        message = 'You have ' + (currencyLabel(model.balanceAmount) || '$0') + ' Candle Cash. Add ' + remainingLabel + ' more to unlock ' + rewardLabel + '.';
      } else {
        message = 'Add ' + remainingLabel + ' more to unlock ' + rewardLabel + '.';
      }
    }

    return '<div class="ForestryRewardsProgress">' +
      '<p class="ForestryRewardsProgress__message">' + escapeHtml(message) + '</p>' +
      '<div class="ForestryRewardsProgress__bar" aria-hidden="true"><span style="width:' + progress.progress.toFixed(2) + '%"></span></div>' +
    '</div>';
  }

  function orderCelebration(model) {
    const configured = model.celebrationState || {};
    if (configured.enabled) {
      return configured;
    }

    if (!model.orderContext || !(model.orderContext.totalAmount > 0)) {
      return null;
    }

    const age = Number.parseInt(String(model.orderContext.createdAt || 0), 10);
    if (age && ((Date.now() / 1000) - age) > 14 * 24 * 60 * 60) {
      return null;
    }

    const earned = normalizedThresholds(model)
      .filter(function (threshold) {
        return cleanString(threshold.rewardType) === 'candle_cash' && model.orderContext.totalAmount >= threshold.spendAmount;
      })
      .slice(-1)[0];

    if (!earned || !(earned.rewardAmount > 0)) {
      return {
        enabled: true,
        headline: 'Thanks for your order',
        body: 'Your latest Candle Cash activity will settle here as soon as the order finishes posting.',
        amount: 0,
      };
    }

    return {
      enabled: true,
      headline: 'You earned ' + (currencyLabel(earned.rewardAmount) || '$0') + ' Candle Cash',
      body: 'We will add it to your balance as soon as order ' + cleanString(model.orderContext.number || '') + ' fully posts.',
      amount: earned.rewardAmount,
    };
  }

  function celebrationMarkup(model, uiState, surface) {
    const source = surface === 'order' ? orderCelebration(model) : (model.celebrationState || {});
    if (!source || !source.enabled) {
      return '';
    }

    const body = cleanString(source.body) || (amountNumber(source.amount) > 0 && amountNumber(model.balanceAmount) > 0
      ? 'Your balance is now ' + (currencyLabel(model.balanceAmount) || '$0') + '.'
      : '');

    return '<div class="ForestryRewardsCelebration ForestryRewardsCelebration--' + escapeHtml(surface || 'default') + '">' +
      '<p class="ForestryRewardsCelebration__eyebrow">Candle Cash</p>' +
      '<h3 class="Heading u-h4">' + escapeHtml(cleanString(source.headline) || 'You earned Candle Cash') + '</h3>' +
      (body ? '<p class="ForestryRewardsCelebration__copy">' + escapeHtml(body) + '</p>' : '') +
      (uiState && uiState.toast && uiState.toastTone === 'success' ? '<p class="ForestryRewardsCelebration__note">' + escapeHtml(uiState.toast) + '</p>' : '') +
    '</div>';
  }

  function availableBalanceHeadline(model) {
    if (!model.profileId) {
      return 'Sign in to view your Candle Cash';
    }

    const amountLabel = currencyLabel(model.balanceAmount || 0) || '$0';
    return amountNumber(model.balanceAmount) > 0
      ? 'You have ' + amountLabel + ' Candle Cash'
      : 'Available Candle Cash: ' + amountLabel;
  }

  function utilityMarkup(parts) {
    const content = (Array.isArray(parts) ? parts : []).filter(Boolean).join('');
    return content ? '<div class="ForestryRewardsSurface__utility">' + content + '</div>' : '';
  }

  function comingSoonNoticeMarkup(surface) {
    if (surface === 'header') {
      return '';
    }

    const tone = surface === 'sidebar' ? 'compact' : 'default';

    return '<div class="ForestryRewardsComingSoon ForestryRewardsComingSoon--' + escapeHtml(tone) + '">' +
      '<span>Candle Cash</span>' +
    '</div>';
  }

  function birthdayOpportunityMarkup(model, uiState) {
    const viewState = birthdayViewState(model);
    const expanded = opportunityIsExpanded(uiState, 'birthday', false) || !!(uiState && uiState.formOpen);
    const completed = viewState === 'applied' || viewState === 'redeemed';
    const cardClass = 'ForestryRewardsCard ForestryRewardsCard--birthday' + (completed ? ' ForestryRewardsCard--complete' : '') + ' reward-card' + (expanded ? ' is-open' : '');

    return '' +
      '<article class="' + cardClass + '" id="candle-cash-birthday" data-opportunity-card="birthday" data-opportunity-id="birthday" role="button" tabindex="0" aria-expanded="' + (expanded ? 'true' : 'false') + '" aria-controls="candle-cash-birthday-panel">' +
        '<div class="ForestryRewardsOpportunitySummary ForestryRewardsOpportunitySummary--single reward-summary">' +
          '<div class="ForestryRewardsOpportunitySummary__main">' +
            '<p class="ForestryRewardsCard__eyebrow">Birthday reward</p>' +
            '<h3 class="Heading u-h4">' + escapeHtml((model.birthdayIssuance && model.birthdayIssuance.reward_name) || 'Birthday Candle Cash') + '</h3>' +
            '<p class="ForestryRewardsOpportunitySummary__amount">' + escapeHtml(model.birthdayIssuance && model.birthdayIssuance.reward_value ? currencyLabel(model.birthdayIssuance.reward_value) : '$10') + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="ForestryRewardsOpportunityPanel reward-details" id="candle-cash-birthday-panel">' +
          '<p class="ForestryRewardsCard__description">' + escapeHtml(rewardCardDescription(model, viewState)) + '</p>' +
          renderBirthdayMeta(model, viewState) +
          '<div class="ForestryRewardsCard__actions">' + birthdayActionMarkup(model, viewState, uiState) + '</div>' +
          birthdayFormMarkup(model, uiState) +
        '</div>' +
      '</article>';
  }

  function tasksPanelMarkup(root, model, uiState, ids) {
    const cards = [birthdayOpportunityMarkup(model, uiState)].concat(
      visibleTasks(model).map(function (task) {
        return taskCardMarkup(root, model, task, uiState);
      })
    ).filter(Boolean);
    const utilities = utilityMarkup([
      celebrationMarkup(model, uiState, 'page'),
      !model.profileId ? guestCalloutMarkup(root) : '',
    ]);

    return '<section class="ForestryRewardsTabPanel ForestryRewardsTasksPanel" id="' + escapeHtml(ids.tasksPanel) + '" role="tabpanel" aria-labelledby="' + escapeHtml(ids.tasksTab) + '"' + (pageTabState(uiState) === 'tasks' ? '' : ' hidden') + '>' +
      utilities +
      '<div class="ForestryRewardsTaskGrid ForestryRewardsTaskGrid--page">' +
        (cards.length ? cards.join('') : '<div class="ForestryRewardsHistoryEmpty">No active opportunities.</div>') +
      '</div>' +
    '</section>';
  }

  function statusPanelMarkup(root, model, uiState, ids) {
    const accountCards = model.profileId
      ? (statusSnapshotCardMarkup(model, root) + statusRulesCardMarkup(root, model))
      : (statusSignInCardMarkup(root) + statusRulesCardMarkup(root, model));
    const utilities = utilityMarkup([
      expirationNoticeMarkup(model, 'page'),
    ]);

    return '<section class="ForestryRewardsTabPanel ForestryRewardsStatusPanel" id="' + escapeHtml(ids.statusPanel) + '" role="tabpanel" aria-labelledby="' + escapeHtml(ids.statusTab) + '"' + (pageTabState(uiState) === 'status' ? '' : ' hidden') + '>' +
      utilities +
      '<section class="ForestryRewardsSection">' +
        '<div class="ForestryRewardsSection__header">' +
          '<div><p class="ForestryRewardsCard__eyebrow">Status</p><h3 class="Heading u-h3">Account</h3></div>' +
        '</div>' +
        (model.profileId ? centralStatsMarkup(model) : '') +
        '<div class="ForestryRewardsWalletGrid ForestryRewardsWalletGrid--status">' +
          accountCards +
        '</div>' +
      '</section>' +
      (model.profileId ? (
        '<section class="ForestryRewardsSection">' +
          '<div class="ForestryRewardsSection__header">' +
            '<div><p class="ForestryRewardsCard__eyebrow">Status</p><h3 class="Heading u-h3">Saved</h3></div>' +
          '</div>' +
          '<div class="ForestryRewardsWalletGrid ForestryRewardsWalletGrid--status">' +
            statusSavedCodesCardMarkup(model, uiState) +
            statusReferralCardMarkup(model) +
          '</div>' +
        '</section>' +
        '<section class="ForestryRewardsSection">' +
          '<div class="ForestryRewardsSection__header">' +
            '<div><p class="ForestryRewardsCard__eyebrow">Status</p><h3 class="Heading u-h3">Activity</h3></div>' +
          '</div>' +
          '<div class="ForestryRewardsWalletGrid ForestryRewardsWalletGrid--status">' +
            statusLedgerCardMarkup(model) +
            statusTaskHistoryCardMarkup(model) +
          '</div>' +
        '</section>'
      ) : '') +
    '</section>';
  }

  function renderCentralSurface(root, model, uiState) {
    const activeTab = pageTabState(uiState);
    const ids = pageTabIds(root);
    const title = cleanString(model.copy.title) || cleanString(root.dataset.title) || 'Candle Cash Central';
    const lead = activeTab === 'status'
      ? (model.profileId ? 'Balance, codes, rules, and recent activity.' : 'Sign in to view your rewards status.')
      : (model.profileId ? 'Open a card to take the next step.' : 'Sign in to unlock your next reward action.');

    root.innerHTML = '' +
      '<section class="ForestryRewardsSurface ForestryRewardsSurface--page">' +
        '<div class="ForestryRewardsSurface__hero ForestryRewardsSurface__hero--page">' +
          '<div class="ForestryRewardsSurface__hero-main">' +
            '<p class="ForestryRewardsEyebrow">Rewards</p>' +
            '<h2 class="Heading u-h1">' + escapeHtml(title) + '</h2>' +
            '<p class="ForestryRewardsLead">' + escapeHtml(lead) + '</p>' +
          '</div>' +
          themeToggleMarkup(root, uiState) +
        '</div>' +
        pageTabsMarkup(root, activeTab) +
        '<div class="ForestryRewardsTabPanels">' +
          tasksPanelMarkup(root, model, uiState, ids) +
          statusPanelMarkup(root, model, uiState, ids) +
        '</div>' +
        (uiState.toast ? '<div class="ForestryRewardsToast ForestryRewardsToast--' + escapeHtml(uiState.toastTone || 'neutral') + '">' + escapeHtml(uiState.toast) + '</div>' : '') +
      '</section>';
  }

  function renderAccountSurface(root, model, uiState) {
    const label = rewardsLabel(model, root);
    const wallet = walletLabel(model, root);
    const title = cleanString(model.copy.title) || (label + ' Central');
    const rewardsUrl = cleanString(root.dataset.rewardsUrl || '/pages/rewards');
    const balanceLabel = currencyLabel(model.balanceAmount || 0) || '$0';
    const activeCodes = mergeArray(model.rewardCodes, []).length;
    const utilities = utilityMarkup([
      celebrationMarkup(model, uiState, 'account'),
      expirationNoticeMarkup(model, 'account'),
      clubBannerMarkup(root, model, 'account'),
    ]);

    root.innerHTML = '' +
      '<section class="ForestryRewardsSurface ForestryRewardsSurface--account" id="candle-cash-wallet">' +
        comingSoonNoticeMarkup('account') +
        themeToggleMarkup(root, uiState) +
        '<div class="ForestryRewardsSurface__hero">' +
          '<div>' +
            '<p class="ForestryRewardsEyebrow">Your wallet</p>' +
            '<h2 class="Heading u-h2">' + escapeHtml(wallet) + '</h2>' +
            '<p class="ForestryRewardsLead">See your balance, how much ' + escapeHtml(label.toLowerCase()) + ' you have used, and what your recent orders saved.</p>' +
          '</div>' +
          '<div class="ForestryRewardsSurface__summary">' +
            '<p class="ForestryRewardsStatLabel">Balance</p>' +
            '<p class="ForestryRewardsStatValue">' + escapeHtml(balanceLabel) + '</p>' +
            '<p class="ForestryRewardsStatNote">' + escapeHtml(walletRulesCopy(model, root)) + '</p>' +
            '<div class="ForestryRewardsCard__actions"><a class="Button Button--primary Button--full" href="' + escapeHtml(rewardsUrl) + '">' + escapeHtml(earnMoreRewardsLabel(model, root)) + '</a></div>' +
          '</div>' +
        '</div>' +
        utilities +
        '<div class="ForestryRewardsWalletGrid">' +
          '<article class="ForestryRewardsCard ForestryRewardsCard--balance">' +
            '<div class="ForestryRewardsCard__header">' +
              '<div><p class="ForestryRewardsCard__eyebrow">Wallet balance</p><h3 class="Heading u-h4">' + escapeHtml(wallet) + '</h3></div>' +
            '</div>' +
            '<p class="ForestryRewardsCard__amount">' + escapeHtml(balanceLabel) + '</p>' +
            '<p class="ForestryRewardsCard__description">' + escapeHtml(walletRulesCopy(model, root)) + '</p>' +
            '<ul class="ForestryRewardsMeta">' +
              '<li><span>Redeem at a time</span><strong>' + escapeHtml(redeemAmountLabel(model)) + '</strong></li>' +
              '<li><span>Per order limit</span><strong>' + escapeHtml(redemptionRules(model).maxPerOrderLabel) + '</strong></li>' +
              '<li><span>Pending rewards</span><strong>' + escapeHtml(String(model.summary.pending_rewards || 0)) + '</strong></li>' +
            '</ul>' +
          '</article>' +
          '<article class="ForestryRewardsCard ForestryRewardsCard--history">' +
            '<div class="ForestryRewardsCard__header">' +
              '<div><p class="ForestryRewardsCard__eyebrow">Wallet activity</p><h3 class="Heading u-h4">Earned and used history</h3></div>' +
            '</div>' +
            '<p class="ForestryRewardsCard__description">This is your recent ' + escapeHtml(label.toLowerCase()) + ' activity, including earnings and redemptions.</p>' +
            '<div class="ForestryRewardsHistoryStack">' + historyLedgerMarkup(model) + '</div>' +
          '</article>' +
          '<article class="ForestryRewardsCard ForestryRewardsCard--history">' +
            '<div class="ForestryRewardsCard__header">' +
              '<div><p class="ForestryRewardsCard__eyebrow">Task activity</p><h3 class="Heading u-h4">Recent reward tasks</h3></div>' +
            '</div>' +
            '<p class="ForestryRewardsCard__description">Completed and pending earn actions stay here so the main workspace stays clean.</p>' +
            '<div class="ForestryRewardsHistoryStack">' + historyTasksMarkup(model) + '</div>' +
          '</article>' +
          '<article class="ForestryRewardsCard ForestryRewardsCard--helper ForestryRewardsCard--wallet-cta">' +
            '<p class="ForestryRewardsCard__eyebrow">Earn more</p>' +
            '<h3 class="Heading u-h3">' + escapeHtml(title) + '</h3>' +
            '<p class="ForestryRewardsCard__description">Head to your main rewards workspace to find active ways to earn more, without the completed-card clutter.</p>' +
            '<div class="ForestryRewardsSnapshot">' +
              '<div><span>Lifetime earned</span><strong>' + escapeHtml(currencyLabel(model.summary.lifetime_earned_amount || 0) || '$0') + '</strong></div>' +
              '<div><span>Saved codes</span><strong>' + escapeHtml(String(activeCodes)) + '</strong></div>' +
              '<div><span>Referrals</span><strong>' + escapeHtml(String(model.referral && model.referral.count ? model.referral.count : 0)) + '</strong></div>' +
            '</div>' +
            '<div class="ForestryRewardsCard__actions"><a class="Button Button--primary Button--full" href="' + escapeHtml(rewardsUrl) + '">' + escapeHtml(earnMoreRewardsLabel(model, root)) + '</a></div>' +
          '</article>' +
        '</div>' +
        (uiState.toast ? '<div class="ForestryRewardsToast ForestryRewardsToast--' + escapeHtml(uiState.toastTone || 'neutral') + '">' + escapeHtml(uiState.toast) + '</div>' : '') +
      '</section>';
  }

  function compactFooterCopy(model, state) {
    const progress = nextThresholdProgress(model);
    const rules = redemptionRules(model);
    const access = redemptionAccess(model);

    if (state.name === 'guest') {
      return {
        primary: 'Sign in for your live Candle Cash',
        secondary: 'Your balance and eligible rewards will appear here.',
      };
    }

    if (state.name === 'applied') {
      return {
        primary: 'Reward applied to this order',
        secondary: 'Your cart total should reflect ' + rules.redeemAmountLabel + ' off right away.',
      };
    }

    if (state.name === 'ready') {
      return {
        primary: 'Ready to redeem',
        secondary: 'Apply ' + rules.redeemAmountLabel + ' off this order.',
      };
    }

    if (state.name === 'redeemable') {
      return {
        primary: rules.redeemAmountLabel + ' ready to redeem',
        secondary: 'Limit ' + rules.maxPerOrderLabel + ' Candle Cash per order.',
      };
    }

    if (state.name === 'birthday_activation') {
      return {
        primary: 'Activate once, then apply',
        secondary: 'Your birthday Candle Cash needs one quick unlock before checkout.',
      };
    }

    if (state.name === 'coming_soon') {
      return {
        primary: access.ctaLabel,
        secondary: access.message,
      };
    }

    if (state.name === 'code_only') {
      return {
        primary: rules.redeemAmountLabel + ' reward code ready',
        secondary: 'Copy it here or open your Candle Cash page.',
      };
    }

    if (state.name === 'balance_only') {
      return {
        primary: (currencyLabel(model.balanceAmount || 0) || '$0') + ' available now',
        secondary: progress && progress.done
          ? 'This order already qualifies. Redemption appears once a cart-ready code is returned.'
          : 'Redeem ' + rules.redeemAmountLabel + ' at a time when your balance is ready.',
      };
    }

    if (state.name === 'review_rewards') {
      return {
        primary: 'Saved rewards are waiting',
        secondary: 'Open Candle Cash to review the strongest option for this order.',
      };
    }

    return {
      primary: 'No active Candle Cash just yet',
      secondary: 'Your next reward will appear here when it is ready.',
    };
  }

  function renderCompactSurface(root, model, uiState) {
    const viewState = birthdayViewState(model);
    const surface = cleanString(root.dataset.surface || 'cart');
    const state = compactHelperState(model);
    const reward = state.reward || {};
    const rules = redemptionRules(model);
    const rewardAmount = rewardAmountValue(reward);
    const compactRewardAmount = state.rewardKind === 'candle_cash' && (
      state.name === 'ready' ||
      state.name === 'redeemable' ||
      state.name === 'applied' ||
      state.name === 'code_only'
    )
      ? rules.redeemAmount
      : rewardAmount;
    const access = redemptionAccess(model);
    const footer = compactFooterCopy(model, state);
    const progress = nextThresholdProgress(model);
    const balanceValue = !model.profileId
      ? 'Sign in'
      : (state.name === 'ready' || state.name === 'applied' || state.name === 'birthday_activation')
        ? (currencyLabel(compactRewardAmount || model.balanceAmount || 0) || '$0')
        : (currencyLabel(model.balanceAmount || 0) || '$0');
    const balanceLabel = !model.profileId
      ? 'View rewards'
      : (state.name === 'applied' ? 'Applied now' : (state.name === 'redeemable' ? 'Ready to redeem' : 'Available now'));
    const balanceNote = state.name === 'applied'
      ? 'Candle Cash is already attached to this order.'
      : state.name === 'coming_soon'
        ? access.message
      : state.name === 'ready'
        ? rules.redeemAmountLabel + ' off is ready to use in one click.'
        : state.name === 'redeemable'
          ? 'Redeem ' + rules.redeemAmountLabel + ' from your existing balance.'
        : state.name === 'birthday_activation'
          ? 'Activate this reward to use it on this order.'
          : state.name === 'code_only'
            ? 'Your reward code is ready to copy.'
            : state.name === 'balance_only'
              ? (progress && progress.done
                ? 'You are not missing spend. Redemption appears once this cart has a ready ' + rules.redeemAmountLabel + ' Candle Cash code.'
                : 'Candle Cash is redeemed in ' + rules.redeemAmountLabel + ' increments.')
              : state.name === 'guest'
                ? 'Sign in to view and redeem your Candle Cash.'
                : 'Your next reward will appear here when it is ready.';
    const utilityParts = [];

    if (state.name !== 'guest' && state.name !== 'applied') {
      if (progress && !progress.done && amountNumber(model.balanceAmount) < rules.redeemAmount) {
        utilityParts.push(progressMarkup(model));
      }

      utilityParts.push(expirationNoticeMarkup(model, 'compact'));
    }

    const utility = utilityMarkup(utilityParts);
    const status = compactSuccessBanner(state, model);

    root.innerHTML = '' +
      '<section class="ForestryRewardsHelper ForestryRewardsHelper--' + escapeHtml(surface) + ' ForestryRewardsHelper--state-' + escapeHtml(state.name) + '">' +
        comingSoonNoticeMarkup(surface) +
        '<div class="ForestryRewardsHelper__head">' +
          '<div class="ForestryRewardsHelper__copy">' +
            '<p class="ForestryRewardsEyebrow">Candle Cash</p>' +
            '<h3 class="Heading u-h4">' + escapeHtml(availableBalanceHeadline(model)) + '</h3>' +
            '<p class="ForestryRewardsLead ForestryRewardsLead--compact">' + escapeHtml(helperMessage(model, viewState)) + '</p>' +
          '</div>' +
          '<div class="ForestryRewardsHelper__balance">' +
            '<span class="ForestryRewardsHelper__balance-label">' + escapeHtml(balanceLabel) + '</span>' +
            '<strong class="ForestryRewardsHelper__balance-value">' + escapeHtml(balanceValue) + '</strong>' +
            '<span class="ForestryRewardsHelper__balance-note">' + escapeHtml(balanceNote) + '</span>' +
          '</div>' +
        '</div>' +
        status +
        utility +
        '<div class="ForestryRewardsHelper__actions">' + helperActionMarkup(root, model, viewState, uiState) + '</div>' +
        '<div class="ForestryRewardsHelper__footer">' +
          '<span>' + escapeHtml(footer.primary) + '</span>' +
          '<span>' + escapeHtml(footer.secondary) + '</span>' +
        '</div>' +
        (uiState.toast ? '<div class="ForestryRewardsToast ForestryRewardsToast--' + escapeHtml(uiState.toastTone || 'neutral') + '">' + escapeHtml(uiState.toast) + '</div>' : '') +
      '</section>';
  }

  function renderHeaderSurface(root, model) {
    const surface = cleanString(root.dataset.surface || 'header');
    const url = cleanString(root.dataset.rewardsUrl || root.dataset.accountUrl || '/pages/rewards');
    const hasBalance = amountNumber(model.balanceAmount) > 0;
    const value = hasBalance ? (currencyLabel(model.balanceAmount) || '$0') : 'View';
    const meta = hasBalance ? 'Open rewards' : 'See balance';

    root.innerHTML = '' +
      '<a class="ForestryRewardsHeaderLink ForestryRewardsHeaderLink--' + escapeHtml(surface) + '" href="' + escapeHtml(url) + '">' +
        '<span class="ForestryRewardsHeaderLink__eyebrow">Candle Cash</span>' +
        '<span class="ForestryRewardsHeaderLink__value">' + escapeHtml(value) + '</span>' +
        '<span class="ForestryRewardsHeaderLink__meta">' + escapeHtml(meta) + '</span>' +
        comingSoonNoticeMarkup(surface) +
      '</a>';
  }

  function renderOrderSurface(root, model, uiState) {
    const title = cleanString(root.dataset.title) || 'Order rewards';
    const subtitle = cleanString(root.dataset.subtitle) || 'See what this order unlocked and keep your Candle Cash close for the next one.';
    const url = cleanString(root.dataset.rewardsUrl || root.dataset.accountUrl || '/pages/rewards');
    const utilities = utilityMarkup([
      expirationNoticeMarkup(model, 'order'),
      clubBannerMarkup(root, model, 'compact'),
    ]);

    root.innerHTML = '' +
      '<section class="ForestryRewardsSurface ForestryRewardsSurface--order">' +
        comingSoonNoticeMarkup('order') +
        themeToggleMarkup(root, uiState) +
        celebrationMarkup(model, uiState, 'order') +
        '<div class="ForestryRewardsSurface__utility">' +
          '<div>' +
            '<p class="ForestryRewardsEyebrow">' + escapeHtml(title) + '</p>' +
            '<h2 class="Heading u-h3">' + escapeHtml(availableBalanceHeadline(model)) + '</h2>' +
            '<p class="ForestryRewardsLead ForestryRewardsLead--compact">' + escapeHtml(subtitle) + '</p>' +
          '</div>' +
          '<div class="ForestryRewardsCard__actions"><a class="Button Button--secondary" href="' + escapeHtml(url) + '">Open rewards</a></div>' +
        '</div>' +
        utilities +
        (uiState.toast ? '<div class="ForestryRewardsToast ForestryRewardsToast--' + escapeHtml(uiState.toastTone || 'neutral') + '">' + escapeHtml(uiState.toast) + '</div>' : '') +
      '</section>';
  }

  function dispatchReviewPrefetch(detail) {
    document.dispatchEvent(new CustomEvent(REVIEW_PREFETCH_EVENT, {
      detail: Object.assign({
        source: 'candle_cash',
        scope: 'sitewide',
      }, detail || {}),
    }));
  }

  function modelHasProductReviewTask(model) {
    return mergeArray(model && model.tasks, []).some(function (task) {
      return cleanString(task && task.handle) === 'product-review';
    });
  }

  function prefetchRewardsModel(root, options) {
    if (!root || !document.documentElement.contains(root)) {
      return Promise.resolve();
    }

    const statusEndpoint = cleanString(root.dataset.endpointCandleCashStatus);
    if (!statusEndpoint) {
      return Promise.resolve();
    }

    const settings = Object.assign({ force: false }, options || {});
    const identity = buildIdentity(root);
    const query = queryFromIdentity(identity);
    const referralCode = activeReferralCode();

    if (referralCode) {
      query.set('ref', referralCode);
    }

    const requests = [
      fetchCachedResponse(statusResponseCacheKey(root, query), function () {
        return fetchContract(root, statusEndpoint, {
          method: 'GET',
          query: query,
        });
      }, {
        ttl: RESPONSE_CACHE_TTLS.status,
        force: settings.force,
        allowSession: true,
      }),
      fetchCartState({ force: settings.force }),
    ];

    if (shouldLoadAvailableRewardsForRoot(root)) {
      const availableEndpoint = cleanString(root.dataset.endpointRewardsAvailable);
      if (availableEndpoint) {
        requests.push(fetchCachedResponse(availableRewardsResponseCacheKey(root, query), function () {
          return fetchContract(root, availableEndpoint, {
            method: 'GET',
            query: query,
          });
        }, {
          ttl: RESPONSE_CACHE_TTLS.available,
          force: settings.force,
          allowSession: false,
        }));
      }
    }

    return Promise.all(requests).catch(function () {
      return [];
    });
  }

  function observeRewardsPrefetchIntent(root) {
    if (!root || !document.documentElement.contains(root)) {
      return;
    }

    const target = root.querySelector(
      '[data-action="redeem-reward"], [data-action="apply-reward"], [data-action="refresh-status"], [data-action="open-product-review-drawer"]'
    ) || root;

    if (!('IntersectionObserver' in window)) {
      if (!root.__forestryRewardsPrefetchVisible) {
        root.__forestryRewardsPrefetchVisible = true;
        prefetchRewardsModel(root);
      }
      return;
    }

    if (!runtime.rewardsPrefetchObserver) {
      runtime.rewardsPrefetchObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || !entry.target) {
            return;
          }

          const intentTarget = entry.target;
          runtime.rewardsPrefetchObserver.unobserve(intentTarget);

          const ownerRoot = intentTarget.__forestryRewardsPrefetchRoot;
          if (!ownerRoot || ownerRoot.__forestryRewardsPrefetchVisible) {
            return;
          }

          ownerRoot.__forestryRewardsPrefetchVisible = true;
          prefetchRewardsModel(ownerRoot);
        });
      }, { rootMargin: '260px 0px' });
    }

    const previous = runtime.rewardsPrefetchTargets.get(root);
    if (previous === target) {
      return;
    }

    if (previous && runtime.rewardsPrefetchObserver) {
      runtime.rewardsPrefetchObserver.unobserve(previous);
    }

    target.__forestryRewardsPrefetchRoot = root;
    runtime.rewardsPrefetchTargets.set(root, target);
    runtime.rewardsPrefetchObserver.observe(target);
  }

  function observeReviewPrefetchIntent(root, model) {
    if (!root || cleanString(root.dataset.surface) !== 'page' || !modelHasProductReviewTask(model)) {
      const previousTarget = root && runtime.reviewPrefetchTargets ? runtime.reviewPrefetchTargets.get(root) : null;
      if (previousTarget && runtime.reviewPrefetchObserver) {
        runtime.reviewPrefetchObserver.unobserve(previousTarget);
      }
      return;
    }

    const cta = root.querySelector('[data-action="open-product-review-drawer"]');
    if (!cta) {
      return;
    }

    if (!('IntersectionObserver' in window)) {
      if (!root.__forestryReviewPrefetchVisible) {
        root.__forestryReviewPrefetchVisible = true;
        dispatchReviewPrefetch({ source: 'candle_cash_visibility' });
      }
      return;
    }

    if (!runtime.reviewPrefetchObserver) {
      runtime.reviewPrefetchObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting || !entry.target) {
            return;
          }

          const target = entry.target;
          runtime.reviewPrefetchObserver.unobserve(target);

          const ownerRoot = target.__forestryReviewPrefetchRoot;
          if (!ownerRoot || ownerRoot.__forestryReviewPrefetchVisible) {
            return;
          }

          ownerRoot.__forestryReviewPrefetchVisible = true;
          dispatchReviewPrefetch({ source: 'candle_cash_visibility' });
        });
      }, { rootMargin: '220px 0px' });
    }

    const previous = runtime.reviewPrefetchTargets.get(root);
    if (previous === cta) {
      return;
    }

    if (previous && runtime.reviewPrefetchObserver) {
      runtime.reviewPrefetchObserver.unobserve(previous);
    }

    cta.__forestryReviewPrefetchRoot = root;
    runtime.reviewPrefetchTargets.set(root, cta);
    runtime.reviewPrefetchObserver.observe(cta);
  }

  function render(root, model) {
    applyRewardsTheme(root, activeRewardsTheme(root));
    root.__forestryLastModel = model;
    const uiState = rootState(root);
    const surface = cleanString(root.dataset.surface || 'page');

    if (surface === 'cart' || surface === 'drawer') {
      renderCompactSurface(root, model, uiState);
    } else if (surface === 'header' || surface === 'sidebar') {
      renderHeaderSurface(root, model);
    } else if (surface === 'account') {
      renderAccountSurface(root, model, uiState);
    } else if (surface === 'order') {
      renderOrderSurface(root, model, uiState);
    } else {
      renderCentralSurface(root, model, uiState);
    }

    observeReviewPrefetchIntent(root, model);
    observeRewardsPrefetchIntent(root);
  }

  function rerender(root) {
    render(root, computeLastModel(root));
  }

  function showToast(root, message, tone) {
    setRootState(root, {
      busy: false,
      toast: message,
      toastTone: tone || 'neutral',
    });
    rerender(root);
  }

  function markBusy(root, message) {
    setRootState(root, {
      busy: true,
      toast: message || 'Working on it…',
      toastTone: 'neutral',
    });
    rerender(root);
  }

  function celebrate(root, tone) {
    if (prefersReducedMotion()) {
      return;
    }

    const host = document.createElement('div');
    host.className = 'ForestryRewardsConfetti';
    host.setAttribute('aria-hidden', 'true');

    const colors = tone === 'activation'
      ? ['#f2d58b', '#f6b4ce', '#d9c7ff', '#cfeadc']
      : ['#2f7a61', '#4c9c7d', '#d7b36b', '#f3e0b5', '#d8efe3'];

    for (let i = 0; i < 22; i += 1) {
      const piece = document.createElement('span');
      piece.style.setProperty('--x', (Math.random() * 220 - 110).toFixed(0) + 'px');
      piece.style.setProperty('--r', (Math.random() * 520 - 260).toFixed(0) + 'deg');
      piece.style.setProperty('--delay', (Math.random() * 120).toFixed(0) + 'ms');
      piece.style.setProperty('--bg', colors[i % colors.length]);
      host.appendChild(piece);
    }

    root.appendChild(host);
    window.setTimeout(function () {
      host.remove();
    }, 1800);
  }

  function matchingCartDiscountTitles(cartDiscounts) {
    return cartDiscounts.map(function (discount) {
      return cleanString(discount && (discount.title || discount.code || discount.description)).toUpperCase();
    }).filter(Boolean);
  }

  function matchingCartDiscountCodes(cartDiscountCodes) {
    return (cartDiscountCodes || []).map(function (discount) {
      if (typeof discount === 'string') {
        return cleanString(discount).toUpperCase();
      }

      return cleanString(discount && (discount.code || discount.discount_code || discount.title)).toUpperCase();
    }).filter(Boolean);
  }

  function computeModel(root, statusResult, cartState) {
    // Liquid fallback keeps Candle Cash renderable until the external loyalty contract is fully connected.
    const fallback = fallbackModel(root);
    const data = mergeObject((statusResult && statusResult.data) || {}, fallback);
    const birthday = mergeObject(data.birthday || {}, fallback.birthday || {});
    const issuance = birthday.issuance || null;
    const rewardCodes = storefrontVisibleRows(mergeArray(data.reward_codes, fallback.reward_codes));
    const otherRewards = rewardCodes.filter(function (row) {
      return cleanString(row.redemption_code) !== cleanString(issuance && issuance.reward_code);
    });
    const cartDiscounts = cartState && cartState.ok && Array.isArray(cartState.data.cart_level_discount_applications)
      ? cartState.data.cart_level_discount_applications
      : [];
    const cartDiscountCodeRows = cartState && cartState.ok && Array.isArray(cartState.data.discount_codes)
      ? cartState.data.discount_codes
      : [];
    const cartDiscountTitles = matchingCartDiscountTitles(cartDiscounts);
    const cartDiscountCodes = matchingCartDiscountCodes(cartDiscountCodeRows);
    const birthdayApplied = Boolean(issuance && rewardMatchesCart({
      reward_code: issuance.reward_code,
      redemption_code: issuance.reward_code,
      reward_name: issuance.reward_name,
      discount_title: issuance.discount_title,
    }, cartDiscountTitles));
    const decoratedRewards = otherRewards.map(function (reward) {
      return Object.assign({}, reward, {
        is_applied: rewardMatchesCart(reward, cartDiscountTitles),
      });
    });
    const summary = mergeObject(data.summary || {}, fallback.summary || {});
    const referral = mergeObject(data.referral || {}, fallback.referral || {});
    const balance = mergeObject(data.balance || {}, fallback.balance || {});
    const balanceAmount = amountNumber(balance.candle_cash_amount || balance.amount || data.candle_cash_amount || summary.current_balance_amount || 0);
    const availableRewards = rewardCatalogRows(mergeArray(data.available_rewards, fallback.available_rewards), balanceAmount);
    const membership = mergeObject(data.membership || {}, fallback.membership || {});
    const history = mergeObject(data.history || {}, fallback.history || {});
    const googleReview = mergeObject(data.google_review || {}, fallback.google_review || {});
    const redemptionAccessConfig = mergeObject(data.redemption_access || {}, fallback.redemption_access || {});
    const redemptionRulesConfig = mergeObject(data.redemption_rules || {}, fallback.redemption_rules || {});
    const profileId = positiveInt(data.profile_id || fallback.profile_id || root.dataset.marketingProfileId || root.dataset.shopifyCustomerId);
    const state = normalizeState(data.state || fallback.state || (profileId ? 'linked_customer' : 'unknown_customer')) || (profileId ? 'linked_customer' : 'unknown_customer');
    const expirationDays = positiveInt(balance.expiration_days || data.candle_cash_expiration_days);
    const orderCreatedAt = Number.parseInt(String(root.dataset.orderCreatedAt || 0), 10) || 0;

    return {
      profileId: profileId,
      state: state,
      consentSms: bool(data.consent && data.consent.sms),
      consentEmail: bool(data.consent && data.consent.email),
      balance: balanceAmount,
      balanceAmount: balanceAmount,
      expirationDate: cleanString(balance.expires_at || data.candle_cash_expiration_date),
      expirationDays: expirationDays,
      expiringBalanceAmount: amountNumber(balance.expiring_amount || balance.candle_cash_amount || balance.amount || summary.current_balance_amount || 0),
      birthdayState: normalizeState(birthday.state || ''),
      birthday: birthday.birthday || null,
      birthdayIssuance: issuance,
      otherRewards: decoratedRewards,
      availableRewards: availableRewards,
      rewardCodes: rewardCodes,
      redemptionAccess: {
        redeemEnabled: bool(redemptionAccessConfig.redeem_enabled),
        ctaLabel: cleanString(redemptionAccessConfig.cta_label),
        message: cleanString(redemptionAccessConfig.message),
        mode: cleanString(redemptionAccessConfig.mode),
      },
      thresholds: mergeArray(data.thresholds, fallback.thresholds),
      candleClub: {
        member: bool(membership.candle_club_member || membership.member),
        multiplier: amountNumber(membership.multiplier) || 1,
        memberHeadline: cleanString(membership.member_headline || membership.memberHeadline) || 'Candle Club Members earn 2x Candle Cash',
        memberCopy: cleanString(membership.member_copy || membership.memberCopy) || 'Members unlock bonus rewards and exclusive voting perks.',
        guestHeadline: cleanString(membership.guest_headline || membership.guestHeadline) || 'Candle Club Members earn 2x Candle Cash',
        guestCopy: cleanString(membership.guest_copy || membership.guestCopy) || 'Members unlock bonus rewards and exclusive voting perks.',
        ctaUrl: cleanString(membership.cta_url || membership.ctaUrl || root.dataset.candleClubUrl || DEFAULT_CANDLE_CLUB_URL),
        ctaText: cleanString(membership.cta_text || membership.ctaText) || 'Explore Candle Club',
        previewOnly: bool(membership.cta_disabled) || cleanString(root.dataset.candleClubPreviewOnly).toLowerCase() === 'true',
        lockMessage: cleanString(membership.lock_message || membership.lockMessage || root.dataset.candleClubLockMessage) || 'Candle Cash',
      },
      celebrationState: mergeObject(data.celebration_state || {}, fallback.celebration_state || {}),
      cartTotalAmount: cartState && cartState.ok ? amountNumber((cartState.data.total_price || 0) / 100) : 0,
      orderContext: {
        number: cleanString(root.dataset.orderNumber),
        totalAmount: amountNumber(root.dataset.orderTotalAmount),
        createdAt: orderCreatedAt,
      },
      copy: mergeObject(data.copy || {}, fallback.copy || {}),
      summary: summary,
      referral: referral,
      googleReview: {
        enabled: bool(googleReview.enabled),
        ready: bool(googleReview.ready),
        reason: cleanString(googleReview.reason),
        message: cleanString(googleReview.message),
        fallbackMode: cleanString(googleReview.fallback_mode || googleReview.fallbackMode),
        reviewUrl: cleanString(googleReview.review_url || googleReview.reviewUrl),
        lastSyncAt: cleanString(googleReview.last_sync_at || googleReview.lastSyncAt),
      },
      tasks: mergeArray(data.tasks, fallback.tasks),
      taskHistory: storefrontVisibleRows(mergeArray(history.tasks, fallback.history && fallback.history.tasks)),
      ledgerHistory: storefrontVisibleRows(mergeArray(history.ledger, fallback.history && fallback.history.ledger)),
      cartAppliedBirthday: birthdayApplied,
      cartDiscounts: cartDiscounts,
      cartDiscountCodes: cartDiscountCodes,
      cartStateData: cartState && cartState.ok ? cartState.data : null,
      redemptionRules: redemptionRulesConfig,
      futureHooks: mergeObject(data.future_hooks || {}, fallback.future_hooks || {}),
    };
  }

  function cachedModelSnapshot(root) {
    const fallback = fallbackModel(root);
    const hasFallback = !!(fallback && Object.keys(fallback).length);
    const surface = cleanString(root && root.dataset && root.dataset.surface).toLowerCase();
    const fallbackAccessMode = cleanString(fallback && fallback.redemption_access && (fallback.redemption_access.mode || fallback.redemption_access.state)).toLowerCase();
    const identity = buildIdentity(root);
    const query = queryFromIdentity(identity);
    const referralCode = activeReferralCode();

    if (referralCode) {
      query.set('ref', referralCode);
    }

    const status = snapshotResponseValue(statusResponseCacheKey(root, query), { allowSession: true });
    const cartState = snapshotResponseValue(cartResponseCacheKey(), { allowSession: false }) || { ok: false, data: {} };
    const availableRewards = shouldLoadAvailableRewardsForRoot(root)
      ? snapshotResponseValue(availableRewardsResponseCacheKey(root, query), { allowSession: false })
      : null;

    if (!status || !status.ok) {
      if (!hasFallback) {
        return null;
      }

      // On cart, avoid flashing the generic "checking access" fallback card while live status is still loading.
      if (surface === 'cart' && fallbackAccessMode === 'pending_status') {
        return null;
      }

      const payload = availableRewards && availableRewards.ok
        ? Object.assign({}, fallback, availableRewards.data || {})
        : fallback;

      if (availableRewards && availableRewards.ok && !Array.isArray(payload.available_rewards) && Array.isArray(availableRewards.data && availableRewards.data.rewards)) {
        payload.available_rewards = availableRewards.data.rewards;
      }

      if (availableRewards && availableRewards.ok && !payload.storefront_reward && availableRewards.data && availableRewards.data.storefront_reward) {
        payload.storefront_reward = availableRewards.data.storefront_reward;
      }

      return { ok: true, model: computeModel(root, { data: payload }, cartState) };
    }

    const statusPayload = Object.assign({}, status.data || {});

    if (availableRewards && availableRewards.ok) {
      statusPayload.available_rewards = Array.isArray(availableRewards.data && availableRewards.data.rewards)
        ? availableRewards.data.rewards
        : [];
    }

    return { ok: true, model: computeModel(root, { data: statusPayload }, cartState) };
  }

  async function loadModel(root, options) {
    await persistReferralCodeToCart();
    const fallback = fallbackModel(root);
    const hasFallback = !!(fallback && Object.keys(fallback).length);
    const force = !!(options && options.force);

    const identity = buildIdentity(root);
    const query = queryFromIdentity(identity);
    const referralCode = activeReferralCode();
    if (referralCode) {
      query.set('ref', referralCode);
    }

    const shouldLoadAvailableRewards = shouldLoadAvailableRewardsForRoot(root);

    const requests = [
      fetchCachedResponse(statusResponseCacheKey(root, query), function () {
        return fetchContract(root, root.dataset.endpointCandleCashStatus, {
          method: 'GET',
          query: query,
        });
      }, {
        ttl: RESPONSE_CACHE_TTLS.status,
        force: force,
        allowSession: true,
      }),
      fetchCartState({ force: force }),
    ];

    if (shouldLoadAvailableRewards) {
      requests.push(fetchCachedResponse(availableRewardsResponseCacheKey(root, query), function () {
        return fetchContract(root, root.dataset.endpointRewardsAvailable, {
          method: 'GET',
          query: query,
        });
      }, {
        ttl: RESPONSE_CACHE_TTLS.available,
        force: force,
        allowSession: false,
      }));
    }

    const results = await Promise.all(requests);
    const status = results[0];
    const cartState = results[1];
    const availableRewards = shouldLoadAvailableRewards ? results[2] : null;

    if (!status.ok) {
      const fallbackPayload = hasFallback ? fallback : null;

      if (fallbackPayload) {
        maybeTrackFallbackRender(root, fallbackPayload, status);
      }

      if (availableRewards && availableRewards.ok) {
        const rewardsPayload = Object.assign({}, fallbackPayload || {}, availableRewards.data || {});
        if (!Array.isArray(rewardsPayload.available_rewards) && Array.isArray(availableRewards.data && availableRewards.data.rewards)) {
          rewardsPayload.available_rewards = availableRewards.data.rewards;
        }
        if (!rewardsPayload.storefront_reward && availableRewards.data && availableRewards.data.storefront_reward) {
          rewardsPayload.storefront_reward = availableRewards.data.storefront_reward;
        }

        return { ok: true, model: computeModel(root, { data: rewardsPayload }, cartState) };
      }

      if (hasFallback) {
        return { ok: true, model: computeModel(root, { data: fallbackPayload }, cartState) };
      }

      if (status.status === 404) {
        return {
          ok: false,
          title: 'Rewards are waking up.',
          detail: 'We are still finishing the storefront connection. Please check back in a moment.',
        };
      }

      if (status.error && status.error.code === 'unauthorized_storefront_request') {
        return {
          ok: false,
          title: 'Rewards are almost ready.',
          detail: 'The rewards connection is not active on this storefront yet.',
        };
      }

      return {
        ok: false,
        title: 'Rewards are taking a breath.',
        detail: status.error && status.error.message ? status.error.message : 'We could not load your rewards right now.',
      };
    }

    const statusPayload = Object.assign({}, status.data || {});

    if (availableRewards && availableRewards.ok) {
      statusPayload.available_rewards = availableRewards.data && Array.isArray(availableRewards.data.rewards)
        ? availableRewards.data.rewards
        : [];
    }

    return { ok: true, model: computeModel(root, { data: statusPayload }, cartState) };
  }

  function viewSessionKey(root, model) {
    return ['forestryRewardsView', window.location.pathname, root.dataset.surface || 'page', model.profileId || 'guest'].join(':');
  }

  function maybeTrackView(root, model) {
    const key = viewSessionKey(root, model);
    if (!oncePerSession(key)) {
      return;
    }

    logRewardEvent(root, {
      event_type: 'reward_view',
      request_key: key,
      reward_kind: 'surface',
      surface: root.dataset.surface || 'page',
      state: model.state || 'linked_customer',
    });
  }

  function maybeHandleApplyMarker(root, model) {
    const marker = getApplyMarker();
    if (!marker || !marker.code) {
      return;
    }

    const titles = matchingCartDiscountTitles(model.cartDiscounts);
    const markerCode = cleanString(marker.code).toUpperCase();
    const codeMatches = titles.indexOf(markerCode) >= 0;
    const birthdayMatches = marker.kind === 'birthday' && model.cartAppliedBirthday;
    const surface = root.dataset.surface || 'page';
    const age = Date.now() - Number(marker.at || 0);

    if (codeMatches || birthdayMatches) {
      if (oncePerSession(marker.request_key + ':success-ui')) {
        showToast(root, marker.kind === 'birthday' ? 'Birthday Candle Cash redeemed!' : 'Candle Cash redeemed! Reward applied - enjoy the glow.', 'success');
        celebrate(root, 'apply');
        logRewardEvent(root, {
          event_type: 'reward_apply_success',
          request_key: marker.request_key || ('reward-apply-success:' + marker.code),
          reward_code: marker.code,
          reward_kind: marker.kind || 'candle_cash',
          surface: surface,
          state: 'applied',
        });
        logRewardEvent(root, {
          event_type: 'reward_confetti_shown',
          request_key: (marker.request_key || marker.code) + ':confetti',
          reward_code: marker.code,
          reward_kind: marker.kind || 'candle_cash',
          surface: surface,
          state: 'applied',
        });
      }
      clearApplyMarker();
      return;
    }

    if ((surface === 'cart' || surface === 'drawer') && age < 8000) {
      return;
    }

    if ((surface === 'cart' || surface === 'drawer') && age < 5 * 60 * 1000) {
      if (oncePerSession(marker.request_key + ':failure-ui')) {
        showToast(root, 'We could not apply Candle Cash automatically just yet. Your reward is still ready to use.', 'warning');
        logRewardEvent(root, {
          event_type: 'reward_apply_failure',
          request_key: marker.request_key + ':failure',
          reward_code: marker.code,
          reward_kind: marker.kind || 'candle_cash',
          surface: surface,
          state: 'discount_not_applied',
        });
      }
      clearApplyMarker();
    }
  }

  function sameOriginUrl(url) {
    try {
      return new URL(url, window.location.origin).origin === window.location.origin;
    } catch (error) {
      return false;
    }
  }

  function dispatchCartRefresh() {
    document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('forestry:rewards:refresh'));
  }

  function cartDiscountAmount(cartData) {
    if (!cartData || typeof cartData !== 'object') {
      return 0;
    }

    const subtotal = amountNumber((cartData.items_subtotal_price || 0) / 100);
    const total = amountNumber((cartData.total_price || 0) / 100);
    const discount = subtotal - total;

    return discount > 0 ? discount : 0;
  }

  function cartDiscountLabel(cartData) {
    const titles = matchingCartDiscountTitles(Array.isArray(cartData && cartData.cart_level_discount_applications) ? cartData.cart_level_discount_applications : []);

    if (titles.length > 0) {
      const rawLabel = cleanString((cartData.cart_level_discount_applications[0] && cartData.cart_level_discount_applications[0].title) || '');
      const normalizedLabel = rawLabel.toUpperCase();

      if (!rawLabel || normalizedLabel.indexOf('CANDLE CASH') >= 0 || /^CC-[A-Z0-9-]+$/.test(normalizedLabel)) {
        return 'Candle Cash Applied';
      }

      return rawLabel;
    }

    return 'Candle Cash Applied';
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function syncCartTotals(cartData) {
    if (!cartData || typeof cartData !== 'object') {
      return;
    }

    const subtotalAmount = amountNumber((cartData.items_subtotal_price || 0) / 100);
    const totalAmount = amountNumber((cartData.total_price || 0) / 100);
    const discountAmount = cartDiscountAmount(cartData);
    const subtotalWithCurrency = moneyWithCurrencyLabel(subtotalAmount);
    const withCurrency = moneyWithCurrencyLabel(totalAmount);
    const discountWithCurrency = moneyWithCurrencyLabel(discountAmount);
    const discountLabel = cartDiscountLabel(cartData);
    const itemCount = Number.parseInt(String(cartData.item_count || 0), 10);

    document.querySelectorAll('[data-cart-subtotal-display]').forEach(function (node) {
      const mode = cleanString(node.getAttribute('data-cart-subtotal-display'));
      node.textContent = mode === 'with_currency' ? subtotalWithCurrency : (currencyLabel(subtotalAmount) || subtotalWithCurrency);
    });

    document.querySelectorAll('[data-cart-total-display]').forEach(function (node) {
      const mode = cleanString(node.getAttribute('data-cart-total-display'));
      node.textContent = mode === 'with_currency' ? withCurrency : (currencyLabel(totalAmount) || withCurrency);
    });

    document.querySelectorAll('[data-cart-discount-label]').forEach(function (node) {
      node.textContent = discountLabel;
    });

    document.querySelectorAll('[data-cart-discount-display]').forEach(function (node) {
      const mode = cleanString(node.getAttribute('data-cart-discount-display'));
      node.textContent = mode === 'with_currency' ? discountWithCurrency : (currencyLabel(discountAmount) || discountWithCurrency);
    });

    document.querySelectorAll('[data-cart-discount-row]').forEach(function (node) {
      if (discountAmount > 0) {
        node.classList.remove('is-hidden');
      } else {
        node.classList.add('is-hidden');
      }
    });

    if (Number.isFinite(itemCount)) {
      document.querySelectorAll('.Header__CartCount').forEach(function (node) {
        node.textContent = String(itemCount);
      });
    }
  }

  function cartDataHasReward(cartData, rewardCode, rewardKind) {
    if (!cartData || typeof cartData !== 'object') {
      return false;
    }

    const markerCode = cleanString(rewardCode).toUpperCase();
    const titles = matchingCartDiscountTitles(Array.isArray(cartData.cart_level_discount_applications) ? cartData.cart_level_discount_applications : []);
    const discountAmount = cartDiscountAmount(cartData);

    if (markerCode && titles.indexOf(markerCode) >= 0 && discountAmount > 0) {
      return true;
    }

    if (rewardKind === 'birthday') {
      return titles.some(function (title) {
        return title.indexOf('BIRTHDAY') >= 0;
      }) && discountAmount > 0;
    }

    return false;
  }

  async function waitForCartDiscountState(rewardCode, rewardKind, shouldBeApplied) {
    const startedAt = Date.now();
    let lastCart = null;

    while ((Date.now() - startedAt) < CART_DISCOUNT_SYNC_TIMEOUT_MS) {
      const cartState = await fetchCartState({ force: true });

      if (cartState.ok) {
        lastCart = cartState.data;

        if (cartDataHasReward(lastCart, rewardCode, rewardKind) === shouldBeApplied) {
          return {
            ok: true,
            data: lastCart,
          };
        }
      }

      await sleep(CART_DISCOUNT_SYNC_POLL_MS);
    }

    return {
      ok: false,
      data: lastCart,
    };
  }

  async function refreshRelatedRoots(sourceRoot, options) {
    const sourceScope = rewardsScopeKey(sourceRoot);
    const settings = Object.assign({ force: false }, options || {});
    const relatedRoots = Array.from(runtime.mounted).filter(function (root) {
      return root && document.body.contains(root) && rewardsScopeKey(root) === sourceScope;
    });

    if (!relatedRoots.length) {
      return loadAndRender(sourceRoot, settings);
    }

    await Promise.all(relatedRoots.map(function (root) {
      return loadAndRender(root, settings);
    }));
  }

  async function loadAndRender(root, options) {
    if (!root || !document.documentElement.contains(root)) {
      return;
    }

    const settings = Object.assign({ force: false }, options || {});

    if (root.__forestryLoadPromise) {
      root.__forestryNeedsReload = true;
      return root.__forestryLoadPromise;
    }

    const cachedSnapshot = !settings.force ? cachedModelSnapshot(root) : null;
    const requestId = (root.__forestryRequestId || 0) + 1;
    root.__forestryRequestId = requestId;

    if (cachedSnapshot && cachedSnapshot.ok) {
      setRootState(root, { loadState: 'loaded' });
      root.setAttribute('data-forestry-rewards-state', 'loaded');
      if (cachedSnapshot.model && cachedSnapshot.model.cartStateData) {
        syncCartTotals(cachedSnapshot.model.cartStateData);
      }
      render(root, cachedSnapshot.model);
    } else {
      setRootState(root, { loadState: 'loading' });
      root.setAttribute('data-forestry-rewards-state', 'loading');
    }

    root.__forestryLoadPromise = (async function () {
      const result = await loadModel(root, settings);

      if (!document.documentElement.contains(root) || root.__forestryRequestId !== requestId) {
        return;
      }

      if (!result.ok) {
        setRootState(root, { loadState: 'error' });
        root.setAttribute('data-forestry-rewards-state', 'error');
        renderUnavailable(root, result.title, result.detail);
        return;
      }

      setRootState(root, { loadState: 'loaded' });
      root.setAttribute('data-forestry-rewards-state', 'loaded');
      if (result.model && result.model.cartStateData) {
        syncCartTotals(result.model.cartStateData);
      }

      render(root, result.model);
      maybeTrackView(root, result.model);
      maybeHandleApplyMarker(root, result.model);
    })().finally(function () {
      root.__forestryLoadPromise = null;
      if (root.__forestryNeedsReload && document.documentElement.contains(root)) {
        root.__forestryNeedsReload = false;
        window.setTimeout(function () {
          loadAndRender(root);
        }, 0);
      }
    });

    return root.__forestryLoadPromise;
  }

  async function saveBirthday(root) {
    if (rootState(root).busy) {
      return;
    }

    const monthField = root.querySelector('[data-field="birth-month"]');
    const dayField = root.querySelector('[data-field="birth-day"]');
    const yearField = root.querySelector('[data-field="birth-year"]');
    const month = positiveInt(monthField && monthField.value);
    const day = positiveInt(dayField && dayField.value);
    const year = positiveInt(yearField && yearField.value);

    if (!month || !day) {
      showToast(root, 'Month and day are required.', 'warning');
      return;
    }

    markBusy(root, 'Saving your birthday…');
    const identity = buildIdentity(root);
    const result = await fetchContract(root, root.dataset.endpointBirthdayCapture, {
      method: 'POST',
      body: Object.assign({}, bodyFromIdentity(identity), {
        birth_month: month,
        birth_day: day,
        birth_year: year || null,
        source: 'shopify_rewards_surface',
      }),
    });

    if (!result.ok) {
      showToast(root, 'We could not save your birthday yet.', 'warning');
      await loadAndRender(root, { force: true });
      return;
    }

    setRootState(root, {
      formOpen: false,
      openOpportunityId: 'birthday',
      busy: false,
      toast: 'Birthday saved. We will keep your reward ready here.',
      toastTone: 'success',
    });
    invalidateRewardsScope(root);
    await refreshRelatedRoots(root, { force: true });
    rerender(root);
  }

  async function refreshStatus(root) {
    if (rootState(root).busy) {
      return;
    }

    setRootState(root, {
      busy: true,
      toast: '',
      toastTone: 'neutral',
    });
    rerender(root);

    await loadAndRender(root, { force: true });

    setRootState(root, { busy: false });
    rerender(root);
  }

  async function activateBirthday(root) {
    if (rootState(root).busy) {
      return;
    }

    const model = computeLastModel(root);
    const issuance = model.birthdayIssuance;
    const requestKey = 'birthday-activate:' + (issuance && issuance.id ? issuance.id : Date.now());

    logRewardEvent(root, {
      event_type: 'reward_activate_click',
      request_key: requestKey,
      reward_code: issuance && issuance.reward_code ? issuance.reward_code : null,
      reward_kind: 'birthday',
      surface: root.dataset.surface || 'page',
      state: model.birthdayState || 'activate_requested',
    });

    markBusy(root, 'Unlocking your birthday reward…');
    const identity = buildIdentity(root);
    const result = await fetchContract(root, root.dataset.endpointBirthdayClaim, {
      method: 'POST',
      body: bodyFromIdentity(identity),
    });

    if (!result.ok) {
      logRewardEvent(root, {
        event_type: 'reward_activation_failure',
        request_key: requestKey + ':failure',
        reward_code: issuance && issuance.reward_code ? issuance.reward_code : null,
        reward_kind: 'birthday',
        surface: root.dataset.surface || 'page',
        state: result.error && result.error.code ? result.error.code : 'birthday_claim_failed',
      });
      showToast(root, 'We could not activate your reward yet. Try again in a moment.', 'warning');
      await loadAndRender(root, { force: true });
      return;
    }

    const rewardCode = result.data && result.data.reward && result.data.reward.issuance
      ? result.data.reward.issuance.reward_code
      : null;

    logRewardEvent(root, {
      event_type: 'reward_activation_success',
      request_key: requestKey + ':success',
      reward_code: rewardCode,
      reward_kind: 'birthday',
      surface: root.dataset.surface || 'page',
      state: 'already_claimed',
    });

    setRootState(root, {
      openOpportunityId: 'birthday',
      busy: false,
      toast: 'Reward unlocked and ready to use!',
      toastTone: 'success',
    });
    invalidateRewardsScope(root);
    await refreshRelatedRoots(root, { force: true });
    rerender(root);

    if (oncePerSession(requestKey + ':confetti')) {
      celebrate(root, 'activation');
      logRewardEvent(root, {
        event_type: 'reward_confetti_shown',
        request_key: requestKey + ':confetti',
        reward_code: rewardCode,
        reward_kind: 'birthday',
        surface: root.dataset.surface || 'page',
        state: 'already_claimed',
      });
    }
  }

  function friendlyRedemptionError(code, message) {
    const normalized = cleanString(code).toLowerCase();

    if (normalized === 'coming_soon') {
      return 'Candle Cash redemption is coming soon for this account.';
    }
    if (normalized === 'insufficient_candle_cash' || normalized === 'insufficient_points') {
      return 'This reward needs a little more Candle Cash before it can be redeemed.';
    }
    if (normalized === 'already_has_active_code') {
      return 'You already have a Candle Cash code waiting. We are pulling it into this cart now.';
    }
    if (normalized === 'reward_unavailable') {
      return 'That reward is not available right now.';
    }
    if (normalized === 'redemption_blocked') {
      return 'You already have active Candle Cash codes waiting. Use one first, then redeem another.';
    }
    if (normalized === 'discount_not_ready' || normalized === 'shopify_discount_sync_failed') {
      return 'Your Candle Cash balance is safe. We will show apply options here as soon as your discount is ready.';
    }

    if (cleanString(message) !== '' && cleanString(message) !== 'The request could not be completed.') {
      return cleanString(message);
    }

    return 'We could not redeem Candle Cash yet. Please try again in a moment.';
  }

  async function performRewardApply(root, rewardCode, rewardKind, applyPath) {
    const surface = cleanString(root.dataset.surface || 'page');
    const inlineApply = (surface === 'cart' || surface === 'drawer') && sameOriginUrl(applyPath);

    if (!rewardCode || !applyPath) {
      showToast(root, 'That reward is not ready to apply yet.', 'warning');
      return;
    }

    const requestKey = rewardKind + '-apply:' + rewardCode;

    logRewardEvent(root, {
      event_type: 'reward_apply_click',
      request_key: requestKey,
      reward_code: rewardCode,
      reward_kind: rewardKind,
      surface: root.dataset.surface || 'page',
      state: 'apply_requested',
    });

    setApplyMarker({
      request_key: requestKey,
      code: rewardCode,
      kind: rewardKind,
      at: Date.now(),
    });

    setRootState(root, {
      busy: true,
      toast: rewardKind === 'birthday' ? 'Applying your birthday Candle Cash...' : 'Applying your Candle Cash...',
      toastTone: 'neutral',
    });
    rerender(root);

    if (!inlineApply) {
      window.location.assign(applyPath);
      return;
    }

    try {
      // Use Shopify's native discount rail first, then wait until /cart.js confirms the discount
      // before repainting totals. This keeps the cart summary aligned with Shopify's source of truth.
      const response = await fetch(new URL(applyPath, window.location.origin).toString(), {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error('reward_apply_failed');
      }

      const appliedCart = await waitForCartDiscountState(rewardCode, rewardKind, true);
      if (appliedCart.ok && appliedCart.data) {
        invalidateRewardsScope(root);
        invalidateCartCache();
        syncCartTotals(appliedCart.data);
        setRootState(root, {
          busy: false,
          toast: rewardKind === 'birthday' ? 'Birthday Candle Cash applied. Updating totals…' : 'Candle Cash applied. Updating totals…',
          toastTone: 'success',
        });
        rerender(root);
        dispatchCartRefresh();
        return;
      }

      // If Shopify has not reflected the discount in the background flow yet, fall back to a
      // full browser navigation so the native discount redirect can finish in the main document.
      window.location.assign(applyPath);
    } catch (error) {
      clearApplyMarker();
      showToast(root, 'We could not apply Candle Cash yet. Please try again in a moment.', 'warning');
      logRewardEvent(root, {
        event_type: 'reward_apply_failure',
        request_key: requestKey + ':network',
        reward_code: rewardCode,
        reward_kind: rewardKind,
        surface: surface,
        state: error && error.message ? error.message : 'reward_apply_failed',
      });
      await loadAndRender(root, { force: true });
    }
  }

  async function redeemReward(root, target) {
    if (rootState(root).busy) {
      return;
    }

    const rewardId = positiveInt(target.getAttribute('data-reward-id'));
    const endpoint = cleanString(root.dataset.endpointRewardsRedeem);

    if (!rewardId || !endpoint) {
      showToast(root, 'This reward is not ready to redeem here yet.', 'warning');
      return;
    }

    markBusy(root, 'Unlocking your Candle Cash...');
    const identity = buildIdentity(root);
    const result = await fetchContract(root, endpoint, {
      method: 'POST',
      body: Object.assign({}, bodyFromIdentity(identity), {
        reward_id: rewardId,
        reuse_existing_code: true,
      }),
    });

    if (!result.ok) {
      showToast(root, friendlyRedemptionError(result.error && result.error.code, result.error && result.error.message), 'warning');
      await loadAndRender(root, { force: true });
      return;
    }

    const rewardCode = cleanString(result.data && result.data.redemption_code);
    const applyPath = cleanString(result.data && result.data.apply_path);
    invalidateRewardsScope(root);

    if (rewardCode && applyPath) {
      await performRewardApply(root, rewardCode, 'candle_cash', applyPath);
      return;
    }

    setRootState(root, {
      busy: false,
      toast: 'Candle Cash redeemed and ready to use.',
      toastTone: 'success',
    });
    await refreshRelatedRoots(root, { force: true });
    rerender(root);
  }

  async function applyReward(root, target) {
    if (rootState(root).busy) {
      return;
    }

    const applyPath = cleanString(target.getAttribute('data-apply-path'));
    const rewardCode = cleanString(target.getAttribute('data-code'));
    const rewardKind = cleanString(target.getAttribute('data-reward-kind')) || 'candle_cash';

    await performRewardApply(root, rewardCode, rewardKind, applyPath);
  }

  async function removeReward(root, target) {
    if (rootState(root).busy) {
      return;
    }

    const removePath = cleanString(target.getAttribute('data-remove-path'));
    const rewardCode = cleanString(target.getAttribute('data-code'));
    const rewardKind = cleanString(target.getAttribute('data-reward-kind')) || 'candle_cash';
    const surface = cleanString(root.dataset.surface || 'page');

    if (!removePath) {
      showToast(root, 'This reward cannot be removed from the cart here yet.', 'warning');
      return;
    }

    markBusy(root, 'Removing your Candle Cash...');

    try {
      const response = await fetch(new URL(removePath, window.location.origin).toString(), {
        method: 'GET',
        credentials: 'same-origin',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error('reward_remove_failed');
      }

      clearApplyMarker();
      const removedCart = await waitForCartDiscountState(rewardCode, rewardKind, false);
      if (removedCart.data) {
        syncCartTotals(removedCart.data);
      }
      invalidateRewardsScope(root);
      invalidateCartCache();
      setRootState(root, {
        busy: false,
        toast: 'Candle Cash removed from this order.',
        toastTone: 'neutral',
      });
      dispatchCartRefresh();

      logRewardEvent(root, {
        event_type: 'reward_remove_success',
        request_key: 'reward-remove:' + rewardCode,
        reward_code: rewardCode,
        reward_kind: rewardKind,
        surface: surface,
        state: 'removed',
      });
    } catch (error) {
      showToast(root, 'We could not remove Candle Cash yet. Please try again in a moment.', 'warning');
      logRewardEvent(root, {
        event_type: 'reward_remove_failure',
        request_key: 'reward-remove:' + rewardCode + ':failure',
        reward_code: rewardCode,
        reward_kind: rewardKind,
        surface: surface,
        state: error && error.message ? error.message : 'reward_remove_failed',
      });
    }
  }

  async function copyValue(root, value, successMessage) {
    if (!value) {
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', 'readonly');
        field.style.position = 'absolute';
        field.style.left = '-9999px';
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        field.remove();
      }

      showToast(root, successMessage, 'success');
    } catch (error) {
      showToast(root, 'Could not copy that yet. You can still use it manually.', 'warning');
      return;
    }

    logRewardEvent(root, {
      event_type: 'referral_link_copied',
      request_key: 'referral-copy:' + Date.now(),
      reward_kind: 'referral',
      surface: root.dataset.surface || 'page',
    });
  }

  async function shareReferral(root, value) {
    const shareValue = cleanString(value);
    if (!shareValue) {
      showToast(root, 'Your referral link is not ready yet.', 'warning');
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Candle Cash',
          text: 'Here is my Candle Cash link from Forestry.',
          url: shareValue,
        });
        showToast(root, 'Referral link ready to share.', 'success');
        logRewardEvent(root, {
          event_type: 'referral_shared',
          request_key: 'referral-share:' + Date.now(),
          reward_kind: 'referral',
          surface: root.dataset.surface || 'page',
        });
        return;
      }
    } catch (error) {
      // Fall back to copy.
    }

    await copyValue(root, shareValue, 'Referral link copied.');
    logRewardEvent(root, {
      event_type: 'referral_shared_copy_fallback',
      request_key: 'referral-share:' + Date.now() + ':copy',
      reward_kind: 'referral',
      surface: root.dataset.surface || 'page',
    });
  }

  function openTaskDestination(url) {
    const destination = cleanString(url);
    if (!destination) {
      return;
    }

    if (destination.charAt(0) === '#') {
      const el = document.querySelector(destination);
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      } else {
        window.location.hash = destination.substring(1);
      }
      return;
    }

    window.open(destination, '_blank', 'noopener');
  }

  function openTaskWindow(url) {
    const destination = cleanString(url);
    if (!destination) {
      try {
        const taskWindow = window.open('', '_blank');
        if (taskWindow) {
          try {
            taskWindow.opener = null;
          } catch (error) {
            // Ignore opener hardening failures.
          }
        }

        return taskWindow;
      } catch (error) {
        return null;
      }
    }

    if (destination.charAt(0) === '#') {
      openTaskDestination(destination);
      return null;
    }

    try {
      const taskWindow = window.open('', '_blank');
      if (taskWindow) {
        try {
          taskWindow.opener = null;
        } catch (error) {
          // Ignore opener hardening failures.
        }
        taskWindow.location.href = destination;
      }

      return taskWindow;
    } catch (error) {
      openTaskDestination(destination);
      return null;
    }
  }

  function navigateTaskWindow(taskWindow, url) {
    const destination = cleanString(url);
    if (!destination) {
      return;
    }

    if (!taskWindow || taskWindow.closed) {
      openTaskDestination(destination);
      return;
    }

    try {
      taskWindow.location.href = destination;
    } catch (error) {
      openTaskDestination(destination);
    }
  }

  async function submitTask(root, target) {
    if (rootState(root).busy) {
      return;
    }

    const taskHandle = cleanString(target.getAttribute('data-task-handle'));
    if (!taskHandle) {
      return;
    }

    const requiresProof = bool(target.getAttribute('data-task-requires-proof'));
    const taskCard = target.closest('[data-task-card]');
    const proofUrlField = taskCard && taskCard.querySelector('[data-task-proof-url="' + taskHandle + '"]');
    const proofTextField = taskCard && taskCard.querySelector('[data-task-proof-text="' + taskHandle + '"]');
    const proofUrl = cleanString(proofUrlField && proofUrlField.value);
    const proofText = cleanString(proofTextField && proofTextField.value);
    const openUrl = cleanString(target.getAttribute('data-open-url'));
    const requestKey = 'task-submit:' + taskHandle + ':' + Date.now();
    const task = mergeArray(computeLastModel(root).tasks, []).find(function (row) {
      return cleanString(row && row.handle) === taskHandle;
    }) || null;
    const manualGoogleReview = googleReviewManualFallbackTask(task);

    if (manualGoogleReview && !proofText) {
      showToast(root, 'Add the name shown on your Google review plus a short snippet or the date posted so the team can verify it.', 'warning');
      return;
    }

    if (requiresProof && !proofUrl && !proofText) {
      showToast(root, 'Add a note or proof link so the team can review it.', 'warning');
      return;
    }

    if (openUrl) {
      openTaskDestination(openUrl);
    }

    logRewardEvent(root, {
      event_type: 'reward_task_click',
      request_key: requestKey,
      reward_kind: 'candle_cash_task',
      surface: root.dataset.surface || 'page',
      state: taskHandle,
    });

    markBusy(root, 'Saving your task…');
    const identity = buildIdentity(root);
    const result = await fetchContract(root, root.dataset.endpointCandleCashTaskSubmit, {
      method: 'POST',
      body: Object.assign({}, bodyFromIdentity(identity), {
        task_handle: taskHandle,
        proof_url: proofUrl || null,
        proof_text: proofText || null,
        request_key: requestKey,
      }),
    });

    if (!result.ok) {
      const failureCode = result.error && result.error.code ? result.error.code : 'task_submit_failed';
      logRewardEvent(root, {
        event_type: 'reward_task_failure',
        request_key: requestKey + ':failure',
        reward_kind: 'candle_cash_task',
        surface: root.dataset.surface || 'page',
        state: failureCode,
      });
      setRootState(root, { openTaskHandle: taskHandle });
      showToast(root, failureCode === 'auto_verified_task'
        ? 'That reward lands automatically once the verified event happens.'
        : (failureCode === 'proof_text_required'
          ? 'Add the name shown on your Google review plus a short snippet or the date posted so the team can verify it.'
          : 'We could not save that task yet. Try again in a moment.'), 'warning');
      await loadAndRender(root, { force: true });
      return;
    }

    const completionState = normalizeState(result.data && result.data.state);
    logRewardEvent(root, {
      event_type: 'reward_task_success',
      request_key: requestKey + ':success',
      reward_kind: 'candle_cash_task',
      surface: root.dataset.surface || 'page',
      state: completionState || 'saved',
    });

    setRootState(root, {
      busy: false,
      openTaskHandle: '',
      toast: completionState === 'awarded'
        ? 'Candle Cash added to your account.'
        : (manualGoogleReview
          ? 'We saved your review details. Candle Cash lands after the team reviews it.'
          : 'We saved the action. Candle Cash will land once the event verifies.'),
      toastTone: 'success',
    });
    invalidateRewardsScope(root);
    await refreshRelatedRoots(root, { force: true });
    rerender(root);

    if (completionState === 'awarded' && oncePerSession(requestKey + ':confetti')) {
      celebrate(root, 'activation');
      logRewardEvent(root, {
        event_type: 'reward_confetti_shown',
        request_key: requestKey + ':confetti',
        reward_kind: 'candle_cash_task',
        surface: root.dataset.surface || 'page',
        state: 'awarded',
      });
    }
  }

  async function startGoogleReview(root, target) {
    if (rootState(root).busy) {
      return;
    }

    const destination = cleanString(target.getAttribute('data-open-url'));
    const requestKey = 'google-review-start:' + Date.now();
    const taskWindow = openTaskWindow(cleanString(root.dataset.endpointGoogleReviewStart) ? '' : destination);

    logRewardEvent(root, {
      event_type: 'reward_task_click',
      request_key: requestKey,
      reward_kind: 'candle_cash_task',
      surface: root.dataset.surface || 'page',
      state: 'google-review',
    });

    if (!cleanString(root.dataset.endpointGoogleReviewStart)) {
      navigateTaskWindow(taskWindow, destination);
      return;
    }

    markBusy(root, 'Opening Google review…');

    const identity = buildIdentity(root);
    const result = await fetchContract(root, root.dataset.endpointGoogleReviewStart, {
      method: 'POST',
      body: Object.assign({}, bodyFromIdentity(identity), {
        request_key: requestKey,
      }),
    });

    if (!result.ok) {
      const failureCode = result.error && result.error.code ? result.error.code : 'google_review_not_ready';
      const failureMessage = result.error && result.error.message ? result.error.message : 'Google review matching is not ready yet. Try again in a moment.';
      const effectiveMode = cleanString(result.error && result.error.details && result.error.details.effective_mode);
      logRewardEvent(root, {
        event_type: 'reward_task_failure',
        request_key: requestKey + ':failure',
        reward_kind: 'candle_cash_task',
        surface: root.dataset.surface || 'page',
        state: failureCode,
      });
      showToast(root, failureMessage, 'warning');
      await loadAndRender(root, { force: true });
      if (effectiveMode === 'manual_review_fallback') {
        setRootState(root, { openTaskHandle: 'google-review' });
        rerender(root);
      }
      if (taskWindow && !taskWindow.closed) {
        try {
          taskWindow.close();
        } catch (error) {
          // Ignore popup close failures.
        }
      }
      return;
    }

    const reviewUrl = cleanString(result.data && result.data.review_url) || destination;
    logRewardEvent(root, {
      event_type: 'reward_task_success',
      request_key: requestKey + ':success',
      reward_kind: 'candle_cash_task',
      surface: root.dataset.surface || 'page',
      state: 'google_review_started',
    });

    setRootState(root, {
      busy: false,
      toast: 'Google review opened. We will match it automatically once it posts.',
      toastTone: 'success',
    });
    rerender(root);

    if (reviewUrl) {
      navigateTaskWindow(taskWindow, reviewUrl);
    }
  }

  async function submitEmailSignup(root, target) {
    if (rootState(root).busy) {
      return;
    }

    const taskHandle = cleanString(target.getAttribute('data-task-handle')) || 'email-signup';
    const emailField = root.querySelector('[data-task-email="' + taskHandle + '"]');
    const firstNameField = root.querySelector('[data-task-first-name="' + taskHandle + '"]');
    const lastNameField = root.querySelector('[data-task-last-name="' + taskHandle + '"]');
    const email = cleanString(emailField && emailField.value);
    const firstName = cleanString(firstNameField && firstNameField.value);
    const lastName = cleanString(lastNameField && lastNameField.value);

    if (!email) {
      showToast(root, 'Add your email first.', 'warning');
      return;
    }

    const requestKey = 'email-signup:' + email.toLowerCase();

    logRewardEvent(root, {
      event_type: 'reward_task_click',
      request_key: requestKey,
      reward_kind: 'candle_cash_task',
      surface: root.dataset.surface || 'page',
      state: taskHandle,
    });

    markBusy(root, 'Saving your email signup…');
    const identity = buildIdentity(root);
    const result = await fetchContract(root, root.dataset.endpointConsentOptin, {
      method: 'POST',
      body: Object.assign({}, bodyFromIdentity(identity), {
        email: email,
        first_name: firstName || null,
        last_name: lastName || null,
        consent_email: true,
        award_bonus: false,
        flow: 'direct',
      }),
    });

    if (!result.ok) {
      logRewardEvent(root, {
        event_type: 'reward_task_failure',
        request_key: requestKey + ':failure',
        reward_kind: 'candle_cash_task',
        surface: root.dataset.surface || 'page',
        state: result.error && result.error.code ? result.error.code : 'email_signup_failed',
      });
      setRootState(root, { busy: false, openTaskHandle: taskHandle });
      showToast(root, 'We could not save your email signup yet.', 'warning');
      return;
    }

    root.dataset.customerEmail = email;
    root.dataset.customerFirstName = firstName;
    root.dataset.customerLastName = lastName;
    if (result.data && result.data.profile_id) {
      root.dataset.marketingProfileId = String(result.data.profile_id);
    }

    logRewardEvent(root, {
      event_type: 'reward_task_success',
      request_key: requestKey + ':success',
      reward_kind: 'candle_cash_task',
      surface: root.dataset.surface || 'page',
      state: 'awarded',
    });

    setRootState(root, {
      busy: false,
      openTaskHandle: '',
      toast: 'Email saved. $5 in Candle Cash is now attached to your account.',
      toastTone: 'success',
    });

    invalidateRewardsScope(root);
    await loadAndRender(root, { force: true });
    rerender(root);

    if (oncePerSession(requestKey + ':confetti')) {
      celebrate(root, 'activation');
      logRewardEvent(root, {
        event_type: 'reward_confetti_shown',
        request_key: requestKey + ':confetti',
        reward_kind: 'candle_cash_task',
        surface: root.dataset.surface || 'page',
        state: 'awarded',
      });
    }
  }

  async function submitSmsSignup(root, target) {
    if (rootState(root).busy) {
      return;
    }

    const taskHandle = cleanString(target.getAttribute('data-task-handle')) || 'sms-signup';
    const phoneField = root.querySelector('[data-task-phone="' + taskHandle + '"]');
    const firstNameField = root.querySelector('[data-task-first-name="' + taskHandle + '"]');
    const lastNameField = root.querySelector('[data-task-last-name="' + taskHandle + '"]');
    const phone = cleanString(phoneField && phoneField.value);
    const firstName = cleanString(firstNameField && firstNameField.value);
    const lastName = cleanString(lastNameField && lastNameField.value);

    if (!phone) {
      showToast(root, 'Add your phone number first.', 'warning');
      return;
    }

    const requestKey = 'sms-signup:' + phone.replace(/\D+/g, '');

    logRewardEvent(root, {
      event_type: 'reward_task_click',
      request_key: requestKey,
      reward_kind: 'candle_cash_task',
      surface: root.dataset.surface || 'page',
      state: taskHandle,
    });

    markBusy(root, 'Saving your text signup…');
    const identity = buildIdentity(root);
    const result = await fetchContract(root, root.dataset.endpointConsentOptin, {
      method: 'POST',
      body: Object.assign({}, bodyFromIdentity(identity), {
        phone: phone,
        first_name: firstName || null,
        last_name: lastName || null,
        consent_sms: true,
        award_bonus: false,
        flow: 'direct',
      }),
    });

    if (!result.ok) {
      logRewardEvent(root, {
        event_type: 'reward_task_failure',
        request_key: requestKey + ':failure',
        reward_kind: 'candle_cash_task',
        surface: root.dataset.surface || 'page',
        state: result.error && result.error.code ? result.error.code : 'sms_signup_failed',
      });
      setRootState(root, { busy: false, openTaskHandle: taskHandle });
      showToast(root, 'We could not save your text signup yet.', 'warning');
      return;
    }

    root.dataset.customerPhone = phone;
    root.dataset.customerFirstName = firstName;
    root.dataset.customerLastName = lastName;
    if (result.data && result.data.profile_id) {
      root.dataset.marketingProfileId = String(result.data.profile_id);
    }

    logRewardEvent(root, {
      event_type: 'reward_task_success',
      request_key: requestKey + ':success',
      reward_kind: 'candle_cash_task',
      surface: root.dataset.surface || 'page',
      state: 'awarded',
    });

    setRootState(root, {
      busy: false,
      openTaskHandle: '',
      toast: 'Texts are on. Candle Cash is now attached to your account.',
      toastTone: 'success',
    });

    invalidateRewardsScope(root);
    await loadAndRender(root, { force: true });
    rerender(root);

    if (oncePerSession(requestKey + ':confetti')) {
      celebrate(root, 'activation');
      logRewardEvent(root, {
        event_type: 'reward_confetti_shown',
        request_key: requestKey + ':confetti',
        reward_kind: 'candle_cash_task',
        surface: root.dataset.surface || 'page',
        state: 'awarded',
      });
    }
  }

  function toggleOpportunityCard(root, opportunityId) {
    const nextOpportunityId = cleanString(opportunityId);
    if (!nextOpportunityId) {
      return;
    }

    const state = rootState(root);
    const currentlyOpen = cleanString(state.openOpportunityId) === nextOpportunityId;

    setRootState(root, {
      openOpportunityId: currentlyOpen ? '' : nextOpportunityId,
      openTaskHandle: '',
      formOpen: !currentlyOpen && nextOpportunityId === 'birthday' ? state.formOpen : false,
      themePanelOpen: false,
    });
    rerender(root);
  }

  async function handleAction(root, target) {
    const action = cleanString(target.getAttribute('data-action'));

    if (action === 'set-tab') {
      switchPageTab(root, target.getAttribute('data-tab-target'), { focus: true });
      return;
    }

    if (action === 'set-theme') {
      setRootState(root, { themePanelOpen: false });
      syncMountedThemes(cleanString(target.getAttribute('data-theme-choice')));
      return;
    }

    if (action === 'toggle-theme-panel') {
      setRootState(root, {
        themePanelOpen: !rootState(root).themePanelOpen,
      });
      rerender(root);
      return;
    }

    if (action === 'toggle-birthday-form') {
      const state = rootState(root);
      setRootState(root, {
        formOpen: !state.formOpen,
        openOpportunityId: 'birthday',
        openTaskHandle: '',
        themePanelOpen: false,
        toast: '',
        toastTone: 'neutral',
      });
      rerender(root);
      return;
    }

    if (action === 'refresh-status') {
      await refreshStatus(root);
      return;
    }

    if (action === 'save-birthday') {
      await saveBirthday(root);
      return;
    }

    if (action === 'activate-birthday') {
      await activateBirthday(root);
      return;
    }

    if (action === 'apply-reward') {
      await applyReward(root, target);
      return;
    }

    if (action === 'redeem-reward') {
      await redeemReward(root, target);
      return;
    }

    if (action === 'remove-reward') {
      await removeReward(root, target);
      return;
    }

    if (action === 'copy-code') {
      await copyValue(root, cleanString(target.getAttribute('data-code')), 'Reward code copied.');
      return;
    }

    if (action === 'copy-referral') {
      await copyValue(root, cleanString(target.getAttribute('data-referral-value')), 'Referral link copied.');
      return;
    }

    if (action === 'share-referral') {
      await shareReferral(root, cleanString(target.getAttribute('data-referral-value')));
      return;
    }

    if (action === 'open-product-review-drawer') {
      const requestedScope = cleanString(root.dataset.surface || 'page') === 'page' ? 'sitewide' : 'product';
      prefetchRewardsModel(root);
      dispatchReviewPrefetch({
        source: 'candle_cash_open_click',
        scope: requestedScope,
      });
      const reviewDrawer = document.querySelector('[data-forestry-sitewide-reviews]');
      if (reviewDrawer) {
        document.dispatchEvent(new CustomEvent('forestry:open-reviews-drawer', {
          detail: {
            scope: requestedScope,
            source: 'candle_cash',
          },
        }));
        logRewardEvent(root, {
          event_type: 'reward_task_open_click',
          request_key: 'product-review-open:' + Date.now(),
          reward_kind: 'product_review',
          surface: root.dataset.surface || 'page',
          meta: {
            task_handle: cleanString(target.getAttribute('data-task-handle')) || 'product-review',
            destination: 'product_reviews_drawer',
          },
        });
      } else {
        const toggle = document.querySelector('[data-action=\"forestry-review-open-drawer\"]') || document.querySelector('[data-action=\"forestry-sitewide-reviews-toggle\"]');
        const openedDrawer = !!(toggle && typeof toggle.click === 'function');

        if (openedDrawer) {
          toggle.click();
        } else {
          openTaskDestination('/collections/all');
        }

        logRewardEvent(root, {
          event_type: 'reward_task_open_click',
          request_key: 'product-review-open:' + Date.now(),
          reward_kind: 'product_review',
          surface: root.dataset.surface || 'page',
          meta: {
            task_handle: cleanString(target.getAttribute('data-task-handle')) || 'product-review',
            destination: openedDrawer ? 'product_reviews_drawer' : 'browse_products',
          },
        });
      }
      return;
    }

    if (action === 'toggle-task-form') {
      const handle = cleanString(target.getAttribute('data-task-handle'));
      const state = rootState(root);
      const nextOpenTaskHandle = state.openTaskHandle === handle ? '' : handle;
      setRootState(root, {
        openTaskHandle: nextOpenTaskHandle,
        openOpportunityId: taskOpportunityId({ handle: handle }),
        formOpen: false,
        themePanelOpen: false,
        toast: '',
        toastTone: 'neutral',
      });
      rerender(root);
      return;
    }

    if (action === 'submit-task') {
      await submitTask(root, target);
      return;
    }

    if (action === 'start-google-review') {
      await startGoogleReview(root, target);
      return;
    }

    if (action === 'submit-email-signup') {
      await submitEmailSignup(root, target);
      return;
    }

    if (action === 'submit-sms-signup') {
      await submitSmsSignup(root, target);
    }
  }

  function registerEvents(root) {
    root.addEventListener('click', function (event) {
      const target = event.target.closest('[data-action]');
      if (!target || !root.contains(target)) {
        return;
      }

      event.preventDefault();
      handleAction(root, target);
    });

    root.addEventListener('pointerover', function (event) {
      const actionTarget = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
      if (!actionTarget || !root.contains(actionTarget)) {
        return;
      }

      const action = cleanString(actionTarget.getAttribute('data-action'));
      if (
        action === 'redeem-reward' ||
        action === 'apply-reward' ||
        action === 'refresh-status' ||
        action === 'open-product-review-drawer'
      ) {
        prefetchRewardsModel(root);
      }

      if (cleanString(root.dataset.surface) !== 'page' || root.__forestryReviewPrefetchInteractive) {
        return;
      }

      if (action !== 'open-product-review-drawer') {
        return;
      }

      root.__forestryReviewPrefetchInteractive = true;
      dispatchReviewPrefetch({ source: 'candle_cash_hover' });
    });

    root.addEventListener('focusin', function (event) {
      const actionTarget = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
      if (!actionTarget || !root.contains(actionTarget)) {
        return;
      }

      const action = cleanString(actionTarget.getAttribute('data-action'));
      if (
        action === 'redeem-reward' ||
        action === 'apply-reward' ||
        action === 'refresh-status' ||
        action === 'open-product-review-drawer'
      ) {
        prefetchRewardsModel(root);
      }

      if (cleanString(root.dataset.surface) !== 'page' || action !== 'open-product-review-drawer') {
        return;
      }

      dispatchReviewPrefetch({ source: 'candle_cash_focus' });
    });

    root.addEventListener('click', function (event) {
      if (cleanString(root.dataset.surface) !== 'page') {
        return;
      }

      if (event.target && event.target.closest && event.target.closest('a, button, input, textarea, select, label')) {
        return;
      }

      const card = event.target && event.target.closest ? event.target.closest('.reward-card[data-opportunity-id]') : null;
      if (!card || !root.contains(card)) {
        return;
      }

      toggleOpportunityCard(root, card.getAttribute('data-opportunity-id'));
    });

    root.addEventListener('click', function (event) {
      if (!rootState(root).themePanelOpen) {
        return;
      }

      if (event.target && event.target.closest && event.target.closest('.ForestryRewardsThemeControl')) {
        return;
      }

      setRootState(root, { themePanelOpen: false });
      rerender(root);
    });

    root.addEventListener('keydown', function (event) {
      const tab = event.target && event.target.closest ? event.target.closest('[role="tab"][data-tab-target]') : null;
      if (!tab || !root.contains(tab)) {
        return;
      }

      const tabs = Array.from(root.querySelectorAll('[role="tab"][data-tab-target]'));
      const currentIndex = tabs.indexOf(tab);
      if (currentIndex < 0) {
        return;
      }

      let nextIndex = -1;
      if (event.key === 'ArrowRight' || event.key === 'Right') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'Left') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      }

      if (nextIndex < 0) {
        return;
      }

      event.preventDefault();
      switchPageTab(root, tabs[nextIndex].getAttribute('data-tab-target'), { focus: true });
    });

    root.addEventListener('keydown', function (event) {
      if (cleanString(root.dataset.surface) !== 'page') {
        return;
      }

      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      const card = event.target && event.target.closest ? event.target.closest('.reward-card[data-opportunity-id]') : null;
      if (!card || !root.contains(card) || event.target !== card) {
        return;
      }

      event.preventDefault();
      toggleOpportunityCard(root, card.getAttribute('data-opportunity-id'));
    });

    root.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !rootState(root).themePanelOpen) {
        return;
      }

      setRootState(root, { themePanelOpen: false });
      rerender(root);
    });
  }

  function observeDrawer(root) {
    const drawer = root.closest('.Drawer');
    if (!drawer) {
      loadAndRender(root);
      return;
    }

    const hydrateIfOpen = function () {
      if (drawer.getAttribute('aria-hidden') === 'false') {
        loadAndRender(root);
      }
    };

    hydrateIfOpen();
    const observer = new MutationObserver(hydrateIfOpen);
    observer.observe(drawer, { attributes: true, attributeFilter: ['aria-hidden'] });
  }

  function mount(root) {
    if (runtime.mounted.has(root)) {
      return;
    }

    const surface = cleanString(root.dataset.surface || '');
    runtime.mounted.add(root);
    applyRewardsTheme(root, activeRewardsTheme(root));
    if (surface === 'page') {
      const requestedTask = requestedTaskHandleFromUrl();
      if (requestedTask) {
        setRootState(root, {
          openTaskHandle: requestedTask,
          openOpportunityId: taskOpportunityId({ handle: requestedTask }),
        });
      }
    }
    registerEvents(root);

    if (surface === 'drawer' || surface === 'sidebar') {
      observeDrawer(root);
      return;
    }

    if (!root.__forestryIdlePrefetchScheduled && surface !== 'header') {
      root.__forestryIdlePrefetchScheduled = true;
      const prefetch = function () {
        prefetchRewardsModel(root);
        if (surface === 'page' && root.querySelector('[data-action="open-product-review-drawer"]')) {
          dispatchReviewPrefetch({ source: 'candle_cash_idle' });
        }
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(prefetch, { timeout: 1100 });
      } else {
        window.setTimeout(prefetch, 320);
      }
    }

    loadAndRender(root);
  }

  function refreshMounted(options) {
    const settings = Object.assign({ force: false }, options || {});
    Array.from(runtime.mounted).forEach(function (root) {
      if (!root || !document.body.contains(root)) {
        runtime.mounted.delete(root);
        return;
      }

      loadAndRender(root, settings);
    });

    scan();
  }

  function scan() {
    activeReferralCode();
    document.querySelectorAll(ROOT_SELECTOR).forEach(mount);
  }

  function observeDom() {
    if (runtime.domObserver || !window.MutationObserver) {
      return;
    }

    runtime.domObserver = new MutationObserver(function (mutations) {
      let shouldScan = false;

      mutations.forEach(function (mutation) {
        if (shouldScan) {
          return;
        }

        mutation.addedNodes.forEach(function (node) {
          if (shouldScan || !node || node.nodeType !== 1) {
            return;
          }

          if ((node.matches && node.matches(ROOT_SELECTOR)) || (node.querySelector && node.querySelector(ROOT_SELECTOR))) {
            shouldScan = true;
          }
        });
      });

      if (shouldScan) {
        window.setTimeout(scan, 0);
      }
    });

    runtime.domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  document.addEventListener('DOMContentLoaded', scan);
  document.addEventListener('DOMContentLoaded', observeDom);
  document.addEventListener('forestry:rewards:refresh', function () {
    refreshMounted({ force: true });
  });
  document.documentElement.addEventListener('cart:refresh', function () {
    invalidateCartCache();
    window.setTimeout(function () {
      refreshMounted({ force: true });
    }, 180);
  });
  document.addEventListener('shopify:section:load', function () {
    window.setTimeout(scan, 0);
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      window.setTimeout(function () {
        refreshMounted({ force: true });
      }, 0);
      return;
    }

    window.setTimeout(scan, 0);
  });

  if (document.readyState !== 'loading') {
    observeDom();
    scan();
  }
})();

(function () {
  const CINEMATIC_SELECTOR = '[data-candle-cash-cinematic]';
  const INTRO_DURATION_MS = 5000;
  const REMEMBERED_INTRO_DURATION_MS = 1800;
  const STORAGE_KEY = 'candleCashIntroSeen';
  const DEBUG_PARAM = 'candle_cash_intro';
  const PORTAL_PARAM = 'candle_cash_portal';
  const PORTAL_STORAGE_KEY = 'candleCashPortalTransition';
  const INLINE_AUTH_BREAKPOINT = '(min-width: 901px)';
  const PORTAL_DURATION_MS = 560;
  const WHEEL_SKIP_THRESHOLD = 24;
  let activeCinematicController = null;

  function cleanCinematicValue(value) {
    return value == null ? '' : String(value).trim();
  }

  function cinematicInlineAuthEnabled() {
    return window.matchMedia ? cinematicMatchMedia(INLINE_AUTH_BREAKPOINT) : window.innerWidth > 900;
  }

  function cinematicMatchMedia(query) {
    return window.matchMedia && window.matchMedia(query).matches;
  }

  function cinematicPrefersReducedMotion() {
    return cinematicMatchMedia('(prefers-reduced-motion: reduce)');
  }

  function cinematicSupportsFinePointer() {
    return cinematicMatchMedia('(hover: hover) and (pointer: fine)');
  }

  function cinematicStorageSafe() {
    try {
      const key = '__candleCashIntroStorage';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function cinematicSessionSafe() {
    try {
      const key = '__candleCashPortalSession';
      window.sessionStorage.setItem(key, '1');
      window.sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function writePortalTransition(target) {
    if (!cinematicSessionSafe()) {
      return;
    }

    window.sessionStorage.setItem(PORTAL_STORAGE_KEY, JSON.stringify({
      target: cleanCinematicValue(target).toLowerCase(),
      createdAt: Date.now(),
    }));
  }

  function readCinematicMemory() {
    if (!cinematicStorageSafe()) {
      return false;
    }

    return cleanCinematicValue(window.localStorage.getItem(STORAGE_KEY)) === 'true';
  }

  function writeCinematicMemory() {
    if (!cinematicStorageSafe()) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, 'true');
  }

  function clearCinematicMemory() {
    if (!cinematicStorageSafe()) {
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
  }

  function requestedCinematicMode() {
    const params = new URLSearchParams(window.location.search || '');
    const value = cleanCinematicValue(params.get(DEBUG_PARAM)).toLowerCase();

    if (value === 'reset') {
      clearCinematicMemory();
      return 'full';
    }

    if (value === 'full' || value === 'replay') {
      return 'full';
    }

    if (value === 'skip' || value === 'settled') {
      writeCinematicMemory();
      return 'remembered';
    }

    return '';
  }

  function requestedPortalState() {
    const params = new URLSearchParams(window.location.search || '');
    const value = cleanCinematicValue(params.get(PORTAL_PARAM)).toLowerCase();

    if (value === 'login' || value === 'register' || value === 'minimized') {
      return value;
    }

    return '';
  }

  function cinematicPortalUrl(href, target) {
    const destination = cleanCinematicValue(href);
    const portalTarget = cleanCinematicValue(target).toLowerCase();

    if (!destination || !portalTarget) {
      return destination;
    }

    const helpers = window.ForestryAuthUrls;

    if (!helpers || typeof helpers.buildAuthUrl !== 'function' || typeof helpers.returnUrlForTarget !== 'function') {
      try {
        const url = new URL(destination, window.location.origin);
        url.searchParams.set('candle_cash_portal', portalTarget);
        return url.pathname + url.search + url.hash;
      } catch (error) {
        return destination;
      }
    }

    return helpers.buildAuthUrl(destination, {
      kind: portalTarget,
      portal: portalTarget,
      returnUrl: helpers.returnUrlForTarget(portalTarget),
    });
  }

  function upgradeCinematicMarkup(root) {
    if (!root) {
      return;
    }

    const hasInlineAuth = !!root.querySelector('[data-candle-cash-portal-surface="login"]');
    const panelCopy = root.querySelector('.CandleCashCinematic__panel-copy');
    const actions = root.querySelector('.CandleCashCinematic__actions');
    const skipButton = root.querySelector('[data-candle-cash-skip]') || root.querySelector('.CandleCashCinematic__skip');
    let controls = root.querySelector('.CandleCashCinematic__controls');
    let minimizeButton = root.querySelector('[data-candle-cash-minimize]');

    if (!root.dataset.cinematicView) {
      root.dataset.cinematicView = 'full';
    }

    if (!root.dataset.cinematicTransition) {
      root.dataset.cinematicTransition = 'idle';
    }

    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'CandleCashCinematic__controls';
      root.insertBefore(controls, root.firstChild);
    }

    if (!minimizeButton) {
      minimizeButton = document.createElement('button');
      minimizeButton.className = 'CandleCashCinematic__control CandleCashCinematic__control--minimize';
      minimizeButton.type = 'button';
      minimizeButton.setAttribute('data-candle-cash-minimize', '');
      minimizeButton.setAttribute('aria-pressed', 'false');
      minimizeButton.textContent = 'MINIMIZE';
      controls.insertBefore(minimizeButton, controls.firstChild || null);
    }

    if (skipButton) {
      skipButton.classList.add('CandleCashCinematic__skip');
      skipButton.setAttribute('data-candle-cash-skip', '');
      if (skipButton.parentNode !== controls) {
        controls.appendChild(skipButton);
      }
    }

    if (panelCopy) {
      panelCopy.textContent = 'Log in to step through the portal, save on future purchases, and unlock member-only benefits.';
    }

    if (actions) {
      const links = actions.querySelectorAll('a[href]');

      if (links[0]) {
        if (hasInlineAuth) {
          links[0].href = cinematicPortalUrl(links[0].getAttribute('href'), 'login');
        }
        links[0].setAttribute('data-candle-cash-portal-link', '');
        links[0].setAttribute('data-portal-target', 'login');
      }

      if (links[1]) {
        if (hasInlineAuth) {
          links[1].href = cinematicPortalUrl(links[1].getAttribute('href'), 'register');
        }
        links[1].setAttribute('data-candle-cash-portal-link', '');
        links[1].setAttribute('data-portal-target', 'register');
      }
    }
  }

  function createCinematicController(root) {
    const introListeners = [];
    const interactiveListeners = [];
    const uiListeners = [];
    let introTimer = 0;
    let enterFrame = 0;
    let pointerFrame = 0;
    let portalTimer = 0;
    let pointerRect = null;
    let pointerTargetX = 0.5;
    let pointerTargetY = 0.5;

    function bind(target, type, handler, options, bucket) {
      if (!target) {
        return;
      }

      const opts = options || false;
      target.addEventListener(type, handler, opts);
      bucket.push(function () {
        target.removeEventListener(type, handler, opts);
      });
    }

    function cleanup(bucket) {
      while (bucket.length) {
        const unbind = bucket.pop();
        if (typeof unbind === 'function') {
          unbind();
        }
      }
    }

    function stopIntroTimer() {
      if (!introTimer) {
        return;
      }

      window.clearTimeout(introTimer);
      introTimer = 0;
    }

    function stopEnterFrame() {
      if (!enterFrame) {
        return;
      }

      window.cancelAnimationFrame(enterFrame);
      enterFrame = 0;
    }

    function stopPointerFrame() {
      if (!pointerFrame) {
        return;
      }

      window.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
    }

    function stopPortalTimer() {
      if (!portalTimer) {
        return;
      }

      window.clearTimeout(portalTimer);
      portalTimer = 0;
    }

    function applyPointerState(x, y) {
      const shiftX = (x - 0.5) * 10;
      const shiftY = (y - 0.5) * 8;

      root.style.setProperty('--candle-cash-pointer-x', (x * 100).toFixed(2) + '%');
      root.style.setProperty('--candle-cash-pointer-y', (y * 100).toFixed(2) + '%');
      root.style.setProperty('--candle-cash-shift-x', shiftX.toFixed(2) + 'px');
      root.style.setProperty('--candle-cash-shift-y', shiftY.toFixed(2) + 'px');
    }

    function queuePointerFrame() {
      if (pointerFrame) {
        return;
      }

      pointerFrame = window.requestAnimationFrame(function () {
        pointerFrame = 0;
        applyPointerState(pointerTargetX, pointerTargetY);
      });
    }

    function resetPointerState() {
      pointerTargetX = 0.5;
      pointerTargetY = 0.5;
      queuePointerFrame();
    }

    function markSeen() {
      root.dataset.cinematicSeen = 'true';
      writeCinematicMemory();
    }

    function prefetchPortalDestination(href) {
      const destination = cleanCinematicValue(href);

      if (!destination || !document.head || document.head.querySelector('link[data-candle-cash-prefetch="' + destination + '"]')) {
        return;
      }

      const hint = document.createElement('link');
      hint.rel = 'prefetch';
      hint.as = 'document';
      hint.href = destination;
      hint.setAttribute('data-candle-cash-prefetch', destination);
      document.head.appendChild(hint);
    }

    function minimizeButton() {
      return root.querySelector('[data-candle-cash-minimize]');
    }

    function standardRoot() {
      return document.querySelector('[data-candle-cash-standard-root]');
    }

    function portalMode() {
      return cleanCinematicValue(root.getAttribute('data-candle-cash-portal-mode')).toLowerCase() || 'hero';
    }

    function writePortalUrl(mode, view) {
      const url = new URL(window.location.href);
      const nextMode = cleanCinematicValue(mode).toLowerCase();
      const nextView = cleanCinematicValue(view).toLowerCase();

      if (nextView === 'minimized') {
        url.searchParams.set(PORTAL_PARAM, 'minimized');
      } else if (nextMode === 'login' || nextMode === 'register') {
        url.searchParams.set(PORTAL_PARAM, nextMode);
      } else {
        url.searchParams.delete(PORTAL_PARAM);
      }

      window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    }

    function syncPortalSurfaces(mode) {
      root.querySelectorAll('[data-candle-cash-portal-surface]').forEach(function (surface) {
        const isActive = cleanCinematicValue(surface.getAttribute('data-candle-cash-portal-surface')).toLowerCase() === mode;
        surface.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
    }

    function focusPortalMode(mode) {
      const activeSurface = root.querySelector('[data-candle-cash-portal-surface="' + mode + '"]');
      if (!activeSurface) {
        return;
      }

      const candidate = activeSurface.querySelector('input, button, a, textarea, select');
      if (candidate && typeof candidate.focus === 'function') {
        candidate.focus({ preventScroll: true });
      }
    }

    function syncGlobalRewardsAuthState(mode, view) {
      const authMode = view !== 'minimized' && (mode === 'login' || mode === 'register') ? mode : '';
      const target = document.documentElement;

      if (!target) {
        return;
      }

      if (authMode) {
        target.setAttribute('data-forestry-rewards-auth', authMode);
        return;
      }

      target.removeAttribute('data-forestry-rewards-auth');
    }

    function setPortalMode(nextMode, options) {
      const mode = nextMode === 'login' || nextMode === 'register' ? nextMode : 'hero';
      const settings = options || {};

      root.setAttribute('data-candle-cash-portal-mode', mode);
      syncPortalSurfaces(mode);
      syncGlobalRewardsAuthState(mode, root.dataset.cinematicView || 'full');

      if (settings.updateHistory !== false) {
        writePortalUrl(mode, root.dataset.cinematicView);
      }

      if (settings.focus) {
        window.setTimeout(function () {
          focusPortalMode(mode);
        }, cinematicPrefersReducedMotion() ? 0 : 140);
      }
    }

    function scrollToStandardRoot() {
      const target = standardRoot();
      if (!target || typeof target.scrollIntoView !== 'function') {
        return;
      }

      target.scrollIntoView({
        behavior: cinematicPrefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    }

    function syncStandardRootVisibility(view) {
      const target = standardRoot();
      const isVisible = view === 'minimized';

      if (!target) {
        return;
      }

      target.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
      target.dataset.standardVisibility = isVisible ? 'visible' : 'hidden';

      if ('inert' in target) {
        target.inert = !isVisible;
      }
    }

    function setCinematicView(nextView) {
      const view = nextView === 'minimized' ? 'minimized' : 'full';
      const button = minimizeButton();

      root.dataset.cinematicView = view;
      writePortalUrl(portalMode(), view);
      syncStandardRootVisibility(view);
      syncGlobalRewardsAuthState(portalMode(), view);

      if (!button) {
        return;
      }

      button.textContent = view === 'minimized' ? 'RESTORE' : 'MINIMIZE';
      button.setAttribute('aria-pressed', view === 'minimized' ? 'true' : 'false');
    }

    function minimizePortal() {
      setPortalMode('hero', { updateHistory: false });
      setCinematicView('minimized');
      scrollToStandardRoot();
    }

    function toggleCinematicView() {
      if (root.dataset.cinematicView === 'minimized') {
        setCinematicView('full');
        return;
      }

      minimizePortal();
    }

    function enableInteractiveState() {
      if (root.dataset.cinematicInteractive === 'true') {
        return;
      }

      if (cinematicPrefersReducedMotion() || !cinematicSupportsFinePointer()) {
        root.dataset.cinematicInteractive = 'false';
        return;
      }

      root.dataset.cinematicInteractive = 'true';
      applyPointerState(0.5, 0.5);

      bind(root, 'pointerenter', function () {
        pointerRect = root.getBoundingClientRect();
      }, { passive: true }, interactiveListeners);

      bind(root, 'pointermove', function (event) {
        if (root.dataset.cinematicInteractive !== 'true') {
          return;
        }

        pointerRect = pointerRect || root.getBoundingClientRect();
        pointerTargetX = Math.max(0, Math.min(1, (event.clientX - pointerRect.left) / Math.max(pointerRect.width, 1)));
        pointerTargetY = Math.max(0, Math.min(1, (event.clientY - pointerRect.top) / Math.max(pointerRect.height, 1)));
        queuePointerFrame();
      }, { passive: true }, interactiveListeners);

      bind(root, 'pointerleave', function () {
        pointerRect = null;
        resetPointerState();
      }, { passive: true }, interactiveListeners);

      bind(window, 'resize', function () {
        pointerRect = null;
      }, { passive: true }, interactiveListeners);
    }

    function settle(reason, immediate) {
      stopIntroTimer();
      stopEnterFrame();
      cleanup(introListeners);
      root.dataset.cinematicSpeed = immediate ? 'instant' : 'normal';
      root.dataset.cinematicPath = reason || 'settled';
      root.dataset.cinematicState = 'settled';
      markSeen();
      enableInteractiveState();
    }

    function skip(reason) {
      settle(reason || 'skipped', true);
    }

    function bindSkipBehavior() {
      const skipButton = root.querySelector('[data-candle-cash-skip]');

      bind(root, 'pointerdown', function (event) {
        if (root.dataset.cinematicState === 'settled') {
          return;
        }

        if (event.target && event.target.closest && event.target.closest('[data-candle-cash-minimize], [data-candle-cash-skip]')) {
          return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }

        skip('skipped');
      }, { passive: true }, introListeners);

      if (!window.PointerEvent) {
        bind(root, 'touchstart', function () {
          if (root.dataset.cinematicState !== 'settled') {
            skip('skipped');
          }
        }, { passive: true }, introListeners);
      }

      bind(window, 'wheel', function (event) {
        if (root.dataset.cinematicState === 'settled') {
          return;
        }

        if ((Math.abs(event.deltaX) + Math.abs(event.deltaY)) >= WHEEL_SKIP_THRESHOLD) {
          skip('scrolled');
        }
      }, { passive: true }, introListeners);

      bind(document, 'keydown', function (event) {
        if (event.key === 'Escape' && root.dataset.cinematicState !== 'settled') {
          skip('escaped');
        }
      }, false, introListeners);

      bind(skipButton, 'click', function (event) {
        event.preventDefault();
        if (root.dataset.cinematicState !== 'settled') {
          skip('skip-control');
        }
      }, false, introListeners);
    }

    function bindViewBehavior() {
      const button = minimizeButton();

      bind(button, 'click', function (event) {
        event.preventDefault();
        toggleCinematicView();
      }, false, uiListeners);
    }

    function openPortalMode(mode) {
      if (root.dataset.cinematicState !== 'settled') {
        skip('portal-open');
      }

      setCinematicView('full');
      setPortalMode(mode, { focus: true });
    }

    function startPortalTransition(target, href) {
      const destination = cleanCinematicValue(href);
      const portalTarget = cleanCinematicValue(target).toLowerCase() || 'login';

      if (!destination) {
        return;
      }

      writePortalTransition(portalTarget);

      if (cinematicPrefersReducedMotion()) {
        window.location.href = destination;
        return;
      }

      stopIntroTimer();
      stopEnterFrame();
      cleanup(introListeners);
      cleanup(interactiveListeners);
      stopPointerFrame();
      root.dataset.cinematicInteractive = 'false';
      root.dataset.cinematicPath = 'portal-' + portalTarget;
      root.dataset.cinematicState = 'settled';
      root.dataset.cinematicTransition = 'out';

      portalTimer = window.setTimeout(function () {
        window.location.href = destination;
      }, PORTAL_DURATION_MS);
    }

    function bindPortalBehavior() {
      root.querySelectorAll('[data-candle-cash-portal-open], [data-candle-cash-portal-link]').forEach(function (link) {
        prefetchPortalDestination(link.getAttribute('href'));

        bind(link, 'click', function (event) {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }

          const target = cleanCinematicValue(link.getAttribute('data-candle-cash-portal-open') || link.getAttribute('data-portal-target')).toLowerCase();
          const inlineTarget = link.hasAttribute('data-candle-cash-portal-open');
          const href = cleanCinematicValue(link.getAttribute('href'));
          const allowInlinePortal = cinematicInlineAuthEnabled();
          let destinationPath = '';

          if (href) {
            try {
              destinationPath = new URL(href, window.location.origin).pathname;
            } catch (error) {
              destinationPath = '';
            }
          }

          if (target && allowInlinePortal && (inlineTarget || destinationPath === window.location.pathname)) {
            event.preventDefault();
            openPortalMode(target);
            return;
          }

          if (!allowInlinePortal) {
            return;
          }

          event.preventDefault();
          startPortalTransition(target, href);
        }, false, uiListeners);
      });

      root.querySelectorAll('[data-candle-cash-portal-back]').forEach(function (button) {
        bind(button, 'click', function (event) {
          event.preventDefault();
          setPortalMode('hero', { focus: true });
        }, false, uiListeners);
      });

      root.querySelectorAll('[data-candle-cash-minimize-inline]').forEach(function (button) {
        bind(button, 'click', function (event) {
          event.preventDefault();
          minimizePortal();
        }, false, uiListeners);
      });
    }

    function startIntro(speed) {
      const introSpeed = speed === 'remembered' ? 'remembered' : 'normal';
      const introDuration = introSpeed === 'remembered' ? REMEMBERED_INTRO_DURATION_MS : INTRO_DURATION_MS;

      root.dataset.cinematicInteractive = 'false';
      root.dataset.cinematicSpeed = introSpeed;
      root.dataset.cinematicPath = introSpeed === 'remembered' ? 'remembered-intro' : 'intro';
      root.dataset.cinematicState = 'pre';
      bindSkipBehavior();

      enterFrame = window.requestAnimationFrame(function () {
        if (root.dataset.cinematicState !== 'pre') {
          return;
        }

        enterFrame = window.requestAnimationFrame(function () {
          if (root.dataset.cinematicState === 'pre') {
            root.dataset.cinematicState = 'enter';
          }
        });
      });

      introTimer = window.setTimeout(function () {
        settle(introSpeed === 'remembered' ? 'remembered-complete' : 'intro-complete', false);
      }, introDuration);
    }

    return {
      root: root,
      init: function () {
        const requestedMode = requestedCinematicMode();
        const requestedPortal = requestedPortalState();

        setCinematicView('full');
        setPortalMode('hero', { updateHistory: false });
        root.setAttribute('data-candle-cash-authing', 'false');
        root.dataset.cinematicTransition = 'idle';
        bindViewBehavior();
        bindPortalBehavior();

        if (cinematicPrefersReducedMotion()) {
          settle('reduced-motion', true);
          if (requestedPortal === 'login' || requestedPortal === 'register') {
            setPortalMode(requestedPortal, { updateHistory: false });
          } else if (requestedPortal === 'minimized') {
            setCinematicView('minimized');
          }
          return;
        }

        if (requestedPortal === 'login' || requestedPortal === 'register') {
          settle('portal-requested', true);
          setPortalMode(requestedPortal, { updateHistory: false, focus: true });
          return;
        }

        if (requestedPortal === 'minimized') {
          settle('portal-minimized', true);
          setCinematicView('minimized');
          return;
        }

        if (requestedMode === 'full') {
          clearCinematicMemory();
          startIntro('normal');
          return;
        }

        if (requestedMode === 'remembered' || readCinematicMemory()) {
          startIntro('remembered');
          return;
        }

        startIntro('normal');
      },
      destroy: function () {
        stopIntroTimer();
        stopEnterFrame();
        stopPointerFrame();
        stopPortalTimer();
        cleanup(introListeners);
        cleanup(interactiveListeners);
        cleanup(uiListeners);
        pointerRect = null;
        root.setAttribute('data-candle-cash-authing', 'false');
        root.dataset.cinematicInteractive = 'false';
        syncGlobalRewardsAuthState('hero', 'full');
        applyPointerState(0.5, 0.5);
      },
    };
  }

  function initCandleCashCinematic() {
    const root = document.querySelector(CINEMATIC_SELECTOR);
    if (!root) {
      if (activeCinematicController) {
        activeCinematicController.destroy();
        activeCinematicController = null;
      }
      return;
    }

    if (activeCinematicController) {
      activeCinematicController.destroy();
    }

    upgradeCinematicMarkup(root);
    activeCinematicController = createCinematicController(root);
    activeCinematicController.init();
  }

  if (document.readyState !== 'loading') {
    initCandleCashCinematic();
  } else {
    document.addEventListener('DOMContentLoaded', initCandleCashCinematic);
  }

  document.addEventListener('shopify:section:load', initCandleCashCinematic);
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      initCandleCashCinematic();
    }
  });
})();

(function () {
  const AUTH_SELECTOR = '[data-candle-cash-auth]';
  const WELCOME_SELECTOR = '[data-candle-cash-welcome]';
  const PAGE_ROOT_SELECTOR = '[data-forestry-rewards-root][data-surface="page"]';
  const AUTH_INTENT_KEY = 'candleCashAuthIntent';
  const PORTAL_STORAGE_KEY = 'candleCashPortalTransition';
  const PORTAL_PARAM = 'candle_cash_portal';
  const PORTAL_MAX_AGE_MS = 15000;
  const AUTH_PORTAL_SETTLE_MS = 1250;
  const AUTH_PORTAL_OUT_MS = 520;
  const WELCOME_PARAM = 'candle_cash_welcome';
  const MIN_WELCOME_DURATION_MS = 1600;
  const MAX_WELCOME_WAIT_MS = 2600;
  const WELCOME_DISSOLVE_MS = 1100;
  const REWARDS_REFRESH_SETTLE_MS = 360;
  const INLINE_AUTH_BREAKPOINT = '(min-width: 901px)';

  function cleanValue(value) {
    return value == null ? '' : String(value).trim();
  }

  function readSessionJson(key) {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeSessionJson(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // ignore
    }
  }

  function removeSessionValue(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (error) {
      // ignore
    }
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function authPortalUrl(href, target) {
    const destination = cleanValue(href);
    const portalTarget = cleanValue(target).toLowerCase();

    if (!destination || !portalTarget) {
      return destination;
    }

    const helpers = window.ForestryAuthUrls;

    if (!helpers || typeof helpers.buildAuthUrl !== 'function' || typeof helpers.returnUrlForTarget !== 'function') {
      try {
        const url = new URL(destination, window.location.origin);
        url.searchParams.set(PORTAL_PARAM, portalTarget);
        return url.pathname + url.search + url.hash;
      } catch (error) {
        return destination;
      }
    }

    return helpers.buildAuthUrl(destination, {
      kind: portalTarget,
      portal: portalTarget,
      returnUrl: helpers.returnUrlForTarget(portalTarget),
    });
  }

  function authForm(container) {
    return container.querySelector('#customer_login, #create_customer, [data-candle-cash-auth-form], form');
  }

  function consentPhoneField(container) {
    return container.querySelector('[data-candle-cash-consent-phone]');
  }

  function consentPhoneWrap(container) {
    return container.querySelector('[data-candle-cash-phone-field]');
  }

  function bonusToggle(container) {
    return container.querySelector('[data-candle-cash-bonus-toggle]');
  }

  function bonusPanel(container) {
    return container.querySelector('[data-candle-cash-bonus-panel]');
  }

  function authError(container) {
    return container.querySelector('[data-candle-cash-auth-error]');
  }

  function inlineAuth(container) {
    return cleanValue(container && container.getAttribute('data-candle-cash-auth-surface')).toLowerCase() === 'inline';
  }

  function desktopInlineAuthEnabled() {
    return window.matchMedia ? window.matchMedia(INLINE_AUTH_BREAKPOINT).matches : window.innerWidth > 900;
  }

  function cinematicRootFor(container) {
    return container && container.closest ? container.closest('[data-candle-cash-cinematic]') : null;
  }

  function authHelpers() {
    return window.ForestryAuthUrls || null;
  }

  function syncAuthReturnInput(container) {
    const form = authForm(container);
    const kind = cleanValue(container && container.getAttribute('data-candle-cash-auth')).toLowerCase();
    const input = form && form.querySelector('input[name="return_to"]');
    const helpers = authHelpers();
    const fallback = cleanValue(input && input.value) || '/account';

    if (!input) {
      return;
    }

    if (helpers && typeof helpers.returnUrlForTarget === 'function') {
      input.value = helpers.returnUrlForTarget(kind || 'login', fallback);
      return;
    }

    input.value = fallback;
  }

  function syncAuthSubmitAction(container) {
    const form = authForm(container);
    const kind = cleanValue(container && container.getAttribute('data-candle-cash-auth')).toLowerCase() || 'login';
    const helpers = authHelpers();
    const input = form && form.querySelector('input[name="return_to"]');
    const fallback = cleanValue(input && input.value) || '/account';
    const baseAction = cleanValue(form && form.getAttribute('data-candle-cash-base-action')) || cleanValue(form && form.getAttribute('action')) || window.location.pathname;

    if (!form) {
      return;
    }

    if (!form.getAttribute('data-candle-cash-base-action')) {
      form.setAttribute('data-candle-cash-base-action', baseAction);
    }

    if (helpers && typeof helpers.buildAuthUrl === 'function' && typeof helpers.returnUrlForTarget === 'function') {
      form.action = helpers.buildAuthUrl(baseAction, {
        kind: kind,
        portal: null,
        returnUrl: helpers.returnUrlForTarget(kind, fallback),
      });
      return;
    }

    form.action = baseAction;
  }

  function suppressShopAuth(container) {
    const form = authForm(container);
    if (!form) {
      return;
    }

    form.removeAttribute('data-login-with-shop-sign-in');

    container.querySelectorAll('shop-login, shop-login-button, [data-shop-login-button], [data-shop-sign-in]').forEach(function (node) {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  }

  function upgradeAuthMarkup(container) {
    if (!container) {
      return;
    }

    const authKind = cleanValue(container.getAttribute('data-candle-cash-auth')).toLowerCase();
    const story = container.querySelector('.CandleCashAuth__story');
    const panel = container.querySelector('.CandleCashAuth__panel');
    const storySubhead = container.querySelector('.CandleCashAuth__subhead');
    const storyCopy = container.querySelector('.CandleCashAuth__story-copy');
    const legend = container.querySelector('.CandleCashAuth__legend');
    const bonus = container.querySelector('.CandleCashAuth__bonus');
    const hintLink = container.querySelector('.CandleCashAuth__hint a[href]');
    const emailConsent = container.querySelector('[data-candle-cash-consent-email]') || container.querySelector('.CandleCashAuth__consent input[type="checkbox"]');
    const smsConsentCandidates = container.querySelectorAll('.CandleCashAuth__consent input[type="checkbox"]');
    const phoneWrap = container.querySelector('[data-candle-cash-phone-field]') || container.querySelector('.CandleCashAuth__phone');
    const phoneField = container.querySelector('[data-candle-cash-consent-phone]') || container.querySelector('.CandleCashAuth__phone input[type="tel"]');

    if (!container.getAttribute('data-auth-portal-state')) {
      container.setAttribute('data-auth-portal-state', 'idle');
    }

    if (!container.getAttribute('data-auth-portal-transition')) {
      container.setAttribute('data-auth-portal-transition', 'idle');
    }

    if (!container.getAttribute('data-candle-cash-bonus-expanded')) {
      container.setAttribute('data-candle-cash-bonus-expanded', 'false');
    }

    if (story) {
      story.setAttribute('data-candle-cash-auth-story', '');
    }

    if (panel) {
      panel.setAttribute('data-candle-cash-auth-panel', '');
    }

    const shell = container.querySelector('.CandleCashAuth__shell');
    if (shell) {
      shell.setAttribute('data-candle-cash-auth-shell', '');
    }

    if (authKind === 'login') {
      if (storySubhead) {
        storySubhead.textContent = 'See your orders, Earn, View and Use Candle Cash, and experience our hand-made Candles';
      }

      if (storyCopy) {
        storyCopy.textContent = 'Candle cash will expire 90 days after earning if not used.';
      }

      if (legend) {
        legend.textContent = 'Enter smoothly and pick up right where Candle Cash left off.';
      }
    } else if (authKind === 'register') {
      if (storySubhead) {
        storySubhead.textContent = 'Create your account through the same portal and arrive in Candle Cash feeling like you never left the magic.';
      }

      if (storyCopy) {
        storyCopy.textContent = 'We\'ll carry you directly into Candle Cash Central the moment your account is ready.';
      }

      if (legend) {
        legend.textContent = 'Set up your account and we\'ll land you directly inside your rewards world.';
      }
    }

    if (bonus) {
      let bonusId = bonus.getAttribute('id');
      let toggle = bonusToggle(container);

      if (!bonusId) {
        bonusId = authKind === 'register' ? 'CandleCashRegisterBonus' : 'CandleCashLoginBonus';
        bonus.setAttribute('id', bonusId);
      }

      bonus.setAttribute('data-candle-cash-bonus-panel', '');

      if (!toggle) {
        toggle = document.createElement('button');
        toggle.className = 'CandleCashAuth__bonus-toggle Button Button--full';
        toggle.type = 'button';
        toggle.setAttribute('data-candle-cash-bonus-toggle', '');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', bonusId);
        toggle.textContent = 'Add Bonus Candle Cash';
        bonus.parentNode.insertBefore(toggle, bonus);
      }
    }

    if (hintLink) {
      const target = authKind === 'register' ? 'login' : 'register';
      hintLink.href = authPortalUrl(hintLink.getAttribute('href'), target);
      hintLink.setAttribute('data-candle-cash-auth-portal-link', '');
      hintLink.setAttribute('data-portal-target', target);
    }

    if (authKind === 'login') {
      const forgotLink = container.querySelector('.Form__ItemHelp[href]');
      const helpers = authHelpers();

      if (forgotLink && helpers && typeof helpers.buildAuthUrl === 'function' && typeof helpers.returnUrlForTarget === 'function') {
        forgotLink.href = helpers.buildAuthUrl(forgotLink.getAttribute('href') || '/account/login', {
          kind: 'login',
          hash: 'recover',
          portal: null,
          returnUrl: helpers.returnUrlForTarget('login'),
        });
      }
    }

    if (emailConsent) {
      emailConsent.setAttribute('data-candle-cash-consent-email', '');
    }

    if (smsConsentCandidates[1]) {
      smsConsentCandidates[1].setAttribute('data-candle-cash-consent-sms', '');
    }

    if (phoneWrap) {
      phoneWrap.setAttribute('data-candle-cash-phone-field', '');
    }

    if (phoneField) {
      phoneField.setAttribute('data-candle-cash-consent-phone', '');
    }
  }

  function buildIntent(container) {
    const form = authForm(container);
    if (!form) {
      return null;
    }

    const emailField = form.querySelector('input[name="customer[email]"]');
    const firstNameField = form.querySelector('input[name="customer[first_name]"]');
    const lastNameField = form.querySelector('input[name="customer[last_name]"]');
    const phoneField = consentPhoneField(container);
    const consentEmail = !!(container.querySelector('[data-candle-cash-consent-email]') || {}).checked;
    const consentSms = !!(container.querySelector('[data-candle-cash-consent-sms]') || {}).checked;

    return {
      context: cleanValue(container.getAttribute('data-candle-cash-auth')),
      email: cleanValue(emailField && emailField.value),
      firstName: cleanValue(firstNameField && firstNameField.value),
      lastName: cleanValue(lastNameField && lastNameField.value),
      phone: cleanValue(phoneField && phoneField.value),
      consentEmail: consentEmail,
      consentSms: consentSms,
      createdAt: Date.now(),
    };
  }

  function syncPhoneField(container) {
    const smsConsent = container.querySelector('[data-candle-cash-consent-sms]');
    const phoneWrap = consentPhoneWrap(container);
    const phoneField = consentPhoneField(container);
    const active = !!(smsConsent && smsConsent.checked);

    if (phoneWrap) {
      phoneWrap.hidden = !active;
    }

    if (phoneField) {
      phoneField.required = active;
      if (!active) {
        phoneField.setCustomValidity('');
      }
    }
  }

  function syncBonusPanel(container, expanded) {
    const panel = bonusPanel(container);
    const toggle = bonusToggle(container);
    const nextExpanded = !!expanded;

    container.dataset.candleCashBonusExpanded = nextExpanded ? 'true' : 'false';

    if (toggle) {
      toggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
      toggle.textContent = nextExpanded ? 'Hide Bonus Candle Cash' : 'Add Bonus Candle Cash';
    }

    if (panel) {
      panel.setAttribute('aria-hidden', nextExpanded ? 'false' : 'true');
    }
  }

  function persistIntent(intent) {
    if (!intent || (!intent.consentEmail && !intent.consentSms)) {
      removeSessionValue(AUTH_INTENT_KEY);
      return;
    }

    writeSessionJson(AUTH_INTENT_KEY, intent);
  }

  function restoreIntent(container) {
    const stored = readSessionJson(AUTH_INTENT_KEY);
    if (!stored || cleanValue(stored.context) !== cleanValue(container.getAttribute('data-candle-cash-auth'))) {
      syncPhoneField(container);
      syncBonusPanel(container, false);
      return;
    }

    const consentEmail = container.querySelector('[data-candle-cash-consent-email]');
    const consentSms = container.querySelector('[data-candle-cash-consent-sms]');
    const phoneField = consentPhoneField(container);

    if (consentEmail) {
      consentEmail.checked = !!stored.consentEmail;
    }

    if (consentSms) {
      consentSms.checked = !!stored.consentSms;
    }

    if (phoneField && cleanValue(stored.phone) !== '') {
      phoneField.value = cleanValue(stored.phone);
    }

    syncPhoneField(container);
    syncBonusPanel(container, !!stored.consentEmail || !!stored.consentSms || cleanValue(stored.phone) !== '');
  }

  function setAuthError(container, message) {
    const errorNode = authError(container);
    const text = cleanValue(message);

    if (!errorNode) {
      return;
    }

    if (!text) {
      errorNode.hidden = true;
      errorNode.textContent = '';
      return;
    }

    errorNode.hidden = false;
    errorNode.textContent = text;
  }

  function parseAuthErrorMessage(htmlText) {
    const source = cleanValue(htmlText);
    if (!source) {
      return '';
    }

    try {
      const parsed = new window.DOMParser().parseFromString(source, 'text/html');
      const alert = parsed.querySelector('.Form__Alert');
      const listItems = parsed.querySelectorAll('.Alert__ErrorItem');

      if (alert) {
        return cleanValue(alert.textContent);
      }

      if (listItems.length) {
        return Array.prototype.map.call(listItems, function (item) {
          return cleanValue(item.textContent);
        }).filter(Boolean).join(' ');
      }
    } catch (error) {
      return '';
    }

    return '';
  }

  function setInlineBusy(container, busy) {
    const form = authForm(container);
    if (!form) {
      return;
    }

    form.toggleAttribute('aria-busy', !!busy);

    form.querySelectorAll('button, input, a').forEach(function (element) {
      if (element.tagName === 'A') {
        element.setAttribute('aria-disabled', busy ? 'true' : 'false');
        return;
      }

      if (element.type === 'hidden') {
        return;
      }

      element.disabled = !!busy;
    });
  }

  function startInlineAuthSuccessTransition(container, destination) {
    const root = cinematicRootFor(container);

    if (!destination) {
      return;
    }

    if (root) {
      root.setAttribute('data-candle-cash-authing', 'true');
      root.setAttribute('data-cinematic-transition', 'out');
    }

    window.setTimeout(function () {
      window.location.href = destination;
    }, prefersReducedMotion() ? 0 : AUTH_PORTAL_OUT_MS);
  }

  async function submitInlineAuthForm(container, form) {
    const intent = buildIntent(container);
    const phoneField = consentPhoneField(container);
    const submitAction = form.getAttribute('action') || window.location.pathname;
    const formData = new window.FormData(form);

    if (intent && intent.consentSms && cleanValue(intent.phone) === '' && phoneField) {
      phoneField.setCustomValidity('Add a phone number for Candle Cash texts.');
      phoneField.reportValidity();
      return;
    }

    if (phoneField) {
      phoneField.setCustomValidity('');
    }

    persistIntent(intent);
    setAuthError(container, '');
    setInlineBusy(container, true);

    try {
      const response = await window.fetch(submitAction, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      const responseText = await response.text();
      const destination = cleanValue(response.url);
      const errorMessage = parseAuthErrorMessage(responseText);

      if (!errorMessage && destination && destination.indexOf('/account/login') === -1 && destination.indexOf('/account/register') === -1) {
        startInlineAuthSuccessTransition(container, destination);
        return;
      }

      if (errorMessage) {
        setAuthError(container, errorMessage);
        setInlineBusy(container, false);
        return;
      }

      window.location.href = destination || submitAction;
    } catch (error) {
      setAuthError(container, 'We could not complete the portal just yet. Please try again.');
      setInlineBusy(container, false);
    }
  }

  function portalIntentFor(container) {
    const target = cleanValue(container.getAttribute('data-candle-cash-auth')).toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const requestedTarget = cleanValue(params.get(PORTAL_PARAM)).toLowerCase();
    const stored = readSessionJson(PORTAL_STORAGE_KEY);

    if (requestedTarget === target) {
      return { target: target };
    }

    if (
      stored &&
      cleanValue(stored.target).toLowerCase() === target &&
      Math.abs(Date.now() - Number(stored.createdAt || 0)) < PORTAL_MAX_AGE_MS
    ) {
      return stored;
    }

    return null;
  }

  function clearPortalIntent() {
    removeSessionValue(PORTAL_STORAGE_KEY);
    const url = new URL(window.location.href);

    if (url.searchParams.has(PORTAL_PARAM)) {
      url.searchParams.delete(PORTAL_PARAM);
      window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : '') + url.hash);
    }
  }

  function runAuthPortal(container) {
    const intent = portalIntentFor(container);

    if (!intent) {
      container.setAttribute('data-auth-portal-state', 'settled');
      container.setAttribute('data-auth-portal-transition', 'idle');
      return;
    }

    if (prefersReducedMotion()) {
      container.setAttribute('data-auth-portal-state', 'settled');
      container.setAttribute('data-auth-portal-transition', 'idle');
      clearPortalIntent();
      return;
    }

    container.setAttribute('data-auth-portal-state', 'pre');
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        container.setAttribute('data-auth-portal-state', 'enter');
      });
    });

    window.setTimeout(function () {
      container.setAttribute('data-auth-portal-state', 'settled');
      container.setAttribute('data-auth-portal-transition', 'idle');
      clearPortalIntent();
    }, AUTH_PORTAL_SETTLE_MS);
  }

  function startAuthPortalTransition(container, link) {
    const destination = cleanValue(link && link.getAttribute('href'));
    const target = cleanValue(link && link.getAttribute('data-portal-target')).toLowerCase();

    if (!container || !destination) {
      return;
    }

    writeSessionJson(PORTAL_STORAGE_KEY, {
      target: target,
      createdAt: Date.now(),
    });

    if (prefersReducedMotion()) {
      window.location.href = destination;
      return;
    }

    persistIntent(buildIntent(container));
    container.setAttribute('data-auth-portal-transition', 'out');

    window.setTimeout(function () {
      window.location.href = destination;
    }, AUTH_PORTAL_OUT_MS);
  }

  function bindAuthContainer(container) {
    if (!container || container.__candleCashAuthBound) {
      return;
    }

    upgradeAuthMarkup(container);
    const form = authForm(container);
    if (!form) {
      return;
    }

    container.__candleCashAuthBound = true;
    suppressShopAuth(container);
    syncAuthReturnInput(container);
    syncAuthSubmitAction(container);
    restoreIntent(container);
    setAuthError(container, '');
    runAuthPortal(container);
    container.setAttribute('data-auth-portal-transition', container.getAttribute('data-auth-portal-transition') || 'idle');

    container.addEventListener('change', function (event) {
      const target = event.target;
      if (!target) {
        return;
      }

      if (
        target.matches('[data-candle-cash-consent-email]') ||
        target.matches('[data-candle-cash-consent-sms]') ||
        target.matches('[data-candle-cash-consent-phone]')
      ) {
        syncPhoneField(container);
        syncBonusPanel(container, true);
        persistIntent(buildIntent(container));
      }
    });

    container.addEventListener('click', function (event) {
      const target = event.target;
      const toggle = target && target.closest ? target.closest('[data-candle-cash-bonus-toggle]') : null;
      const portalLink = target && target.closest ? target.closest('[data-candle-cash-auth-portal-link]') : null;

      if (toggle) {
        event.preventDefault();
        syncBonusPanel(container, container.dataset.candleCashBonusExpanded !== 'true');
        return;
      }

      if (
        portalLink &&
        !event.defaultPrevented &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        startAuthPortalTransition(container, portalLink);
      }
    });

    form.addEventListener('submit', function (event) {
      suppressShopAuth(container);
      syncAuthReturnInput(container);
      syncAuthSubmitAction(container);

      const intent = buildIntent(container);
      const phoneField = consentPhoneField(container);

      if (intent && intent.consentSms && cleanValue(intent.phone) === '' && phoneField) {
        event.preventDefault();
        phoneField.setCustomValidity('Add a phone number for Candle Cash texts.');
        phoneField.reportValidity();
        return;
      }

      if (phoneField) {
        phoneField.setCustomValidity('');
      }

      persistIntent(intent);

      if (inlineAuth(container) && desktopInlineAuthEnabled()) {
        const root = cinematicRootFor(container);

        if (root) {
          root.setAttribute('data-candle-cash-authing', 'true');
          root.setAttribute('data-cinematic-transition', 'out');
        }
      }
    });
  }

  function currentWelcomeMode() {
    const params = new URLSearchParams(window.location.search);
    return cleanValue(params.get(WELCOME_PARAM)).toLowerCase();
  }

  function clearWelcomeParam() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(WELCOME_PARAM)) {
      return;
    }

    url.searchParams.delete(WELCOME_PARAM);
    const next = url.pathname + (url.search ? url.search : '') + url.hash;
    window.history.replaceState({}, document.title, next);
  }

  function waitForRewardsReady(root) {
    return new Promise(function (resolve) {
      if (!root) {
        resolve();
        return;
      }

      if (cleanValue(root.getAttribute('data-forestry-rewards-state')) === 'loaded') {
        resolve();
        return;
      }

      let settled = false;
      const timeout = window.setTimeout(done, MAX_WELCOME_WAIT_MS);
      const observer = new MutationObserver(function () {
        if (cleanValue(root.getAttribute('data-forestry-rewards-state')) === 'loaded') {
          done();
        }
      });

      observer.observe(root, {
        attributes: true,
        attributeFilter: ['data-forestry-rewards-state'],
      });

      function done() {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve();
      }
    });
  }

  async function applyAuthConsent(root, intent) {
    const pending = intent || readSessionJson(AUTH_INTENT_KEY);
    const endpoint = cleanValue(root && root.dataset && root.dataset.endpointConsentOptin);

    if (!root || !pending || !endpoint) {
      return { ok: false, applied: false };
    }

    const email = cleanValue(pending.email) || cleanValue(root.dataset.customerEmail);
    const phone = cleanValue(pending.phone) || cleanValue(root.dataset.customerPhone);
    const firstName = cleanValue(pending.firstName) || cleanValue(root.dataset.customerFirstName);
    const lastName = cleanValue(pending.lastName) || cleanValue(root.dataset.customerLastName);
    const requestBody = {
      email: email || null,
      phone: phone || null,
      first_name: firstName || null,
      last_name: lastName || null,
      shopify_customer_id: cleanValue(root.dataset.shopifyCustomerId) || null,
      award_bonus: true,
      flow: 'direct',
    };

    let shouldSubmit = false;

    if (pending.consentEmail && email) {
      requestBody.consent_email = true;
      shouldSubmit = true;
    }

    if (pending.consentSms && phone) {
      requestBody.consent_sms = true;
      shouldSubmit = true;
    }

    if (!shouldSubmit) {
      removeSessionValue(AUTH_INTENT_KEY);
      return { ok: false, applied: false };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(function () {
        return null;
      });

      removeSessionValue(AUTH_INTENT_KEY);

      if (response.ok && payload && payload.ok) {
        document.dispatchEvent(new CustomEvent('forestry:rewards:refresh'));
        await delay(REWARDS_REFRESH_SETTLE_MS);
        await waitForRewardsReady(root);
        return {
          ok: true,
          applied: true,
          data: payload.data || {},
        };
      }
    } catch (error) {
      removeSessionValue(AUTH_INTENT_KEY);
      return { ok: false, applied: false };
    }

    return { ok: false, applied: false };
  }

  function updateWelcomeCopy(overlay, intent) {
    const detail = overlay.querySelector('[data-candle-cash-welcome-detail]');
    if (!detail) {
      return;
    }

    if (intent && intent.consentEmail && intent.consentSms) {
      detail.textContent = 'Your bonus Candle Cash is arriving with the glow.';
      return;
    }

    if (intent && intent.consentEmail) {
      detail.textContent = 'Your member email bonus is already being prepared.';
      return;
    }

    if (intent && intent.consentSms) {
      detail.textContent = 'Your text bonus is already being prepared.';
      return;
    }

    detail.textContent = 'Candle Cash Central is ready and waiting.';
  }

  async function runWelcomeSequence(root, overlay, intent) {
    if (!overlay || overlay.__candleCashWelcomeRunning) {
      return;
    }

    overlay.__candleCashWelcomeRunning = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    updateWelcomeCopy(overlay, intent);

    window.requestAnimationFrame(function () {
      overlay.setAttribute('data-welcome-state', 'enter');
    });

    const consentPromise = applyAuthConsent(root, intent);

    await Promise.all([
      delay(MIN_WELCOME_DURATION_MS),
      waitForRewardsReady(root),
      consentPromise,
    ]);

    overlay.setAttribute('data-welcome-state', 'dissolve');
    await delay(WELCOME_DISSOLVE_MS);
    overlay.setAttribute('data-welcome-state', 'done');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    clearWelcomeParam();
  }

  function maybeRunWelcome() {
    const overlay = document.querySelector(WELCOME_SELECTOR);
    const root = document.querySelector(PAGE_ROOT_SELECTOR);
    const mode = currentWelcomeMode();
    const pendingIntent = readSessionJson(AUTH_INTENT_KEY);
    const shouldRun = mode === 'login' || mode === 'register' || mode === 'home' || !!pendingIntent;

    if (!overlay || !root || !shouldRun) {
      return;
    }

    runWelcomeSequence(root, overlay, pendingIntent);
  }

  function initializeAll() {
    const helpers = authHelpers();
    if (helpers && typeof helpers.applyManagedLinks === 'function') {
      helpers.applyManagedLinks(document);
    }

    document.querySelectorAll(AUTH_SELECTOR).forEach(bindAuthContainer);
    maybeRunWelcome();
  }

  if (document.readyState !== 'loading') {
    initializeAll();
  } else {
    document.addEventListener('DOMContentLoaded', initializeAll);
  }

  window.addEventListener('pageshow', function () {
    initializeAll();
  });
})();
