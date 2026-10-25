/* Admin: live service controls (go live / end service, post notes and scriptures in real time). Loaded by admin-dashboard.html. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, started = false, current = null;
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t); }
  function guard(fn) { return function () { var a = arguments; return Promise.resolve().then(function () { return fn.apply(null, a); }).catch(function (e) { toast((e && e.code === 'permission-denied') ? 'You do not have permission to do that.' : 'Could not save. Please try again.', 'error'); }); }; }
  function draw(l) {
    current = l; var on = !!(l && l.active);
    $('liveState').textContent = on ? 'LIVE NOW' : 'Offline'; $('liveState').className = 'live-chip' + (on ? ' on' : '');
    $('liveGo').textContent = on ? 'Update live details' : 'Go live'; $('liveEnd').disabled = !on;
    if (l && !$('liveTitle').dataset.touched) { $('liveTitle').value = l.title || ''; $('liveVideo').value = l.video || ''; }
  }
  function drawNotes(items) {
    var ul = $('liveList'); ul.textContent = '';
    if (!items.length) { var li = document.createElement('li'); li.textContent = 'No notes yet.'; li.style.color = 'var(--white-60)'; ul.appendChild(li); return; }
    items.forEach(function (n) {
      var li = document.createElement('li'), t = document.createElement('span'), b = document.createElement('button');
      li.style.cssText = 'display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--dark-border)';
      t.textContent = (n.kind === 'scripture' ? '📖 ' : '• ') + n.text; b.type = 'button'; b.className = 'admin-btn danger'; b.style.padding = '4px 10px'; b.setAttribute('aria-label', 'Delete this note'); b.setAttribute('data-del', n.id); b.textContent = 'Delete';
      li.appendChild(t); li.appendChild(b); ul.appendChild(li);
    });
    ul.scrollTop = ul.scrollHeight;
  }
  window.loadLive = function () { if (started) return; started = true; window.listenLive(draw); window.listenLiveNotes(drawNotes); };
  function ytOk(v) { return !v || (window.cacMedia && window.cacMedia.video(v)); }
  function init() {
    if (!$('liveGo')) return;
    ['liveTitle', 'liveVideo'].forEach(function (id) { $(id).addEventListener('input', function () { $('liveTitle').dataset.touched = '1'; }); });
    $('liveGo').addEventListener('click', guard(function () {
      var title = $('liveTitle').value.trim(), video = $('liveVideo').value.trim();
      if (!title) return toast('Give the service a title (e.g. Sunday Service).', 'error');
      if (!ytOk(video)) return toast('Paste a YouTube link (or a Google Drive video link).', 'error');
      return window.setLive({ active: true, title: title, video: video }).then(function () { toast('Service is LIVE. Visitors now see the banner.'); });
    }));
    $('liveEnd').addEventListener('click', guard(function () {
      if (!window.confirm('End the live service?' + ($('liveClear').checked ? ' The notes will be cleared.' : ''))) return;
      return window.setLive({ active: false, title: (current && current.title) || '', video: (current && current.video) || '' }).then(function () { return $('liveClear').checked ? window.clearLiveNotes() : 0; }).then(function () { $('liveTitle').dataset.touched = ''; toast('Service ended.'); });
    }));
    function post(kind) { var inp = $('liveText'), v = inp.value.trim(); if (!v) return Promise.resolve(); if (v.length > 600) return toast('Keep each note under 600 characters.', 'error'); return window.addLiveNote(kind, v).then(function () { inp.value = ''; inp.focus(); }); }
    $('liveAddNote').addEventListener('click', guard(function () { return post('note'); })); $('liveAddScripture').addEventListener('click', guard(function () { return post('scripture'); }));
    $('liveText').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); guard(function () { return post('note'); })(); } });
    $('liveList').addEventListener('click', guard(function (e) { var b = e.target.closest('[data-del]'); if (b) return window.deleteLiveNote(b.getAttribute('data-del')); }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
