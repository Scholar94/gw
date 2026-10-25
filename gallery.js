/* CAC GOOD WORKS: GALLERY. Pictures/videos from Google Drive (or any https link). All database text is rendered as text, never HTML. */
(function () {
  'use strict';
  var M = window.cacMedia, all = [], shown = [], cur = 0, cat = '', last = null;
  var $ = function (id) { return document.getElementById(id); };
  function h(tag, a) { var e = document.createElement(tag); if (a) Object.keys(a).forEach(function (k) { if (k === 'class') e.className = a[k]; else if (k === 'text') e.textContent = a[k]; else if (a[k] != null && a[k] !== false) e.setAttribute(k, a[k] === true ? '' : a[k]); }); for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); return e; }
  var ic = function (c) { return h('i', { class: c, 'aria-hidden': 'true' }); };
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  function thumbFor(it) {
    if (it.mediaType === 'video') { var v = M.video(it.mediaUrl); return v ? v.thumb : ''; }
    return M.imageSrc(it.mediaUrl, 700);
  }
  function filters() {
    var cats = []; all.forEach(function (i) { if (i.category && cats.indexOf(i.category) < 0) cats.push(i.category); }); cats.sort();
    var box = $('galleryFilters'); box.textContent = '';
    ['All'].concat(cats).forEach(function (c) { var v = c === 'All' ? '' : c; box.appendChild(h('button', { type: 'button', class: 'g-filter-btn' + (v === cat ? ' active' : ''), 'data-cat': v, 'aria-pressed': String(v === cat), text: c })); });
    box.hidden = cats.length < 2;
  }
  function grid() {
    var g = $('masonryGrid'); g.textContent = ''; shown = all.filter(function (i) { return !cat || i.category === cat; });
    if (!shown.length) return g.appendChild(h('div', { class: 'no-gallery', style: 'column-span:all' }, ic('fas fa-images'), h('p', { text: all.length ? 'Nothing in this category yet.' : 'Photos and videos will appear here soon.' })));
    shown.forEach(function (it, i) {
      var t = thumbFor(it), vid = it.mediaType === 'video';
      var tile = h('button', { type: 'button', class: 'masonry-item', 'data-i': i, 'aria-label': (vid ? 'Play video: ' : 'View photo: ') + (it.caption || 'gallery item'), style: 'display:block;width:100%;padding:0;border:0;background:none;font:inherit;color:inherit;text-align:left' },
        t ? h('img', { src: t, alt: it.caption || '', loading: 'lazy', decoding: 'async' }) : h('div', { class: 'placeholder-img' }, ic(vid ? 'fas fa-video' : 'fas fa-image')),
        h('div', { class: 'item-overlay' }), h('div', { class: 'item-caption' }, it.caption || '', h('small', { style: 'opacity:.7;display:block', text: it.category || '' })));
      if (vid) tile.appendChild(h('div', { class: 'item-type-icon' }, ic('fas fa-play')));
      g.appendChild(tile);
    });
  }
  function stage() { return $('lbStage'); }
  function open(i) {
    var it = shown[i]; if (!it) return; cur = i; last = last || document.activeElement;
    var st = stage(); st.textContent = '';
    if (it.mediaType === 'video') {
      var v = M.video(it.mediaUrl), direct = M.safeUrl(it.mediaUrl);
      if (v) st.appendChild(h('iframe', { src: v.embed, title: it.caption || 'Video', allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: true, style: 'width:min(90vw,960px);aspect-ratio:16/9;border:0;border-radius:12px;background:#000' }));
      else if (direct) st.appendChild(h('video', { src: direct, controls: true, autoplay: true, playsinline: true, style: 'max-width:90vw;max-height:80vh;border-radius:12px' }));
      else return;
    } else { var s = M.imageSrc(it.mediaUrl, 1800); if (!s) return; st.appendChild(h('img', { src: s, alt: it.caption || 'Gallery image' })); }
    $('lbCaption').textContent = it.caption || ''; $('lightbox').classList.add('open'); document.body.style.overflow = 'hidden'; $('lbClose').focus();
  }
  function close() { $('lightbox').classList.remove('open'); stage().textContent = ''; document.body.style.overflow = ''; if (last && last.focus) last.focus(); last = null; }
  function nav(d) { if (shown.length) open((cur + d + shown.length) % shown.length); }
  function load() {
    (window.cacReady || Promise.resolve()).then(function () { return typeof window.getGalleryItems === 'function' ? window.getGalleryItems() : []; }).catch(function () { return null; }).then(function (r) {
      if (r === null) { var g = $('masonryGrid'); g.textContent = ''; return g.appendChild(h('div', { class: 'no-gallery', style: 'column-span:all' }, ic('fas fa-triangle-exclamation'), h('p', { text: 'The gallery could not be loaded right now.' }))); }
      all = r; filters(); grid();
    });
  }
  $('galleryFilters').addEventListener('click', function (e) { var b = e.target.closest('.g-filter-btn'); if (b) { cat = b.getAttribute('data-cat'); filters(); grid(); } });
  $('masonryGrid').addEventListener('click', function (e) { var t = e.target.closest('.masonry-item'); if (t) open(+t.getAttribute('data-i')); });
  $('lbClose').addEventListener('click', close); $('lbPrev').addEventListener('click', function () { nav(-1); }); $('lbNext').addEventListener('click', function () { nav(1); });
  $('lightbox').addEventListener('click', function (e) { if (e.target === e.currentTarget) close(); });
  document.addEventListener('keydown', function (e) { if (!$('lightbox').classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') nav(1); if (e.key === 'ArrowLeft') nav(-1); });
  load();
})();
