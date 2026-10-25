/* =============================================
   CAC GOOD WORKS: EDGE CLIENT
   Sends public submissions (prayer, newsletter, visit, testimony, contact) to the Cloudflare Worker
   (worker.js), protected by Cloudflare Turnstile. Configure in config.js > edge { url, turnstileSiteKey }.
   When edge.url is empty the site keeps its old behaviour (forms write to Firestore directly),
   so nothing breaks before the Worker is deployed.
   ============================================= */
(function () {
  'use strict';
  var cfg = (window.CAC_CONFIG && window.CAC_CONFIG.edge) || {};
  var base = String(cfg.url || '').replace(/\/+$/, '');
  var siteKey = String(cfg.turnstileSiteKey || '');
  var enabled = /^https:\/\/[^\s/]+$/.test(base) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
  var KIND = { savePrayerRequest: 'prayer', saveNewsletter: 'newsletter', saveVisitorEnquiry: 'visit', saveTestimony: 'testimony' };
  var tsLoad;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!tsLoad) tsLoad = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
      s.onload = function () { window.turnstile ? resolve(window.turnstile) : reject(new Error('The security check could not start.')); };
      s.onerror = function () { tsLoad = null; reject(new Error('The security check could not load. Please check your connection (or disable content blockers) and try again.')); };
      document.head.appendChild(s);
    });
    return tsLoad;
  }

  /** One fresh single-use Turnstile token. The widget stays invisible unless Cloudflare needs the visitor to interact. */
  function token() {
    if (!siteKey) return Promise.resolve('');
    return loadTurnstile().then(function (ts) {
      return new Promise(function (resolve, reject) {
        var box = document.createElement('div'); box.className = 'cac-turnstile'; document.body.appendChild(box);
        var id, done = false, timer = setTimeout(function () { finish(new Error('The security check took too long. Please try again.')); }, 30000);
        function finish(err, t) { if (done) return; done = true; clearTimeout(timer); try { ts.remove(id); } catch (e) {} box.remove(); err ? reject(err) : resolve(t); }
        try {
          id = ts.render(box, { sitekey: siteKey, appearance: 'interaction-only',
            callback: function (t) { finish(null, t); },
            'error-callback': function () { finish(new Error('The security check failed. Please refresh the page and try again.')); },
            'timeout-callback': function () { finish(new Error('The security check expired. Please try again.')); } });
        } catch (e) { finish(new Error('The security check could not start.')); }
      });
    });
  }

  function post(path, body, opts) {
    if (!enabled) return Promise.reject(new Error('Our online form is not connected yet. Please contact us by phone or WhatsApp instead.'));
    return (opts && opts.noToken ? Promise.resolve('') : token()).then(function (t) {
      return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({}, body, { turnstile: t })) });
    }, function (e) { throw e; }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j.ok) return j;
        throw new Error(j.error || (r.status === 429 ? 'Too many submissions. Please try again later.' : 'Something went wrong. Please try again.'));
      });
    }, function (e) {
      throw e instanceof TypeError ? new Error('Could not reach the server. Please check your connection and try again.') : e;
    });
  }

  /** GET a JSON resource from the Worker (no CAPTCHA: capability URLs such as ticket codes). */
  function get(path) {
    if (!enabled) return Promise.reject(new Error('Our online service is not connected yet.'));
    return fetch(base + path).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.ok && j.ok) return j; var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; }); }, function () { throw new Error('Could not reach the server. Please check your connection and try again.'); });
  }
  function submit(kind, data) { return post('/v1/submit/' + kind, data); }

  /* Route the four public save functions through the Worker. firebase.js calls install() again after it defines its own versions. */
  function install() {
    Object.keys(KIND).forEach(function (fn) { window[fn] = function (d) { return submit(KIND[fn], d); }; });
  }

  window.cacEdge = { enabled: function () { return enabled; }, url: base, submit: submit, post: post, get: get, token: token, install: install };
  if (enabled) { window.CAC_BACKEND = Object.assign({}, window.CAC_BACKEND, { configured: true, edge: true }); install(); }
})();
