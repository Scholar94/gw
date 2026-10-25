/* =============================================
   CAC GOOD WORKS ASSEMBLY — APP.JS
   ============================================= */
'use strict';

/* NAVBAR */
const navbar    = document.getElementById('navbar');
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  navbar?.classList.toggle('scrolled', window.scrollY > 60);
  document.getElementById('scrollTop')?.classList.toggle('visible', window.scrollY > 400);
}, { passive: true });

hamburger?.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  navLinks.classList.toggle('open');
  document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
});
navLinks?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  hamburger?.classList.remove('open');
  navLinks.classList.remove('open');
  document.body.style.overflow = '';
}));

document.getElementById('scrollTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* PARTICLES */
(function() {
  const c = document.getElementById('particles');
  if (!c) return;
  const n = window.innerWidth < 768 ? 20 : 50;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*100}%;--dur:${4+Math.random()*6}s;--delay:${Math.random()*4}s;--opacity:${0.2+Math.random()*0.5};width:${1+Math.random()*3}px;height:${1+Math.random()*3}px;`;
    c.appendChild(p);
  }
})();

/* SCRIPTURE ROTATION */
const scriptures = [
  '"For I know the plans I have for you, declares the Lord." — Jeremiah 29:11',
  '"I can do all things through Christ who strengthens me." — Philippians 4:13',
  '"The Lord is my shepherd; I shall not want." — Psalm 23:1',
  '"Trust in the Lord with all your heart." — Proverbs 3:5',
  '"Be still and know that I am God." — Psalm 46:10',
  '"Seek first the kingdom of God and His righteousness." — Matthew 6:33',
];
let si = 0;
const sEl = document.getElementById('heroScripture');
if (sEl) {
  setInterval(() => {
    sEl.style.opacity = 0;
    setTimeout(() => { sEl.textContent = scriptures[si = (si+1) % scriptures.length]; sEl.style.opacity = 1; sEl.style.transition = 'opacity 0.8s'; }, 600);
  }, 6000);
}

/* VERSE OF THE DAY */
const verses = [
  '"The Lord is my shepherd; I shall not want." — Psalm 23:1',
  '"In the beginning was the Word, and the Word was with God." — John 1:1',
  '"For God so loved the world that He gave His only Son." — John 3:16',
  '"I am the way, the truth, and the life." — John 14:6',
  '"Come to me, all who are weary and burdened." — Matthew 11:28',
  '"The name of the Lord is a fortified tower." — Proverbs 18:10',
  '"Cast all your anxiety on him because he cares for you." — 1 Peter 5:7',
];
const vEl = document.getElementById('verseOfDay');
if (vEl) vEl.textContent = verses[new Date().getDay()];

/* COUNTERS */
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10), dur = 2000, step = target / (dur / 16);
  let cur = 0;
  const t = setInterval(() => { cur += step; if (cur >= target) { cur = target; clearInterval(t); } el.textContent = Math.floor(cur); }, 16);
}

/* INTERSECTION OBSERVER */
const ro = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); ro.unobserve(e.target); } }), { threshold: 0.15 });
const co = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { animateCounter(e.target); co.unobserve(e.target); } }), { threshold: 0.5 });
document.querySelectorAll('.reveal').forEach(el => ro.observe(el));
document.querySelectorAll('.stat-num').forEach(el => co.observe(el));
document.querySelectorAll('.value-card,.stat-item,.service-card,.min-card,.leader-card,.leader-mini-card,.give-card,.loc-item').forEach((el,i) => {
  el.classList.add('reveal'); el.style.transitionDelay = `${(i%4)*0.1}s`; ro.observe(el);
});

/* CAROUSEL */
(function() {
  const track = document.getElementById('testimonialTrack');
  if (!track) return;
  const slides = track.querySelectorAll('.testimonial-slide');
  const dots   = document.getElementById('carouselDots');
  let cur = 0;
  slides.forEach((_,i) => {
    const d = document.createElement('button');
    d.className = 'carousel-dot' + (i===0?' active':'');
    d.setAttribute('aria-label', 'Slide '+(i+1));
    d.addEventListener('click', () => go(i));
    dots.appendChild(d);
  });
  function go(i) {
    cur = (i+slides.length)%slides.length;
    track.style.transform = `translateX(-${cur*100}%)`;
    dots.querySelectorAll('.carousel-dot').forEach((d,j) => d.classList.toggle('active', j===cur));
  }
  document.getElementById('prevBtn')?.addEventListener('click', () => go(cur-1));
  document.getElementById('nextBtn')?.addEventListener('click', () => go(cur+1));
  let ap = setInterval(() => go(cur+1), 5000);
  track.parentElement.addEventListener('mouseenter', () => clearInterval(ap));
  track.parentElement.addEventListener('mouseleave', () => { ap = setInterval(() => go(cur+1), 5000); });
  let sx = 0;
  track.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive:true });
  track.addEventListener('touchend',   e => { const d = sx - e.changedTouches[0].clientX; if (Math.abs(d)>50) go(d>0?cur+1:cur-1); });
})();

/* COUNTDOWNS — computed in church time (Africa/Lagos, UTC+1, no DST) so every visitor sees the same real countdown */
function nextServiceUTC(day, h, m) {
  const now = Date.now(), L = new Date(now + 3600000); // Lagos wall clock held in UTC fields
  for (let i = 0; i < 8; i++) {
    const c = Date.UTC(L.getUTCFullYear(), L.getUTCMonth(), L.getUTCDate() + i, h - 1, m);
    const wd = new Date(c + 3600000).getUTCDay();
    if (wd === day && c > now) return c;
  }
}
function startCountdown(id, day, h, m) {
  const el = document.querySelector('#'+id+' .countdown-val');
  if (!el) return;
  let target = nextServiceUTC(day, h, m);
  function tick() {
    let diff = target - Date.now();
    if (diff <= 0) { target = nextServiceUTC(day, h, m); diff = target - Date.now(); }
    const d=Math.floor(diff/86400000), hh=Math.floor((diff%86400000)/3600000), mm=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
    el.textContent = d>0 ? `${d}d ${hh}h ${mm}m` : `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  tick(); setInterval(tick, 1000);
}
startCountdown('sundayCountdown', 0, 8, 15);     // Sunday 8:15 AM
startCountdown('wednesdayCountdown', 3, 17, 0);  // Wednesday 5:00 PM

/* TOAST */
function showToast(msg) {
  const t = document.getElementById('toast'), m = document.getElementById('toastMsg');
  if (!t) return; m.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}

/* PUBLIC FORM HELPERS */
function backendReady() {
  const wait = window.cacEdge && window.cacEdge.enabled() ? Promise.resolve() : (window.cacReady || Promise.resolve());   // edge mode never waits for the Firestore SDK
  return wait.then(() => {
    if (!window.CAC_BACKEND || !window.CAC_BACKEND.configured) throw new Error('offline-form');
  });
}
const OFFLINE_MSG = 'Our online form is not connected yet. Please reach us on WhatsApp or by phone.';
function cooldown(key, ms = 30000) {
  const last = +localStorage.getItem('cacLast_' + key) || 0;
  if (Date.now() - last < ms) return false;
  try { localStorage.setItem('cacLast_' + key, String(Date.now())); } catch {}
  return true;
}

/* PRAYER FORM */
document.getElementById('prayerForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const name = document.getElementById('prayerName').value.trim().slice(0, 80);
  const phone = document.getElementById('prayerPhone').value.trim().slice(0, 25);
  const request = document.getElementById('prayerRequest').value.trim();
  const type = (document.querySelector('input[name="requestType"]:checked') || {}).value || 'General';
  if (request.length < 5) return showToast('Please enter your prayer request.');
  if (request.length > 2000) return showToast('Please keep your request under 2000 characters.');
  if (phone && !/^\+?[0-9\s()-]{7,20}$/.test(phone)) return showToast('Please enter a valid phone number.');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  try {
    await backendReady();
    if (!cooldown('prayer')) throw new Error('Please wait a few seconds before sending another request.');
    await window.savePrayerRequest({ name, phone, request, type });
    showToast('✓ Request submitted. We will pray with you!');
    e.target.reset();
  } catch (err) {
    showToast(err.message === 'offline-form' ? OFFLINE_MSG : (/permission|insufficient/i.test(err.message) ? 'Sorry, we could not accept that request. Please try again.' : err.message));
  }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Request';
});

