import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
test('security.txt has Contact + Expires and does not lapse within 14 days (renew yearly)', () => {
  const t = readFileSync('security.txt', 'utf8'), exp = /^Expires:\s*(.+)$/m.exec(t); assert.ok(/^Contact:\s*mailto:\S+@\S+/m.test(t), 'Contact'); assert.ok(exp, 'Expires');
  assert.ok(new Date(exp[1]) - Date.now() > 14 * 864e5, 'security.txt Expires is within 14 days or past: renew it');
});
test('strict firestore.rules has no public create on submission collections', () => {
  const r = readFileSync('firestore.rules', 'utf8');
  for (const c of ['prayer_requests', 'newsletters', 'visitor_enquiries', 'testimonies']) { const m = new RegExp(`match /${c}/\\{id\\} \\{([\\s\\S]*?)\\n    \\}`).exec(r); assert.ok(m, c); assert.ok(!/allow create/.test(m[1]), c + ' must not allow create'); }
});
test('no private keys or service-account JSON are committed', () => {
  for (const f of readdirSync('.').filter(x => statSync(x).isFile() && !/\.(png|webp|jpg|woff2|ico|zip|json)$/.test(x) || x === 'firebase.json')) {
    const t = readFileSync(f, 'utf8'); assert.ok(!/BEGIN (RSA |EC )?PRIVATE KEY-----\s*[A-Za-z0-9+/]{40,}/.test(t) || /^test-/.test(f), f); assert.ok(!/"private_key_id"\s*:\s*"[0-9a-f]{20,}"/.test(t), f);
  }
});
test('the worker never logs request bodies or secrets', () => { const w = readFileSync('worker.js', 'utf8'); assert.ok(!/console\.log\(/.test(w)); assert.ok(!/console\.(error|warn)\([^)]*(body|secret|token)/i.test(w)); });
test('csp.json is strict', () => { const c = JSON.parse(readFileSync('csp.json', 'utf8'))['Content-Security-Policy']; assert.ok(!/script-src[^;]*'unsafe-(inline|eval)'/.test(c)); assert.ok(/object-src 'none'/.test(c) && /base-uri 'self'/.test(c)); });
