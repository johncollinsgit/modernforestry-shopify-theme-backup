/**
 * Include your custom JavaScript here.
 *
 * We also offer some hooks so you can plug your own logic. For instance, if you want to be notified when the variant
 * changes on product page, you can attach a listener to the document:
 *
 * document.addEventListener('variant:changed', function(event) {
 *   var variant = event.detail.variant; // Gives you access to the whole variant details
 * });
 *
 * You can also add a listener whenever a product is added to the cart:
 *
 * document.addEventListener('product:added', function(event) {
 *   var variant = event.detail.variant; // Get the variant that was added
 *   var quantity = event.detail.quantity; // Get the quantity that was added
 * });
 *
 * If you just want to force refresh the mini-cart without adding a specific product, you can trigger the event
 * "cart:refresh" in a similar way (in that case, passing the quantity is not necessary):
 *
 * document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', {
 *   bubbles: true
 * }));
 */

(function () {
  var NOTE_INPUT_SELECTOR = '[data-cart-note-input]';
  var NOTE_PREVIEW_SELECTOR = '[data-cart-note-preview]';
  var CART_ADD_FORM_SELECTOR = 'form[action^="/cart/add"]';
  var CART_SYNC_FORM_SELECTOR = 'form[action="/cart"], form[action="/checkout"]';
  var CHECKOUT_TRIGGER_SELECTOR = '[name="checkout"], [href="/checkout"], form[action="/checkout"] [type="submit"]';
  var CART_TERMS_CHECKBOX_SELECTOR = '[data-cart-terms-checkbox]';
  var CART_CHECKOUT_TRIGGER_SELECTOR = '[data-cart-checkout-trigger], [name="checkout"], [href="/checkout"]';
  var CANDLE_CASH_GIFT_CARD_NOTICE_SELECTOR = '[data-candle-cash-gift-card-notice]';
  var CANDLE_CASH_GIFT_CARD_BLOCK_MESSAGE = 'Candle Cash cannot be used when gift cards are in the cart. Remove the gift card or remove Candle Cash before checkout.';
  var REQUIRED_SELLING_PLAN_SELECTOR = 'form[data-requires-selling-plan="true"]';
  var TRACKING_FIELD_PREFIX = '_mf_';
  var TRACKING_FIELD_KEYS = {
    session_key: true,
    client_id: true,
    fbp: true,
    fbc: true,
    cart_token: true
  };
  var NOTE_SAVE_DELAY = 320;
  var noteSaveTimer = null;
  var lastSavedNote = null;
  var isCheckoutSyncInFlight = false;

  function matchesSelector(element, selector) {
    if (!element || element.nodeType !== 1) {
      return false;
    }

    var proto = Element.prototype;
    var matcher = proto.matches || proto.msMatchesSelector || proto.webkitMatchesSelector;
    return matcher ? matcher.call(element, selector) : false;
  }

  function closestSelector(element, selector) {
    var current = element;

    while (current && current.nodeType === 1) {
      if (matchesSelector(current, selector)) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function normalizeNote(value) {
    return (value || '').replace(/\r\n/g, '\n');
  }

  function normalizeTrackingFieldKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isNoisyTrackingField(value) {
    var normalizedValue = normalizeTrackingFieldKey(value);

    if (!normalizedValue) {
      return false;
    }

    if (normalizedValue.indexOf(TRACKING_FIELD_PREFIX) === 0) {
      return true;
    }

    return !!TRACKING_FIELD_KEYS[normalizedValue];
  }

  function extractBracketKey(inputName, prefix) {
    var keyMatch;

    if (typeof inputName !== 'string') {
      return '';
    }

    keyMatch = inputName.match(new RegExp('^' + prefix + '\\[(.+)\\]$'));
    return keyMatch && keyMatch[1] ? keyMatch[1] : '';
  }

  function buildTrackingAttributeCleanup() {
    var cleanup = {};

    Object.keys(TRACKING_FIELD_KEYS).forEach(function (fieldKey) {
      cleanup[fieldKey] = '';
      cleanup[TRACKING_FIELD_PREFIX + fieldKey] = '';
    });

    return cleanup;
  }

  function sanitizeCartAddForm(form) {
    var propertyInputs;
    var i;

    if (!matchesSelector(form, CART_ADD_FORM_SELECTOR)) {
      return;
    }

    propertyInputs = form.querySelectorAll('[name^="properties["]');

    for (i = 0; i < propertyInputs.length; i += 1) {
      var propertyInput = propertyInputs[i];
      var propertyName = extractBracketKey(propertyInput.getAttribute('name'), 'properties');

      if (!isNoisyTrackingField(propertyName)) {
        continue;
      }

      if (propertyInput.parentNode) {
        propertyInput.parentNode.removeChild(propertyInput);
      }
    }
  }

  function sanitizeCartAddFormData(formData) {
    var keysToDelete = [];

    if (!formData || typeof formData.forEach !== 'function') {
      return;
    }

    formData.forEach(function (_, key) {
      var propertyName;

      if (typeof key !== 'string') {
        return;
      }

      if (key.indexOf('properties[') !== 0) {
        return;
      }

      propertyName = extractBracketKey(key, 'properties');

      if (isNoisyTrackingField(propertyName)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(function (key) {
      formData.delete(key);
    });
  }

  function sanitizeAllCartAddForms() {
    var forms = document.querySelectorAll(CART_ADD_FORM_SELECTOR);
    var i;

    for (i = 0; i < forms.length; i += 1) {
      sanitizeCartAddForm(forms[i]);
    }
  }

  function getFormSubmitter(event, form) {
    var activeElement;

    if (event && event.submitter) {
      return event.submitter;
    }

    activeElement = document.activeElement;
    if (activeElement && form && form.contains(activeElement)) {
      return closestSelector(activeElement, 'button, input, [name="checkout"]');
    }

    return null;
  }

  function isCheckoutSubmit(form, event) {
    var submitter = getFormSubmitter(event, form);

    if (matchesSelector(form, 'form[action="/checkout"]')) {
      return true;
    }

    if (!matchesSelector(form, 'form[action="/cart"]')) {
      return false;
    }

    if (submitter && submitter.getAttribute && submitter.getAttribute('name') === 'checkout') {
      return true;
    }

    return !!form.querySelector('[name="checkout"]');
  }

  function ensureCheckoutInput(form) {
    var checkoutInput;

    if (!form || form.querySelector('input[type="hidden"][name="checkout"]')) {
      return;
    }

    checkoutInput = document.createElement('input');
    checkoutInput.type = 'hidden';
    checkoutInput.name = 'checkout';
    checkoutInput.value = 'Checkout';
    form.appendChild(checkoutInput);
  }

  function removeSyntheticCheckoutInput(form) {
    var checkoutInput = form && form.querySelector('input[type="hidden"][name="checkout"]');

    if (checkoutInput && checkoutInput.parentNode) {
      checkoutInput.parentNode.removeChild(checkoutInput);
    }
  }

  function getCartTermsCheckbox(form) {
    if (!form || !form.querySelector) {
      return null;
    }

    return form.querySelector(CART_TERMS_CHECKBOX_SELECTOR);
  }

  function ensureLegacyTermsCheckboxAlias(form, termsCheckbox) {
    var existingAlias = document.getElementById('effectiveAppsAgreeCB');
    var checkboxId;
    var linkedLabel;

    if (!termsCheckbox) {
      return;
    }

    if (existingAlias && existingAlias !== termsCheckbox) {
      return;
    }

    checkboxId = termsCheckbox.getAttribute('id');

    if (checkboxId === 'effectiveAppsAgreeCB') {
      return;
    }

    if (!checkboxId) {
      checkboxId = 'cart-terms-agree';
      termsCheckbox.setAttribute('id', checkboxId);
    }

    linkedLabel = form.querySelector('label[for="' + checkboxId + '"]');
    termsCheckbox.setAttribute('id', 'effectiveAppsAgreeCB');

    if (linkedLabel) {
      linkedLabel.setAttribute('for', 'effectiveAppsAgreeCB');
    }
  }

  function setCartTermsCheckoutState(form) {
    var termsCheckbox = getCartTermsCheckbox(form);
    var checkoutTriggers;
    var i;

    if (!termsCheckbox) {
      return;
    }

    ensureLegacyTermsCheckboxAlias(form, termsCheckbox);
    checkoutTriggers = form.querySelectorAll(CART_CHECKOUT_TRIGGER_SELECTOR);

    for (i = 0; i < checkoutTriggers.length; i += 1) {
      var trigger = checkoutTriggers[i];
      var tagName = trigger.tagName ? trigger.tagName.toLowerCase() : '';
      var canDisable = tagName === 'button' || (tagName === 'input' && trigger.type !== 'hidden');

      if (canDisable) {
        trigger.disabled = !termsCheckbox.checked;
      }

      trigger.setAttribute('aria-disabled', termsCheckbox.checked ? 'false' : 'true');
    }
  }

  function clearCartTermsValidation(termsCheckbox) {
    var termsWrapper = closestSelector(termsCheckbox, '[data-cart-terms-wrapper]');

    if (termsWrapper) {
      termsWrapper.classList.remove('is-invalid');
    }

    if (termsCheckbox) {
      termsCheckbox.removeAttribute('aria-invalid');
    }
  }

  function markCartTermsValidation(termsCheckbox) {
    var termsWrapper = closestSelector(termsCheckbox, '[data-cart-terms-wrapper]');

    if (termsWrapper) {
      termsWrapper.classList.add('is-invalid');
    }

    termsCheckbox.setAttribute('aria-invalid', 'true');
    termsCheckbox.focus();
  }

  function shouldBlockCheckoutForTerms(form) {
    var termsCheckbox = getCartTermsCheckbox(form);

    if (!termsCheckbox || termsCheckbox.checked) {
      return false;
    }

    markCartTermsValidation(termsCheckbox);
    return true;
  }

  function markCandleCashGiftCardValidation(form) {
    var notice = form && form.querySelector(CANDLE_CASH_GIFT_CARD_NOTICE_SELECTOR);

    if (!notice) {
      notice = document.querySelector(CANDLE_CASH_GIFT_CARD_NOTICE_SELECTOR);
    }

    if (notice) {
      notice.classList.add('is-invalid');
      notice.focus();
    }

    window.alert(CANDLE_CASH_GIFT_CARD_BLOCK_MESSAGE);
  }

  function shouldBlockCheckoutForGiftCardRewards(form) {
    if (!form || form.getAttribute('data-candle-cash-gift-card-block') !== 'true') {
      return false;
    }

    markCandleCashGiftCardValidation(form);
    return true;
  }

  function syncCartTermsStateFromDom() {
    var cartForms = document.querySelectorAll(CART_SYNC_FORM_SELECTOR);
    var i;

    for (i = 0; i < cartForms.length; i += 1) {
      setCartTermsCheckoutState(cartForms[i]);
    }
  }

  function ensureRequiredSellingPlanInput(form) {
    var sellingPlanId;
    var sellingPlanInput;
    var sellingPlanInputs;
    var i;

    if (!matchesSelector(form, REQUIRED_SELLING_PLAN_SELECTOR)) {
      return;
    }

    sellingPlanInputs = form.querySelectorAll('[name="selling_plan"]');
    for (i = 0; i < sellingPlanInputs.length; i += 1) {
      if (String(sellingPlanInputs[i].value || '').trim() !== '') {
        return;
      }
    }

    sellingPlanId = form.getAttribute('data-default-selling-plan-id');
    if (!sellingPlanId) {
      return;
    }

    sellingPlanInput = form.querySelector('input[name="selling_plan"][data-forestry-selling-plan-fallback]');

    if (!sellingPlanInput) {
      sellingPlanInput = document.createElement('input');
      sellingPlanInput.type = 'hidden';
      sellingPlanInput.name = 'selling_plan';
      sellingPlanInput.setAttribute('data-forestry-selling-plan-fallback', 'true');
      form.appendChild(sellingPlanInput);
    }

    sellingPlanInput.value = sellingPlanId;
  }

  function ensureRequiredSellingPlanFormData(form, formData) {
    var hasSellingPlan = false;
    var sellingPlanId;

    if (!matchesSelector(form, REQUIRED_SELLING_PLAN_SELECTOR) || !formData || typeof formData.append !== 'function') {
      return;
    }

    if (typeof formData.forEach === 'function') {
      formData.forEach(function (value, key) {
        if (key === 'selling_plan' && String(value || '').trim() !== '') {
          hasSellingPlan = true;
        }
      });
    }

    if (hasSellingPlan) {
      return;
    }

    sellingPlanId = form.getAttribute('data-default-selling-plan-id');
    if (sellingPlanId) {
      formData.append('selling_plan', sellingPlanId);
    }
  }

  function getCartUpdateUrl() {
    if (window.routes && window.routes.cartUrl) {
      return window.routes.cartUrl + '/update.js';
    }

    return '/cart/update.js';
  }

  function postCartUpdate(payload, options) {
    var requestOptions = options || {};

    var fetchOptions = {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(payload)
    };

    if (requestOptions.keepalive) {
      fetchOptions.keepalive = true;
    }

    return fetch(getCartUpdateUrl(), fetchOptions)["catch"](function () {
      // Cart note persistence should never block checkout.
    });
  }

  function saveCartNote(note, options) {
    var requestOptions = options || {};
    var normalizedNote = normalizeNote(note);

    if (!requestOptions.force && normalizedNote === lastSavedNote) {
      return;
    }

    lastSavedNote = normalizedNote;

    postCartUpdate({
      note: normalizedNote,
      attributes: buildTrackingAttributeCleanup()
    }, requestOptions);
  }

  function clearTrackingCartAttributes(options) {
    postCartUpdate({
      attributes: buildTrackingAttributeCleanup()
    }, options || {});
  }

  function syncCartBeforeCheckout(noteInput, onComplete) {
    var payload;
    var done = typeof onComplete === 'function' ? onComplete : function () {};

    if (isCheckoutSyncInFlight) {
      return;
    }

    isCheckoutSyncInFlight = true;
    payload = {
      attributes: buildTrackingAttributeCleanup()
    };

    if (noteInput) {
      payload.note = normalizeNote(noteInput.value);
      lastSavedNote = payload.note;
      updateNotePreview(noteInput.value);
      window.clearTimeout(noteSaveTimer);
    }

    postCartUpdate(payload, {}).then(function () {
      isCheckoutSyncInFlight = false;
      done();
    });
  }

  function truncatePreviewText(value) {
    var compactValue = (value || '').replace(/\s+/g, ' ').trim();

    if (compactValue.length <= 120) {
      return compactValue;
    }

    return compactValue.slice(0, 117) + '...';
  }

  function updateNotePreview(note) {
    var previewText = truncatePreviewText(note);
    var previewElements = document.querySelectorAll(NOTE_PREVIEW_SELECTOR);
    var i;

    for (i = 0; i < previewElements.length; i += 1) {
      var previewElement = previewElements[i];

      if (!previewText) {
        previewElement.textContent = '';
        previewElement.classList.add('is-hidden');
      } else {
        previewElement.textContent = 'Saved note: ' + previewText;
        previewElement.classList.remove('is-hidden');
      }
    }
  }

  function getPrimaryNoteInput() {
    var noteInputs = document.querySelectorAll(NOTE_INPUT_SELECTOR);
    return noteInputs.length > 0 ? noteInputs[0] : null;
  }

  function scheduleCartNoteSave(note) {
    window.clearTimeout(noteSaveTimer);
    noteSaveTimer = window.setTimeout(function () {
      saveCartNote(note);
    }, NOTE_SAVE_DELAY);
  }

  function syncNoteStateFromDom() {
    var noteInput = getPrimaryNoteInput();

    sanitizeAllCartAddForms();
    syncCartTermsStateFromDom();

    if (!noteInput) {
      return;
    }

    lastSavedNote = normalizeNote(noteInput.value);
    updateNotePreview(noteInput.value);
  }

  document.addEventListener('input', function (event) {
    if (!matchesSelector(event.target, NOTE_INPUT_SELECTOR)) {
      return;
    }

    updateNotePreview(event.target.value);
    scheduleCartNoteSave(event.target.value);
  });

  document.addEventListener('change', function (event) {
    var termsForm;

    if (matchesSelector(event.target, CART_TERMS_CHECKBOX_SELECTOR)) {
      termsForm = closestSelector(event.target, CART_SYNC_FORM_SELECTOR);
      clearCartTermsValidation(event.target);
      setCartTermsCheckoutState(termsForm);
      return;
    }

    if (!matchesSelector(event.target, NOTE_INPUT_SELECTOR)) {
      return;
    }

    updateNotePreview(event.target.value);
    saveCartNote(event.target.value, {
      force: true
    });
  });

  document.addEventListener('click', function (event) {
    var checkoutTrigger = closestSelector(event.target, CHECKOUT_TRIGGER_SELECTOR);
    var checkoutForm;
    var noteInput;
    var href;
    var isCheckoutLink;
    var cartAddForm;

    cartAddForm = closestSelector(event.target, CART_ADD_FORM_SELECTOR);
    if (cartAddForm) {
      ensureRequiredSellingPlanInput(cartAddForm);
    }

    if (!checkoutTrigger) {
      return;
    }

    checkoutForm = closestSelector(checkoutTrigger, CART_SYNC_FORM_SELECTOR);

    if (!checkoutForm) {
      checkoutForm = closestSelector(event.target, CART_SYNC_FORM_SELECTOR);
    }

    if (shouldBlockCheckoutForTerms(checkoutForm)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (shouldBlockCheckoutForGiftCardRewards(checkoutForm)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    noteInput = getPrimaryNoteInput();
    href = checkoutTrigger.getAttribute && checkoutTrigger.getAttribute('href');
    isCheckoutLink = typeof href === 'string' && href.indexOf('/checkout') === 0;

    if (!isCheckoutLink) {
      if (!noteInput) {
        clearTrackingCartAttributes({
          keepalive: true
        });
        return;
      }

      updateNotePreview(noteInput.value);
      window.clearTimeout(noteSaveTimer);
      saveCartNote(noteInput.value, {
        force: true,
        keepalive: true
      });
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    syncCartBeforeCheckout(noteInput, function () {
      window.location.href = '/checkout';
    });
  }, true);

  document.addEventListener('submit', function (event) {
    var submittedForm = event.target;
    var noteInput;
    var checkoutSubmit;

    sanitizeCartAddForm(submittedForm);
    ensureRequiredSellingPlanInput(submittedForm);

    if (!matchesSelector(submittedForm, CART_SYNC_FORM_SELECTOR)) {
      return;
    }

    noteInput = submittedForm.querySelector(NOTE_INPUT_SELECTOR) || getPrimaryNoteInput();
    checkoutSubmit = isCheckoutSubmit(submittedForm, event);

    if (checkoutSubmit && shouldBlockCheckoutForTerms(submittedForm)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (checkoutSubmit && shouldBlockCheckoutForGiftCardRewards(submittedForm)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    syncCartBeforeCheckout(noteInput, function () {
      if (checkoutSubmit) {
        ensureCheckoutInput(submittedForm);
      } else {
        removeSyntheticCheckoutInput(submittedForm);
      }
      submittedForm.submit();
    });
  }, true);

  document.addEventListener('formdata', function (event) {
    if (!matchesSelector(event.target, CART_ADD_FORM_SELECTOR)) {
      return;
    }

    sanitizeCartAddForm(event.target);
    ensureRequiredSellingPlanFormData(event.target, event.formData);
    sanitizeCartAddFormData(event.formData);
  });

  document.addEventListener('theme:loading:end', function () {
    window.setTimeout(syncNoteStateFromDom, 0);
  });

  document.documentElement.addEventListener('cart:refresh', function () {
    window.setTimeout(syncNoteStateFromDom, 350);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncNoteStateFromDom);
  } else {
    syncNoteStateFromDom();
  }
})();