/* NEWSLETTER */
document.getElementById('newsletterForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = e.target.querySelector('input').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showToast('Please enter a valid email address.');
  try {
    await backendReady();
    if (!cooldown('newsletter')) throw new Error('Please wait a few seconds.');
    await window.saveNewsletter({ email });
    showToast('✓ Subscribed! Welcome to the CAC Good Works family.');
    e.target.reset();
  } catch (err) { showToast(err.message === 'offline-form' ? OFFLINE_MSG : err.message); }
});

/* PARALLAX */
window.addEventListener('scroll', () => {
  const h = document.querySelector('.hero-content');
  if (!h) return;
  const s = window.scrollY;
  if (s < window.innerHeight) { h.style.transform = `translateY(${s*0.3}px)`; h.style.opacity = 1-s/(window.innerHeight*0.8); }
}, { passive:true });

/* SMOOTH ANCHOR SCROLL */
document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const t = document.querySelector(a.getAttribute('href'));
  if (t) { e.preventDefault(); t.scrollIntoView({ behavior:'smooth', block:'start' }); }
}));


/* LIVESTREAM: only embed when a real YouTube channel ID is configured; never show a fake "LIVE" badge or a broken player */
(function () {
  const wrap = document.getElementById('liveWrap'); if (!wrap) return;
  const init = () => {
    const cfg = window.CAC_CONFIG || {}, frame = wrap.querySelector('iframe[data-live-embed]');
    if (/^UC[\w-]{20,}$/.test(cfg.youtubeChannelId || '')) {
      frame.src = 'https://www.youtube.com/embed/live_stream?channel=' + cfg.youtubeChannelId;
      document.getElementById('liveBadgeWrap').hidden = false;
    } else {
      wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;min-height:260px;text-align:center;padding:30px"><i class="fab fa-youtube" style="font-size:3rem;color:var(--gold)"></i><p style="color:var(--white-60);max-width:420px">Watch our services and past messages on our YouTube channel.</p><a class="btn-primary sm" target="_blank" rel="noopener" href="' + (cfg.youtubeChannelUrl || 'https://youtube.com') + '"><i class="fab fa-youtube"></i> Open YouTube channel</a></div>';
    }
  };
  init();
})();


/* SOCIAL LINKS: show only networks that have a real URL in config.js (never ship dead "#" links) */
document.querySelectorAll('a[data-net]').forEach(a => {
  const url = ((window.CAC_CONFIG || {}).social || {})[a.dataset.net];
  if (/^https:\/\//.test(url || '')) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; } else a.remove();
});
