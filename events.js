/* =============================================
   CAC GOOD WORKS — EVENTS PAGE
   List + month views, filters, multi-select, add to
   Google / Outlook / Yahoo / Apple (.ics) calendars.
   ============================================= */
(function () {
  'use strict';
  var C = window.CACCal, CFG = window.CAC_CONFIG;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var state = { cloud: [], type: 'all', q: '', view: 'list', selected: new Set(), cal: null, pickDay: null, loaded: false, error: '' };
  var today = C.todayLagos();
  state.cal = { y: +today.slice(0, 4), m: +today.slice(5, 7) };
  var userTZ = (Intl.DateTimeFormat().resolvedOptions().timeZone) || C.TZ;
  var userDiffers = (function () { // compare UTC offsets today
    try { var f = function (tz) { return new Date(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(/(\d+)\/(\d+)\/(\d+),? (\d+):(\d+)/, '$3-$1-$2T$4:$5:00Z')).getTime(); };
      return f(userTZ) !== f(C.TZ); } catch (e) { return false; }
  })();

  /* ---------- data ---------- */
  function cloudToEvent(e) {
    return { id: 'cloud-' + e.id, title: e.title, type: e.type || 'Special Event', date: e.date, time: e.time || '', endTime: e.endTime || '', endDate: e.endDate || '',
      venue: e.venue || CFG.address, description: e.description || '', status: e.status, cloud: true, dbId: e.id, rsvp: !!e.rsvp, capacity: Number(e.capacity) || 0 };
  }
  function occurrences(from, to) {
    var out = [];
    CFG.series.forEach(function (s) { out = out.concat(C.expandSeries(s, from, to)); });
    state.cloud.forEach(function (e) {
      if (!C.parseYMD(e.date) || e.status === 'completed' && e.date < today) return;
      var last = e.endDate || e.date;
      if (last >= from && e.date <= to) out.push(e);
    });
    out.sort(function (a, b) { return (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')) || a.title.localeCompare(b.title); });
    return out;
  }
  function matches(ev) {
    if (state.type !== 'all' && ev.type !== state.type) return false;
    if (state.q) { var h = (ev.title + ' ' + ev.venue + ' ' + ev.description + ' ' + ev.type).toLowerCase(); if (h.indexOf(state.q.toLowerCase()) < 0) return false; }
    return true;
  }
  function allTypes() { var s = {}; CFG.series.forEach(function (x) { s[x.type] = 1; }); state.cloud.forEach(function (e) { s[e.type || 'Special Event'] = 1; }); return Object.keys(s).sort(); }

  /* ---------- formatting ---------- */
  function fmtDate(ds) { var d = C.parseYMD(ds); return { day: d.d, mon: MONTHS[d.m - 1].slice(0, 3), dow: DOW[C.weekday(ds)], full: DOW[C.weekday(ds)] + ', ' + d.d + ' ' + MONTHS[d.m - 1] + ' ' + d.y }; }
  function timeLine(ev) {
    if (!ev.time) return '<span><i class="far fa-clock"></i>All day · time to be announced</span>';
    var s = C.lagosToInstant(ev.date, ev.time), n = C.normalise(ev), e = C.lagosToInstant(n.endDate, n.endTime);
    var f = function (tz, withDay) { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short', weekday: withDay ? 'short' : undefined }).format(s); };
    var fe = new Intl.DateTimeFormat('en-GB', { timeZone: C.TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(e);
    var html = '<span><i class="far fa-clock"></i>' + esc(f(C.TZ)) .replace(/GMT\+1/, 'WAT') + ' – ' + esc(fe) + ' (Lagos)</span>';
    if (userDiffers) html += '<span class="ev-local"><i class="fas fa-globe"></i>' + esc(f(userTZ, true)) + ' your time</span>';
    return html;
  }

  /* ---------- rendering ---------- */
  function rowHTML(ev) {
    var d = fmtDate(ev.date), sel = state.selected.has(ev.id);
    return '<article class="ev-row' + (sel ? ' sel' : '') + '" data-id="' + esc(ev.id) + '">' +
      '<input type="checkbox" aria-label="Select ' + esc(ev.title) + ' on ' + esc(d.full) + '"' + (sel ? ' checked' : '') + '>' +
      '<div class="ev-date" aria-hidden="true"><b>' + d.day + '</b><span>' + d.mon + '</span></div>' +
      '<div class="ev-body"><h3>' + esc(ev.title) + '<span class="tag">' + esc(ev.type) + '</span></h3>' +
      '<div class="ev-meta"><span><i class="far fa-calendar"></i>' + esc(d.full) + (ev.endDate && ev.endDate !== ev.date ? ' → ' + esc(fmtDate(ev.endDate).full) : '') + '</span>' + timeLine(ev) +
      (ev.venue ? '<span><i class="fas fa-location-dot"></i>' + esc(ev.venue) + '</span>' : '') + '</div>' +
      (ev.description ? '<p class="ev-desc">' + esc(ev.description) + '</p>' : '') + '</div>' +
      '<div class="menu-wrap">' + (rsvpOpen(ev) ? '<button type="button" class="btn-sm solid" data-rsvp="' + esc(ev.id) + '"><i class="fas fa-ticket"></i> Reserve a place</button> ' : '') + menuBtn(ev.id) + '</div></article>';
  }
  /** RSVP is offered only for real database events that staff switched on, and only when the Worker is configured. */
  function rsvpOpen(ev) { return !!(ev.rsvp && ev.status !== 'completed' && /^[A-Za-z0-9]{10,40}$/.test(String(ev.dbId)) && window.cacEdge && window.cacEdge.enabled() && window.cacTicket); }
  function menuBtn(id) {
    return '<button type="button" class="btn-sm" data-menu="' + esc(id) + '" aria-haspopup="true" aria-expanded="false"><i class="far fa-calendar-plus"></i> Add to calendar</button>';
  }
  function findEv(id) { return occurrences(C.addDays(today, -400), C.addDays(today, 800)).filter(function (e) { return e.id === id; })[0]; }
  function renderList() {
    var from = today, to = C.addDays(today, 150);
    var list = occurrences(from, to).filter(matches);
    var box = $('#evList');
    if (!list.length) { box.innerHTML = '<div class="empty"><i class="far fa-calendar-xmark"></i><p>No events match your search.</p></div>'; return; }
    var html = '', cur = '';
    list.forEach(function (ev) {
      var d = C.parseYMD(ev.date), key = MONTHS[d.m - 1] + ' ' + d.y;
      if (key !== cur) { cur = key; html += '<h2 class="ev-month">' + key + '</h2>'; }
      html += rowHTML(ev);
    });
    box.innerHTML = html;
  }
  function renderMonth() {
    var y = state.cal.y, m = state.cal.m, first = y + '-' + pad(m) + '-01', last = y + '-' + pad(m) + '-' + pad(C.daysInMonth(y, m));
    var evs = occurrences(first, last).filter(matches), by = {};
    evs.forEach(function (e) { var end = e.endDate && e.endDate > e.date ? e.endDate : e.date; for (var d = e.date; d <= end; d = C.addDays(d, 1)) { (by[d] = by[d] || []).push(e); } });
    var lead = C.weekday(first), html = '<div class="cal-head"><h3>' + MONTHS[m - 1] + ' ' + y + '</h3><div class="cal-nav"><button type="button" data-cal="-1" aria-label="Previous month"><i class="fas fa-chevron-left"></i></button><button type="button" data-cal="0" aria-label="Today" title="Today"><i class="fas fa-circle-dot"></i></button><button type="button" data-cal="1" aria-label="Next month"><i class="fas fa-chevron-right"></i></button></div></div><div class="cal-grid" role="grid">';
    DOW.forEach(function (d) { html += '<div class="cal-dow" role="columnheader">' + d + '</div>'; });
    for (var i = 0; i < lead; i++) html += '<div class="cal-day out" aria-hidden="true"></div>';
    for (var d = 1; d <= C.daysInMonth(y, m); d++) {
      var ds = y + '-' + pad(m) + '-' + pad(d), dayEvs = by[ds] || [];
      html += '<button type="button" class="cal-day' + (ds === today ? ' today' : '') + (ds === state.pickDay ? ' pick' : '') + (dayEvs.length ? ' has' : '') + '" data-day="' + ds + '" aria-label="' + esc(fmtDate(ds).full) + ', ' + dayEvs.length + ' events"><span class="n">' + d + '</span>';
      dayEvs.slice(0, 3).forEach(function (e) { html += '<span class="cal-pill">' + esc(e.title) + '</span>'; });
      if (dayEvs.length > 3) html += '<span class="cal-more">+' + (dayEvs.length - 3) + ' more</span>';
      html += '</button>';
    }
    html += '</div>';
    var dayList = state.pickDay ? (by[state.pickDay] || []) : [];
    html += '<div id="dayList" style="margin-top:22px">' + (state.pickDay ? '<h2 class="ev-month">' + esc(fmtDate(state.pickDay).full) + '</h2>' + (dayList.length ? dayList.map(rowHTML).join('') : '<p class="ev-desc">No events on this day.</p>') : '<p class="ev-desc">Select a day to see its events.</p>') + '</div>';
    $('#evMonth').innerHTML = html;
  }
  function renderChips() {
    var types = ['all'].concat(allTypes());
    $('#evChips').innerHTML = types.map(function (t) { return '<button type="button" class="chip" data-type="' + esc(t) + '" aria-pressed="' + (state.type === t) + '">' + (t === 'all' ? 'All events' : esc(t)) + '</button>'; }).join('');
  }
  function renderSeries() {
    $('#seriesGrid').innerHTML = CFG.series.map(function (s) {
      var rule = s.rule.kind === 'weekly' ? 'Every ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][s.rule.day] : s.rule.kind === 'monthly-last-weekday' ? 'Last Saturday of each month' : 'Last ' + s.rule.count + ' days of each month';
      var t = s.time ? ' · ' + new Intl.DateTimeFormat('en-GB', { timeZone: C.TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(C.lagosToInstant('2026-01-01', s.time)) : '';
      return '<div class="card"><span class="tag" style="margin:0 0 10px">' + esc(s.type) + '</span><h3 style="font-family:var(--font-body);font-size:1.05rem;margin-bottom:4px">' + esc(s.title) + '</h3><p class="ev-desc" style="margin:0 0 14px">' + esc(rule + t) + '</p><div class="menu-wrap">' +
        '<button type="button" class="btn-sm" data-smenu="' + esc(s.id) + '" aria-haspopup="true" aria-expanded="false"><i class="fas fa-rotate"></i> Add recurring</button></div></div>';
    }).join('');
  }
  function renderAll() {
    renderChips();
    $('#evList').hidden = state.view !== 'list'; $('#evMonth').hidden = state.view !== 'month';
    document.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.view === state.view)); });
    if (state.view === 'list') renderList(); else renderMonth();
    updateBar();
  }

  /* ---------- calendar actions ---------- */
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'; }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function toast(msg) { var t = $('#evToast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 3500); }
  function icsFor(list, name) { return C.buildICS(list.map(function (e) { return Object.assign({}, e, { uid: e.id }); }), { name: name || CFG.name }); }
  function menuItems(target, isSeries) {
    var arr = isSeries ? [target] : [target];
    var ev = target;
    return '<a href="' + esc(C.googleURL(ev)) + '" target="_blank" rel="noopener"><i class="fab fa-google"></i>Google Calendar</a>' +
      '<a href="' + esc(C.outlookURL(ev)) + '" target="_blank" rel="noopener"><i class="fab fa-microsoft"></i>Outlook.com</a>' +
      '<a href="' + esc(C.outlookURL(ev, 'https://outlook.office.com')) + '" target="_blank" rel="noopener"><i class="fas fa-briefcase"></i>Microsoft 365 / Work</a>' +
      '<a href="' + esc(C.yahooURL(ev)) + '" target="_blank" rel="noopener"><i class="fab fa-yahoo"></i>Yahoo Calendar</a>' +
      '<button type="button" data-ics="' + esc(ev.id) + '"><i class="fab fa-apple"></i>Apple / other (.ics)</button>';
  }
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.menu.remove(); openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu = null; } }
  function showMenu(btn, target) {
    closeMenu();
    var m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu'); m.innerHTML = menuItems(target);
    m._ev = target; btn.parentNode.appendChild(m); btn.setAttribute('aria-expanded', 'true'); openMenu = { menu: m, btn: btn };
    var f = m.querySelector('a'); if (f) f.focus();
  }
  function seriesTarget(id) { var s = CFG.series.filter(function (x) { return x.id === id; })[0]; return s ? C.seriesAnchor(s, today) : null; }

  /* selection */
  function selectedEvents() { var map = {}; occurrences(C.addDays(today, -400), C.addDays(today, 800)).forEach(function (e) { map[e.id] = e; }); return Array.from(state.selected).map(function (id) { return map[id]; }).filter(Boolean); }
  function updateBar() {
    var n = state.selected.size; $('#selCount').textContent = n + (n === 1 ? ' event selected' : ' events selected');
    $('#selBar').classList.toggle('show', n > 0);
  }
  function visibleIds() { return Array.prototype.map.call(document.querySelectorAll('#' + (state.view === 'list' ? 'evList' : 'dayList') + ' .ev-row'), function (r) { return r.dataset.id; }); }
  function openBulk() {
    var list = selectedEvents(); if (!list.length) return;
    var m = $('#bulkModal'); m.hidden = false;
    $('#bulkCount').textContent = list.length + (list.length === 1 ? ' event' : ' events');
    $('#bulkLinks').hidden = true;
    $('#bulkClose').focus();
  }
  function showLinks(kind) {
    var list = selectedEvents(), box = $('#bulkLinks'), fn = kind === 'google' ? C.googleURL : kind === 'outlook' ? C.outlookURL : C.yahooURL;
    box.hidden = false;
    box.innerHTML = '<p class="sub" style="margin:10px 0 6px">Your browser only allows one calendar to open at a time, so tap each event to add it:</p><div class="linklist">' +
      list.map(function (e, i) { return '<a href="' + esc(fn(e)) + '" target="_blank" rel="noopener" data-done>' + '<span>' + (i + 1) + '. ' + esc(e.title) + ' — ' + esc(fmtDate(e.date).full) + '</span><i class="fas fa-arrow-up-right-from-square"></i></a>'; }).join('') + '</div>';
  }

  /* ---------- events wiring ---------- */
  document.addEventListener('click', function (e) { var rb = e.target.closest && e.target.closest('[data-rsvp]'); if (rb) { var evx = state.cloud.filter(function (x) { return x.id === rb.getAttribute('data-rsvp'); })[0]; if (evx && window.cacTicket) window.cacTicket.open({ id: evx.dbId, title: evx.title, date: evx.date, capacity: evx.capacity }); return; }
    var t = e.target;
    var mb = t.closest('[data-menu]'); if (mb) { e.stopPropagation(); if (openMenu && openMenu.btn === mb) return closeMenu(); var ev = findEv(mb.dataset.menu); if (ev) showMenu(mb, ev); return; }
    var sb = t.closest('[data-smenu]'); if (sb) { e.stopPropagation(); if (openMenu && openMenu.btn === sb) return closeMenu(); var tg = seriesTarget(sb.dataset.smenu); if (tg) showMenu(sb, tg); return; }
    var ic = t.closest('[data-ics]');
    if (ic) { var tgt = openMenu && openMenu.menu._ev; if (tgt) { download(slug(tgt.title) + '.ics', icsFor([tgt])); toast('Calendar file downloaded — open it to add the event.'); } closeMenu(); return; }
    if (!t.closest('.menu')) closeMenu();
    var chip = t.closest('[data-type]'); if (chip) { state.type = chip.dataset.type; renderAll(); return; }
    var vw = t.closest('[data-view]'); if (vw) { state.view = vw.dataset.view; renderAll(); return; }
    var cn = t.closest('[data-cal]'); if (cn) { var k = +cn.dataset.cal; if (k === 0) state.cal = { y: +today.slice(0, 4), m: +today.slice(5, 7) }; else { state.cal.m += k; if (state.cal.m < 1) { state.cal.m = 12; state.cal.y--; } if (state.cal.m > 12) { state.cal.m = 1; state.cal.y++; } } state.pickDay = null; renderAll(); return; }
    var dy = t.closest('[data-day]'); if (dy) { state.pickDay = dy.dataset.day; renderAll(); var dl = $('#dayList'); if (dl && window.innerWidth < 900) dl.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  });
  document.addEventListener('change', function (e) {
    var cb = e.target.closest('.ev-row input[type=checkbox]'); if (!cb) return;
    var row = cb.closest('.ev-row'), id = row.dataset.id;
    if (cb.checked) state.selected.add(id); else state.selected.delete(id);
    row.classList.toggle('sel', cb.checked); updateBar();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenu(); $('#bulkModal').hidden = true; } });
  $('#evSearch').addEventListener('input', function (e) { state.q = e.target.value.trim(); renderAll(); });
  $('#selAll').addEventListener('click', function () { var ids = visibleIds(); ids.forEach(function (id) { state.selected.add(id); }); renderAll(); toast(ids.length + ' events selected'); });
  $('#selClear').addEventListener('click', function () { state.selected.clear(); renderAll(); });
  $('#selAdd').addEventListener('click', openBulk);
  $('#selectAllTop').addEventListener('click', function () { var ids = visibleIds(); if (!ids.length) return toast('No events to select.'); ids.forEach(function (id) { state.selected.add(id); }); renderAll(); openBulk(); });
  $('#bulkClose').addEventListener('click', function () { $('#bulkModal').hidden = true; });
  $('#bulkModal').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
  $('#bulkIcs').addEventListener('click', function () { var l = selectedEvents(); download('cac-good-works-events.ics', icsFor(l)); toast(l.length + ' events saved. Open the file to add them all at once.'); });
  $('#bulkGoogle').addEventListener('click', function () { showLinks('google'); });
  $('#bulkOutlook').addEventListener('click', function () { showLinks('outlook'); });
  $('#bulkYahoo').addEventListener('click', function () { showLinks('yahoo'); });
  $('#bulkLinks').addEventListener('click', function (e) { var a = e.target.closest('a'); if (a) a.classList.add('done'); });
  $('#fullIcs').addEventListener('click', function () {
    var recurring = CFG.series.map(function (s) { return C.seriesAnchor(s, today); }).filter(Boolean);
    var one = state.cloud.filter(function (e) { return e.date >= today; });
    download('cac-good-works-calendar.ics', icsFor(recurring.concat(one), 'CAC Good Works Assembly'));
    toast('Full calendar saved, including repeating services.');
  });


  /* ---------- structured data for search engines (schema.org/Event) ---------- */
  function addJSONLD() {
    var old = document.getElementById('ldEvents'); if (old) old.remove();
    var list = occurrences(today, C.addDays(today, 90)), seen = {}, items = [];
    list.forEach(function (e) {
      var k = e.seriesId || e.id; if (seen[k] || items.length >= 10) return; seen[k] = 1;
      var n = C.normalise(e), iso = function (d, t) { return t ? d + 'T' + t + ':00+01:00' : d; };
      items.push({ '@type': 'Event', name: e.title, description: e.description || undefined, startDate: iso(e.date, e.time), endDate: iso(n.endDate, n.endTime),
        eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: e.venue || CFG.name, address: CFG.address }, organizer: { '@type': 'Church', name: CFG.name } });
    });
    var s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldEvents';
    s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': items }).replace(/</g, '\\u003c'); document.head.appendChild(s);
  }

  /* ---------- subscribable feed (calendar.ics is regenerated daily by the free GitHub Actions job) ---------- */
  function feedLinks(loc) {
    var base = loc.protocol + '//' + loc.host + loc.pathname.replace(/[^/]*$/, '') + 'calendar.ics';
    var web = base.replace(/^https?:/, 'webcal:'), isPublic = /^https:$/.test(loc.protocol) && !/^(localhost|127\.|\[::1\])/.test(loc.hostname || loc.host);
    return { https: base, webcal: web, google: isPublic ? 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(web) : '' };
  }
  window.__feedLinks = feedLinks;
  (function () {
    var f = feedLinks(location); $('#subWebcal').href = /^https?:/.test(location.protocol) ? f.webcal : 'calendar.ics';
    if (f.google) { var g = $('#subGoogle'); g.href = f.google; g.hidden = false; }
    $('#subCopy').addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(f.https).then(function () { toast('Feed link copied. Paste it into any calendar app’s “subscribe by URL”.'); }, function () { prompt('Copy this link:', f.https); });
      else prompt('Copy this link:', f.https);
    });
  })();

  /* ---------- boot ---------- */
  renderSeries();
  renderAll(); // regular services are static config: show them instantly, never wait on the network
  var qv = new URLSearchParams(location.search); if (qv.get('view') === 'month') { state.view = 'month'; renderAll(); }
  (window.cacReady || Promise.resolve()).then(function () {
    return window.getEvents ? window.getEvents() : [];
  }).then(function (rows) {
    state.cloud = rows.map(cloudToEvent).filter(function (e) { return C.parseYMD(e.date); });
  }).catch(function (err) {
    console.warn('events:', err); state.error = 'Special events could not be loaded right now. Regular services are still shown.';
  }).then(function () {
    if (state.error) { var n = $('#evNotice'); n.textContent = state.error; n.hidden = false; }
    closeMenu(); renderAll(); addJSONLD();
  });
  window.__evState = state; // test hook
})();
