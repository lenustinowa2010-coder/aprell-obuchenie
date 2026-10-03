/* Все ссылки на страницы открываются отдельно от сайта обучения. */
(() => {
  function prepareLink(link) {
    const href = (link.getAttribute('href') || '').trim();
    // Якоря управляют разделами приложения; download сохраняет файл.
    if (!href || href.startsWith('#') || link.hasAttribute('download')) return;
    let url;
    try { url = new URL(href, document.baseURI); } catch { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (link.target !== '_blank') link.target = '_blank';
    if (!link.relList.contains('noopener')) link.relList.add('noopener');
    if (!link.relList.contains('noreferrer')) link.relList.add('noreferrer');
  }

  function prepareTree(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('a[href]')) prepareLink(root);
    root.querySelectorAll('a[href]').forEach(prepareLink);
  }

  prepareTree(document.documentElement);
  new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'attributes') prepareLink(record.target);
      else record.addedNodes.forEach(prepareTree);
    });
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'target', 'rel']
  });
})();
