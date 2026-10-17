# CAC Good Works Assembly: Website

Static site (HTML/CSS/JS) + Firebase (Auth, Firestore, Storage). No build step.

## Pages
Home · About · Ministries · **Daily Devotional** · Sermons · **Events & Calendar** · Gallery · **Give** · Contact · **Plan a Visit** · **Testimonies** · **Impact** · Admin (`admin-login.html`).
A floating **language picker** (12 languages incl. Yorùbá, Igbo, Hausa, Arabic with RTL) is on every public page.

## Go live (one-time Firebase setup)
1. Create a Firebase project → add a Web app → paste the config into `firebase.js`.
2. Enable **Authentication → Email/Password** and **Firestore** (free Spark plan). **Do not enable Storage** unless you choose a paid plan: audio/gallery in the admin accept a pasted link instead (e.g. archive.org for audio, YouTube for video).
3. Create your admin user (Authentication tab), then in Firestore create `admins/{that user's UID}` with `{ role: "super" }`
   (roles: `super`, `editor` = content, `pastoral` = prayer requests/visitors). Admins can't be created from the website.
4. Deploy rules + indexes: `firebase deploy --only firestore` (add `,storage` only if you enabled Storage).
5. Host with `firebase deploy --only hosting` (or any static host).
6. **Scheduled publishing + feeds (free, no card):** in GitHub → Settings → Secrets, add `FIREBASE_SERVICE_ACCOUNT` (Firebase console → Project settings → Service accounts → Generate new private key; paste the JSON) and, under Variables, `SITE_URL` (e.g. `https://yourchurch.org`). `.github/workflows/daily.yml` then runs daily at 00:05 Lagos time: it publishes scheduled devotionals and regenerates `devotionals.xml` (RSS) and `calendar.ics` (subscribable calendar). Never commit the key. Without the secret, only the static recurring calendar is produced, and scheduled devotionals are still promoted whenever an admin opens the Devotionals panel.

Until step 1 is done, public pages run in **preview mode**: forms say they're not connected (they never fake success) and the admin area is locked.

## Events & calendar
Regular services are defined in `config.js` (`series`). Special events come from Firestore (Admin → Events; start/end time, multi-day).
Visitors can add one event, ticked events, all shown events or the full recurring calendar to Google / Outlook / Yahoo / Apple (`.ics`). Times are stored in Lagos time and displayed in the visitor's own timezone too.

## Everything here is free and needs no credit card
| Need | Free solution used |
|---|---|
| Database + admin login | Firebase **Spark** plan (Firestore + Authentication) |
| Scheduled publishing, RSS, subscribable calendar | **GitHub Actions** (`daily.yml`) |
| Hosting | Firebase Hosting (Spark), Cloudflare Pages, or GitHub Pages* |
| Audio / images | Paste a link (archive.org, GitHub + jsDelivr); video via YouTube |
| Reminders instead of push notifications | A repeating event in the visitor's own calendar |
| Backups | Admin → Backup (JSON/CSV download) |
| Translation, fonts, icons | Google Website Translator (only when chosen), self-hosted fonts/icons |

\*GitHub Pages cannot send custom security headers, so the CSP in `_headers`/`firebase.json` only applies on Firebase Hosting or Cloudflare Pages. Prefer one of those.
Not free / avoided: Cloud Functions, Firebase Storage (new projects), SMS/email sending services, true push notifications (they need a paid server).

## Development
```bash
npm install --legacy-peer-deps          # dev tooling only; the site itself has no build step
python3 tools/build_pages.py            # regenerates new pages + shared nav/footer/scripts (run FIRST)
python3 tools/build_seo.py https://YOUR-DOMAIN   # canonical/OG tags, sitemap.xml, robots.txt (run AFTER build_pages)
python3 tools/build_icons.py            # re-subsets Font Awesome after you add a new icon (needs: pip install fonttools brotli)
```
Fonts and icons are **self-hosted** (`assets/`), so the site makes no request to Google Fonts or a CDN. Edit church details, services, social links and the YouTube channel ID in `config.js`.

## Tests (247 browser checks, 34 unit, 62 rules)
- `npm run test:unit`: calendar/ICS engine.
- `npm run test:e2e`: headless-browser suite (needs `pip install playwright && playwright install chromium`): pages, events + calendar export, devotionals, forms, translator, SEO, icons, dead links, layout shift, anchors.
- `npm run test:rules`: Firestore security rules against the emulator (needs Java). **Run in CI; not yet run by the author.**
- `npm run lint:html`: html-validate (0 errors).
- CI: `.github/workflows/ci.yml` runs all of the above plus Lighthouse CI (accessibility and SEO must stay >= 0.9).

## Security headers
`_headers` (Cloudflare Pages/Netlify) and `firebase.json` (Firebase Hosting) ship a Content-Security-Policy, HSTS, nosniff, referrer and permissions policies. The CSP currently allows `'unsafe-inline'` scripts because the pages use inline handlers; moving them to external files would allow a strict CSP.

## Known limits / next phase
- **Google Drive**: not wired. A static site can't hold Drive credentials safely. It needs Cloud Functions with a service account. Admin can paste Drive/https links for PDFs/images meanwhile.
- **Online giving**: no payment provider connected (only bank details). Add Paystack/Flutterwave verification via a Cloud Function.
- Devotional bookmarks/notes/streaks are stored **on the visitor's device** (private), not synced to accounts.
- Rate limiting is client-side cooldown + strict Firestore rules; add Firebase App Check for stronger abuse protection.
- Translation uses Google's free Website Translator (machine translation; loads only after a visitor picks a language).
