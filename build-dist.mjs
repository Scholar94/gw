#!/usr/bin/env node
/* Production build (CI only): copies the site to dist/ (git-ignored, so the repository stays flat), minifies JS and CSS, gives them
   content-hashed names (long cache lifetimes + instant updates), rewrites every reference, stamps the service-worker cache version, and
   adds the Content-Security-Policy as a <meta> tag (GitHub Pages cannot send headers; Cloudflare/Firebase hosting also send the real headers).
   Run:  python3 build-seo.py $SITE_URL && node build-dist.mjs      Output: ./dist */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { transformSync } from 'esbuild';

const OUT = 'dist', DEPLOY_EXT = /\.(html|css|js|woff2|webp|png|jpg|jpeg|svg|ico|json|xml|ics|txt)$/i;
const NEVER = /^(package(-lock)?\.json|csp\.json|firebase\.json|worker\.js|test-.*|build-.*|job-.*|backup-.*|wrangler\.toml|\.lighthouserc\.json|\.htmlvalidate\.json|tsconfig.*|firestore\..*|snap-.*|README.*|THIRD-PARTY.*|LICENSE.*|SECURITY\.md)$/i;
const files = readdirSync('.').filter(f => statSync(f).isFile() && (DEPLOY_EXT.test(f) || f === '_headers' || f === '_redirects') && !NEVER.test(f));
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT);
const hash = b => createHash('sha256').update(b).digest('hex').slice(0, 10);

/* 1. which JS/CSS files do pages load? (those get hashed; sw.js and everything fetched by name at runtime keep their names) */
const html = files.filter(f => f.endsWith('.html')), refd = new Set();
for (const f of html) for (const m of readFileSync(f, 'utf8').matchAll(/<(?:script[^>]*\bsrc|link[^>]*\bhref)="([^"#?]+\.(?:js|css))"/g)) if (!/^(https?:)?\/\//.test(m[1]) && files.includes(m[1])) refd.add(m[1]);
const map = {}, sizes = { before: 0, after: 0 };
for (const f of refd) {
  const src = readFileSync(f, 'utf8'), isCss = f.endsWith('.css');
  const min = transformSync(src, { loader: isCss ? 'css' : 'js', minify: true, target: 'es2022', legalComments: 'none' }).code;   // scripts stay scripts: top-level names used by data-on-* handlers are not renamed
  const name = f.replace(/\.(js|css)$/, `.${hash(min)}.$1`); map[f] = name; sizes.before += src.length; sizes.after += min.length; writeFileSync(`${OUT}/${name}`, min);
}
/* 2. everything else is copied (sw.js is minified and stamped) */
const csp = JSON.parse(readFileSync('csp.json', 'utf8'))['Content-Security-Policy'].split(';').map(s => s.trim()).filter(d => d && !/^(frame-ancestors|report-uri|sandbox)\b/.test(d)).join('; ');
const buildId = hash(Object.values(map).join('|') + html.map(f => readFileSync(f, 'utf8').length).join(','));
for (const f of files) {
  if (map[f]) continue;
  if (f === 'sw.js') {
    let s = transformSync(readFileSync(f, 'utf8'), { loader: 'js', minify: true, target: 'es2022' }).code;
    for (const [o, n] of Object.entries(map)) s = s.split(`"${o}"`).join(`"${n}"`).split(`'${o}'`).join(`'${n}'`);
    s = s.replace(/cac-v\d+/, 'cac-' + buildId); writeFileSync(`${OUT}/${f}`, s); continue;
  }
  if (f.endsWith('.html')) {
    let s = readFileSync(f, 'utf8');
    for (const [o, n] of Object.entries(map)) s = s.split(`"${o}"`).join(`"${n}"`);
    s = s.replace(/(<meta charset="[^"]*"\s*\/?>)/i, `$1\n<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}">`);
    if (!s.includes('http-equiv="Content-Security-Policy"')) throw new Error(f + ': no <meta charset> to anchor the CSP tag');
    writeFileSync(`${OUT}/${f}`, s); continue;
  }
  copyFileSync(f, `${OUT}/${f}`);
}
const gz = f => gzipSync(readFileSync(f)).length;
console.log(`dist/: ${files.length} files, ${Object.keys(map).length} JS/CSS hashed. Minified ${(sizes.before / 1024).toFixed(0)} KB -> ${(sizes.after / 1024).toFixed(0)} KB. Cache version cac-${buildId}.`);
