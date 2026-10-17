/* Homepage widgets: today's devotional + next 3 events (church time) */
(function () {
  'use strict';
  var C = window.CACCal, CFG = window.CAC_CONFIG; if (!C || !CFG) return;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], today = C.todayLagos();

  function fmtT(ev) { return ev.time ? new Intl.DateTimeFormat('en-GB', { timeZone: C.TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(C.lagosToInstant(ev.date, ev.time)) + ' (Lagos)' : 'Time to be announced'; }
  function renderEvents(cloud) {
    var out = [];
    CFG.series.forEach(function (s) { out = out.concat(C.expandSeries(s, today, C.addDays(today, 45))); });
    cloud.forEach(function (e) { if (C.parseYMD(e.date) && e.date >= today && e.status !== 'completed') out.push({ id: e.id, title: e.title, date: e.date, time: e.time, type: e.type }); });
    // prefer special events, then fill with the soonest services
    out.sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
    var seen = {}, pick = [];
    out.forEach(function (e) { var k = e.seriesId || e.id; if (!seen[k] && pick.length < 4) { seen[k] = 1; pick.push(e); } });
    $('#homeEvents').innerHTML = pick.map(function (e) {
      var d = C.parseYMD(e.date);
      return '<a class="card" href="events.html" style="display:flex;gap:16px;align-items:center"><div class="ev-date"><b>' + d.d + '</b><span>' + MON[d.m - 1] + '</span></div><div><h3 style="font-family:var(--font-body);font-size:1rem">' + esc(e.title) + '</h3><div class="ev-desc" style="margin:0">' + esc(fmtT(e)) + '</div></div></a>';
    }).join('');
  }
  function renderDev(rows) {
    var list = rows.filter(function (d) { return d.status === 'published' && d.date <= today; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    var box = $('#homeDevotional');
    if (!list.length) { box.innerHTML = '<p style="color:var(--white-60)">Our devotional library is being prepared. “Begin Each Day in His Presence.”</p>'; return; }
    var d = list[0], isToday = d.date === today;
    box.innerHTML = '<span class="tag" style="margin:0 0 12px">' + (isToday ? 'Today’s devotional' : 'Latest devotional') + '</span><h3 style="font-size:1.6rem;margin-bottom:6px">' + esc(d.title) + '</h3><p style="color:var(--gold);margin-bottom:10px">' + esc(d.scripture) + '</p><p style="color:var(--white-60);margin-bottom:18px">' + esc((d.message || '').replace(/\s+/g, ' ').slice(0, 180)) + '…</p><a class="btn btn-primary" href="devotionals.html?d=' + esc(d.date) + '">Read today’s devotional</a>';
  }
  renderEvents([]); // services are static config: render immediately, merge special events when they arrive
  (window.cacReady || Promise.resolve()).then(function () {
    var ev = window.getEvents ? window.getEvents().catch(function () { return []; }) : Promise.resolve([]);
    var dv = window.getPublishedDevotionals && window.CAC_BACKEND && window.CAC_BACKEND.configured ? window.getPublishedDevotionals(5).catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all([ev, dv]);
  }).then(function (r) { renderEvents(r[0]); renderDev(r[1]); }).catch(function () { renderEvents([]); renderDev([]); });
})();
