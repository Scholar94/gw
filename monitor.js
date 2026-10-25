/* CAC GOOD WORKS: OPTIONAL MONITORING. Off unless config.js > monitoring has a value. No cookies; Sentry only receives error reports (no session replay, no PII). */
(function () {
  'use strict';
  var m = (window.CAC_CONFIG && window.CAC_CONFIG.monitoring) || {}, dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1';
  function add(src, attrs) { var s = document.createElement('script'); s.src = src; s.defer = true; s.crossOrigin = 'anonymous'; Object.keys(attrs || {}).forEach(function (k) { s.setAttribute(k, attrs[k]); }); document.head.appendChild(s); return s; }
  if (/^[0-9a-f]{32}$/.test(m.cloudflareToken || '') && !dnt) add('https://static.cloudflareinsights.com/beacon.min.js', { 'data-cf-beacon': JSON.stringify({ token: m.cloudflareToken }) });
  if (/^https:\/\/[0-9a-f]+@[a-z0-9.-]+\/\d+$/.test(m.sentryDsn || '')) {
    add('https://browser.sentry-cdn.com/8.33.1/bundle.min.js').onload = function () {
      if (!window.Sentry) return;
      window.Sentry.init({ dsn: m.sentryDsn, sendDefaultPii: false, tracesSampleRate: 0, release: 'cac-site', ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection'], denyUrls: [/extensions\//i, /^chrome:\/\//i] });
    };
  }
})();
