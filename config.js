/* =============================================
   CAC GOOD WORKS — SITE CONFIG (public, non-secret)
   Edit church details here. Never put secrets here.
   ============================================= */
window.CAC_CONFIG = {
  name: 'CAC Good Works Assembly',
  timezone: 'Africa/Lagos',
  phone: '+2348079731695',
  whatsapp: '2348079731695',
  email: 'info@cacgoodworks.org',
  address: 'CAC Good Works Assembly, Ijebu-ode, Ogun State, Nigeria',
  // Paste your YouTube CHANNEL ID (starts with UC…, from YouTube Studio > Settings > Channel > Advanced) to enable the live embed.
  youtubeChannelId: '',   // UC... id (YouTube > Settings > Advanced). The daily job imports new uploads automatically (free RSS, no API key).
  youtubeSync: { titleMustMatch: '' },   // optional regex: only import videos whose title matches, e.g. 'sermon|service|message'
  // Google Drive media library (free): admin uploads go to YOUR Drive folder. clientId: Google Cloud > APIs & Services > Credentials > OAuth client (Web).
  // folderId: the id at the end of your Drive folder's URL. Leave '' to disable (then admin uses pasted links only).
  drive: { clientId: '', folderId: '' },
  // Web Push (free): vapidPublicKey from `npx web-push generate-vapid-keys` (public half only; the private half is a GitHub secret). Needs edge.url.
  push: { vapidPublicKey: '' },
  // Monitoring (both optional, free tiers). cloudflareToken: Cloudflare > Web Analytics (cookieless, no consent banner needed).
  // sentryDsn: sentry.io free plan > Project > Client Keys. Leave '' to keep both off (nothing is loaded, nothing is sent).
  monitoring: { cloudflareToken: '', sentryDsn: '' },
  // Podcast feed (podcast.xml): submit https://YOUR-SITE/podcast.xml to Apple Podcasts Connect + Spotify for Creators.
  // Apple needs square cover art 1400-3000px (podcast-cover.jpg is a starter); audio must be https and Range-capable (archive.org, or Drive via the Worker).
  podcast: { title: '', description: '', author: 'CAC Good Works Assembly', email: '', language: 'en', category: 'Religion & Spirituality', subcategory: 'Christianity', image: 'podcast-cover.jpg' },
  youtubeChannelUrl: 'https://youtube.com/@CACGoodWorks',
  // Social links: add the real URL to show an icon; leave '' to hide it (no dead links).
  social: { facebook: '', youtube: 'https://youtube.com/@CACGoodWorks', instagram: '', tiktok: '', x: '' },
  // Believers Bible College (BBC). Admin > Believers Bible College overrides these defaults without editing code.
  bbc: {
    name: 'Believers Bible College',
    url: 'https://awopejumichael7-sketch.github.io/bbc/',   // BBC platform link (must start with https://)
    headline: 'Go deeper in the Word',
    text: 'Believers Bible College is the official e-learning platform of CAC Good Works Assembly: a place to study Scripture, be established in the faith and grow in discipleship, from your phone or computer. Join us today and take your next step in the Word.',
    buttonLabel: 'Visit Believers Bible College',
    image: 'bbc-crest.webp'
  },
  // Edge Worker (Cloudflare, free). Leave url '' until the Worker is deployed: forms then write to Firestore directly (legacy mode).
  // url example: 'https://cac-edge.YOUR-SUBDOMAIN.workers.dev' (no trailing slash). turnstileSiteKey: Cloudflare dashboard > Turnstile (public value).
  edge: { url: '', turnstileSiteKey: '' },
  // Weekly/monthly programmes (matches the service times already published on the site)
  series: [
    { id: 'sunday-service', title: 'Sunday Service', type: 'Service', time: '08:15', endTime: '10:30',
      venue: 'CAC Good Works Assembly, Ijebu-ode', description: 'Worship, the Word and the Holy Spirit.', rule: { kind: 'weekly', day: 0 } },
    { id: 'midweek-service', title: 'Midweek Service', type: 'Service', time: '17:00', endTime: '19:00',
      venue: 'CAC Good Works Assembly, Ijebu-ode', description: 'Word-based teaching and intercessory prayer.', rule: { kind: 'weekly', day: 3 } },
    { id: 'ruth-boaz', title: 'Ruth & Boaz Meeting', type: 'Fellowship',
      venue: 'CAC Good Works Assembly, Ijebu-ode', description: 'Monthly singles meeting. Time to be announced by the church.', rule: { kind: 'monthly-last-weekday', day: 6 } },
    { id: 'couples-meeting', title: 'Couples Meeting', type: 'Fellowship',
      venue: 'CAC Good Works Assembly, Ijebu-ode', description: 'Monthly couples meeting. Time to be announced by the church.', rule: { kind: 'monthly-last-weekday', day: 6 } },
    { id: 'fasting-prayer', title: 'Fasting & Prayer', type: 'Prayer',
      venue: 'CAC Good Works Assembly, Ijebu-ode', description: 'Corporate fast, last 3 days of every month.', rule: { kind: 'month-end-days', count: 3 } }
  ],
  languages: [
    ['en', 'English'], ['yo', 'Yorùbá'], ['ig', 'Igbo'], ['ha', 'Hausa'], ['fr', 'Français'], ['es', 'Español'],
    ['pt', 'Português'], ['ar', 'العربية'], ['sw', 'Kiswahili'], ['zh-CN', '中文'], ['hi', 'हिन्दी'], ['de', 'Deutsch']
  ]
};

/* Resolves when firebase.js has finished loading (or after 5s so pages never hang if the CDN is blocked). */
window.cacReady = new Promise(function (resolve) {
  if (window.CAC_BACKEND) return resolve();
  window.addEventListener('cac-backend-ready', resolve, { once: true });
  setTimeout(resolve, 5000);
});
