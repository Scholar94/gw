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

/* COUNTDOWNS */
function nextDay(day, h=8, m=0) {
  const d = new Date(), n = new Date();
  const diff = (day - d.getDay() + 7) % 7 || 7;
  n.setDate(d.getDate()+diff); n.setHours(h,m,0,0); return n;
}
function startCountdown(id, target) {
  const el = document.querySelector('#'+id+' .countdown-val');
  if (!el) return;
  function tick() {
    let diff = target - new Date();
    if (diff <= 0) { target = nextDay(target.getDay(), target.getHours(), target.getMinutes()); diff = target - new Date(); }
    const d=Math.floor(diff/86400000), h=Math.floor((diff%86400000)/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
    el.textContent = d>0 ? `${d}d ${h}h ${m}m` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  tick(); setInterval(tick, 1000);
}
startCountdown('sundayCountdown', nextDay(0,8,0));
startCountdown('wednesdayCountdown', nextDay(3,17,30));

/* TOAST */
function showToast(msg) {
  const t = document.getElementById('toast'), m = document.getElementById('toastMsg');
  if (!t) return; m.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}

/* PRAYER FORM */
document.getElementById('prayerForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  try {
    const data = {
      name: document.getElementById('prayerName').value.trim(),
      phone: document.getElementById('prayerPhone').value.trim(),
      request: document.getElementById('prayerRequest').value.trim(),
      type: document.querySelector('input[name="requestType"]:checked').value,
      timestamp: new Date().toISOString()
    };
    if (typeof window.savePrayerRequest === 'function') await window.savePrayerRequest(data);
    showToast('✓ Request submitted. We will pray with you!');
    e.target.reset();
  } catch { showToast('✓ Request received. We will be in touch!'); e.target.reset(); }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Request';
});

/* NEWSLETTER */
document.getElementById('newsletterForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = e.target.querySelector('input').value.trim();
  try { if (typeof window.saveNewsletter === 'function') await window.saveNewsletter({ email, timestamp: new Date().toISOString() }); } catch {}
  showToast('✓ Subscribed! Welcome to the CAC Good Works family.');
  e.target.reset();
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
