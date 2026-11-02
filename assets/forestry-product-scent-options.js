(function () {
  if (window.__everbranchProductOptionsLoaded) return;
  window.__everbranchProductOptionsLoaded = true;

  const ROOT_SELECTOR = '[data-everbranch-product-options]';
  const initialized = new WeakSet();

  function initAll() {
    document.querySelectorAll('[data-forestry-theme-scent-options]').forEach(init);
    document.querySelectorAll(ROOT_SELECTOR).forEach(init);
  }

  async function init(root) {
    if (initialized.has(root)) return;
    initialized.add(root);

    const endpoint = String(root.dataset.proxyEndpoint || '').trim();
    const productId = String(root.dataset.productId || '').trim();
    const handle = String(root.dataset.productHandle || '').trim();
    if (!endpoint || (!productId && !handle)) return;

    const form = findProductForm(root);
    const requiresOptions = Boolean(form && form.dataset.isBundle === 'true');
    if (form && form.dataset.everbranchScentGuard === 'true') {
      root.remove();
      return;
    }
    if (form) {
      form.dataset.everbranchScentGuard = 'true';
      form.dataset.everbranchScentState = 'loading';
      function guard(event) {
        if (!requiresOptions || form.dataset.everbranchScentState === 'ready') return;
        if (event.type === 'click' && !isCheckoutControl(event.target)) return;
        blockEvent(event);
        root.hidden = false;
        root.scrollIntoView({ block: 'nearest' });
      }
      form.addEventListener('submit', guard, true);
      form.addEventListener('click', guard, true);
    }
    root.hidden = false;

    try {
      const url = new URL(endpoint, window.location.origin);
      if (productId) url.searchParams.set('product_id', productId);
      if (handle) url.searchParams.set('handle', handle);

      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json();
      const ruleset = payload && payload.ok ? payload.data : null;
      if (!response.ok || !payload || !payload.ok) throw new Error('Scent options unavailable');
      if (!ruleset) {
        if (form) form.dataset.everbranchScentState = 'ready';
        root.hidden = true;
        return;
      }

      render(root, ruleset);
    } catch (loadError) {
      if (!requiresOptions) {
        if (form) form.dataset.everbranchScentState = 'ready';
        root.hidden = true;
        return;
      }
      if (form) form.dataset.everbranchScentState = 'error';
      root.hidden = false;
      root.innerHTML = '';
      const error = document.createElement('p');
      error.className = 'everbranch-product-options__error';
      error.setAttribute('role', 'alert');
      error.textContent = root.dataset.loadError || 'Scent options could not be loaded. Please refresh and try again.';
      root.appendChild(error);
    }
  }

  function render(root, ruleset) {
    const form = findProductForm(root);
    if (!form) {
      root.hidden = false;
      root.innerHTML = '<p class="everbranch-product-options__error">The product form could not be found.</p>';
      return;
    }

    if (form.dataset.everbranchProductOptionsAttached === 'true') {
      root.remove();
      return;
    }

    if (!form.id) form.id = 'everbranch-product-form-' + Math.random().toString(36).slice(2, 10);
    placeInsideProductForm(root, form);

    const count = Number(ruleset.option_count);
    const values = Array.isArray(ruleset.allowed_values) ? ruleset.allowed_values.filter(Boolean) : [];
    if (!Number.isInteger(count) || count < 1 || count > 24 || !values.length) {
      throw new Error('Invalid scent options');
    }
    form.dataset.everbranchProductOptionsAttached = 'true';

    root.innerHTML = '';
    root.hidden = false;

    const heading = document.createElement('h3');
    heading.className = 'everbranch-product-options__heading';
    heading.textContent = root.dataset.heading || 'Choose your scents';
    root.appendChild(heading);

    const help = document.createElement('p');
    help.className = 'everbranch-product-options__help';
    help.textContent = root.dataset.helpText || 'Choose one scent for each item in this bundle.';
    root.appendChild(help);

    const fields = document.createElement('div');
    fields.className = 'everbranch-product-options__fields';
    const selects = [];
    const propertyInputs = [];

    for (let index = 1; index <= count; index += 1) {
      const field = document.createElement('label');
      field.className = 'everbranch-product-options__field';

      const label = document.createElement('span');
      label.className = 'everbranch-product-options__label';
      label.textContent = (root.dataset.scentLabel || 'Scent') + ' ' + index;

      const select = document.createElement('select');
      select.className = 'everbranch-product-options__select';
      select.required = true;
      select.dataset.scentPosition = String(index);

      const propertyInput = document.createElement('input');
      propertyInput.type = 'hidden';
      propertyInput.name = 'properties[Scent ' + index + ']';
      propertyInput.dataset.everbranchScentPosition = String(index);
      form.appendChild(propertyInput);

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = root.dataset.placeholder || 'Choose a scent';
      placeholder.disabled = true;
      placeholder.selected = true;
      select.appendChild(placeholder);

      values.forEach((value) => {
        const option = document.createElement('option');
        option.value = String(value);
        option.textContent = String(value);
        select.appendChild(option);
      });

      field.appendChild(label);
      field.appendChild(select);
      fields.appendChild(field);
      selects.push(select);
      propertyInputs.push(propertyInput);
    }

    root.appendChild(fields);

    const error = document.createElement('p');
    error.className = 'everbranch-product-options__error';
    error.hidden = true;
    error.setAttribute('aria-live', 'polite');
    root.appendChild(error);

    function syncProperties() {
      selects.forEach((select, index) => {
        propertyInputs[index].value = select.value;
      });
    }

    selects.forEach((select) => {
      select.addEventListener('change', syncProperties);
    });

    function validate(event) {
      error.hidden = true;
      error.textContent = '';

      syncProperties();

      const missing = selects.find((select) => !select.value);
      if (missing) {
        blockEvent(event);
        error.textContent = (root.dataset.missingError || 'Choose all [count] scents before adding this bundle.').replace('[count]', String(count));
        error.hidden = false;
        missing.focus();
        return false;
      }

      if (ruleset.require_distinct_values) {
        const chosen = selects.map((select) => select.value);
        if (new Set(chosen).size !== chosen.length) {
          blockEvent(event);
          error.textContent = root.dataset.distinctError || 'Choose a different scent for each item in this bundle.';
          error.hidden = false;
          selects[0].focus();
          return false;
        }
      }

      return true;
    }

    form.dataset.everbranchScentState = 'ready';
    form.addEventListener('submit', validate, true);
    form.addEventListener('click', function (event) {
      if (isCheckoutControl(event.target)) {
        validate(event);
      }
    }, true);
  }

  function findProductForm(root) {
    const closest = root.closest('form[action*="/cart/add"]');
    if (closest) return closest;

    const forms = Array.from(document.querySelectorAll('form[action*="/cart/add"]'))
      .filter((form) => form.querySelector('[name="id"]'));

    return forms.find((form) => form.getClientRects().length > 0)
      || forms[0]
      || null;
  }

  function placeInsideProductForm(root, form) {
    if (root.closest('form') === form) return;

    const anchor = form.querySelector(
      '.product-form__buttons, .product-form__payment-container, .shopify-payment-button, shopify-accelerated-checkout, button[type="submit"], input[type="submit"]'
    );

    if (anchor) {
      let insertionPoint = anchor;
      while (insertionPoint.parentElement && insertionPoint.parentElement !== form) {
        insertionPoint = insertionPoint.parentElement;
      }
      form.insertBefore(root, insertionPoint);
    } else {
      form.appendChild(root);
    }
  }

  function isCheckoutControl(target) {
    if (!(target instanceof Element)) return false;

    return Boolean(target.closest(
      'button[type="submit"], input[type="submit"], .shopify-payment-button, shopify-accelerated-checkout, [data-shopify="payment-button"]'
    ));
  }

  function blockEvent(event) {
    if (!event) return;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll, { once: true });
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', initAll);
})();
