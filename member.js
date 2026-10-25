/* =============================================
   CAC GOOD WORKS: OPTIONAL MEMBER SYNC
   Passwordless email-link sign-in (Firebase Auth, free). Bookmarks, read history, notes and Bible-plan progress
   then follow the person across phones and laptops. Without signing in, everything stays on the device as before.
   mergePrefs() is pure (unit-tested in test-member.mjs): last-writer-wins per bookmark/note, union for "read" and plan progress.
   ============================================= */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else { root.cacMemberSync = api; if (typeof document !== 'undefined') api.boot(); }
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var KEY = 'cacDevotionalPrefs', DAY = 864e5, LIM = { bm: 1000, notes: 300, noteLen: 2000, read: 2000, plans: 20, planDone: 2000 };
  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  function keys(o) { return Object.keys(o || {}); }
  function union() { var s = {}; [].slice.call(arguments).forEach(function (a) { (a || []).forEach(function (x) { s[x] = 1; }); }); return Object.keys(s); }
  function num(n) { n = Number(n); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  /** local: {bookmarks[], read[], notes{}, meta:{bm{},nt{}}, plans{}}   remote: {bm{date:{on,at}}, notes{date:{t,at}}, read[], plans{}} */
  function mergePrefs(local, remote, now) {
    local = local || {}; remote = remote || {}; now = now || Date.now();
    var lb = (local.bookmarks || []).filter(function (d) { return DATE.test(d); }), lm = (local.meta && local.meta.bm) || {}, rb = remote.bm || {};
    var bm = {}, bookmarks = [], cut = now - 60 * DAY;
    union(lb, keys(lm), keys(rb)).filter(function (d) { return DATE.test(d); }).forEach(function (d) {
      var l = { on: lb.indexOf(d) >= 0, at: num(lm[d]) }, r = rb[d] && { on: !!rb[d].on, at: num(rb[d].at) };
      var w = r && (r.at > l.at || (r.at === l.at && r.on && !l.on)) ? r : l;
      if (w.on) { bookmarks.push(d); bm[d] = { on: true, at: w.at }; } else if (w.at > cut) bm[d] = { on: false, at: w.at };
    });
    bookmarks.sort(); if (bookmarks.length > LIM.bm) { bookmarks.slice(0, bookmarks.length - LIM.bm).forEach(function (d) { delete bm[d]; }); bookmarks = bookmarks.slice(-LIM.bm); }

    var ln = local.notes || {}, lt = (local.meta && local.meta.nt) || {}, rn = remote.notes || {}, notes = {}, nt = {}, rnotes = {};
    union(keys(ln), keys(lt), keys(rn)).filter(function (d) { return DATE.test(d); }).forEach(function (d) {
      var l = { t: String(ln[d] || ''), at: num(lt[d]) }, r = rn[d] && { t: String(rn[d].t || ''), at: num(rn[d].at) };
      var w = r && r.at > l.at ? r : l, text = w.t.slice(0, LIM.noteLen);
      if (text.trim()) { notes[d] = text; nt[d] = w.at; rnotes[d] = { t: text, at: w.at }; } else if (w.at > cut) { nt[d] = w.at; rnotes[d] = { t: '', at: w.at }; }
    });
    var nk = keys(notes).sort(); if (nk.length > LIM.notes) nk.slice(0, nk.length - LIM.notes).forEach(function (d) { delete notes[d]; delete nt[d]; delete rnotes[d]; });

    var read = union(local.read, remote.read).filter(function (d) { return DATE.test(d); }).sort().slice(-LIM.read);

    var plans = {}, lp = local.plans || {}, rp = remote.plans || {};
    union(keys(lp), keys(rp)).filter(function (id) { return /^[a-z0-9-]{2,40}$/.test(id); }).slice(0, LIM.plans).forEach(function (id) {
      var a = lp[id] || {}, b = rp[id] || {};
      plans[id] = { done: union(a.done, b.done).filter(function (x) { return /^[\w-]{1,20}$/.test(String(x)); }).slice(0, LIM.planDone).sort(), at: Math.max(num(a.at), num(b.at)) };
    });

    var out = {}; keys(local).forEach(function (k) { out[k] = local[k]; });
    out.bookmarks = bookmarks; out.notes = notes; out.read = read; out.plans = plans;
    out.meta = { bm: keys(bm).reduce(function (o, d) { o[d] = bm[d].at; return o; }, {}), nt: nt };
    return { local: out, remote: { bm: bm, notes: rnotes, read: read, plans: plans } };
  }

  function readLocal() { try { return JSON.parse(root.localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function writeLocal(d) { try { root.localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* storage blocked */ } }
  /** Call whenever the local store changes: stamps meta so merges know what is newest. */
  function stamp(d, kind, date, now) { d.meta = d.meta || { bm: {}, nt: {} }; (d.meta[kind] = d.meta[kind] || {})[date] = now || Date.now(); }

  /* ---------------- browser controller ---------------- */
  var timer, user = null, syncing = false;
  function A() { return root.cacMemberAuth; }
  function sync() {
    if (!user || syncing || !A()) return Promise.resolve(false);
    syncing = true;
    return A().get().then(function (remote) {
      var m = mergePrefs(readLocal(), remote); writeLocal(m.local); root.dispatchEvent(new Event('cac-prefs-synced'));
      return A().set(m.remote);
    }).then(function () { setStatus('Synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); return true; })
      .catch(function () { setStatus('Could not sync right now. Your data is safe on this device.'); return false; })
      .then(function (ok) { syncing = false; return ok; });
  }
  function onChanged() { if (!user) return; clearTimeout(timer); timer = setTimeout(sync, 2500); }

  var el = {};
  function h(tag, attrs, kids) { var e = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { k === 'text' ? e.textContent = attrs[k] : e.setAttribute(k, attrs[k]); }); (kids || []).forEach(function (c) { e.appendChild(c); }); return e; }
  function setStatus(t) { if (el.msg) el.msg.textContent = t; }
  function errText(e) {
    var c = e && e.code || '';
    return ({ 'auth/invalid-email': 'That email address does not look right.', 'auth/too-many-requests': 'Too many attempts. Please try again later.', 'auth/operation-not-allowed': 'Email sign-in is not switched on yet. Please tell the church office.',
      'auth/invalid-action-code': 'That sign-in link has expired or was already used. Please request a new one.', 'auth/expired-action-code': 'That sign-in link has expired. Please request a new one.', 'auth/unauthorized-continue-uri': 'This website is not yet authorised for sign-in. Please tell the church office.', 'auth/network-request-failed': 'No connection. Please try again.' })[c] || 'Something went wrong. Please try again.';
  }
  function render() {
    var box = el.box; if (!box) return; box.textContent = '';
    box.appendChild(h('h4', { text: 'Sync across devices' }));
    if (user) {
      box.appendChild(h('p', { class: 'ev-desc', text: 'Signed in as ' + (user.email || 'member') + '. Your bookmarks, notes and reading progress follow you.' }));
      el.msg = h('p', { class: 'ev-desc', role: 'status', 'aria-live': 'polite' }); box.appendChild(el.msg);
      var row = h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }), now = h('button', { type: 'button', class: 'btn-sm', text: 'Sync now' }), out = h('button', { type: 'button', class: 'btn-sm', text: 'Sign out' });
      now.addEventListener('click', function () { setStatus('Syncing…'); sync(); });
      out.addEventListener('click', function () { A().signOut(); });
      row.appendChild(now); row.appendChild(out); box.appendChild(row);
    } else {
      box.appendChild(h('p', { class: 'ev-desc', text: 'Optional. No password: we email you a one-time link. Without signing in, everything stays on this device.' }));
      var f = h('div', { class: 'f-group', style: 'margin-bottom:10px' }), lab = h('label', { for: 'memEmail', text: 'Email address' }), inp = h('input', { id: 'memEmail', type: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
      f.appendChild(lab); f.appendChild(inp); box.appendChild(f);
      var go = h('button', { type: 'button', class: 'btn-sm', text: 'Email me a sign-in link' }); el.msg = h('p', { class: 'ev-desc', role: 'status', 'aria-live': 'polite' });
      go.addEventListener('click', function () {
        var email = inp.value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setStatus('Please enter a valid email address.');
        go.disabled = true; setStatus('Sending…');
        A().sendLink(email).then(function () { try { root.localStorage.setItem('cacMemberEmail', email); } catch (e) {} setStatus('Check your inbox (and spam folder) for the sign-in link.'); }, function (e) { setStatus(errText(e)); }).then(function () { go.disabled = false; });
      });
      box.appendChild(go); box.appendChild(el.msg);
    }
  }
  function finishLink() {
    var email = ''; try { email = root.localStorage.getItem('cacMemberEmail') || ''; } catch (e) {}
    if (!email) email = (root.prompt('Please confirm your email address to finish signing in:') || '').trim();
    if (!email) return Promise.resolve();
    return A().finish(email).then(function () { try { root.localStorage.removeItem('cacMemberEmail'); } catch (e) {} root.history.replaceState(null, '', root.location.pathname); }, function (e) { root.history.replaceState(null, '', root.location.pathname); root.alert(errText(e)); });
  }
  function boot() {
    el.box = document.getElementById('dvAccount');   // optional: other pages (Bible) sync silently without the card
    (root.cacReady || Promise.resolve()).then(function () {
      if (!A() || !A().available()) return;                       // Firebase not configured: feature stays hidden
      if (el.box) { el.box.hidden = false; render(); }
      var done = A().isLink() ? finishLink() : Promise.resolve();
      done.then(function () { A().onChange(function (u) { var was = !!user; user = u; render(); if (u) { setStatus('Syncing…'); sync(); } else if (was) setStatus(''); }); });
      root.addEventListener('cac-prefs-changed', onChanged);
    });
  }
  return { mergePrefs: mergePrefs, stamp: stamp, readLocal: readLocal, writeLocal: writeLocal, boot: boot, sync: sync, LIM: LIM };
});
