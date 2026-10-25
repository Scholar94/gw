/* CAC GOOD WORKS: COLOUR THEMES (dark = default, light, high contrast). Loaded in <head> so the saved theme is applied before first paint (no flash). */
(function () {
  'use strict';
  var KEY = 'cacTheme', ORDER = ['dark', 'light', 'contrast'], LABEL = { dark: 'Dark', light: 'Light', contrast: 'High contrast' }, ICON = { dark: 'fa-moon', light: 'fa-sun', contrast: 'fa-circle-half-stroke' };
  function get() { var t = ''; try { t = localStorage.getItem(KEY) || ''; } catch (e) {} if (ORDER.indexOf(t) < 0 && window.matchMedia && window.matchMedia('(prefers-contrast: more)').matches) t = 'contrast'; return ORDER.indexOf(t) < 0 ? 'dark' : t; }
  function apply(t) { document.documentElement.setAttribute('data-theme', t); var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'light' ? '#faf7f0' : '#0a0a0f'); }
  apply(get());
  window.cacTheme = { get: get, set: function (t) { if (ORDER.indexOf(t) < 0) return; try { localStorage.setItem(KEY, t); } catch (e) {} apply(t); draw(); }, ORDER: ORDER };
  var btn;
  function draw() {
    if (!btn) return; var t = get(), n = ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];
    btn.innerHTML = ''; var i = document.createElement('i'); i.className = 'fas ' + ICON[t]; i.setAttribute('aria-hidden', 'true'); var s = document.createElement('span'); s.className = 'sr-only'; s.textContent = 'Colour theme: ' + LABEL[t] + '. Activate to switch to ' + LABEL[n] + '.';
    btn.appendChild(i); btn.appendChild(s); btn.title = 'Theme: ' + LABEL[t];
  }
  document.addEventListener('DOMContentLoaded', function () {
    var anchor = document.getElementById('hamburger'); if (!anchor || !anchor.parentNode) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.id = 'themeBtn'; btn.className = 'theme-btn'; anchor.parentNode.insertBefore(btn, anchor);
    btn.addEventListener('click', function () { window.cacTheme.set(ORDER[(ORDER.indexOf(get()) + 1) % ORDER.length]); }); draw();
  });
})();
