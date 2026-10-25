/* CAC GOOD WORKS: LISTEN MODE. Reads a devotional aloud with the browser's built-in text-to-speech (free, offline-capable, no audio files).
   Long text is split into sentence-sized pieces because browsers silently stop long utterances. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.cacListen = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  /** Split into pieces of at most `max` characters, preferring sentence ends, never cutting words. */
  function chunk(text, max) {
    max = max || 200; var out = [], sentences = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?;:]+[.!?;:]*\s*/g) || [];
    sentences.forEach(function (s) {
      s = s.trim(); if (!s) return;
      while (s.length > max) { var cut = s.lastIndexOf(' ', max); if (cut < max * 0.4) cut = max; out.push(s.slice(0, cut).trim()); s = s.slice(cut).trim(); }
      if (!s) return;
      var last = out[out.length - 1];
      if (last && last.length + 1 + s.length <= max && !/[.!?]$/.test(last)) out[out.length - 1] = last + ' ' + s; else out.push(s);
    });
    return out;
  }
  var supported = !!(root.speechSynthesis && root.SpeechSynthesisUtterance), queue = [], idx = 0, rate = 1, state = 'idle', onState = function () {}, gen = 0;
  function set(s) { state = s; onState(s); }
  function next(g) {
    if (g !== gen) return;
    if (idx >= queue.length) { set('idle'); return; }
    var u = new root.SpeechSynthesisUtterance(queue[idx++]); u.rate = rate; u.lang = root.document && root.document.documentElement.lang || 'en';
    u.onend = function () { next(g); }; u.onerror = function (e) { if (g === gen && e.error !== 'interrupted' && e.error !== 'canceled') set('idle'); };
    root.speechSynthesis.speak(u);
  }
  return {
    chunk: chunk, supported: supported,
    onState: function (f) { onState = f; },
    state: function () { return state; },
    setRate: function (r) { rate = Math.min(2, Math.max(.5, +r || 1)); },
    start: function (text) { if (!supported) return false; this.stop(); queue = chunk(text); idx = 0; if (!queue.length) return false; set('playing'); next(gen); return true; },
    pause: function () { if (state === 'playing') { root.speechSynthesis.pause(); set('paused'); } },
    resume: function () { if (state === 'paused') { root.speechSynthesis.resume(); set('playing'); } },
    stop: function () { gen++; queue = []; idx = 0; if (supported) root.speechSynthesis.cancel(); if (state !== 'idle') set('idle'); }
  };
});
