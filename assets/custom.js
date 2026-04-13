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
  var CHECKOUT_TRIGGER_SELECTOR = '[name="checkout"], [href="/checkout"], form[action="/checkout"] [type="submit"]';
  var NOTE_SAVE_DELAY = 320;
  var noteSaveTimer = null;
  var lastSavedNote = null;

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

  function getCartUpdateUrl() {
    if (window.routes && window.routes.cartUrl) {
      return window.routes.cartUrl + '/update.js';
    }

    return '/cart/update.js';
  }

  function saveCartNote(note, options) {
    var requestOptions = options || {};
    var normalizedNote = normalizeNote(note);

    if (!requestOptions.force && normalizedNote === lastSavedNote) {
      return;
    }

    lastSavedNote = normalizedNote;

    var fetchOptions = {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        note: normalizedNote
      })
    };

    if (requestOptions.keepalive) {
      fetchOptions.keepalive = true;
    }

    fetch(getCartUpdateUrl(), fetchOptions)["catch"](function () {
      // Cart note persistence should never block checkout.
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

    if (!checkoutTrigger) {
      return;
    }

    var noteInput = getPrimaryNoteInput();

    if (!noteInput) {
      return;
    }

    updateNotePreview(noteInput.value);
    window.clearTimeout(noteSaveTimer);
    saveCartNote(noteInput.value, {
      force: true,
      keepalive: true
    });
  }, true);

  document.addEventListener('submit', function (event) {
    var submittedForm = event.target;

    if (!matchesSelector(submittedForm, 'form[action="/cart"], form[action="/checkout"]')) {
      return;
    }

    var noteInput = submittedForm.querySelector(NOTE_INPUT_SELECTOR) || getPrimaryNoteInput();

    if (!noteInput) {
      return;
    }

    updateNotePreview(noteInput.value);
    window.clearTimeout(noteSaveTimer);
    saveCartNote(noteInput.value, {
      force: true,
      keepalive: true
    });
  }, true);

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
