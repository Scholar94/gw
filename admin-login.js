function togglePass() {
  const inp  = document.getElementById('passcode');
  const icon = document.getElementById('passIcon');
  inp.type   = inp.type === 'password' ? 'text' : 'password';
  icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}
function showError(msg) {
  document.getElementById('loginErrorMsg').textContent = msg;
  document.getElementById('loginError').classList.add('show');
  const card = document.getElementById('loginCard');
  card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500);
}
const FRIENDLY = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.'
};
async function doLogin() {
  const email = document.getElementById('username').value.trim();
  const pass  = document.getElementById('passcode').value;
  const btn   = document.getElementById('loginBtn');
  document.getElementById('loginError').classList.remove('show');
  if (!email || !pass) return showError('Please enter your email and password.');
  await window.cacReady;
  if (!window.cacAuth || !window.cacAuth.available()) return showError('Admin sign-in is not available until Firebase is configured in firebase.js.');
  btn.classList.add('loading'); btn.disabled = true;
  try {
    await window.cacAuth.signIn(email, pass);
    // Wait for the role lookup; only registered admins (Firestore: admins/{uid}) may proceed.
    const unsub = window.cacAuth.onChange(async (user, role) => {
      if (!user) return;
      unsub && unsub();
      if (role) { window.location.href = 'admin-dashboard.html'; }
      else { await window.cacAuth.signOut(); showError('This account is not authorised for the admin area.'); btn.classList.remove('loading'); btn.disabled = false; }
    });
  } catch (e) {
    showError(FRIENDLY[e.code] || 'Sign-in failed. Please try again.');
    btn.classList.remove('loading'); btn.disabled = false;
    document.getElementById('passcode').value = '';
  }
}
document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
if (new URLSearchParams(location.search).get('reason') === 'timeout') showError('Session expired. Please sign in again.');
