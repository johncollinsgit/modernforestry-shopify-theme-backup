(function () {
  function sync(root) {
    if (!root) return;
    const standard = document.querySelector('[data-candle-cash-standard-root]');
    if (!standard) return;
    const visible = root.getAttribute('data-cinematic-view') === 'minimized';
    standard.setAttribute('aria-hidden', visible ? 'false' : 'true');
    standard.dataset.standardVisibility = visible ? 'visible' : 'hidden';
    if ('inert' in standard) {
      standard.inert = !visible;
    }
  }

  function init() {
    var root = document.querySelector('[data-candle-cash-cinematic]');
    if (!root) return;

    sync(root);

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'data-cinematic-view') {
          sync(root);
        }
      }
    });

    observer.observe(root, { attributes: true, attributeFilter: ['data-cinematic-view'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
