#!/usr/bin/env node
// Generates static, JS-free SEO pages into dist/ after `vite build`.
// Run as part of `npm run build` (see package.json).
//
// - dist/region/<id>/index.html — one bilingual landing page per region
// - dist/privacy/index.html     — bilingual privacy policy
// - dist/sitemap.xml            — root + all generated pages
// - dist/robots.txt

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllRegions } from '../src/data/levels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.geodoodle.com';

// Minimal, self-contained day-theme CSS — same "Paper & Ink" tokens as
// src/styles/index.css. Uses the system font stack rather than loading
// Outfit, since these pages don't ship the app's font bundle.
const PAGE_CSS = `
:root {
  --bg-primary: #F9F8F6;
  --bg-secondary: #FFFFFF;
  --text-primary: #1C1C1E;
  --text-secondary: #6B7280;
  --border-color: rgba(28, 28, 30, 0.1);
  --radius-lg: 24px;
  --radius-full: 9999px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 2.5rem 1.25rem 4rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.6;
}
main { max-width: 640px; margin: 0 auto; }
a { color: inherit; }
a.back { color: var(--text-secondary); text-decoration: none; font-weight: 600; font-size: 0.9rem; }
h1 { font-size: 2rem; margin: 1.5rem 0 1rem; }
h1 .en { display: block; color: var(--text-secondary); font-weight: 400; font-size: 1.15rem; margin-top: 0.25rem; }
h2 { font-size: 1.1rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
p.fact { font-weight: 600; font-size: 1.1rem; }
hr { border: none; border-top: 1px solid var(--border-color); margin: 2.5rem 0; }
a.cta {
  display: inline-block;
  margin-top: 2rem;
  padding: 0.75rem 1.75rem;
  border-radius: var(--radius-full);
  background: var(--text-primary);
  color: var(--bg-primary);
  text-decoration: none;
  font-weight: 600;
}
`.trim();

// Google tag (gtag.js) — same snippet as index.html, kept in one place so
// it's not duplicated across every generated page.
const GTAG_SNIPPET = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-8BYQ9HJF28"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-8BYQ9HJF28');
</script>`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageShell({ title, description, canonical, bodyHtml }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${canonical}" />
<link rel="alternate" hreflang="tr" href="${canonical}" />
<link rel="alternate" hreflang="en" href="${canonical}" />
<link rel="alternate" hreflang="x-default" href="${canonical}" />
<style>${PAGE_CSS}</style>
${GTAG_SNIPPET}
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

// funFact only exists in Turkish in the source data (src/data/*.js) — there
// is no funFactEn field to regenerate from. Rather than show untranslated
// Turkish text under an "English" heading, the English section gets a
// templated (not literally translated) blurb instead.
function regionPage(region) {
  const name = escapeHtml(region.name);
  const nameEn = escapeHtml(region.nameEn);
  const fact = escapeHtml(region.funFact);
  const title = `${region.name} Sınırını Çiz | GeoDoodle — Draw the Border of ${region.nameEn}`;
  const canonical = `${SITE}/region/${region.id}/`;

  const body = `<main>
  <a class="back" href="${SITE}/">&larr; GeoDoodle</a>
  <h1>${name} Sınırını Çiz<span class="en">Draw the Border of ${nameEn}</span></h1>

  <section>
    <h2>Türkçe</h2>
    <p class="fact">${fact}</p>
    <p>${name} sınırını hafızandan ya da haritanın üzerinden geçerek çiz, çizimini gerçek sınırla karşılaştır ve doğruluk skorunu anında gör. GeoDoodle'da tamamen ücretsiz oyna.</p>
  </section>

  <hr />

  <section>
    <h2>English</h2>
    <p class="fact">Draw ${nameEn}'s border on GeoDoodle, a free geography drawing game.</p>
    <p>Trace ${nameEn}'s outline or draw it from memory, then compare your drawing to the real border and see your accuracy score instantly.</p>
  </section>

  <a class="cta" href="${SITE}/">GeoDoodle'da Oyna / Play on GeoDoodle</a>
</main>`;

  return pageShell({ title, description: region.funFact, canonical, bodyHtml: body });
}

function privacyPage() {
  const title = 'Gizlilik Politikası | GeoDoodle — Privacy Policy';
  const description = "GeoDoodle gizlilik politikası: hesap yok, ilerlemen yalnızca tarayıcında (localStorage) saklanır, kişisel veri toplanmaz.";
  const canonical = `${SITE}/privacy/`;
  const repoUrl = 'https://github.com/musaay/geodoodle';

  const body = `<main>
  <a class="back" href="${SITE}/">&larr; GeoDoodle</a>
  <h1>Gizlilik Politikası<span class="en">Privacy Policy</span></h1>

  <section>
    <h2>Türkçe</h2>
    <p>GeoDoodle'da hesap oluşturmazsın. İlerlemen (tamamlanan bölgeler, en iyi skorların, yıldızların, günlük seri sayacın) yalnızca kendi cihazının tarayıcısındaki yerel depolama alanında (localStorage) tutulur; hiçbir sunucuya gönderilmez.</p>
    <p>GeoDoodle bugün itibarıyla seni tanımlayan hiçbir kişisel veri toplamaz.</p>
    <p>Anonim kullanım istatistikleri (sayfa görüntülemeleri, oynanan oyunlar) için Google Analytics kullanıyoruz. Bu veriler Google tarafından işlenir ve çerezler kullanır; ancak bizim tarafımızdan seni tanımlayan hiçbir kişisel veri toplanmaz.</p>
    <p>Üçüncü taraf reklam hizmetleri kullanılmaya başlandığında bu sayfa güncellenecektir.</p>
    <p>Sorularınız için: <a href="${repoUrl}">${repoUrl}</a></p>
  </section>

  <hr />

  <section>
    <h2>English</h2>
    <p>GeoDoodle does not require an account. Your progress (completed regions, best scores, stars, daily streak) is stored only in your device's browser local storage (localStorage) and is never sent to a server.</p>
    <p>As of today, GeoDoodle does not collect any personally identifying data.</p>
    <p>We use Google Analytics for anonymous usage statistics (page views, game plays). This data is processed by Google and involves cookies; however, no personally identifying data is collected by us.</p>
    <p>This page will be updated if and when third-party advertising services are introduced.</p>
    <p>Questions: <a href="${repoUrl}">${repoUrl}</a></p>
  </section>

  <a class="cta" href="${SITE}/">GeoDoodle'a Dön / Back to GeoDoodle</a>
</main>`;

  return pageShell({ title, description, canonical, bodyHtml: body });
}

function writeFile(relPath, content) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error('dist/ not found — run `vite build` first.');
    process.exit(1);
  }

  const regions = getAllRegions();

  for (const region of regions) {
    writeFile(`region/${region.id}/index.html`, regionPage(region));
  }
  writeFile('privacy/index.html', privacyPage());

  const urls = [
    `${SITE}/`,
    `${SITE}/privacy/`,
    ...regions.map((r) => `${SITE}/region/${r.id}/`),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
  writeFile('sitemap.xml', sitemap);

  const robots = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
  writeFile('robots.txt', robots);

  console.log(`Generated ${regions.length} region pages, privacy page, sitemap.xml, robots.txt`);
}

main();
