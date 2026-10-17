/* =============================================
   CAC GOOD WORKS — FLOATING TRANSLATOR
   Custom accessible picker on top of Google's Website
   Translator (free, no API key). Choice is remembered.
   Google loads only AFTER a visitor picks a non-English
   language, so English visitors make no third-party request.
   ============================================= */
(function () {
  'use strict';
  var LANGS = (window.CAC_CONFIG && window.CAC_CONFIG.languages) || [['en', 'English'], ['fr', 'Français']];
  var RTL = { ar: 1, he: 1, ur: 1, fa: 1 };
  var KEY = 'cacLang';

  function getCookie(n) { var m = document.cookie.match('(?:^|; )' + n + '=([^;]*)'); return m ? decodeURIComponent(m[1]) : ''; }
  function setGoogCookie(lang) {
    var v = lang === 'en' ? '' : '/en/' + lang;
    var host = location.hostname;
    var exp = lang === 'en' ? 'Thu, 01 Jan 1970 00:00:00 GMT' : '';
    [null, host, '.' + host].forEach(function (d) {
      document.cookie = 'googtrans=' + v + ';path=/;' + (exp ? 'expires=' + exp + ';' : '') + (d ? 'domain=' + d + ';' : '');
    });
  }
  function current() { var c = getCookie('googtrans'); var m = /\/en\/([\w-]+)/.exec(c); return m ? m[1] : (localStorage.getItem(KEY) || 'en'); }
  function applyDir(lang) { document.documentElement.dir = RTL[lang.split('-')[0]] ? 'rtl' : 'ltr'; }

  var loaded = false;
  function loadGoogle() {
    if (loaded) return; loaded = true;
    var holder = document.createElement('div'); holder.id = 'google_translate_element'; holder.className = 'cac-gt-hidden'; holder.setAttribute('aria-hidden', 'true');
    document.body.appendChild(holder);
    window.googleTranslateElementInit = function () {
      new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false, includedLanguages: LANGS.map(function (l) { return l[0]; }).join(',') }, 'google_translate_element');
    };
    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    s.async = true; s.onerror = function () { status('Translation service could not be reached. Check your connection.'); };
    document.head.appendChild(s);
  }
  function switchTo(lang) {
    localStorage.setItem(KEY, lang);
    setGoogCookie(lang); applyDir(lang);
    var combo = document.querySelector('select.goog-te-combo');
    if (combo) { combo.value = lang === 'en' ? '' : lang; combo.dispatchEvent(new Event('change')); if (lang === 'en') location.reload(); }
    else if (lang === 'en') { location.reload(); }
    else { loadGoogle(); }
  }

  var panel, btn, live;
  function status(msg) { if (live) live.textContent = msg; }
  function build() {
    var cur = current();
    var wrap = document.createElement('div');
    wrap.className = 'cac-lang notranslate'; wrap.setAttribute('translate', 'no');
    wrap.innerHTML =
      '<button type="button" class="cac-lang-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="cacLangPanel" aria-label="Choose language">' +
      '<i class="fas fa-language" aria-hidden="true"></i><span class="cac-lang-cur"></span></button>' +
      '<div class="cac-lang-panel" id="cacLangPanel" role="dialog" aria-label="Choose language" hidden>' +
      '<div class="cac-lang-title">Translate this page</div><ul role="listbox" aria-label="Languages"></ul>' +
      '<p class="cac-lang-note">Automatic translation by Google. Scripture and names may be imperfect.</p>' +
      '<div class="cac-lang-live" role="status" aria-live="polite"></div></div>';
    document.body.appendChild(wrap);
    btn = wrap.querySelector('.cac-lang-btn'); panel = wrap.querySelector('.cac-lang-panel'); live = wrap.querySelector('.cac-lang-live');
    var ul = wrap.querySelector('ul');
    LANGS.forEach(function (l) {
      var li = document.createElement('li'); li.setAttribute('role', 'option'); li.tabIndex = 0; li.dataset.lang = l[0];
      li.textContent = l[1]; if (l[0] === cur) li.setAttribute('aria-selected', 'true');
      ul.appendChild(li);
    });
    var label = function (c) { var f = LANGS.filter(function (l) { return l[0] === c; })[0]; return f ? f[1] : 'English'; };
    wrap.querySelector('.cac-lang-cur').textContent = label(cur);
    function open(o) { panel.hidden = !o; btn.setAttribute('aria-expanded', String(o)); if (o) { var sel = ul.querySelector('[aria-selected="true"]') || ul.firstChild; sel.focus(); } }
    btn.addEventListener('click', function () { open(panel.hidden); });
    function choose(li) { if (!li) return; var l = li.dataset.lang; ul.querySelectorAll('li').forEach(function (x) { x.removeAttribute('aria-selected'); }); li.setAttribute('aria-selected', 'true');
      wrap.querySelector('.cac-lang-cur').textContent = label(l); status('Translating…'); switchTo(l); open(false); btn.focus(); }
    ul.addEventListener('click', function (e) { choose(e.target.closest('li')); });
    ul.addEventListener('keydown', function (e) {
      var li = e.target.closest('li'); if (!li) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(li); }
      if (e.key === 'ArrowDown') { e.preventDefault(); (li.nextSibling || ul.firstChild).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (li.previousSibling || ul.lastChild).focus(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); } });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) open(false); });
    if (cur !== 'en') { applyDir(cur); loadGoogle(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
