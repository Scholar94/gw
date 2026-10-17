/* =============================================
   CAC GOOD WORKS — PUBLIC FORMS (visit, testimony)
   Validation, honeypot, client cooldown, honest errors.
   (Server-side limits live in firestore.rules.)
   ============================================= */
(function () {
  'use strict';
  var COOLDOWN_MS = 30000;
  function msg(form, type, text) { var m = form.querySelector('.f-msg'); m.className = 'f-msg ' + type; m.textContent = text; m.setAttribute('role', type === 'err' ? 'alert' : 'status'); }
  var emailOK = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };
  var phoneOK = function (v) { return /^\+?[0-9\s()-]{7,20}$/.test(v); };

  function wire(form, cfg) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var g = function (n) { var el = form.elements[n]; return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
      if (g('website')) return; // honeypot: bots fill hidden fields
      var last = +localStorage.getItem('cacLast_' + cfg.key) || 0;
      if (Date.now() - last < COOLDOWN_MS) return msg(form, 'err', 'Please wait a few seconds before sending another submission.');
      var err = cfg.validate(g); if (err) return msg(form, 'err', err);
      var btn = form.querySelector('button[type=submit]'), label = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
      (window.cacReady || Promise.resolve()).then(function () {
        if (!window.CAC_BACKEND || !window.CAC_BACKEND.configured) throw new Error('Our online form is not connected yet. Please contact us by phone or WhatsApp instead.');
        return cfg.save(cfg.data(g));
      }).then(function () {
        try { localStorage.setItem('cacLast_' + cfg.key, String(Date.now())); } catch (x) {}
        form.reset(); msg(form, 'ok', cfg.success);
      }).catch(function (x) {
        msg(form, 'err', /permission|insufficient/i.test(x.message) ? 'Sorry, we could not accept that submission. Please check the form and try again.' : x.message || 'Something went wrong. Please try again.');
      }).then(function () { btn.disabled = false; btn.innerHTML = label; });
    });
  }

  var tf = document.getElementById('testimonyForm');
  if (tf) wire(tf, {
    key: 'testimony', success: 'Thank you! Your testimony has been received and will be reviewed before it is published.',
    validate: function (g) { if (g('story').length < 30) return 'Please share a little more (at least 30 characters).'; if (g('story').length > 3000) return 'Please keep your testimony under 3000 characters.'; if (g('email') && !emailOK(g('email'))) return 'Please enter a valid email address.'; if (!g('consent')) return 'Please confirm your consent to publish.'; },
    data: function (g) { return { name: g('anonymous') ? 'Anonymous' : g('name').slice(0, 80), country: g('country').slice(0, 60), email: g('email').slice(0, 120), story: g('story'), consent: true }; },
    save: function (d) { return window.saveTestimony(d); }
  });
  var vf = document.getElementById('visitForm');
  if (vf) wire(vf, {
    key: 'visit', success: 'Thank you! We look forward to welcoming you. Someone from our team may contact you.',
    validate: function (g) { if (g('name').length < 2) return 'Please enter your name.'; if (!g('email') && !g('phone')) return 'Please provide an email or phone number.'; if (g('email') && !emailOK(g('email'))) return 'Please enter a valid email address.'; if (g('phone') && !phoneOK(g('phone'))) return 'Please enter a valid phone number.'; if (!g('consent')) return 'Please agree to be contacted.'; },
    data: function (g) { return { name: g('name').slice(0, 80), email: g('email').slice(0, 120), phone: g('phone').slice(0, 25), visitDate: g('visitDate'), guests: g('guests'), message: g('message').slice(0, 1000), consent: true }; },
    save: function (d) { return window.saveVisitorEnquiry(d); }
  });

  /* approved testimonies list */
  var list = document.getElementById('testimonyList');
  if (list) {
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    (window.cacReady || Promise.resolve()).then(function () { return window.getApprovedTestimonies ? window.getApprovedTestimonies() : []; }).then(function (rows) {
      list.innerHTML = rows.length ? rows.map(function (t) { return '<figure class="card"><blockquote style="font-family:var(--font-accent);font-size:1.15rem;line-height:1.7">“' + esc(t.story) + '”</blockquote><figcaption style="margin-top:12px;color:var(--gold);font-size:.85rem">— ' + esc(t.name || 'Anonymous') + (t.country ? ', ' + esc(t.country) : '') + '</figcaption></figure>'; }).join('')
        : '<div class="empty" style="grid-column:1/-1"><i class="fas fa-star"></i><p>Approved testimonies will appear here. Be the first to share what God has done!</p></div>';
    }).catch(function () { list.innerHTML = '<div class="empty" style="grid-column:1/-1"><p>Testimonies could not be loaded right now.</p></div>'; });
  }
})();
