import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeFeed, toSermon, syncYouTube, buildPodcast, probe } from './job-media.mjs';

const feed = `<?xml version="1.0"?><feed xmlns:yt="x" xmlns:media="y"><title>Chan</title>
<entry><id>yt:video:dQw4w9WgXcQ</id><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>Faith &amp; Works &lt;b&gt;</title><published>2026-01-11T23:30:00+00:00</published><media:group><media:description>Line &quot;one&quot;</media:description></media:group></entry>
<entry><yt:videoId>bad</yt:videoId><title>Broken</title><published>2026-01-01T00:00:00+00:00</published></entry>
<entry><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Second</title><published>2026-01-04T10:00:00+00:00</published><media:group><media:description></media:description></media:group></entry></feed>`;
const CH = 'UC' + 'a'.repeat(22);
test('parseYouTubeFeed decodes entities and drops invalid entries', () => {
  const v = parseYouTubeFeed(feed); assert.equal(v.length, 2); assert.equal(v[0].title, 'Faith & Works <b>'); assert.equal(v[0].description, 'Line "one"');
});
test('toSermon: Lagos date (UTC+1), watch url, thumb, source', () => { const s = toSermon(parseYouTubeFeed(feed)[0]); assert.equal(s.date, '2026-01-12'); assert.equal(s.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'); assert.equal(s.source, 'youtube'); });
function fakeDb(existing = [], removed = []) {
  const created = [];
  return { created, collection: n => ({ doc: id => ({ get: async () => ({ exists: (n === 'sermons_removed' ? removed : existing).includes(id) }), create: async d => { if (existing.includes(id)) { const e = new Error('6 ALREADY_EXISTS'); e.code = 6; throw e; } created.push({ id, ...d }); } }) }) };
}
const TS = { fromDate: d => ({ ts: d }) }, okFetch = async () => new Response(feed);
test('sync creates new sermons with yt- ids, in publish order', async () => { const db = fakeDb(); const ids = await syncYouTube(db, TS, CH, {}, okFetch); assert.deepEqual(ids, ['dQw4w9WgXcQ', 'aaaaaaaaaaa']); assert.equal(db.created[0].id, 'yt-dQw4w9WgXcQ'); assert.ok(db.created[0].createdAt.ts instanceof Date); });
test('sync never overwrites existing sermons and respects admin deletions', async () => {
  const db = fakeDb(['yt-dQw4w9WgXcQ'], ['aaaaaaaaaaa']); assert.deepEqual(await syncYouTube(db, TS, CH, {}, okFetch), []);
});
test('sync: missing channel id or feed failure never throws', async () => {
  assert.deepEqual(await syncYouTube(fakeDb(), TS, '', {}, okFetch), []);
  assert.deepEqual(await syncYouTube(fakeDb(), TS, CH, {}, async () => new Response('', { status: 500 })), []);
  assert.deepEqual(await syncYouTube(fakeDb(), TS, CH, {}, async () => { throw new Error('net'); }), []);
});
test('sync honours titleMustMatch', async () => { assert.deepEqual(await syncYouTube(fakeDb(), TS, CH, { titleMustMatch: '^Second' }, okFetch), ['aaaaaaaaaaa']); });
const DID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const cfg = { name: 'CAC <GW>', edge: { url: 'https://e.dev' }, podcast: { author: 'CAC', email: 'a@b.org', image: 'podcast-cover.jpg' } };
test('podcast: valid RSS, escaped, Drive via Worker, https only, newest first, image absolute', () => {
  const xml = buildPodcast([{ id: 'a', title: 'Old & Good', date: '2026-01-01', audioUrl: 'https://archive.org/download/x/a.mp3' }, { id: 'b', title: 'New', date: '2026-02-01', audioUrl: DID, preacher: 'Pr' }, { id: 'c', title: 'Bad', date: '2026-03-01', audioUrl: 'javascript:x' }, { id: 'd', title: 'Http', date: '2026-03-01', audioUrl: 'http://x.org/a.mp3' }], 'https://s.org', cfg, { ['https://e.dev/v1/media/' + DID]: { length: 123, type: 'audio/mp4' } }, new Date('2026-02-02T00:00:00Z'));
  assert.ok(xml.indexOf('>New<') < xml.indexOf('Old &amp; Good')); assert.ok(!xml.includes('javascript') && !xml.includes('http://x.org'));
  assert.match(xml, /enclosure url="https:\/\/e\.dev\/v1\/media\/1AbC[^"]*" length="123" type="audio\/mp4"/); assert.match(xml, /itunes:image href="https:\/\/s\.org\/podcast-cover\.jpg"/); assert.match(xml, /CAC &lt;GW&gt;|<title>CAC &lt;GW&gt; Messages/);
  assert.match(xml, /<itunes:category text="Religion &amp; Spirituality">/);
});
test('podcast: Drive items are skipped when no Worker is configured', () => { assert.ok(!buildPodcast([{ id: 'b', title: 'T', date: '2026-02-01', audioUrl: DID }], 'https://s.org', { name: 'X' }).includes('<item>')); });
test('probe reads total size from Content-Range and falls back safely', async () => {
  assert.deepEqual(await probe('https://x', async () => new Response('a', { status: 206, headers: { 'content-range': 'bytes 0-0/5000', 'content-type': 'audio/mpeg' } })), { length: 5000, type: 'audio/mpeg' });
  assert.deepEqual(await probe('https://x', async () => { throw new Error('x'); }), { length: 0, type: 'audio/mpeg' });
});
