/* Registers the offline/push service worker (kept as a file so the Content-Security-Policy needs no inline script). */
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
