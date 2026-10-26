/* =============================================
   CAC GOOD WORKS: EVENT RSVP + QR TICKETS (visitor side)
   Reserve a place (capacity + waiting list are enforced by the Worker), get a ticket with a QR code, keep it on this device.
   The QR holds only an unguessable 12-character code ("CAC1:XXXXXXXXXXXX"); the ushers' scanner looks it up.
   ============================================= */
(function () {
  'use strict';
  var KEY = 'cacTickets', E = function () { return window.cacEdge; };
  function h(tag, a) { var e = document.createElement(tag); if (a) Object.keys(a).forEach(function (k) { if (k === 'text') e.textContent = a[k]; else if (k === 'class') e.className = a[k]; else if (a[k] != null && a[k] !== false) e.setAttribute(k, a[k] === true ? '' : a[k]); }); for (var i = 2; i < arguments.length; i++) if (arguments[i]) e.appendChild(typeof arguments[i] === 'string' ? document.createTextNode(arguments[i]) : arguments[i]); return e; }
  function tickets() { try { var t = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(t) ? t.filter(function (x) { return x && /^[0-9A-HJKMNP-TV-Z]{12}$/.test(x.code); }) : []; } catch (e) { return []; } }
  function save(t) { var all = tickets().filter(function (x) { return x.code !== t.code; }); all.unshift({ code: t.code, title: String(t.title || '').slice(0, 120), date: String(t.date || '').slice(0, 10) }); try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, 30))); } catch (e) {} }
  function forget(code) { try { localStorage.setItem(KEY, JSON.stringify(tickets().filter(function (x) { return x.code !== code; }))); } catch (e) {} }

  /** Draw a QR (dark modules on a white quiet zone: scanners need light-on-dark inversion avoided, in every theme). */
  function drawQR(canvas, text, px) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make(); var n = q.getModuleCount(), quiet = 4, size = px || 240, cell = Math.floor(size / (n + quiet * 2)), full = cell * (n + quiet * 2);
    canvas.width = canvas.height = full; var c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, full, full); c.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
    return canvas;
  }
  function payload(code) { return 'CAC1:' + code; }

  /* ---------------- RSVP dialog ---------------- */
  var dlg, lastFocus;
  function close() { if (!dlg) return; dlg.remove(); dlg = null; document.removeEventListener('keydown', onKey, true); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab' && dlg) { var f = [].filter.call(dlg.querySelectorAll('button,input,select,a[href]'), function (x) { return !x.disabled && x.offsetParent !== null; }); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  }
  function field(id, label, attrs) { var i = h('input', Object.assign({ id: id, class: 'rsvp-in' }, attrs)); return h('div', { class: 'f-group' }, h('label', { for: id, text: label }), i); }
  function open(ev) {
    if (!E() || !E().enabled()) { window.alert('Online reservations are not connected yet. Please contact the church office.'); return; }
    close(); lastFocus = document.activeElement;
    var msg = h('p', { class: 'f-msg', role: 'status', 'aria-live': 'polite' }), party = h('select', { id: 'rvParty', class: 'rsvp-in' }); [1, 2, 3, 4].forEach(function (n) { party.appendChild(h('option', { value: n, text: n === 1 ? 'Just me' : n + ' people' })); });
    var name = field('rvName', 'Your name', { type: 'text', autocomplete: 'name', maxlength: 80, required: true }), email = field('rvEmail', 'Email', { type: 'email', autocomplete: 'email', maxlength: 120 }), phone = field('rvPhone', 'Phone / WhatsApp', { type: 'tel', autocomplete: 'tel', maxlength: 25 });
    var trap = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', style: 'position:absolute;left:-9999px;opacity:0;height:0' });
    var go = h('button', { type: 'submit', class: 'btn-sm solid', text: 'Reserve my place' }), x = h('button', { type: 'button', class: 'sc-x', 'aria-label': 'Close' }, h('i', { class: 'fas fa-times', 'aria-hidden': 'true' }));
    var form = h('form', { novalidate: true }, h('p', { class: 'ev-desc', text: ev.capacity > 0 ? 'Places are limited. If we are full you will join the waiting list and your ticket will update if a place opens.' : 'Reserve your place and get a ticket with a QR code.' }), name, email, phone, h('p', { class: 'ev-desc', text: 'Give an email or a phone number, so we can reach you about this event only.' }), h('div', { class: 'f-group' }, h('label', { for: 'rvParty', text: 'How many places?' }), party), trap, msg, h('div', { class: 'sc-actions' }, go));
    dlg = h('div', { id: 'rsvpDlg', class: 'sc-pop rsvp-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reserve a place' }, h('div', { class: 'sc-head' }, h('strong', { text: ev.title || 'Event' }), x), form);
    document.body.appendChild(dlg); document.addEventListener('keydown', onKey, true); name.querySelector('input').focus();
    x.addEventListener('click', close);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var n = name.querySelector('input').value.trim(), em = email.querySelector('input').value.trim(), ph = phone.querySelector('input').value.trim();
      if (n.length < 2) { msg.textContent = 'Please enter your name.'; msg.className = 'f-msg err'; return; } if (!em && !ph) { msg.textContent = 'Please give an email address or a phone number.'; msg.className = 'f-msg err'; return; }
      go.disabled = true; msg.className = 'f-msg'; msg.textContent = 'Reserving…';
      E().post('/v1/rsvp', { eventId: ev.id, name: n, email: em, phone: ph, party: +party.value, website: trap.value, ticketUrl: new URL('ticket.html', location.href).href.split(/[?#]/)[0] }).then(function (r) {
        save({ code: r.code, title: ev.title, date: ev.date }); form.textContent = '';
        form.appendChild(h('p', { class: 'ev-desc', style: 'color:var(--gold);font-size:1rem', role: 'status', text: r.status === 'confirmed' ? 'You are booked in!' : 'We are full, so you are on the waiting list.' }));
        var cv = h('canvas', { role: 'img', 'aria-label': 'Your ticket QR code', style: 'max-width:100%;border-radius:8px' }); drawQR(cv, payload(r.code), 220); form.appendChild(cv);
        form.appendChild(h('p', { class: 'ev-desc', text: (r.status === 'confirmed' ? 'Show this QR code at the door. It is saved on this device.' : 'Keep this page: open your ticket later to see if a place has opened.') + (r.emailed ? ' We have also emailed your ticket link' + (r.status === 'confirmed' ? '.' : ', and we will email you if a place opens.') : ' We could not email you, so keep this ticket link.') }));
        form.appendChild(h('div', { class: 'sc-actions' }, h('a', { class: 'btn-sm solid', href: 'ticket.html?c=' + r.code, text: 'Open my ticket' }), h('button', { type: 'button', class: 'btn-sm', 'data-close': '1', text: 'Done' })));
        form.querySelector('[data-close]').addEventListener('click', close);
      }).catch(function (err) { go.disabled = false; msg.className = 'f-msg err'; msg.textContent = err.message || 'Could not reserve. Please try again.'; });
    });
  }
  window.cacTicket = { open: open, drawQR: drawQR, payload: payload, tickets: tickets, save: save, forget: forget, h: h };
})();
