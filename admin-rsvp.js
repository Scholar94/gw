/* Admin: event reservations list, capacity overview and the USHER CHECK-IN SCANNER (phone camera or typed code). Loaded by admin-dashboard.html. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, events = [], stream, timer, detector, jsqrReady, lastCode = '', lastAt = 0, canvas = document.createElement('canvas');
  var CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/;
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t); }
  function h(tag, a, text) { var e = document.createElement(tag); if (a) Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (text != null) e.textContent = text; return e; }

  /** "CAC1:abcd efgh jkmn" | "ABCDEFGHJKMN" -> normalised 12-char code or '' */
  function parse(raw) { var s = String(raw || '').trim().toUpperCase().replace(/^CAC1:/, '').replace(/[\s-]/g, ''); return CODE.test(s) ? s : ''; }
  window.cacCheckin = { parse: parse };

  function show(kind, title, detail) {
    var box = $('scanResult'); box.className = 'scan-result ' + kind; box.textContent = ''; box.appendChild(h('strong', null, title)); if (detail) box.appendChild(h('span', null, ' ' + detail));
    if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : [60, 60, 60]);
  }
  async function handle(raw) {
    var code = parse(raw); if (!code) return show('bad', 'Not a CAC ticket', 'The code must be 12 letters/numbers.');
    var now = Date.now(); if (code === lastCode && now - lastAt < 4000) return; lastCode = code; lastAt = now;
    try {
      var r = await window.getRsvp(code), sel = $('rsvpEvent').value;
      if (!r) return show('bad', 'Ticket not found', 'Do not admit.');
      if (r.status === 'cancelled') return show('bad', 'Cancelled', r.name || '');
      if (sel && r.eventId !== sel) return show('warn', 'Wrong event', 'This ticket is for “' + (r.eventTitle || 'another event') + '”.');
      if (r.status === 'waitlist') return show('warn', 'Waiting list', (r.name || '') + ' is not confirmed.');
      if (r.checkedIn) return show('warn', 'Already checked in', r.name || '');
      await window.checkInRsvp(code, true);
      show('ok', 'Welcome, ' + (r.name || 'guest'), r.party > 1 ? '(party of ' + r.party + ')' : ''); refresh();
    } catch (e) { show('bad', 'Could not check in', 'Check your connection and permissions.'); }
  }

  /* ---------- camera ---------- */
  function loadJsqr() { return window.jsQR ? Promise.resolve() : (jsqrReady = jsqrReady || new Promise(function (res, rej) { var s = h('script', { src: 'admin-jsqr.js' }); s.onload = res; s.onerror = function () { jsqrReady = null; rej(new Error('scanner')); }; document.head.appendChild(s); })); }
  async function tick() {
    var v = $('scanVideo'); if (!stream || v.readyState < 2) return;
    try {
      if (detector) { var f = await detector.detect(v); if (f[0]) handle(f[0].rawValue); }
      else { await loadJsqr(); var w = v.videoWidth, hh = v.videoHeight; if (!w) return; canvas.width = w; canvas.height = hh; var c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(v, 0, 0, w, hh); var q = window.jsQR(c.getImageData(0, 0, w, hh).data, w, hh); if (q) handle(q.data); }
    } catch (e) { /* frame errors are ignored; next frame retries */ }
  }
  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return show('bad', 'Camera not available', 'Use the code box below instead.');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); } catch (e) { return show('bad', 'Camera blocked', 'Allow camera access, or use the code box.'); }
    detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    var v = $('scanVideo'); v.srcObject = stream; v.hidden = false; await v.play(); $('scanStart').hidden = true; $('scanStop').hidden = false; timer = setInterval(tick, 250); show('', 'Scanning…', 'Hold the ticket QR in view.');
  }
  function stop() { clearInterval(timer); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; var v = $('scanVideo'); if (v) { v.srcObject = null; v.hidden = true; } if ($('scanStart')) { $('scanStart').hidden = false; $('scanStop').hidden = true; } }
  window.stopScan = stop;

  /* ---------- list ---------- */
  async function refresh() {
    var id = $('rsvpEvent').value, tb = $('rsvpBody'); tb.textContent = ''; $('rsvpStats').textContent = '';
    if (!id) return;
    var ev = events.filter(function (e) { return e.id === id; })[0] || {}, counts = await window.getRsvpCounts(id), list = await window.getRsvps(id);
    list.sort(function (a, b) { return (a.status === 'waitlist') - (b.status === 'waitlist') || (a.seq || 0) - (b.seq || 0); });
    var inn = list.filter(function (r) { return r.checkedIn && r.status === 'confirmed'; }).reduce(function (a, r) { return a + (r.party || 1); }, 0);
    $('rsvpStats').textContent = 'Confirmed seats: ' + (counts.confirmed || 0) + (ev.capacity > 0 ? ' of ' + ev.capacity : ' (no limit)') + ' · Waiting: ' + (counts.waiting || 0) + ' · Checked in: ' + inn;
    if (!list.length) { var tr0 = h('tr'), td0 = h('td', { colspan: '5' }, 'No reservations yet.'); tr0.appendChild(td0); tb.appendChild(tr0); return; }
    list.forEach(function (r) {
      var tr = h('tr'), act = h('td'), tog = h('button', { type: 'button', class: 'admin-btn', 'data-ci': r.id, 'data-on': r.checkedIn ? '0' : '1' }, r.checkedIn ? 'Undo check-in' : 'Check in');
      if (r.status === 'confirmed') act.appendChild(tog); if (r.status !== 'cancelled') { var c = h('button', { type: 'button', class: 'admin-btn danger', 'data-cancel': r.id, style: 'margin-left:6px' }, 'Cancel'); act.appendChild(c); }
      [r.name || '', String(r.party || 1), r.status + (r.checkedIn ? ' · in' : ''), [r.email, r.phone].filter(Boolean).join(' / ')].forEach(function (t) { tr.appendChild(h('td', null, t)); }); tr.appendChild(act); tb.appendChild(tr);
    });
  }
  window.loadRsvp = async function () {
    try { events = (await window.getEvents()).filter(function (e) { return e.rsvp; }); } catch (e) { events = []; }
    var sel = $('rsvpEvent'), keep = sel.value; sel.textContent = ''; sel.appendChild(h('option', { value: '' }, events.length ? 'Choose an event…' : 'No events accept RSVPs yet'));
    events.forEach(function (e) { sel.appendChild(h('option', { value: e.id }, (e.date || '') + ' · ' + (e.title || ''))); }); if (keep) sel.value = keep; refresh();
  };
  function init() {
    if (!$('rsvpEvent')) return;
    $('rsvpEvent').addEventListener('change', refresh); $('scanStart').addEventListener('click', start); $('scanStop').addEventListener('click', stop);
    $('scanGo').addEventListener('click', function () { handle($('scanCode').value); $('scanCode').value = ''; $('scanCode').focus(); });
    $('scanCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('scanGo').click(); } });
    $('rsvpBody').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-ci]'), c = e.target.closest('[data-cancel]');
      try {
        if (b) { await window.checkInRsvp(b.getAttribute('data-ci'), b.getAttribute('data-on') === '1'); refresh(); }
        else if (c && window.confirm('Cancel this reservation? The next person on the waiting list will be promoted.')) {
          if (!window.cacEdge || !window.cacEdge.enabled()) return toast('Cancelling needs the Cloudflare Worker to be connected.', 'error');
          await window.cacEdge.post('/v1/rsvp/cancel', { code: c.getAttribute('data-cancel') }, { noToken: true }); toast('Reservation cancelled.'); refresh();
        }
      } catch (err) { toast('Could not do that: ' + (err.message || 'permission or connection'), 'error'); }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
