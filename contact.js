document.getElementById('contactForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('contactSubmitBtn');
  const v = id => document.getElementById(id).value.trim();
  const email = v('contactEmail'), phone = v('contactPhone'), message = v('contactMessage');
  if (v('contactName').length < 2) return showToast('Please enter your name.');
  if (!email && !phone) return showToast('Please provide an email or phone number so we can reply.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showToast('Please enter a valid email address.');
  if (message.length < 5) return showToast('Please enter your message.');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  try {
    await (window.cacEdge && window.cacEdge.enabled() ? Promise.resolve() : (window.cacReady || Promise.resolve()));
    if (!window.CAC_BACKEND || !window.CAC_BACKEND.configured) throw new Error('Our online form is not connected yet. Please reach us on WhatsApp or by phone.');
    const last = +localStorage.getItem('cacLast_contact') || 0;
    if (Date.now() - last < 30000) throw new Error('Please wait a few seconds before sending another message.');
    const subject = document.getElementById('contactSubject').value;
    await window.saveVisitorEnquiry({ name: v('contactName').slice(0, 80), email: email.slice(0, 120), phone: phone.slice(0, 25), visitDate: '', guests: '', message: ('[' + subject + '] ' + message).slice(0, 1000), consent: true });
    try { localStorage.setItem('cacLast_contact', String(Date.now())); } catch {}
    showToast('Message sent! We will respond within 24 hours.');
    e.target.reset();
  } catch (err) { showToast(/permission|insufficient/i.test(err.message) ? 'Sorry, we could not send that message. Please try again.' : err.message); }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
});
function showToast(msg) {
  const t = document.getElementById('toast'), m = document.getElementById('toastMsg');
  if (!t) return; m.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}
