/* =============================================
   CAC GOOD WORKS: WEB PUSH OPT-IN (devotional page)
   Visitor opts in -> browser subscription -> stored by the Cloudflare Worker -> a free GitHub Actions job sends the daily devotional.
   Hidden unless config.js has push.vapidPublicKey AND edge.url. iPhones only support push for the installed app (Add to Home Screen).
   ============================================= */
(function () {
  'use strict';
  var cfg = window.CAC_CONFIG || {}, key = (cfg.push && cfg.push.vapidPublicKey) || '', box = document.getElementById('dvPushBox');
  if (!box) return;
  var ok = key && window.cacEdge && window.cacEdge.enabled() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;

  function b64(s) { var p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; }
  function reg() { return navigator.serviceWorker.ready; }
  function msg(t) { var m = box.querySelector('[role=status]'); if (m) m.textContent = t; }
  function draw(on) {
    box.textContent = '';
    var p = document.createElement('p'); p.className = 'ev-desc'; p.style.margin = '14px 0 8px';
    p.textContent = on ? 'Phone notifications are ON for the daily devotional.' : 'Or get a notification on this device each morning.';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn-sm'; b.id = 'pushToggle'; b.textContent = on ? 'Turn off notifications' : 'Turn on notifications';
    var s = document.createElement('p'); s.className = 'ev-desc'; s.setAttribute('role', 'status'); s.setAttribute('aria-live', 'polite');
    b.addEventListener('click', function () { b.disabled = true; (on ? off() : subscribe()).then(function () { draw(!on); }, function (e) { b.disabled = false; msg(e.message || 'Could not change notifications.'); }); });
    box.appendChild(p); box.appendChild(b); box.appendChild(s);
    if (ios && !on) { s.textContent = 'On iPhone/iPad: first tap Share, then “Add to Home Screen”, and open the app from there.'; }
  }
  function subscribe() {
    if (ios) return Promise.reject(new Error('On iPhone/iPad, add this site to your Home Screen first.'));
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings to turn this on.');
      return reg();
    }).then(function (r) { return r.pushManager.getSubscription().then(function (x) { return x || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }); }); })
      .then(function (sub) { return window.cacEdge.post('/v1/push/subscribe', { subscription: sub.toJSON(), lang: (document.documentElement.lang || 'en').slice(0, 10) }); });
  }
  function off() {
    return reg().then(function (r) { return r.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return; var ep = sub.endpoint;
      return sub.unsubscribe().then(function () { return window.cacEdge.post('/v1/push/unsubscribe', { endpoint: ep }).catch(function () {}); });
    });
  }
  if (!ok) return;
  reg().then(function (r) { return r.pushManager.getSubscription(); }).then(function (sub) { box.hidden = false; draw(!!sub && Notification.permission === 'granted'); }).catch(function () {});
})();
