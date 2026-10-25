/* YouTube sermon import + podcast feed (pure functions + one Firestore sync). Free: YouTube channel RSS needs no API key. */
import { createRequire } from 'node:module';
import { xmlEsc } from './job-lib.mjs';
const M = createRequire(import.meta.url)('./media.js');

const unesc = s => String(s ?? '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
});
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? unesc(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : ''; };

/** Parse a YouTube channel Atom feed -> [{videoId,title,published:Date,description}] (invalid entries dropped). */
export function parseYouTubeFeed(xml) {
  return [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    videoId: tag(e, 'yt:videoId'), title: tag(e, 'title'), published: new Date(tag(e, 'published')), description: tag(e, 'media:description')
  })).filter(v => /^[A-Za-z0-9_-]{11}$/.test(v.videoId) && v.title && !isNaN(v.published));
}

const lagosDate = d => new Date(d.getTime() + 3600e3).toISOString().slice(0, 10);   // Lagos = UTC+1, no DST

/** Turn feed entries into sermon documents (never overwrites: caller skips existing + removed ids). */
export function toSermon(v, o = {}) {
  return { title: v.title.slice(0, 200), preacher: o.preacher || '', category: o.category || 'Sermon', date: lagosDate(v.published),
    videoUrl: `https://www.youtube.com/watch?v=${v.videoId}`, thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    description: v.description.slice(0, 500), source: 'youtube', videoId: v.videoId };
}

export async function fetchFeed(channelId, fetchImpl = fetch) {
  const res = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { headers: { 'user-agent': 'cac-good-works-sync' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('YouTube feed HTTP ' + res.status);
  return parseYouTubeFeed(await res.text());
}

/** Import new videos. Returns the ids created. Idempotent; honours admin deletions (sermons_removed tombstones). */
export async function syncYouTube(db, Timestamp, channelId, opts = {}, fetchImpl = fetch) {
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId || '')) { console.log('youtubeChannelId not set (config.js): skipping YouTube import.'); return []; }
  let entries; try { entries = await fetchFeed(channelId, fetchImpl); } catch (e) { console.warn('YouTube import skipped:', e.message); return []; }
  const created = [], max = opts.max || 15, mustMatch = opts.titleMustMatch ? new RegExp(opts.titleMustMatch, 'i') : null;
  for (const v of entries.slice(0, max)) {
    if (mustMatch && !mustMatch.test(v.title)) continue;
    const ref = db.collection('sermons').doc('yt-' + v.videoId);
    if ((await db.collection('sermons_removed').doc(v.videoId).get()).exists) continue;
    try { await ref.create({ ...toSermon(v, opts), createdAt: Timestamp.fromDate(v.published) }); created.push(v.videoId); }
    catch (e) { if (!/ALREADY_EXISTS|already exists|code.?6/i.test(String(e.code) + e.message)) throw e; }
  }
  return created;
}

/* ---------------- podcast ---------------- */
const rfc822 = d => d.toUTCString();
const isoToDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(s + 'T07:00:00Z') : new Date(0);

/** Size + content type of a remote audio file via a 1-byte range request (works on archive.org and the edge Worker). */
export async function probe(url, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(url, { headers: { range: 'bytes=0-0' }, signal: AbortSignal.timeout(15000) });
    const cr = (r.headers.get('content-range') || '').match(/\/(\d+)$/), type = (r.headers.get('content-type') || '').split(';')[0];
    await r.body?.cancel?.();
    return { length: cr ? +cr[1] : (+r.headers.get('content-length') || 0), type: /^audio\//.test(type) ? type : 'audio/mpeg' };
  } catch { return { length: 0, type: 'audio/mpeg' }; }
}

export function buildPodcast(audios, site, cfg, probes = {}, now = new Date()) {
  const p = cfg.podcast || {}, edge = (cfg.edge && cfg.edge.url) || '';
  const title = p.title || `${cfg.name || 'Church'} Messages`, img = p.image ? (/^https:/.test(p.image) ? p.image : `${site}/${p.image.replace(/^\//, '')}`) : '';
  const items = audios.map(a => ({ a, url: M.podcastUrl(a.audioUrl, edge) })).filter(x => x.url && a_ok(x.a)).sort((x, y) => isoToDate(y.a.date) - isoToDate(x.a.date)).slice(0, 200).map(({ a, url }) => {
    const pr = probes[url] || { length: 0, type: 'audio/mpeg' };
    return `    <item>
      <title>${xmlEsc(a.title)}</title>
      <description>${xmlEsc([a.preacher && 'Speaker: ' + a.preacher, a.description].filter(Boolean).join('. ') || a.title)}</description>
      <enclosure url="${xmlEsc(url)}" length="${pr.length}" type="${xmlEsc(pr.type)}"/>
      <guid isPermaLink="false">${xmlEsc(a.id)}</guid>
      <pubDate>${rfc822(isoToDate(a.date))}</pubDate>
      <itunes:author>${xmlEsc(a.preacher || p.author || cfg.name)}</itunes:author>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEsc(title)}</title>
    <link>${xmlEsc(site)}/sermons.html</link>
    <atom:link href="${xmlEsc(site)}/podcast.xml" rel="self" type="application/rss+xml"/>
    <language>${xmlEsc(p.language || 'en')}</language>
    <description>${xmlEsc(p.description || `Messages from ${cfg.name || 'our church'}.`)}</description>
    <itunes:author>${xmlEsc(p.author || cfg.name || '')}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:category text="${xmlEsc(p.category || 'Religion &amp; Spirituality'.replace('&amp;', '&'))}">${p.subcategory === '' ? '' : `<itunes:category text="${xmlEsc(p.subcategory || 'Christianity')}"/>`}</itunes:category>
${img ? `    <itunes:image href="${xmlEsc(img)}"/>\n    <image><url>${xmlEsc(img)}</url><title>${xmlEsc(title)}</title><link>${xmlEsc(site)}</link></image>\n` : ''}${p.email ? `    <itunes:owner><itunes:name>${xmlEsc(p.author || cfg.name || '')}</itunes:name><itunes:email>${xmlEsc(p.email)}</itunes:email></itunes:owner>\n` : ''}    <lastBuildDate>${rfc822(now)}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>
`;
}
const a_ok = a => a && a.id && a.title;
