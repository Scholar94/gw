/* =============================================
   CAC GOOD WORKS: SERMONS PAGE
   Video (YouTube / Google Drive) and audio (Drive via the edge Worker, archive.org, any https file).
   Audio player: speed control, chapters, searchable timed transcript, resumes where you stopped.
   Everything from the database is treated as untrusted text (built with textContent, never innerHTML).
   ============================================= */
(function () {
  'use strict';
  var M = window.cacMedia;
  var videos = [], audios = [], vCat = '', loadedAudio = false;
  var lastFocus = null;

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k]; else if (k === 'text') el.textContent = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return el;
  }
  function icon(cls) { return h('i', { class: cls, 'aria-hidden': 'true' }); }
  function empty(ic, msg) { return h('div', { class: 'no-results', style: 'grid-column:1/-1' }, icon(ic), h('p', { text: msg })); }
  function meta(ic, text) { return h('span', null, h('i', { class: ic, style: 'color:var(--gold);margin-right:6px;font-size:.8em', 'aria-hidden': 'true' }), text || '—'); }
  function ready() { return window.cacReady || Promise.resolve(); }
  function fmtDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : (d || ''); }
  function match(s, q) { return ((s.title || '') + ' ' + (s.preacher || '') + ' ' + (s.category || '') + ' ' + (s.description || '')).toLowerCase().indexOf(q) !== -1; }

  /* ---------------- VIDEO ---------------- */
  function renderFilters() {
    var cats = []; videos.forEach(function (s) { if (s.category && cats.indexOf(s.category) < 0) cats.push(s.category); }); cats.sort();
    var box = document.getElementById('videoFilters'); box.textContent = '';
    ['All'].concat(cats).forEach(function (c) {
      var v = c === 'All' ? '' : c;
      box.appendChild(h('button', { type: 'button', class: 'filter-btn' + (v === vCat ? ' active' : ''), 'data-cat': v, 'aria-pressed': String(v === vCat), text: c }));
    });
    box.hidden = cats.length < 2;
  }
  function renderVideos() {
    var q = document.getElementById('videoSearch').value.trim().toLowerCase(), grid = document.getElementById('videoSermonGrid'); grid.textContent = '';
    var list = videos.filter(function (s) { return (!vCat || s.category === vCat) && (!q || match(s, q)); });
    if (!videos.length) return grid.appendChild(empty('fa-video', 'New sermons will appear here soon.'));
    if (!list.length) return grid.appendChild(empty('fa-search', 'No sermons match your search.'));
    list.forEach(function (s) {
      var v = M.video(s.videoUrl), thumb = s.thumb && M.safeUrl(s.thumb) || (v && v.thumb) || '';
      var card = h('button', { type: 'button', class: 'sermon-card', 'data-id': s.id, 'aria-label': 'Play: ' + (s.title || 'Sermon') },
        h('div', { class: 'sermon-thumb' }, thumb ? h('img', { src: thumb, alt: '', loading: 'lazy', decoding: 'async', width: 320, height: 180 }) : icon('fas fa-play-circle'), h('div', { class: 'play-btn' }, icon('fas fa-play'))),
        h('div', { class: 'sermon-info' }, h('span', { class: 's-category', text: s.category || 'General' }), h('h3', { text: s.title || 'Untitled sermon' }),
          h('div', { class: 'sermon-meta' }, meta('fas fa-user', s.preacher), meta('fas fa-calendar', fmtDate(s.date)))));
      if (!v) card.disabled = true;
      grid.appendChild(card);
    });
  }
  function openVideo(id) {
    var s = videos.filter(function (x) { return x.id === id; })[0], v = s && M.video(s.videoUrl); if (!v) return;
    lastFocus = document.activeElement;
    var modal = document.getElementById('videoModal'), f = document.getElementById('modalIframe');
    f.title = s.title || 'Sermon video'; f.src = v.embed + (v.kind === 'youtube' ? '?autoplay=1&rel=0' : '');
    modal.classList.add('open'); document.body.style.overflow = 'hidden'; document.getElementById('modalClose').focus();
  }
  function closeVideo() {
    document.getElementById('videoModal').classList.remove('open'); document.getElementById('modalIframe').src = 'about:blank'; document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------------- AUDIO ---------------- */
  var SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
  function posKey(s) { return 'cacPos_' + s.id; }
  function highlight(text, q) {
    if (!q) return document.createTextNode(text);
    var frag = document.createDocumentFragment(), low = text.toLowerCase(), i = 0, j;
    while ((j = low.indexOf(q, i)) !== -1) { if (j > i) frag.appendChild(document.createTextNode(text.slice(i, j))); frag.appendChild(h('mark', { text: text.slice(j, j + q.length) })); i = j + q.length; }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    return frag;
  }
  function buildPlayer(s, src) {
    var wrap = h('div', { class: 'audio-player-wrap' });
    var audio = h('audio', { controls: true, preload: 'none', src: src, 'aria-label': s.title || 'Sermon audio' });
    var speed = h('select', { class: 'ap-speed', 'aria-label': 'Playback speed' }); SPEEDS.forEach(function (x) { speed.appendChild(h('option', { value: x, text: x + '×', selected: x === 1 })); });
    var tools = h('div', { class: 'ap-tools' }, h('label', null, 'Speed ', speed));
    wrap.appendChild(audio); wrap.appendChild(tools);
    speed.addEventListener('change', function () { audio.playbackRate = +speed.value; });
    audio.addEventListener('play', function () { audio.playbackRate = +speed.value; });
    // resume
    var saved = 0; try { saved = +localStorage.getItem(posKey(s)) || 0; } catch (e) {}
    audio.addEventListener('loadedmetadata', function () { if (saved > 5 && saved < audio.duration - 5) { audio.currentTime = saved; saved = 0; } });
    var lastSave = 0; audio.addEventListener('timeupdate', function () { var n = Date.now(); if (n - lastSave > 5000) { lastSave = n; try { localStorage.setItem(posKey(s), String(Math.floor(audio.currentTime))); } catch (e) {} } });
    audio.addEventListener('ended', function () { try { localStorage.removeItem(posKey(s)); } catch (e) {} });
    function seek(t) { audio.currentTime = t; var p = audio.play(); if (p && p.catch) p.catch(function () {}); }   // play() can reject (offline, autoplay policy): never surface as an unhandled error
    // chapters
    var chapters = M.parseChapters(s.chapters);
    if (chapters.length) {
      var ul = h('ul', { class: 'ap-chapters', 'aria-label': 'Chapters' });
      chapters.forEach(function (c, i) { var b = h('button', { type: 'button', 'data-t': c.t }, h('b', { text: M.fmtTime(c.t) }), ' ' + c.title); ul.appendChild(h('li', null, b)); });
      ul.addEventListener('click', function (e) { var b = e.target.closest('button[data-t]'); if (b) seek(+b.getAttribute('data-t')); });
      audio.addEventListener('timeupdate', function () { var cur = -1; chapters.forEach(function (c, i) { if (audio.currentTime >= c.t) cur = i; }); [].forEach.call(ul.children, function (li, i) { li.classList.toggle('now', i === cur); }); });
      wrap.appendChild(h('details', { class: 'ap-sect' }, h('summary', { text: 'Chapters (' + chapters.length + ')' }), ul));
    }
    // transcript
    var lines = M.parseTranscript(s.transcript);
    if (lines.length) {
      var search = h('input', { type: 'search', class: 'ap-search', placeholder: 'Search this transcript…', 'aria-label': 'Search transcript' });
      var out = h('div', { class: 'ap-transcript', role: 'region', 'aria-label': 'Transcript', 'aria-live': 'polite' }), count = h('p', { class: 'ap-count', 'aria-live': 'polite' });
      function draw() {
        var q = search.value.trim().toLowerCase(); out.textContent = '';
        var shown = lines.filter(function (l) { return !q || l.text.toLowerCase().indexOf(q) !== -1; });
        count.textContent = q ? shown.length + (shown.length === 1 ? ' match' : ' matches') : '';
        shown.slice(0, 400).forEach(function (l) {
          var p = h('p', { class: l.t >= 0 ? 'ln timed' : 'ln' });
          if (l.t >= 0) p.appendChild(h('button', { type: 'button', 'data-t': l.t, 'aria-label': 'Play from ' + M.fmtTime(l.t), text: M.fmtTime(l.t) }));
          p.appendChild(highlight(l.text, q)); out.appendChild(p);
        });
      }
      out.addEventListener('click', function (e) { var b = e.target.closest('button[data-t]'); if (b) seek(+b.getAttribute('data-t')); });
      var tmo; search.addEventListener('input', function () { clearTimeout(tmo); tmo = setTimeout(draw, 120); });
      wrap.appendChild(h('details', { class: 'ap-sect' }, h('summary', { text: 'Transcript' }), search, count, out)); draw();
    }
    return wrap;
  }
  function renderAudio() {
    var q = document.getElementById('audioSearch').value.trim().toLowerCase(), list = document.getElementById('audioSermonList'); list.textContent = '';
    var shown = audios.filter(function (s) { return !q || match(s, q) || (s.transcript || '').toLowerCase().indexOf(q) !== -1; });
    if (!audios.length) return list.appendChild(empty('fa-headphones', 'New audio messages will appear here soon.'));
    if (!shown.length) return list.appendChild(empty('fa-search', 'No audio sermons match your search.'));
    shown.forEach(function (s) {
      var src = M.audioSrc(s.audioUrl), actions = h('div', { class: 'audio-actions' });
      var card = h('div', { class: 'audio-sermon-card', id: 'audio-' + s.id });
      var info = h('div', { class: 'audio-info' }, h('h4', { text: s.title || 'Untitled' }), h('span', null, h('i', { class: 'fas fa-user', style: 'color:var(--gold);margin-right:4px;font-size:.7rem', 'aria-hidden': 'true' }), (s.preacher || '—') + ' · ' + (fmtDate(s.date) || '—')));
      if (src) {
        var play = h('button', { type: 'button', 'data-play': s.id, title: 'Open player', 'aria-label': 'Open player for ' + (s.title || 'sermon'), 'aria-expanded': 'false' }, icon('fas fa-play'));
        actions.appendChild(play); actions.appendChild(h('a', { href: src, target: '_blank', rel: 'noopener', download: true, title: 'Download', 'aria-label': 'Download ' + (s.title || 'sermon') }, icon('fas fa-download')));
        card.appendChild(h('div', { class: 'audio-icon-wrap' }, icon('fas fa-headphones'))); card.appendChild(info); card.appendChild(actions);
        card._build = function () { if (!card.querySelector('.audio-player-wrap')) card.appendChild(buildPlayer(s, src)); };
      } else { card.appendChild(h('div', { class: 'audio-icon-wrap' }, icon('fas fa-headphones'))); card.appendChild(info); info.appendChild(h('span', { class: 'ap-soon', text: ' Audio coming soon' })); }
      list.appendChild(card);
    });
  }
  function togglePlayer(id) {
    var card = document.getElementById('audio-' + id); if (!card || !card._build) return;
    card._build(); var on = card.classList.toggle('playing'), audio = card.querySelector('audio'), btn = card.querySelector('[data-play]');
    btn.setAttribute('aria-expanded', String(on)); btn.firstChild.className = on ? 'fas fa-chevron-up' : 'fas fa-play';
    if (!on && audio) audio.pause();
  }

  /* ---------------- tabs, loading, wiring ---------------- */
  function switchTab(tab) {
    [].forEach.call(document.querySelectorAll('.tab-btn'), function (b) { var on = b.getAttribute('data-tab') === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    [].forEach.call(document.querySelectorAll('.tab-pane'), function (p) { p.classList.toggle('active', p.id === 'tab-' + tab); });
    if (tab === 'audio' && !loadedAudio) loadAudio();
  }
  function loadVideos() {
    ready().then(function () { return typeof window.getSermons === 'function' ? window.getSermons() : []; }).catch(function () { return null; }).then(function (r) {
      if (r === null) { document.getElementById('videoSermonGrid').textContent = ''; return document.getElementById('videoSermonGrid').appendChild(empty('fa-triangle-exclamation', 'Sermons could not be loaded right now. Please try again later.')); }
      videos = r; renderFilters(); renderVideos();
    });
  }
  function loadAudio() {
    loadedAudio = true;
    ready().then(function () { return typeof window.getAudioSermons === 'function' ? window.getAudioSermons() : []; }).catch(function () { loadedAudio = false; return null; }).then(function (r) {
      if (r === null) { var l = document.getElementById('audioSermonList'); l.textContent = ''; return l.appendChild(empty('fa-triangle-exclamation', 'Audio sermons could not be loaded right now.')); }
      audios = r; renderAudio();
      var m = location.hash.match(/^#audio-([\w-]+)$/); if (m) { var c = document.getElementById('audio-' + m[1]); if (c) { togglePlayer(m[1]); c.scrollIntoView({ block: 'center' }); } }
    });
  }
  document.querySelector('.sermons-tabs').addEventListener('click', function (e) { var b = e.target.closest('.tab-btn'); if (b) switchTab(b.getAttribute('data-tab')); });
  document.getElementById('videoFilters').addEventListener('click', function (e) { var b = e.target.closest('.filter-btn'); if (b) { vCat = b.getAttribute('data-cat'); renderFilters(); renderVideos(); } });
  document.getElementById('videoSearch').addEventListener('input', renderVideos);
  document.getElementById('audioSearch').addEventListener('input', renderAudio);
  document.getElementById('videoSermonGrid').addEventListener('click', function (e) { var c = e.target.closest('.sermon-card'); if (c) openVideo(c.getAttribute('data-id')); });
  document.getElementById('audioSermonList').addEventListener('click', function (e) { var b = e.target.closest('[data-play]'); if (b) togglePlayer(b.getAttribute('data-play')); });
  document.getElementById('modalClose').addEventListener('click', closeVideo);
  document.getElementById('videoModal').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeVideo(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('videoModal').classList.contains('open')) closeVideo(); });
  if (/^#audio-/.test(location.hash)) switchTab('audio');
  loadVideos();
})();
