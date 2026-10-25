/* Minimal offline shell. Network-first for pages (so content is never stale); cache fallback when offline. */
const V = 'cac-v5', SHELL = ['index.html','events.html','devotionals.html','style.css','pages.css','app.js','config.js','calendar-lib.js','logo-mark.webp','icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // never touch Firebase/Google requests
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

/* ---- Web Push: the daily devotional (sent by the free GitHub Actions job; see job-push.mjs) ---- */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  const title = String(d.title || 'Daily Devotional').slice(0, 80), url = typeof d.url === 'string' && /^(?!\/\/)[A-Za-z0-9_\-.\/?=&%]+$/.test(d.url) ? d.url : 'devotionals.html';   // same-site relative path only (works under a GitHub Pages sub-path too)
  e.waitUntil(self.registration.showNotification(title, { body: String(d.body || '').slice(0, 200), icon: 'icon-192.png', badge: 'icon-192.png', tag: 'daily-devotional', renotify: false, data: { url } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || 'devotionals.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const w = cs.find(c => c.url === target); return w ? w.focus() : self.clients.openWindow(target); }));
});
