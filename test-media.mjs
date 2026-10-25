import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('./media.js');
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

test('driveId: share, open, uc, docs, lh3 and bare ids', () => {
  for (const u of [`https://drive.google.com/file/d/${ID}/view?usp=sharing`, `https://drive.google.com/open?id=${ID}`, `https://drive.google.com/uc?export=download&id=${ID}`, `https://drive.google.com/file/u/0/d/${ID}/view`, `https://lh3.googleusercontent.com/d/${ID}=w800`, ID, ` ${ID} `])
    assert.equal(M.driveId(u), ID, u);
  for (const u of ['', 'http://drive.google.com/file/d/' + ID, 'https://evil.com/file/d/' + ID, 'https://drive.google.com/drive/folders/' + ID, 'javascript:alert(1)', 'short']) assert.equal(M.driveId(u), '', u);
});
test('youtubeId: watch, short, embed, shorts, live and bare ids; rejects others', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://m.youtube.com/watch?feature=x&v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'])
    assert.equal(M.youtubeId(u), 'dQw4w9WgXcQ', u);
  for (const u of ['http://youtu.be/dQw4w9WgXcQ', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'javascript:alert(1)']) assert.equal(M.youtubeId(u), '', u);
});
test('video(): YouTube uses the no-cookie embed, Drive uses the preview player; others are null', () => {
  assert.equal(M.video('https://youtu.be/dQw4w9WgXcQ').embed, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(M.video(`https://drive.google.com/file/d/${ID}/view`).embed, `https://drive.google.com/file/d/${ID}/preview`);
  assert.equal(M.video('https://vimeo.com/123'), null); assert.equal(M.video(''), null);
});
test('audioSrc: Drive -> Worker proxy when available, else download link; https only for everything else', () => {
  assert.equal(M.audioSrc(`https://drive.google.com/file/d/${ID}/view`, 'https://edge.x.dev/'), `https://edge.x.dev/v1/media/${ID}`);
  assert.match(M.audioSrc(ID, ''), /^https:\/\/drive\.google\.com\/uc\?export=download&id=/);
  assert.equal(M.audioSrc('https://archive.org/download/a/b.mp3', ''), 'https://archive.org/download/a/b.mp3');
  assert.equal(M.audioSrc('javascript:alert(1)', ''), ''); assert.equal(M.audioSrc('http://insecure/a.mp3', ''), ''); assert.equal(M.audioSrc('https://x.org/a" onerror="x', ''), '');
});
test('imageSrc clamps width and rejects unsafe urls', () => { assert.equal(M.imageSrc(ID, 99999), `https://lh3.googleusercontent.com/d/${ID}=w2400`); assert.equal(M.imageSrc('data:image/png;base64,xx'), ''); assert.equal(M.imageSrc('https://a.org/p.jpg'), 'https://a.org/p.jpg'); });
test('podcastUrl: Drive needs the Worker, otherwise skipped', () => { assert.equal(M.podcastUrl(ID, ''), ''); assert.equal(M.podcastUrl(ID, 'https://e.dev'), `https://e.dev/v1/media/${ID}`); });
test('time parsing and formatting', () => { assert.equal(M.parseTime('1:02:03'), 3723); assert.equal(M.parseTime('12:30'), 750); assert.equal(M.parseTime('90'), 90); assert.equal(M.parseTime('x'), -1); assert.equal(M.fmtTime(3723), '1:02:03'); assert.equal(M.fmtTime(65), '1:05'); });
test('chapters: parsed, sorted, de-duplicated, junk ignored', () => {
  const c = M.parseChapters('10:00 Prayer\n00:00 Welcome\nnot a chapter\n[05:30] - The Word\n10:00 duplicate');
  assert.deepEqual(c.map(x => [x.t, x.title]), [[0, 'Welcome'], [330, 'The Word'], [600, 'Prayer']]);
});
test('transcript: timed and untimed lines', () => { assert.deepEqual(M.parseTranscript('[00:05] Hello\n\nPlain line'), [{ t: 5, text: 'Hello' }, { t: -1, text: 'Plain line' }]); });
