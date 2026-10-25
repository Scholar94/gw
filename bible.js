/* CAC GOOD WORKS: BIBLE READER PAGE. Reader (KJV/WEB), verse of the day + share card, reading plans with progress that can sync across devices. */
(function () {
  'use strict';
  var S = window.cacScripture, C = window.CACCal, KEY = 'cacDevotionalPrefs', h = S.h;
  var $ = function (id) { return document.getElementById(id); };
  var cur = { refs: [], texts: '' };

  function prefs() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function savePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} window.dispatchEvent(new Event('cac-prefs-changed')); }
  function flash(t) { var s = $('bFlash'); s.textContent = t; clearTimeout(flash.t); flash.t = setTimeout(function () { s.textContent = ''; }, 3500); }

  /* ---------- reader ---------- */
  function show(refs, push) {
    cur.refs = refs; var v = $('bVer').value; S.version(v); var out = $('bText'); out.textContent = ''; out.appendChild(h('p', { text: 'Loading…' }));
    S.load(v).then(function (d) {
      out.textContent = ''; var all = [];
      refs.forEach(function (r) { var vs = S.verses(d, r); all = all.concat(vs); out.appendChild(h('h2', { class: 'sc-title', text: S.toString(r) })); var box = h('div', { class: 'sc-body' }); S.renderVerses(box, vs); out.appendChild(box); });
      cur.texts = S.plainText(all); $('bTools').hidden = !all.length; if (!all.length) out.textContent = 'Reference not found.';
      var one = refs.length === 1 && !refs[0].v1 && refs[0].c1 === refs[0].c2; $('bPrev').hidden = $('bNext').hidden = !one;
      document.title = (refs.length ? S.toString(refs[0]) + ' · ' : '') + 'Bible — CAC Good Works Assembly';
      if (push) { var u = new URL(location.href); u.searchParams.set('ref', refs.map(S.toString).join('; ')); u.searchParams.set('v', v); history.replaceState(null, '', u); }
    }, function () { out.textContent = 'Could not load the Bible text. Please check your connection and try again.'; });
  }
  function go(text, push) {
    var parts = String(text).split(/\s*;\s*/).filter(Boolean), refs = parts.map(S.parse).filter(Boolean);
    if (!refs.length) { flash('Sorry, that reference was not recognised. Try “John 3:16” or “Psalm 23”.'); return; }
    $('bRef').value = parts.join('; '); show(refs.slice(0, 4), push);
  }
  function step(dir) {
    var r = cur.refs[0], b = S.BOOKS.indexOf(r.book), c = r.c1 + dir;
    if (c < 1) { if (b === 0) return; b--; c = S.CH[b]; } else if (c > S.CH[b]) { if (b === S.BOOKS.length - 1) return; b++; c = 1; }
    go(S.BOOKS[b] + ' ' + c, true); window.scrollTo({ top: $('bText').getBoundingClientRect().top + scrollY - 100, behavior: 'smooth' });
  }

  /* ---------- verse of the day ---------- */
  function votd() {
    var r = S.votd(C.todayLagos()), box = $('votdText'); $('votdRef').textContent = S.toString(r);
    S.load(S.version()).then(function (d) { var t = S.plainText(S.verses(d, r)); box.textContent = '“' + t + '”'; $('votdShare').onclick = function () { $('votdShare').disabled = true; S.shareImage(t, S.toString(r), S.version()).then(function () { $('votdShare').disabled = false; }, function () { $('votdShare').disabled = false; flash('Could not make the image.'); }); }; $('votdOpen').onclick = function () { go(S.toString(r), true); window.scrollTo({ top: $('bTop').offsetTop - 80, behavior: 'smooth' }); }; }, function () { box.textContent = ''; });
  }

  /* ---------- plans ---------- */
  function planState(id) { var p = prefs(); return ((p.plans || {})[id] || { done: [] }).done || []; }
  function setDone(id, dayId, on) {
    var p = prefs(); p.plans = p.plans || {}; var e = p.plans[id] = p.plans[id] || { done: [] }, i = e.done.indexOf(dayId);
    if (on && i < 0) e.done.push(dayId); if (!on && i >= 0) e.done.splice(i, 1); e.at = Date.now(); savePrefs(p);
  }
  var openPlan = '';
  function renderPlans() {
    var box = $('plans'); box.textContent = '';
    S.PLAN_DEFS.forEach(function (pl) {
      var days = S.planDays(pl.id), done = planState(pl.id), next = days.filter(function (d) { return done.indexOf(d.id) < 0; })[0], pct = Math.round(done.length / days.length * 100);
      var card = h('div', { class: 'card plan', 'data-plan': pl.id }, h('h3', { text: pl.title }), h('p', { class: 'ev-desc', text: pl.blurb }),
        h('div', { class: 'plan-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': pl.title + ' progress' }, h('span', { style: 'width:' + pct + '%' })),
        h('p', { class: 'ev-desc', text: done.length + ' of ' + days.length + ' days done' }));
      var row = h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
      if (next) row.appendChild(h('button', { type: 'button', class: 'btn-sm', 'data-read': pl.id + ':' + next.id, text: (done.length ? 'Continue · ' : 'Start · ') + next.label }));
      else row.appendChild(h('span', { class: 'ev-desc', text: 'Completed. Well done!' }));
      row.appendChild(h('button', { type: 'button', class: 'btn-sm', 'data-toggle': pl.id, 'aria-expanded': String(openPlan === pl.id), text: openPlan === pl.id ? 'Hide days' : 'All days' })); card.appendChild(row);
      if (openPlan === pl.id) {
        var ul = h('ul', { class: 'plan-days' });
        days.forEach(function (d) { var on = done.indexOf(d.id) >= 0, cb = h('input', { type: 'checkbox', 'data-done': pl.id + ':' + d.id, id: 'pd-' + pl.id + '-' + d.id, checked: on }); ul.appendChild(h('li', null, cb, h('label', { for: cb.id, text: 'Day ' + d.id + ': ' + d.label }), h('button', { type: 'button', class: 'plan-read', 'data-read': pl.id + ':' + d.id, 'aria-label': 'Read day ' + d.id, text: 'Read' }))); });
        card.appendChild(ul);
      }
      box.appendChild(card);
    });
  }
  function readDay(spec) {
    var a = spec.split(':'), d = S.planDays(a[0]).filter(function (x) { return x.id === a[1]; })[0]; if (!d) return;
    $('bRef').value = d.label; show(d.refs.slice(0, 4), false); window.scrollTo({ top: $('bTop').offsetTop - 80, behavior: 'smooth' }); flash('Tick the day as done when you finish.');
  }

  /* ---------- wiring ---------- */
  $('bForm').addEventListener('submit', function (e) { e.preventDefault(); go($('bRef').value, true); });
  $('bVer').addEventListener('change', function () { if (cur.refs.length) show(cur.refs, true); votd(); });
  $('bPrev').addEventListener('click', function () { step(-1); }); $('bNext').addEventListener('click', function () { step(1); });
  $('bCopy').addEventListener('click', function () { var t = cur.texts + ' — ' + cur.refs.map(S.toString).join('; ') + ' (' + $('bVer').value + ')'; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { flash('Copied to clipboard.'); }, function () { flash('Could not copy.'); }); });
  $('bShare').addEventListener('click', function () { if (!cur.texts) return; $('bShare').disabled = true; S.shareImage(cur.texts.length > 700 ? cur.texts.slice(0, 700).replace(/\s\S*$/, '') + '…' : cur.texts, cur.refs.map(S.toString).join('; '), $('bVer').value).then(function () { $('bShare').disabled = false; }, function () { $('bShare').disabled = false; flash('Could not make the image.'); }); });
  $('plans').addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]'); if (t) { openPlan = openPlan === t.getAttribute('data-toggle') ? '' : t.getAttribute('data-toggle'); renderPlans(); var f = document.querySelector('[data-toggle="' + t.getAttribute('data-toggle') + '"]'); if (f) f.focus(); return; }
    var r = e.target.closest('[data-read]'); if (r) readDay(r.getAttribute('data-read'));
  });
  $('plans').addEventListener('change', function (e) { var c = e.target.closest('[data-done]'); if (!c) return; var a = c.getAttribute('data-done').split(':'); setDone(a[0], a[1], c.checked); var f = c.id; renderPlans(); var n = document.getElementById(f); if (n) n.focus(); });
  window.addEventListener('cac-prefs-synced', renderPlans);

  $('bVer').value = S.version();
  var qs = new URLSearchParams(location.search); if (qs.get('v') === 'WEB' || qs.get('v') === 'KJV') { $('bVer').value = qs.get('v'); S.version(qs.get('v')); }
  renderPlans(); votd();
  go(qs.get('ref') || 'John 1', false);
})();
