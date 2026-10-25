/* CAC GOOD WORKS: TICKET PAGE. Shows an RSVP's live status + QR code (looked up with the unguessable ticket code), lets the holder cancel. */
(function () {
  'use strict';
  var T = window.cacTicket, h = T.h, root = document.getElementById('ticketRoot'), code = (new URLSearchParams(location.search).get('c') || '').toUpperCase(), timer;
  var MSG = { confirmed: ['You are booked in', 'Show this QR code to the usher at the door.'], waitlist: ['You are on the waiting list', 'A place has not opened yet. This page checks again every minute: keep it open or come back later. We cannot email you automatically.'], cancelled: ['This reservation was cancelled', 'You can make a new reservation from the events page.'] };
  function fmt(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : d; }
  function list() {
    var t = T.tickets(); root.textContent = '';
    if (!t.length) return root.appendChild(h('div', { class: 'card' }, h('p', { text: 'No tickets are saved on this device.' }), h('a', { class: 'btn-sm solid', href: 'events.html', text: 'See upcoming events' })));
    root.appendChild(h('h2', { text: 'Your tickets' })); var ul = h('ul', { class: 'plan-days' });
    t.forEach(function (x) { ul.appendChild(h('li', null, h('a', { href: 'ticket.html?c=' + x.code, text: (x.title || 'Event') + (x.date ? ' · ' + fmt(x.date) : '') }))); }); root.appendChild(ul);
  }
  function draw(j) {
    var st = j.checkedIn ? ['Checked in', 'Welcome! This ticket has been used.'] : (MSG[j.status] || ['Unknown', '']), good = j.status === 'confirmed' && !j.checkedIn;
    root.textContent = '';
    var card = h('article', { class: 'card ticket' + (good ? '' : ' dim') }, h('p', { class: 'ticket-state', role: 'status', text: st[0] }), h('h2', { text: j.event.title || 'Event' }),
      h('p', { class: 'ev-desc', text: [fmt(j.event.date), j.event.time, j.event.venue].filter(Boolean).join(' · ') }), h('p', { text: j.name + (j.party > 1 ? ' + ' + (j.party - 1) + (j.party === 2 ? ' guest' : ' guests') : '') }));
    var cv = h('canvas', { class: 'ticket-qr', role: 'img', 'aria-label': 'Ticket QR code for ' + j.name }); T.drawQR(cv, T.payload(j.code), 260); card.appendChild(cv);
    card.appendChild(h('p', { class: 'ticket-code', text: j.code.replace(/(.{4})(?=.)/g, '$1 ') })); card.appendChild(h('p', { class: 'ev-desc', text: st[1] }));
    var acts = h('div', { class: 'sc-actions' }, h('button', { type: 'button', class: 'btn-sm', id: 'tkRefresh', text: 'Refresh' }));
    if (j.status !== 'cancelled' && !j.checkedIn) acts.appendChild(h('button', { type: 'button', class: 'btn-sm', id: 'tkCancel', text: 'Cancel my reservation' }));
    acts.appendChild(h('button', { type: 'button', class: 'btn-sm', id: 'tkSave', text: 'Save image' })); card.appendChild(acts); card.appendChild(h('p', { id: 'tkMsg', class: 'f-msg', role: 'status', 'aria-live': 'polite' })); root.appendChild(card);
    document.getElementById('tkRefresh').onclick = load;
    document.getElementById('tkSave').onclick = function () { var a = h('a', { href: cv.toDataURL('image/png'), download: 'ticket-' + j.code + '.png' }); document.body.appendChild(a); a.click(); a.remove(); };
    var c = document.getElementById('tkCancel'); if (c) c.onclick = function () {
      if (!window.confirm('Cancel this reservation? Your place may go to someone on the waiting list.')) return; c.disabled = true;
      window.cacEdge.post('/v1/rsvp/cancel', { code: j.code }, { noToken: true }).then(function () { load(); }, function (e) { c.disabled = false; document.getElementById('tkMsg').className = 'f-msg err'; document.getElementById('tkMsg').textContent = e.message; });
    };
  }
  function load() {
    if (!window.cacEdge || !window.cacEdge.enabled()) { root.textContent = ''; return root.appendChild(h('div', { class: 'card' }, h('p', { text: 'Tickets are not connected yet. Please contact the church office.' }))); }
    window.cacEdge.get('/v1/rsvp/' + encodeURIComponent(code)).then(draw, function (e) {
      root.textContent = ''; var gone = e.status === 404; if (gone) T.forget(code);
      root.appendChild(h('div', { class: 'card' }, h('p', { role: 'alert', text: gone ? 'We could not find that ticket. Check the link or QR code.' : (e.message || 'Could not load the ticket.') }), h('a', { class: 'btn-sm', href: 'ticket.html', text: 'My saved tickets' })));
    });
  }
  if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(code)) list(); else { load(); timer = setInterval(function () { if (!document.hidden) load(); }, 60000); }
})();
