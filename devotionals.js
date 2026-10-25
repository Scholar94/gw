/* =============================================
   CAC GOOD WORKS — DAILY DEVOTIONAL READER
   Public reading (no sign-in), archive with search/filters,
   print/share/font-size, and private device-local
   bookmarks, read history, streak and notes.
   ============================================= */
(function () {
  'use strict';
  var C = window.CACCal;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var today = C.todayLagos(), PAGE = 15;

  /* private, per-device store (never sent to the server) */
  var store = (function () {
    var K = 'cacDevotionalPrefs';
    var d = { bookmarks: [], read: [], notes: {}, size: 1.1 };
    try { d = Object.assign(d, JSON.parse(localStorage.getItem(K) || '{}')); } catch (e) {}
    function stamp(kind, date) { d.meta = d.meta || { bm: {}, nt: {} }; (d.meta[kind] = d.meta[kind] || {})[date] = Date.now(); }
    return { d: d, stamp: stamp, save: function () { try { localStorage.setItem(K, JSON.stringify(d)); } catch (e) { /* storage full/blocked */ } window.dispatchEvent(new Event('cac-prefs-changed')); },
      reload: function () { try { var n = JSON.parse(localStorage.getItem(K) || '{}'); Object.keys(n).forEach(function (k) { d[k] = n[k]; }); } catch (e) {} } };
  })();

  var state = { all: [], preview: false, sample: false, shown: PAGE, q: '', topic: '', cur: null };

  function fmt(ds) { var d = C.parseYMD(ds); return DOWL[C.weekday(ds)] + ', ' + d.d + ' ' + MONTHS[d.m - 1] + ' ' + d.y; }
  function paras(t) { return String(t || '').split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
  function listHTML(a, ordered) { a = (a || []).filter(Boolean); return a.length ? '<' + (ordered ? 'ol' : 'ul') + '>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</' + (ordered ? 'ol' : 'ul') + '>' : ''; }
  function safeURL(u) { return /^https:\/\//i.test(u || '') ? u : ''; }

  var SAMPLE = [{ id: '2000-01-01', date: today, status: 'published', sample: true, title: 'Sample devotional (layout preview)', theme: 'Preview', scripture: 'Psalm 23:1', scriptureText: 'The LORD is my shepherd; I shall not want. (KJV)',
    author: 'Placeholder – not a real devotional', message: 'This is placeholder text so you can see how a devotional will look.\n\nOnce Firebase is connected, devotionals published from the admin dashboard will appear here automatically, one for each day.',
    application: 'Placeholder application text.', reflection: ['Sample reflection question one?', 'Sample reflection question two?'], prayerPoints: ['Sample prayer point'], closingPrayer: 'Sample closing prayer.', supporting: ['John 10:11'] }];

  /* ---------- load ---------- */
  function load() {
    $('#dvArticle').innerHTML = '<div class="skeleton" style="height:340px"></div>';
    var qs = new URLSearchParams(location.search); state.preview = qs.get('preview') === '1';
    return (window.cacReady || Promise.resolve()).then(function () {
      if (!window.CAC_BACKEND || !window.CAC_BACKEND.configured) { state.sample = true; state.all = SAMPLE; return; }
      var p = state.preview && window.cacAuth ? new Promise(function (res) { var u = window.cacAuth.onChange(function (usr, role) { res(role ? 'admin' : null); }); }).then(function (r) { return r ? window.getAllDevotionals() : window.getPublishedDevotionals(400); }) : window.getPublishedDevotionals(400);
      return p.then(function (rows) { state.all = rows; });
    }).catch(function (e) { console.warn('devotionals:', e); state.error = true; state.all = []; });
  }
  function visible() { // published and not future-dated (defence in depth: Lagos date)
    return state.all.filter(function (d) { return state.preview ? true : (d.status === 'published' && d.date <= today) || d.sample; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  }

  /* ---------- article ---------- */
  function setMeta(d) {
    document.title = d.title + ' — Daily Devotional — CAC Good Works Assembly';
    var m = document.querySelector('meta[name=description]'); if (m) m.content = d.scripture + ' — ' + (d.message || '').replace(/\s+/g, ' ').slice(0, 140);
    var u = document.querySelector('link[rel=canonical]'); if (u && !state.sample) u.href = location.origin + location.pathname + '?d=' + d.date;
    var old = document.getElementById('ldDevotional'); if (old) old.remove();
    if (!state.sample && d.status === 'published') {
      var s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldDevotional';
      s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: d.title, datePublished: d.date, inLanguage: 'en',
        author: { '@type': d.author ? 'Person' : 'Organization', name: d.author || 'CAC Good Works Assembly' }, publisher: { '@type': 'Church', name: 'CAC Good Works Assembly' },
        mainEntityOfPage: location.origin + location.pathname + '?d=' + d.date, about: d.scripture }).replace(/</g, '\\u003c');
      document.head.appendChild(s);
    }
  }
  function renderArticle(d, note) {
    state.cur = d; var list = visible(), i = list.findIndex(function (x) { return x.date === d.date; });
    var older = list[i + 1], newer = list[i - 1], isBm = store.d.bookmarks.indexOf(d.date) >= 0, isRead = store.d.read.indexOf(d.date) >= 0;
    var img = safeURL(d.imageUrl), pdf = safeURL(d.pdfUrl);
    var html = (note ? '<div class="notice" style="margin-bottom:20px">' + note + '</div>' : '') +
      (d.sample ? '<div class="notice warn" style="margin-bottom:20px"><i class="fas fa-triangle-exclamation"></i> Preview mode: this is placeholder content. Connect Firebase to publish real devotionals.</div>' : '') +
      (d.status && d.status !== 'published' ? '<div class="notice warn" style="margin-bottom:20px">Admin preview — status: <b>' + esc(d.status) + '</b>. This is not public.</div>' : '') +
      '<div class="dv-tools no-print" role="toolbar" aria-label="Reading tools">' +
      '<button class="icon-btn" id="fMinus" aria-label="Decrease text size"><i class="fas fa-minus"></i></button><button class="icon-btn" id="fPlus" aria-label="Increase text size"><i class="fas fa-plus"></i></button>' +
      '<button class="icon-btn" id="bmBtn" aria-pressed="' + isBm + '" aria-label="Bookmark this devotional"><i class="' + (isBm ? 'fas' : 'far') + ' fa-bookmark"></i></button>' +
      (window.cacListen && window.cacListen.supported ? '<button class="icon-btn" id="lsBtn" aria-pressed="false" aria-label="Listen to this devotional"><i class="fas fa-headphones" aria-hidden="true"></i></button><button class="icon-btn" id="lsStop" aria-label="Stop listening" hidden><i class="fas fa-stop" aria-hidden="true"></i></button><select id="lsRate" aria-label="Reading speed" hidden><option value="0.8">0.8×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select>' : '') +
      '<button class="icon-btn" id="shBtn" aria-label="Share or copy link"><i class="fas fa-share-nodes"></i></button>' +
      '<button class="icon-btn" id="prBtn" aria-label="Print or save as PDF"><i class="fas fa-print"></i></button>' +
      (pdf ? '<a class="btn-sm" href="' + esc(pdf) + '" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> PDF</a>' : '') +
      '<button class="btn-sm' + (isRead ? ' solid' : '') + '" id="rdBtn" aria-pressed="' + isRead + '" style="margin-left:auto"><i class="fas fa-check"></i> ' + (isRead ? 'Read' : 'Mark as read') + '</button></div>' +
      '<div class="date">' + esc(fmt(d.date)) + (d.theme ? ' · ' + esc(d.theme) : '') + '</div><h2>' + esc(d.title) + '</h2><div class="by">By ' + esc(d.author || 'CAC Good Works Assembly') + '</div>' +
      (img ? '<img class="dv-img" src="' + esc(img) + '" alt="" loading="lazy">' : '') +
      '<div class="dv-scripture">' + (d.scriptureText ? esc(d.scriptureText) : '') + '<cite>' + esc(d.scripture) + '</cite></div>' +
      '<div class="dv-body">' + paras(d.message) + '</div>' +
      (d.supporting && d.supporting.length ? '<h4>Supporting passages</h4><p>' + d.supporting.map(esc).join(' · ') + '</p>' : '') +
      (d.application ? '<h4>Daily application</h4><div class="dv-body">' + paras(d.application) + '</div>' : '') +
      (d.reflection && d.reflection.length ? '<h4>Reflection questions</h4>' + listHTML(d.reflection, true) : '') +
      (d.prayerPoints && d.prayerPoints.length ? '<h4>Prayer points</h4>' + listHTML(d.prayerPoints) : '') +
      (d.closingPrayer ? '<h4>Closing prayer</h4><div class="dv-body"><p><em>' + esc(d.closingPrayer) + '</em></p></div>' : '') +
      (d.declaration ? '<div class="dv-box"><b>Declaration:</b> ' + esc(d.declaration) + '</div>' : '') +
      (d.memoryVerse ? '<div class="dv-box"><b>Memory verse:</b> ' + esc(d.memoryVerse) + '</div>' : '') +
      '<nav class="dv-nav no-print" aria-label="Devotional navigation">' +
      (older ? '<a class="btn-sm" href="?d=' + older.date + '" data-nav="' + older.date + '"><i class="fas fa-chevron-left"></i> Previous day</a>' : '<span></span>') +
      (newer ? '<a class="btn-sm" href="?d=' + newer.date + '" data-nav="' + newer.date + '">Next day <i class="fas fa-chevron-right"></i></a>' : '<span></span>') + '</nav>';
    if (window.cacListen) window.cacListen.stop();   // a new article never keeps reading the old one
    $('#dvArticle').innerHTML = html; $('#dvArticle').style.setProperty('--dv-size', store.d.size + 'rem');
    $('#dvNotes').value = store.d.notes[d.date] || '';
    setMeta(d); renderStreak(); renderRelated(d); renderArchive();
    if (window.cacScripture && !state.sample) window.cacScripture.linkify($('#dvArticle'));   // every Bible reference becomes tappable
  }
  function renderEmpty() {
    $('#dvArticle').innerHTML = '<div class="empty"><i class="fas fa-book-bible"></i><h3 style="margin-bottom:8px">' + (state.error ? 'We couldn’t load devotionals right now' : 'No devotional has been published yet') + '</h3><p>' + (state.error ? 'Please check your connection and try again.' : 'Please check back soon. “Begin Each Day in His Presence.”') + '</p></div>';
    renderArchive();
  }
  function show(date, push) {
    var list = visible(); if (!list.length) return renderEmpty();
    var d = list.filter(function (x) { return x.date === date; })[0], note = '';
    if (!d && !date) { // today's devotional, else graceful fallback to latest published
      d = list.filter(function (x) { return x.date === today; })[0];
      if (!d) { d = list[0]; note = 'Today’s devotional hasn’t been published yet. Here is the most recent one.'; }
    } else if (!d) { d = list[0]; note = 'That devotional isn’t available. Showing the most recent one.'; }
    if (push) history.pushState({}, '', '?d=' + d.date);
    renderArticle(d, note);
  }

  /* ---------- sidebar ---------- */
  function renderArchive() {
    var list = visible(), q = state.q.toLowerCase();
    var topics = {}; list.forEach(function (d) { if (d.theme) topics[d.theme] = 1; });
    var sel = $('#dvTopic'), cur = sel.value; sel.innerHTML = '<option value="">All topics</option>' + Object.keys(topics).sort().map(function (t) { return '<option>' + esc(t) + '</option>'; }).join(''); sel.value = cur;
    var f = list.filter(function (d) { return (!state.topic || d.theme === state.topic) && (!q || (d.title + ' ' + d.scripture + ' ' + (d.author || '') + ' ' + (d.theme || '') + ' ' + d.date).toLowerCase().indexOf(q) >= 0); });
    var page = f.slice(0, state.shown);
    $('#dvList').innerHTML = page.length ? page.map(function (d) { return '<a href="?d=' + d.date + '" data-nav="' + d.date + '"' + (state.cur && state.cur.date === d.date ? ' class="cur" aria-current="page"' : '') + '><b>' + esc(d.title) + '</b><small>' + esc(fmt(d.date)) + ' · ' + esc(d.scripture) + '</small></a>'; }).join('') : '<p class="ev-desc">No devotionals match.</p>';
    $('#dvMore').hidden = f.length <= state.shown; $('#dvJump').max = today;
    $('#dvBm').innerHTML = store.d.bookmarks.length ? store.d.bookmarks.slice().sort().reverse().map(function (dt) { var d = list.filter(function (x) { return x.date === dt; })[0]; return d ? '<a href="?d=' + dt + '" data-nav="' + dt + '">' + esc(d.title) + '<small>' + esc(dt) + '</small></a>' : ''; }).join('') : '<p class="ev-desc">Tap the bookmark icon to save devotionals on this device.</p>';
  }
  function renderStreak() {
    var read = store.d.read.slice().sort(), set = {}; read.forEach(function (d) { set[d] = 1; });
    var n = 0, d = set[today] ? today : C.addDays(today, -1);
    while (set[d]) { n++; d = C.addDays(d, -1); }
    $('#dvStreak').textContent = n; $('#dvReadTotal').textContent = read.length;
  }
  function renderRelated(d) {
    var box = $('#dvRelated'); box.innerHTML = '';
    if (!window.getSermons || !window.CAC_BACKEND || !window.CAC_BACKEND.configured) return;
    window.getSermons().then(function (s) {
      var key = ((d.theme || '') + ' ' + d.scripture.split(' ')[0]).toLowerCase().split(/\s+/).filter(function (w) { return w.length > 3; });
      var m = s.filter(function (x) { var h = ((x.title || '') + ' ' + (x.category || '') + ' ' + (x.scripture || '')).toLowerCase(); return key.some(function (k) { return h.indexOf(k) >= 0; }); }).slice(0, 3);
      box.innerHTML = m.length ? '<h4>Related sermons</h4><div class="dv-list">' + m.map(function (x) { return '<a href="sermons.html">' + esc(x.title) + '<small>' + esc(x.preacher || '') + '</small></a>'; }).join('') + '</div>' : '';
    }).catch(function () {});
  }

  /* ---------- wiring ---------- */
  function toggle(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  document.addEventListener('click', function (e) {
    var t = e.target, nav = t.closest('[data-nav]');
    if (nav) { e.preventDefault(); show(nav.dataset.nav, true); window.scrollTo({ top: $('#dvTop').offsetTop - 80, behavior: 'smooth' }); return; }
    if (!state.cur) return;
    var d = state.cur;
    if (t.closest('#fMinus')) { store.d.size = Math.max(.9, +(store.d.size - .1).toFixed(2)); store.save(); $('#dvArticle').style.setProperty('--dv-size', store.d.size + 'rem'); }
    if (t.closest('#fPlus')) { store.d.size = Math.min(1.8, +(store.d.size + .1).toFixed(2)); store.save(); $('#dvArticle').style.setProperty('--dv-size', store.d.size + 'rem'); }
    if (t.closest('#lsBtn')) { var L = window.cacListen, st = L.state();
        if (st === 'playing') L.pause(); else if (st === 'paused') L.resume(); else { var c = $('#dvArticle').cloneNode(true); [].forEach.call(c.querySelectorAll('.dv-tools,.dv-nav,.notice,img,button,select,.no-print'), function (n) { n.remove(); }); L.setRate($('#lsRate').value); L.start(c.innerText || c.textContent); } return; }
      if (t.closest('#lsStop')) { window.cacListen.stop(); return; }
      if (t.closest('#bmBtn')) { toggle(store.d.bookmarks, d.date); store.stamp('bm', d.date); store.save(); renderArticle(d); $('#bmBtn').focus(); }
    if (t.closest('#rdBtn')) { toggle(store.d.read, d.date); store.save(); renderArticle(d); $('#rdBtn').focus(); }
    if (t.closest('#prBtn')) window.print();
    if (t.closest('#shBtn')) {
      var url = location.origin + location.pathname + '?d=' + d.date;
      if (navigator.share) navigator.share({ title: d.title, text: d.scripture, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { flash('Link copied'); }, function () { prompt('Copy this link:', url); });
      else prompt('Copy this link:', url);
    }
  });
  function flash(msg) { var f = $('#dvFlash'); f.textContent = msg; setTimeout(function () { f.textContent = ''; }, 2500); }
  $('#dvSearch').addEventListener('input', function (e) { state.q = e.target.value.trim(); state.shown = PAGE; renderArchive(); });
  $('#dvTopic').addEventListener('change', function (e) { state.topic = e.target.value; state.shown = PAGE; renderArchive(); });
  $('#dvMore').addEventListener('click', function () { state.shown += PAGE; renderArchive(); });
  $('#dvJump').addEventListener('change', function (e) {
    var v = e.target.value; if (!v) return; var list = visible();
    var d = list.filter(function (x) { return x.date === v; })[0] || list.filter(function (x) { return x.date < v; })[0];
    if (d) show(d.date, true); else flash('No devotional on or before that date.');
  });
  var nt; $('#dvNotes').addEventListener('input', function (e) { if (!state.cur) return; clearTimeout(nt); var v = e.target.value, dt = state.cur.date; nt = setTimeout(function () { if (v.trim()) store.d.notes[dt] = v; else delete store.d.notes[dt]; store.stamp('nt', dt); store.save(); flash('Saved on this device'); }, 500); });
  window.addEventListener('popstate', function () { show(new URLSearchParams(location.search).get('d'), false); });

  /* ---------- daily reminder (free substitute for push notifications; lives in the visitor's own calendar) ---------- */
  function reminderEvent() {
    var t = ($('#remindTime').value || '06:00'), hm = C.parseHM(t) || { h: 6, min: 0 }, now = new Date(), p2 = function (n) { return String(n).padStart(2, '0'); };
    var ld = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hm.h, hm.min);
    var date = startToday > now ? ld : C.addDays(ld, 1), endMin = hm.h * 60 + hm.min + 15, endDate = date;
    if (endMin >= 1440) { endMin -= 1440; endDate = C.addDays(date, 1); }
    var url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'devotionals.html';
    return { id: 'daily-devotional', uid: 'daily-devotional', title: 'Daily Devotional — CAC Good Works', description: 'Begin each day in His presence. Read today’s devotional: ' + url, venue: url,
      date: date, time: p2(hm.h) + ':' + p2(hm.min), endDate: endDate, endTime: p2(Math.floor(endMin / 60)) + ':' + p2(endMin % 60), rrule: 'FREQ=DAILY', floating: true };
  }
  function syncReminder() { $('#remGoogle').href = C.googleURL(reminderEvent()); }
  $('#remindTime').addEventListener('input', syncReminder); syncReminder();
  window.__reminderEvent = reminderEvent;
  $('#remIcs').addEventListener('click', function () {
    var blob = new Blob([C.buildICS([reminderEvent()], { name: 'Daily Devotional reminder', alarmMinutes: 0 })], { type: 'text/calendar;charset=utf-8' }), u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u; a.download = 'daily-devotional-reminder.ics'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); flash('Reminder file downloaded. Open it to add the daily reminder.');
  });

  if (window.cacListen) { window.cacListen.onState(function (s) { var b = $('#lsBtn'); if (!b) return; b.setAttribute('aria-pressed', String(s === 'playing')); b.setAttribute('aria-label', s === 'playing' ? 'Pause listening' : s === 'paused' ? 'Resume listening' : 'Listen to this devotional'); b.querySelector('i').className = 'fas ' + (s === 'playing' ? 'fa-pause' : 'fa-headphones'); $('#lsStop').hidden = $('#lsRate').hidden = s === 'idle'; }); window.addEventListener('pagehide', function () { window.cacListen.stop(); }); document.addEventListener('change', function (e) { if (e.target && e.target.id === 'lsRate') window.cacListen.setRate(e.target.value); }); }
  window.addEventListener('cac-prefs-synced', function () { store.reload(); if (state.cur) renderArticle(state.cur); });
  load().then(function () { show(new URLSearchParams(location.search).get('d'), false); });
  window.__dv = { state: state, visible: visible }; // test hook
})();
