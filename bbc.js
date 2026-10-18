/* =============================================
   CAC GOOD WORKS — BELIEVERS BIBLE COLLEGE PROMO
   Renders [data-bbc="full|compact"] containers.
   Defaults come from config.js; Admin > Believers Bible
   College overrides them (Firestore siteSettings/bbc).
   All text is inserted with textContent and all URLs are
   validated (https only), so settings can never inject code.
   ============================================= */
(function () {
  'use strict';
  var nodes = document.querySelectorAll('[data-bbc]');
  if (!nodes.length) return;
  var DEF = (window.CAC_CONFIG && window.CAC_CONFIG.bbc) || {};
  var current = {};

  function httpsURL(u) { try { var x = new URL(String(u || ''), location.href); return x.protocol === 'https:' && String(u).indexOf('https://') === 0 ? x.href : ''; } catch (e) { return ''; } }
  function remoteImg(s) { s = String(s || ''); return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(s) || /^https:\/\/\S+$/.test(s) ? s : ''; }
  function localImg(s) { return /^[\w.\-]+\.(svg|png|jpe?g|webp)$/i.test(String(s || '')) ? s : ''; }   // bundled file shipped with the site
  function pickText(remote, fallback, max) { return (typeof remote === 'string' && remote.trim() ? remote.trim() : fallback || '').slice(0, max); }

  function merged(remote) {
    remote = remote || {};
    return {
      name: DEF.name || 'Believers Bible College',
      headline: pickText(remote.headline, DEF.headline, 120),
      text: pickText(remote.text, DEF.text, 600),
      buttonLabel: pickText(remote.buttonLabel, DEF.buttonLabel, 60) || 'Visit Believers Bible College',
      url: httpsURL(remote.url) || httpsURL(DEF.url),
      image: remoteImg(remote.image) || localImg(DEF.image) || remoteImg(DEF.image) || 'bbc-crest.webp'
    };
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function icon(cls) { var i = el('i', cls); i.setAttribute('aria-hidden', 'true'); return i; }

  function render(node, d) {
    var compact = node.getAttribute('data-bbc') === 'compact';
    node.textContent = '';
    var card = el('div', 'bbc-card' + (compact ? ' bbc-compact' : '')), copy = el('div', 'bbc-copy'), media = el('figure', 'bbc-media');
    var img = el('img'); img.alt = d.name; img.loading = 'lazy'; img.decoding = 'async'; img.width = 1200; img.height = 800; img.src = d.image;
    img.addEventListener('error', function () { if (img.getAttribute('src') !== 'bbc-crest.webp') img.src = 'bbc-crest.webp'; });
    media.appendChild(img);
    copy.appendChild(el('span', 'tag bbc-tag', d.name));
    var h = el(compact ? 'h3' : 'h2', 'bbc-title', d.headline); if (!compact) h.id = 'bbcTitle'; copy.appendChild(h);
    copy.appendChild(el('p', 'bbc-text', d.text));
    var act = el('div', 'bbc-actions');
    if (d.url) {
      var a = el('a', 'btn-primary bbc-btn'); a.href = d.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', d.buttonLabel + ' (opens in a new tab)');
      a.appendChild(icon('fas fa-graduation-cap')); a.appendChild(document.createTextNode(' ' + d.buttonLabel + ' ')); a.appendChild(icon('fas fa-arrow-up-right-from-square'));
      act.appendChild(a);
      if (!compact) act.appendChild(el('small', 'bbc-note', 'Opens in a new tab'));
    } else {
      var s = el('span', 'bbc-disabled'); s.setAttribute('aria-disabled', 'true'); s.appendChild(icon('fas fa-graduation-cap')); s.appendChild(document.createTextNode(' Link coming soon'));
      act.appendChild(s);
    }
    copy.appendChild(act);
    if (compact) { card.appendChild(media); card.appendChild(copy); } else { card.appendChild(copy); card.appendChild(media); }
    node.appendChild(card);
  }
  function renderAll(remote) { current = merged(remote); Array.prototype.forEach.call(nodes, function (n) { render(n, current); }); }

  renderAll(null); // instant, from config defaults: never wait on the network
  (window.cacReady || Promise.resolve()).then(function () {
    if (!window.CAC_BACKEND || !window.CAC_BACKEND.configured || !window.getSiteSetting) return;
    return window.getSiteSetting('bbc').then(function (s) { if (s) renderAll(s); });
  }).catch(function (e) { console.warn('bbc settings:', e && e.message); });
  window.__bbc = { merged: merged, renderAll: renderAll };
})();
