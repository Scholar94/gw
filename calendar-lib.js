/* =============================================
   CAC GOOD WORKS — CALENDAR LIBRARY
   ICS generation, calendar deep links, recurring
   services. Church timezone = Africa/Lagos (UTC+1,
   no daylight saving), so wall-clock maths is safe.
   Works in browser (window.CACCal) and Node (tests).
   ============================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CACCal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TZ = 'Africa/Lagos';
  var OFFSET_H = 1; // WAT = UTC+1 all year
  var DAY = 86400000;
  var pad = function (n) { return String(n).padStart(2, '0'); };

  /* ---------- date helpers (Lagos wall clock) ---------- */
  function parseYMD(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = new Date(Date.UTC(y, mo - 1, d));
    // reject 2026-02-31 style overflow
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return { h: +m[1], min: +m[2] };
  }
  function ymd(date) { // from a "Lagos date carried in UTC fields"
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
  }
  /** Convert Lagos wall time to a real instant. */
  function lagosToInstant(dateStr, timeStr) {
    var d = parseYMD(dateStr); if (!d) return null;
    var t = parseHM(timeStr) || { h: 0, min: 0 };
    return new Date(Date.UTC(d.y, d.m - 1, d.d, t.h - OFFSET_H, t.min));
  }
  /** Current Lagos calendar date as YYYY-MM-DD (independent of visitor's device timezone). */
  function todayLagos(now) {
    var n = new Date((now || new Date()).getTime() + OFFSET_H * 3600000);
    return ymd(n);
  }
  function addDays(dateStr, n) {
    var d = parseYMD(dateStr);
    return ymd(new Date(Date.UTC(d.y, d.m - 1, d.d) + n * DAY));
  }
  function weekday(dateStr) { var d = parseYMD(dateStr); return new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay(); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  /* ---------- ICS ---------- */
  function icsEscape(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function utcStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  function localStamp(dateStr, timeStr) { // floating local value used with TZID
    var d = parseYMD(dateStr), t = parseHM(timeStr) || { h: 0, min: 0 };
    return d.y + pad(d.m) + pad(d.d) + 'T' + pad(t.h) + pad(t.min) + '00';
  }
  function compactDate(dateStr) { return dateStr.replace(/-/g, ''); }
  /** RFC 5545 line folding at 75 octets (UTF-8 aware), continuation lines start with a space. */
  function fold(line) {
    var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    var bytes = function (c) { return enc ? enc.encode(c).length : c.length; };
    var out = [], cur = '', len = 0, limit = 75;
    for (var ch of line) {
      var b = bytes(ch);
      if (len + b > limit) { out.push(cur); cur = ' '; len = 1; limit = 75; }
      cur += ch; len += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  /** Normalise an event into { start/end strings in Lagos time } */
  function normalise(ev) {
    var allDay = !ev.time;
    var endDate = ev.endDate || ev.date;
    var endTime = ev.endTime || null;
    if (!allDay && !endTime) { // default duration: 2 hours
      var s = lagosToInstant(ev.date, ev.time);
      var e = new Date(s.getTime() + 2 * 3600000);
      var le = new Date(e.getTime() + OFFSET_H * 3600000);
      endDate = ymd(le); endTime = pad(le.getUTCHours()) + ':' + pad(le.getUTCMinutes());
    }
    return { allDay: allDay, endDate: endDate, endTime: endTime };
  }

  function veventLines(ev, opts) {
    opts = opts || {};
    var n = normalise(ev), L = [];
    L.push('BEGIN:VEVENT');
    L.push('UID:' + (ev.uid || ev.id || (ev.title + ev.date)).toString().replace(/[^\w.@-]/g, '-') + '@cacgoodworks');
    L.push('DTSTAMP:' + utcStamp(opts.now || new Date()));
    if (n.allDay) {
      L.push('DTSTART;VALUE=DATE:' + compactDate(ev.date));
      // all-day DTEND is exclusive
      L.push('DTEND;VALUE=DATE:' + compactDate(addDays(n.endDate, 1)));
    } else if (ev.floating) { // visitor-local wall time (e.g. a personal daily reminder): no TZID, follows the device's timezone
      L.push('DTSTART:' + localStamp(ev.date, ev.time));
      L.push('DTEND:' + localStamp(n.endDate, n.endTime));
    } else {
      L.push('DTSTART;TZID=' + TZ + ':' + localStamp(ev.date, ev.time));
      L.push('DTEND;TZID=' + TZ + ':' + localStamp(n.endDate, n.endTime));
    }
    if (ev.rrule) L.push('RRULE:' + ev.rrule);
    L.push('SUMMARY:' + icsEscape(ev.title));
    if (ev.description) L.push('DESCRIPTION:' + icsEscape(ev.description));
    if (ev.venue) L.push('LOCATION:' + icsEscape(ev.venue));
    if (ev.url) L.push('URL:' + ev.url);
    if (!n.allDay && opts.alarm !== false) {
      var am = opts.alarmMinutes == null ? 60 : opts.alarmMinutes;
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Reminder: ' + ev.title), am === 0 ? 'TRIGGER:PT0S' : 'TRIGGER:-PT' + am + 'M', 'END:VALARM');
    }
    L.push('END:VEVENT');
    return L;
  }

  function buildICS(events, opts) {
    opts = opts || {};
    var L = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CAC Good Works Assembly//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsEscape(opts.name || 'CAC Good Works Assembly'), 'X-WR-TIMEZONE:' + TZ,
      'BEGIN:VTIMEZONE', 'TZID:' + TZ, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0100', 'TZNAME:WAT', 'END:STANDARD', 'END:VTIMEZONE'
    ];
    events.forEach(function (ev) { L = L.concat(veventLines(ev, opts)); });
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  /* ---------- deep links ---------- */
  function q(obj) {
    return Object.keys(obj).filter(function (k) { return obj[k] !== undefined && obj[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  }
  function googleURL(ev) {
    var n = normalise(ev), dates;
    if (n.allDay) dates = compactDate(ev.date) + '/' + compactDate(addDays(n.endDate, 1));
    else if (ev.floating) dates = localStamp(ev.date, ev.time) + '/' + localStamp(n.endDate, n.endTime);
    else dates = utcStamp(lagosToInstant(ev.date, ev.time)) + '/' + utcStamp(lagosToInstant(n.endDate, n.endTime));
    return 'https://calendar.google.com/calendar/render?' + q({
      action: 'TEMPLATE', text: ev.title, dates: dates, details: ev.description, location: ev.venue,
      recur: ev.rrule ? 'RRULE:' + ev.rrule : undefined, ctz: ev.floating ? undefined : TZ
    });
  }
  function outlookURL(ev, base) {
    var n = normalise(ev), s, e;
    if (n.allDay) { s = ev.date + 'T00:00:00'; e = addDays(n.endDate, 1) + 'T00:00:00'; }
    else { s = lagosToInstant(ev.date, ev.time).toISOString().replace(/\.\d+Z$/, 'Z'); e = lagosToInstant(n.endDate, n.endTime).toISOString().replace(/\.\d+Z$/, 'Z'); }
    return (base || 'https://outlook.live.com') + '/calendar/0/deeplink/compose?' + q({
      path: '/calendar/action/compose', rru: 'addevent', subject: ev.title, startdt: s, enddt: e,
      body: ev.description, location: ev.venue, allday: n.allDay ? 'true' : undefined
    });
  }
  function yahooURL(ev) {
    var n = normalise(ev), st, et;
    if (n.allDay) { st = compactDate(ev.date); et = compactDate(addDays(n.endDate, 1)); }
    else { st = utcStamp(lagosToInstant(ev.date, ev.time)); et = utcStamp(lagosToInstant(n.endDate, n.endTime)); }
    return 'https://calendar.yahoo.com/?' + q({ v: 60, title: ev.title, st: st, et: et, desc: ev.description, in_loc: ev.venue, dur: n.allDay ? 'allday' : undefined });
  }

  /* ---------- recurring services ---------- */
  /**
   * series: { id,title,type,description,venue,time,endTime,
   *           rule: {kind:'weekly',day:0-6} | {kind:'monthly-last-weekday',day:0-6} | {kind:'month-end-days',count:n} }
   * Returns occurrences between [from,to] (inclusive, YYYY-MM-DD), each a standalone event object.
   */
  function expandSeries(series, from, to) {
    var out = [], r = series.rule, cursor, end = to;
    function push(date) {
      if (date < from || date > to) return;
      out.push(Object.assign({}, series, { id: series.id + '@' + date, seriesId: series.id, date: date, recurring: true }));
    }
    if (r.kind === 'weekly') {
      cursor = from;
      while (weekday(cursor) !== r.day) cursor = addDays(cursor, 1);
      for (; cursor <= end; cursor = addDays(cursor, 7)) push(cursor);
    } else {
      var a = parseYMD(from), b = parseYMD(to), y = a.y, m = a.m;
      while (y < b.y || (y === b.y && m <= b.m)) {
        var dim = daysInMonth(y, m);
        if (r.kind === 'monthly-last-weekday') {
          for (var d = dim; d >= dim - 6; d--) {
            var ds = y + '-' + pad(m) + '-' + pad(d);
            if (weekday(ds) === r.day) { push(ds); break; }
          }
        } else if (r.kind === 'month-end-days') {
          for (var i = r.count - 1; i >= 0; i--) push(y + '-' + pad(m) + '-' + pad(dim - i));
        }
        m++; if (m > 12) { m = 1; y++; }
      }
    }
    return out;
  }
  var DAYCODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  function seriesToRRULE(series) {
    var r = series.rule;
    if (r.kind === 'weekly') return 'FREQ=WEEKLY;BYDAY=' + DAYCODES[r.day];
    if (r.kind === 'monthly-last-weekday') return 'FREQ=MONTHLY;BYDAY=-1' + DAYCODES[r.day];
    if (r.kind === 'month-end-days') { var a = []; for (var i = r.count; i >= 1; i--) a.push(-i); return 'FREQ=MONTHLY;BYMONTHDAY=' + a.join(','); }
    return '';
  }
  /** First occurrence on/after `from` – used as DTSTART for a recurring export */
  function seriesAnchor(series, from) {
    var occ = expandSeries(series, from, addDays(from, 400));
    return occ[0] ? Object.assign({}, occ[0], { id: series.id, rrule: seriesToRRULE(series), recurring: true }) : null;
  }

  return {
    TZ: TZ, parseYMD: parseYMD, parseHM: parseHM, lagosToInstant: lagosToInstant, todayLagos: todayLagos,
    addDays: addDays, weekday: weekday, daysInMonth: daysInMonth, icsEscape: icsEscape, fold: fold,
    buildICS: buildICS, googleURL: googleURL, outlookURL: outlookURL, yahooURL: yahooURL,
    expandSeries: expandSeries, seriesToRRULE: seriesToRRULE, seriesAnchor: seriesAnchor, normalise: normalise
  };
});
