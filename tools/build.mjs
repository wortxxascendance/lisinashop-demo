// Сборка сайта. Запуск: npm run build  (боевая версия в dist/)  или  npm run build:demo  (демо для GitHub Pages в docs/)
// Что делает:
//  1. собирает data/pages.js из content/ (юридические страницы);
//  2. копирует сайт в папку сборки и добавляет ?v=хэш к скриптам и стилям, чтобы их можно было кешировать надолго;
//  3. открывает каждую страницу в браузере без интерфейса и сохраняет готовый HTML (поисковики видят товары и тексты сразу);
//  4. пишет sitemap.xml, robots.txt, 404.html и список редиректов со старых адресов Tilda.
// Параметры: --demo  --no-prerender  --out папка  --base /папка/  --site https://адрес
// Для шага 3 нужен Chrome или Edge (путь можно задать переменной CHROME_PATH).
import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const DEMO = has('--demo');
const OUT = join(ROOT, val('--out', DEMO ? 'docs' : 'dist'));
const BASE = val('--base', DEMO ? '/lisinashop-demo/' : '/');
const SITE = String(val('--site', process.env.SITE_URL || (DEMO ? 'https://wortxxascendance.github.io' : 'https://lisinashop.ru'))).replace(/\/+$/, '');
const API = DEMO ? '' : '/api';
const PRERENDER = !has('--no-prerender');

const CATS = ['prof', 'home', 'badi', 'rezept', 'sale'];
const PAGE_ROUTES = ['delivery', 'oferta', 'politika', 'politika-konfidenczialnosti', 'garant', 'contacts'];
const NOINDEX_ROUTES = ['checkout', 'favorites', 'order'];

const log = (...a) => console.log('[build]', ...a);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- 1. Страницы из content/ ----------
async function buildPagesData() {
  const meta = JSON.parse(await readFile(join(ROOT, 'content/pages.json'), 'utf8'));
  const pages = {};
  for (const [slug, m] of Object.entries(meta)) {
    pages[slug] = { title: m.title, description: m.description };
    if (m.file) pages[slug].html = await readFile(join(ROOT, 'content/pages', m.file), 'utf8');
  }
  await writeFile(join(ROOT, 'data/pages.js'), '/* Создан tools/build.mjs из content/, вручную не править */\nwindow.LS_PAGES = ' + JSON.stringify(pages) + ';\n');
  return pages;
}

// ---------- 2. Копирование и версии файлов ----------
const hashOf = async (file) => createHash('sha1').update(await readFile(file)).digest('hex').slice(0, 8);

async function copySite() {
  if (!OUT.startsWith(ROOT + sep) || OUT === ROOT) throw new Error(`Опасная папка сборки: ${OUT}`);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'data'), { recursive: true });
  await cp(join(ROOT, 'assets'), join(OUT, 'assets'), { recursive: true });
  await cp(join(ROOT, 'data/products.js'), join(OUT, 'data/products.js'));
  await cp(join(ROOT, 'data/pages.js'), join(OUT, 'data/pages.js'));
  await writeFile(join(OUT, 'assets/site-config.js'),
    `/* Создан tools/build.mjs */\nwindow.LS_BASE = ${JSON.stringify(BASE)};\nwindow.LS_SITE = ${JSON.stringify(SITE)};\nwindow.LS_API = ${JSON.stringify(API)};\n`);
}

