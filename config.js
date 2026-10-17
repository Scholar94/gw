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
  youtubeChannelId: '',
  youtubeChannelUrl: 'https://youtube.com/@CACGoodWorks',
  // Social links: add the real URL to show an icon; leave '' to hide it (no dead links).
  social: { facebook: '', youtube: 'https://youtube.com/@CACGoodWorks', instagram: '', tiktok: '', x: '' },
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
