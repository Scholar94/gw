/* CAC GOOD WORKS: PRAYER WALL. Staff-approved requests; visitors tap "I prayed" (counted by the Worker, one tap per request per device). */
(function () {
  'use strict';
  var list = document.getElementById('wallList'), KEY = 'cacPrayed';
  function h(tag, a) { var e = document.createElement(tag); if (a) Object.keys(a).forEach(function (k) { if (k === 'text') e.textContent = a[k]; else if (k === 'class') e.className = a[k]; else if (a[k] != null && a[k] !== false) e.setAttribute(k, a[k] === true ? '' : a[k]); }); for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); return e; }
  function done() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function mark(id) { var d = done(); if (d.indexOf(id) < 0) d.push(id); try { localStorage.setItem(KEY, JSON.stringify(d.slice(-300))); } catch (e) {} }
  function empty(msg) { list.textContent = ''; list.appendChild(h('p', { class: 'ev-desc', text: msg })); }
  function draw(items) {
    if (!items.length) return empty('No requests on the wall yet. You can send us yours from the home page and our pastoral team will pray with you.');
    list.textContent = ''; var mine = done();
    items.forEach(function (w) {
      var did = mine.indexOf(w.id) >= 0, n = Math.max(0, w.prayedCount | 0);
      var cnt = h('span', { class: 'wall-count', 'aria-live': 'polite', text: n + (n === 1 ? ' person has prayed' : ' people have prayed') });
      var btn = h('button', { type: 'button', class: 'btn-sm', 'data-id': w.id, disabled: did, text: did ? 'Thank you for praying' : 'I prayed' });
      list.appendChild(h('article', { class: 'card wall-card' }, h('p', { class: 'wall-text', text: w.text || '' }), h('div', { class: 'wall-foot' }, btn, cnt)));
    });
  }
  list.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]'); if (!b || b.disabled) return; b.disabled = true; var id = b.getAttribute('data-id'), card = b.closest('.wall-card'), cnt = card.querySelector('.wall-count');
    if (!window.cacEdge || !window.cacEdge.enabled()) { b.disabled = false; cnt.textContent = 'Counting is not connected yet.'; return; }
    window.cacEdge.post('/v1/prayed/' + encodeURIComponent(id), {}).then(function () {
      mark(id); b.textContent = 'Thank you for praying'; var m = /^(\d+)/.exec(cnt.textContent), n = (m ? +m[1] : 0) + 1; cnt.textContent = n + (n === 1 ? ' person has prayed' : ' people have prayed');
    }).catch(function (err) { b.disabled = false; cnt.textContent = err.message || 'Could not record that. Please try again.'; });
  });
  (window.cacReady || Promise.resolve()).then(function () { return typeof window.getPrayerWall === 'function' ? window.getPrayerWall() : []; }).then(draw, function () { empty('The prayer wall could not be loaded right now.'); });
})();