async function makeTemplate() {
  let html = await readFile(join(ROOT, 'index.html'), 'utf8');
  if (BASE !== '/') html = html.replace(/(href|src)="\/(?!\/)/g, `$1="${BASE}`);
  const versioned = new RegExp(`((?:href|src)=")(${BASE.replace(/\//g, '\\/')})((?:assets\\/[^"?]+\\.(?:css|js))|(?:data\\/[^"?]+\\.js))"`, 'g');
  const found = new Set();
  for (const m of html.matchAll(versioned)) found.add(m[3]);
  for (const rel of found) {
    const v = await hashOf(join(OUT, rel));
    html = html.split(`${BASE}${rel}"`).join(`${BASE}${rel}?v=${v}"`);
  }
  if (DEMO) html = html.replace('<meta name="viewport"', '<meta name="robots" content="noindex, nofollow">\n<meta name="viewport"');
  return html;
}

// ---------- 3. Предварительная отрисовка ----------
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  for (const n of ['google-chrome', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [n], { encoding: 'utf8' }).trim(); } catch { /* не найден */ }
  }
  throw new Error('Не найден Chrome или Edge. Установите его или задайте CHROME_PATH, либо соберите без предварительной отрисовки: --no-prerender');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
function startPreviewServer(template) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const u = new URL(req.url, 'http://x');
      if (!u.pathname.startsWith(BASE)) { res.writeHead(404).end(); return; }
      const rel = decodeURIComponent(u.pathname.slice(BASE.length));
      const file = normalize(join(OUT, rel));
      if (file.startsWith(OUT + sep) && rel && extname(rel)) {
        try { const b = await readFile(file); res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(b); return; } catch { res.writeHead(404).end(); return; }
      }
      res.writeHead(200, { 'content-type': MIME['.html'] }).end(template); // любой адрес без расширения: оболочка сайта
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function prerender(template, routes) {
  const { default: puppeteer } = await import('puppeteer-core');
  const server = await startPreviewServer(template);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const results = new Map();
  const queue = [...routes];
  const errors = [];

  async function worker() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(() => { window.LS_PRERENDER = true; });
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith(origin) ? r.continue() : r.abort()));
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
    while (queue.length) {
      const route = queue.shift();
      try {
        await page.goto(`${origin}${BASE}${route}`, { waitUntil: 'load' });
        await page.waitForFunction('window.__lsRendered === true', { timeout: 20000 });
        results.set(route, await page.evaluate(() => ({
          title: document.title,
          head: [...document.head.querySelectorAll('meta[name="description"],link[rel="canonical"],meta[property^="og:"],meta[data-dyn],script[type="application/ld+json"]')].map((e) => e.outerHTML).join('\n'),
          app: document.getElementById('app').innerHTML
        })));
      } catch (e) { errors.push(`${route}: ${e.message}`); }
    }
    await page.close();
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  await browser.close();
  server.close();
  if (errors.length) { console.error(errors.join('\n')); throw new Error(`Ошибки при отрисовке страниц: ${errors.length}`); }
  return results;
}

function pageHtml(template, data) {
  return template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(data.title)}</title>`)
    .replace('</head>', () => `${data.head}\n</head>`)
    .replace('<main id="app" tabindex="-1"></main>', () => `<main id="app" tabindex="-1">${data.app}</main>`);
}

// ---------- 4. sitemap, robots, редиректы ----------
async function writeSeoFiles(products) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = ['', 'catalog/', ...CATS.map((c) => `catalog/${c}/`), ...PAGE_ROUTES.map((p) => `${p}/`), ...products.map((p) => `product/${p.slug}/`)];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${SITE}${BASE}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n';
  await writeFile(join(OUT, 'sitemap.xml'), xml);
  const robots = DEMO
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\n${NOINDEX_ROUTES.map((r) => `Disallow: /${r}/`).join('\n')}\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`;
  await writeFile(join(OUT, 'robots.txt'), robots);
  if (DEMO) await writeFile(join(OUT, '.nojekyll'), '');
}

async function writeRedirects(products) {
  const fixed = [
    ['/pilulya_prof', '/catalog/prof/'], ['/pilulya', '/catalog/home/'], ['/badi', '/catalog/badi/'], ['/akzia', '/catalog/sale/'],
    ['/rezept', '/catalog/rezept/'], ['/payment', '/delivery/'], ['/contakt', '/contacts/']
  ];
  const lines = ['# Создан tools/build.mjs. Подключите внутри server { } командой include (см. deploy/README.md).', '# Старые адреса Tilda -> новые адреса, ответ 301, чтобы не потерять позиции в поиске.'];
  for (const [from, to] of fixed) lines.push(`location = ${from} { return 301 ${to}; }`);
  for (const p of products) {
    if (p.oldPath && p.oldPath.startsWith('/')) lines.push(`location = ${p.oldPath} { return 301 /product/${p.slug}/; }`);
  }
  await mkdir(join(ROOT, 'deploy'), { recursive: true });
  await writeFile(join(ROOT, 'deploy/redirects.generated.conf'), lines.join('\n') + '\n');
  return lines.length - 2;
}

// ---------- запуск ----------
async function main() {
  const t0 = Date.now();
  const products = JSON.parse(await readFile(join(ROOT, 'data/products.json'), 'utf8'));
  await buildPagesData();
  await copySite();
  const template = await makeTemplate();
  await writeFile(join(OUT, 'index.html'), template);
  log(`режим: ${DEMO ? 'демо' : 'боевая версия'}, base ${BASE}, сайт ${SITE}, папка ${OUT.replace(ROOT, '.')}`);

  const routes = ['', 'catalog/', ...CATS.map((c) => `catalog/${c}/`), ...PAGE_ROUTES.map((p) => `${p}/`), 'checkout/', 'favorites/', 'order/', ...products.map((p) => `product/${p.slug}/`), '__not-found__/'];
  if (PRERENDER) {
    log(`предварительная отрисовка: ${routes.length} страниц…`);
    const results = await prerender(template, routes);
    for (const [route, data] of results) {
      const html = pageHtml(template, data);
      if (route === '__not-found__/') {
        // у страницы 404 нет собственного адреса, поэтому canonical и og:url не нужны
        await writeFile(join(OUT, '404.html'), html.replace(/<link rel="canonical"[^>]*>\n?/, '').replace(/<meta property="og:url"[^>]*>\n?/, ''));
      }
      else {
        const dir = join(OUT, route);
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, 'index.html'), html);
      }
    }
  } else {
    log('предварительная отрисовка пропущена (--no-prerender): страницы откроются через оболочку сайта');
    await writeFile(join(OUT, '404.html'), template);
  }
  await writeSeoFiles(products);
  if (!DEMO) log(`редиректов со старых адресов: ${await writeRedirects(products)} (deploy/redirects.generated.conf)`);
  const files = (await readdir(OUT, { recursive: true })).length;
  log(`готово за ${((Date.now() - t0) / 1000).toFixed(1)} с, файлов: ${files}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
