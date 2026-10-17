/* Pure, testable helpers for the daily job (no network, no Firebase imports). */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
export const C = require(path.join(root, 'calendar-lib.js'));

/** Reuse the browser config (single source of truth for services) without duplicating it. */
export function loadConfig() {
  const win = { CAC_BACKEND: {}, addEventListener() {} }; new Function('window', readFileSync(path.join(root, 'config.js'), 'utf8'))(win);
  return win.CAC_CONFIG;
}

export const xmlEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const strip = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // control chars are illegal in XML

/** Idempotent: only touches docs still 'scheduled' whose date has arrived (Lagos). Safe to retry. */
export async function promoteScheduled(db, today, serverTimestamp) {
  const snap = await db.collection('devotionals').where('status', '==', 'scheduled').where('date', '<=', today).get();
  await Promise.all(snap.docs.map(d => d.ref.update({ status: 'published', publishedAt: serverTimestamp })));
  return snap.docs.map(d => d.id);
}

/** RSS 2.0 of published devotionals up to and including today (never drafts, scheduled, archived or future). */
export function buildRSS(devotionals, site, today, cfg = { name: 'CAC Good Works Assembly' }) {
  const items = devotionals.filter(d => d.status === 'published' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const pub = ds => new Date(C.lagosToInstant(ds, '06:00')).toUTCString();
  const body = items.map(d => {
    const url = `${site}/devotionals.html?d=${d.date}`;
    const summary = strip(String(d.message || '').replace(/\s+/g, ' ')).slice(0, 300);
    return `    <item>
      <title>${xmlEsc(strip(d.title))}</title>
      <link>${xmlEsc(url)}</link>
      <guid isPermaLink="true">${xmlEsc(url)}</guid>
      <pubDate>${pub(d.date)}</pubDate>
      <author>${xmlEsc(strip(d.author || cfg.name))}</author>
      <category>${xmlEsc(strip(d.theme || 'Devotional'))}</category>
      <description>${xmlEsc(strip(d.scripture) + ': ' + summary + (summary.length >= 300 ? '…' : ''))}</description>
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEsc(cfg.name)} — Daily Devotional</title>
    <link>${xmlEsc(site)}/devotionals.html</link>
    <atom:link href="${xmlEsc(site)}/devotionals.xml" rel="self" type="application/rss+xml"/>
    <description>Begin each day in His presence.</description>
    <language>en</language>
    <lastBuildDate>${items[0] ? pub(items[0].date) : new Date(0).toUTCString()}</lastBuildDate>
${body}
  </channel>
</rss>
`;
}

/** Subscribable calendar: recurring services (RRULE) + upcoming special events. Deterministic output (no churn). */
export function buildCalendar(events, cfg, today) {
  const ANCHOR = '2026-01-01';
  const recurring = cfg.series.map(s => C.seriesAnchor(s, ANCHOR)).filter(Boolean);
  const special = events.filter(e => C.parseYMD(e.date) && (e.endDate || e.date) >= C.addDays(today, -7) && e.status !== 'cancelled')
    .map(e => ({ id: 'cloud-' + e.id, title: e.title, date: e.date, time: e.time || '', endTime: e.endTime || '', endDate: e.endDate || '',
      venue: e.venue || cfg.address, description: e.description || '' }));
  const stamp = new Date(Date.UTC(2026, 0, 1));
  let ics = C.buildICS(recurring.map(e => ({ ...e, uid: e.id })).concat(special.map(e => ({ ...e, uid: e.id }))), { name: cfg.name, now: stamp });
  // hint clients to refresh twice a day
  ics = ics.replace('METHOD:PUBLISH\r\n', 'METHOD:PUBLISH\r\nREFRESH-INTERVAL;VALUE=DURATION:PT12H\r\nX-PUBLISHED-TTL:PT12H\r\n');
  return ics;
}
