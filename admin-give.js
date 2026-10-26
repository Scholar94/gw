/* Admin: online giving overview (super admins only: Firestore rules enforce this). Records are written by the Worker after Paystack verification. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); }, rows = [];
  function h(tag, a, text) { var e = document.createElement(tag); if (a) Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (text != null) e.textContent = text; return e; }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t); }
  function money(n, c) { try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency: c || 'NGN', maximumFractionDigits: 0 }).format(n); } catch (e) { return (c || '') + ' ' + n; } }
  function when(v) { var d = v && v.toDate ? v.toDate() : (v ? new Date(v) : null); return d && !isNaN(d) ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  function draw() {
    var ok = rows.filter(function (r) { return r.status === 'success'; }), ym = new Date().toISOString().slice(0, 7);
    var month = ok.filter(function (r) { var d = r.paidAt && r.paidAt.toDate ? r.paidAt.toDate() : null; return d && d.toISOString().slice(0, 7) === ym; }).reduce(function (a, r) { return a + (r.amount || 0); }, 0);
    var by = {}; ok.forEach(function (r) { by[r.purpose] = (by[r.purpose] || 0) + (r.amount || 0); });
    $('giveStats').textContent = 'This month: ' + money(month) + ' · Latest 200 records, confirmed: ' + money(ok.reduce(function (a, r) { return a + (r.amount || 0); }, 0)) + ' (' + Object.keys(by).map(function (k) { return k + ' ' + money(by[k]); }).join(', ') + ')';
    var tb = $('giveBody'); tb.textContent = '';
    if (!rows.length) { var tr0 = h('tr'); tr0.appendChild(h('td', { colspan: '5' }, 'No gifts recorded yet.')); tb.appendChild(tr0); return; }
    rows.forEach(function (r) { var tr = h('tr'); [when(r.createdAt), r.name || '—', r.purpose || '', money(r.amount, r.currency), r.status || ''].forEach(function (t) { tr.appendChild(h('td', null, t)); }); tb.appendChild(tr); });
  }
  window.loadGiving = async function () {
    try { rows = await window.getDonations(); draw(); $('giveNote').textContent = ''; }
    catch (e) { rows = []; draw(); $('giveNote').textContent = (e && e.code === 'permission-denied') ? 'Only super admins can see giving records.' : 'Could not load giving records.'; }
  };
  function init() {
    if (!$('giveBody')) return;
    $('giveRecheck').addEventListener('click', async function () {
      if (!window.cacEdge || !window.cacEdge.enabled()) return toast('Needs the Cloudflare Worker to be connected.', 'error');
      var pend = rows.filter(function (r) { return r.status === 'pending' && (r.provider || 'paystack') === 'paystack'; }).slice(0, 15);   // Flutterwave can only be confirmed with the transaction id from the donor's return link if (!pend.length) return toast('No pending Paystack payments to re-check.');
      var changed = 0; for (var i = 0; i < pend.length; i++) { try { var j = await window.cacEdge.post('/v1/give/verify', { reference: pend[i].id }, { noToken: true }); if (j.status !== 'pending') changed++; } catch (e) { /* skip */ } }
      toast(changed ? changed + ' payment(s) updated.' : 'Nothing changed yet.'); window.loadGiving();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
