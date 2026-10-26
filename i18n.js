/* =============================================
   CAC GOOD WORKS: INTERFACE TRANSLATION
   Replaces WHOLE short text nodes (menus, buttons, labels, headings) with reviewed translations from i18n-<code>.json. Long paragraphs
   stay in English until they are translated deliberately. Nothing is auto-translated here (the page-translate widget is the machine option).
   A language is offered only if it is listed in config.js > i18n.enabled AND its file is marked reviewed (or i18n.allowDrafts is true).
   Add a language: fill a column in i18n-translators.csv, run `python3 build-i18n.py apply --reviewed fr`, add the code to config.js.
   ============================================= */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else { root.cacI18n = api; if (typeof document !== 'undefined') api.boot(); }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var KEY = 'cacLang', CODE = /^[a-z]{2,3}$/;

  /** Translate one text value, keeping its leading/trailing whitespace. Returns null when there is no exact translation. */
  function translateText(map, text) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(String(text)); if (!m || !m[2]) return null;
    var key = m[2].replace(/\s+/g, ' '), t = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    return typeof t === 'string' && t ? m[1] + t + m[3] : null;
  }
  /** May this language file be shown to visitors? */
  function usable(file, cfg) { return !!(file && file._meta && CODE.test(file._meta.code || '') && file.strings && typeof file.strings === 'object' && (file._meta.reviewed === true || (cfg && cfg.allowDrafts === true))); }

  var cfg = (root.CAC_CONFIG && root.CAC_CONFIG.i18n) || {}, langs = { en: { code: 'en', name: 'English', strings: {} } }, cur = 'en', orig = new WeakMap(), attrOrig = new WeakMap(), obs, btn;
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  function skip(n) { for (var p = n.parentNode; p && p.nodeType === 1; p = p.parentNode) if (/^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT|CODE)$/.test(p.nodeName) || p.hasAttribute('data-no-i18n') || p.isContentEditable) return true; return false; }
  function applyTo(rootEl, map) {
    var tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT), n, nodes = [];
    while ((n = tw.nextNode())) nodes.push(n);
    nodes.forEach(function (n) { if (skip(n)) return; var o = orig.has(n) ? orig.get(n) : n.nodeValue, t = translateText(map, o); if (t !== null) { if (!orig.has(n)) orig.set(n, o); n.nodeValue = t; } else if (orig.has(n)) { n.nodeValue = orig.get(n); orig.delete(n); } });
    var els = rootEl.querySelectorAll ? rootEl.querySelectorAll('[aria-label],[title],[placeholder],[alt]') : [];
    [].forEach.call(els, function (el) { if (el.closest && el.closest('[data-no-i18n]')) return; ATTRS.forEach(function (a) { if (!el.hasAttribute(a)) return; var store = attrOrig.get(el) || {}, o = a in store ? store[a] : el.getAttribute(a), t = translateText(map, o); if (t !== null) { store[a] = o; attrOrig.set(el, store); el.setAttribute(a, t); } else if (a in store) { el.setAttribute(a, store[a]); delete store[a]; } }); });
  }
  function load(code) {
    if (langs[code]) return Promise.resolve(langs[code]);
    return root.fetch('i18n-' + code + '.json').then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); }).then(function (f) {
      if (!usable(f, cfg) || f._meta.code !== code) { if (root.console) console.warn('[i18n] ' + code + ' is not marked reviewed (set i18n.allowDrafts to preview it).'); return null; }
      return (langs[code] = { code: code, name: f._meta.name || code, strings: f.strings });
    }).catch(function () { return null; });
  }
  function draw() {
    if (!btn) return; var list = Object.keys(langs), next = langs[list[(list.indexOf(cur) + 1) % list.length]];
    btn.textContent = ''; var v = document.createElement('span'); v.className = 'lang-code'; v.setAttribute('aria-hidden', 'true'); v.textContent = cur.toUpperCase();
    var s = document.createElement('span'); s.className = 'sr-only'; s.textContent = 'Language: ' + langs[cur].name + '. Switch to ' + next.name + '.'; btn.appendChild(v); btn.appendChild(s); btn.title = langs[cur].name;
  }
  function set(code, persist) {
    var l = langs[code]; if (!l) return; cur = code; document.documentElement.setAttribute('lang', code === 'en' ? (document.documentElement.getAttribute('data-lang0') || 'en') : code);
    applyTo(document.body, l.strings); draw(); if (persist) { try { root.localStorage.setItem(KEY, code); } catch (e) {} }
    if (obs) obs.disconnect(); if (code !== 'en') { obs = new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (nd) { if (nd.nodeType === 1) applyTo(nd, l.strings); else if (nd.nodeType === 3 && nd.parentNode && !skip(nd)) { var t = translateText(l.strings, nd.nodeValue); if (t !== null) { orig.set(nd, nd.nodeValue); nd.nodeValue = t; } } }); }); }); obs.observe(document.body, { childList: true, subtree: true }); }
  }
  function boot() {
    var want = (cfg.enabled || []).filter(function (c) { return c !== 'en' && CODE.test(c); }).slice(0, 5); if (!want.length) return;
    document.documentElement.setAttribute('data-lang0', document.documentElement.getAttribute('lang') || 'en');
    Promise.all(want.map(load)).then(function () {
      if (Object.keys(langs).length < 2) return;
      var anchor = document.getElementById('themeBtn') || document.getElementById('hamburger'); if (anchor && anchor.parentNode) { btn = document.createElement('button'); btn.type = 'button'; btn.id = 'langBtn'; btn.className = 'theme-btn lang-btn'; anchor.parentNode.insertBefore(btn, anchor); btn.addEventListener('click', function () { var list = Object.keys(langs); set(list[(list.indexOf(cur) + 1) % list.length], true); }); }
      var q = new URLSearchParams(root.location.search).get('lang'), saved = ''; try { saved = root.localStorage.getItem(KEY) || ''; } catch (e) {}
      var start = langs[q] ? q : (langs[saved] ? saved : 'en'); if (start !== 'en') set(start, false); else draw();
    });
  }
  return { translateText: translateText, usable: usable, boot: boot, set: set, current: function () { return cur; } };
});
