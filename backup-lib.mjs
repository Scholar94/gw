/* Encrypted backup helpers (AES-256-GCM, key from passphrase via scrypt). Format: "CACBK1" | salt(16) | iv(12) | tag(16) | ciphertext(gzip(JSON)). */
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
const MAGIC = Buffer.from('CACBK1');
const key = (pass, salt) => scryptSync(String(pass), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
export function encrypt(obj, pass) {
  if (!pass || String(pass).length < 12) throw new Error('BACKUP_PASSPHRASE must be at least 12 characters');
  const salt = randomBytes(16), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(pass, salt), iv);
  const ct = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), ct]);
}
export function decrypt(buf, pass) {
  if (buf.length < 50 || !buf.subarray(0, 6).equals(MAGIC)) throw new Error('Not a CAC backup file');
  const salt = buf.subarray(6, 22), iv = buf.subarray(22, 34), tag = buf.subarray(34, 50), d = createDecipheriv('aes-256-gcm', key(pass, salt), iv); d.setAuthTag(tag);
  try { return JSON.parse(gunzipSync(Buffer.concat([d.update(buf.subarray(50)), d.final()])).toString('utf8')); } catch { throw new Error('Wrong passphrase or damaged file'); }
}
/** Firestore Timestamp / Date -> ISO strings, recursively. */
export function plain(v) {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}
export const COLLECTIONS = ['sermons', 'audio_sermons', 'devotionals', 'events', 'gallery', 'siteSettings', 'testimonies', 'prayer_wall', 'rsvps', 'rsvp_counts', 'donations', 'prayer_requests', 'visitor_enquiries', 'newsletters', 'admins', 'live', 'live_notes', 'sermons_removed'];
