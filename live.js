/* =============================================
   CAC GOOD WORKS: LIVE SERVICE MODE
   Every page: a small "Live now" pill when the admin has switched the service on (one read per page view).
   live.html: the video plus real-time sermon notes and scriptures. Scripture references open the verse popover.
   ============================================= */
(function () {
  'use strict';
  var M = window.cacMedia, S = window.cacScripture;
  function h(tag, a) { var e = document.createElement(tag); if (a) Object.keys(a).forEach(function (k) { if (k === 'text') e.textContent = a[k]; else if (k === 'class') e.className = a[k]; else if (a[k] != null && a[k] !== false) e.setAttribute(k, a[k] === true ? '' : a[k]); }); for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); return e; }
  function ready() { return window.cacReady || Promise.resolve(); }
  var onLivePage = !!document.getElementById('liveStage');

  /* ---------- banner on every other page ---------- */
  function banner(l) {
    if (document.getElementById('liveBanner')) return;
    document.body.appendChild(h('a', { id: 'liveBanner', class: 'live-banner', href: 'live.html', 'aria-label': 'Live now: ' + (l.title || 'Service') + '. Watch.' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), h('b', { text: 'LIVE NOW' }), ' ' + (l.title || 'Service') + ' · Watch'));
  }
  if (!onLivePage) {
    ready().then(function () { return typeof window.getLive === 'function' ? window.getLive() : null; }).then(function (l) { if (l && l.active) banner(l); }).catch(function () {});
    return;
  }

  /* ---------- live.html ---------- */
  var stage = document.getElementById('liveStage'), feed = document.getElementById('liveNotes'), status = document.getElementById('liveStatus'), auto = document.getElementById('liveAuto');
  var shownVideo = '', seen = {};
  function drawStage(l) {
    if (!l || !l.active) {
      shownVideo = ''; stage.textContent = '';
      stage.appendChild(h('div', { class: 'card', style: 'text-align:center;padding:40px' }, h('h2', { text: 'No service is live right now' }), h('p', { class: 'ev-desc', text: 'This page updates by itself the moment we go live. You can also catch up on past messages.' }), h('a', { class: 'btn-sm', href: 'sermons.html', text: 'Watch past sermons' })));
      status.textContent = 'Offline'; document.getElementById('liveHead').textContent = 'Live Service'; return;
    }
    document.getElementById('liveHead').textContent = l.title || 'Live Service'; status.textContent = 'Live now';
    var v = M.video(l.video); var key = v ? v.embed : '';
    if (key === shownVideo && stage.firstChild) return; shownVideo = key; stage.textContent = '';
    if (v) stage.appendChild(h('iframe', { src: v.embed + (v.kind === 'youtube' ? '?rel=0' : ''), title: l.title || 'Live service', allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true, class: 'live-frame' }));
    else stage.appendChild(h('div', { class: 'card', style: 'text-align:center;padding:30px' }, h('p', { text: 'The video will appear here shortly. Follow the notes below.' })));
  }
  function drawNotes(items) {
    feed.textContent = '';
    if (!items.length) { feed.appendChild(h('li', { class: 'ev-desc', text: 'Sermon notes and scriptures will appear here as the message goes on.' })); return; }
    items.forEach(function (n) {
      var sc = n.kind === 'scripture', item = h('li', { class: 'live-note ' + (sc ? 'is-scripture' : '') }, h('i', { class: sc ? 'fas fa-book-bible' : 'fas fa-pen', 'aria-hidden': 'true' }), h('span', { text: String(n.text || '') }));
      feed.appendChild(item);
    });
    if (S) S.linkify(feed);
    var fresh = items.some(function (n) { return !seen[n.id]; }); items.forEach(function (n) { seen[n.id] = 1; });
    if (fresh && auto && auto.checked && items.length > 1) feed.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  ready().then(function () {
    if (typeof window.listenLive !== 'function' || !window.CAC_BACKEND || !window.CAC_BACKEND.configured) { drawStage(null); drawNotes([]); status.textContent = 'Not connected'; return; }
    window.listenLive(drawStage); window.listenLiveNotes(drawNotes);
  });
})();
