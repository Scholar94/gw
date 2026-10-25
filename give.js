/* CAC GOOD WORKS: ONLINE GIVING (Paystack hosted checkout). The donor is sent to Paystack to pay; on return we ask the Worker to VERIFY the payment
   with Paystack before showing "thank you". Card details never touch this website. Hidden unless the Worker is configured. */
(function () {
  'use strict';
  var form = document.getElementById('giveForm'), off = document.getElementById('giveOff'), msg = document.getElementById('giveMsg'), res = document.getElementById('giveResult');
  if (!form) return;
  var E = window.cacEdge;
  function say(el, t, cls) { el.textContent = t; el.className = 'f-msg' + (cls ? ' ' + cls : ''); }
  function fmt(n, cur) { try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency: cur || 'NGN', maximumFractionDigits: 0 }).format(n); } catch (e) { return cur + ' ' + n; } }
  if (!E || !E.enabled()) return;                       // not connected: the "online giving is not enabled yet" notice stays
  form.hidden = false; if (off) off.hidden = true;

  var ref = new URLSearchParams(location.search).get('reference') || new URLSearchParams(location.search).get('trxref') || '';
  if (/^cac_[A-Za-z0-9]{16,40}$/.test(ref)) {
    form.hidden = true; res.hidden = false; say(res, 'Confirming your payment with Paystack…');
    E.post('/v1/give/verify', { reference: ref }).then(function (j) {
      if (j.status === 'success') { say(res, 'Thank you! Your gift of ' + fmt(j.amount, j.currency) + ' was received. God bless you. Paystack has emailed your receipt.', 'ok'); history.replaceState(null, '', location.pathname); }
      else if (j.status === 'pending') say(res, 'Your payment is still being processed. Please check your email for the Paystack receipt; if it was charged we will see it. You can reload this page in a minute.');
      else { say(res, j.status === 'mismatch' ? 'We could not match that payment to your gift, so we have not counted it. Please contact the church office.' : 'The payment was not completed, so you have not been charged.', 'err'); res.appendChild(document.createElement('br')); var a = document.createElement('a'); a.href = 'give.html'; a.textContent = 'Try again'; a.className = 'btn-sm'; res.appendChild(a); }
    }, function (e) { say(res, (e.message || 'Could not confirm the payment.') + ' If you were charged, Paystack will email you a receipt and we will reconcile it.', 'err'); });
    return;
  }
  document.querySelectorAll('[data-amt]').forEach(function (b) { b.addEventListener('click', function () { form.amount.value = b.getAttribute('data-amt'); form.amount.focus(); }); });
  form.addEventListener('submit', function (e) {
    e.preventDefault(); var amount = parseInt(form.amount.value, 10), email = form.email.value.trim();
    if (!(amount >= 100 && amount <= 5000000)) return say(msg, 'Please enter a whole amount from 100 to 5,000,000.', 'err');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say(msg, 'Please enter your email address: Paystack sends your receipt there.', 'err');
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true; say(msg, 'Taking you to Paystack…');
    E.post('/v1/give/init', { amount: amount, email: email, name: form.name.value.trim(), purpose: form.purpose.value, returnUrl: location.origin + location.pathname }).then(function (j) {
      if (/^https:\/\/checkout\.paystack\.com\//.test(j.url || '')) location.href = j.url; else throw new Error('Unexpected payment address.');
    }).catch(function (err) { btn.disabled = false; say(msg, err.message || 'Could not start the payment.', 'err'); });   // .catch (not a 2nd .then arg) so errors thrown above are handled too
  });
})();
