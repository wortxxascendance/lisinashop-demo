// Сборка «пробной» версии для страницы Tilda: docs/tilda/ls-tilda.js
// Запускается после демо-сборки (npm run build:demo делает обе), потому что берёт файлы из docs/.
// На странице Tilda достаточно одного HTML-блока (T123) со строкой:
//   <script src="https://wortxxascendance.github.io/lisinashop-demo/tilda/ls-tilda.js"></script>
// и блока корзины Tilda: оформление, доставка СДЭК и оплата остаются тильдовскими.
// Параметры: --public https://адрес/папки/  (где лежит демо-сборка, по умолчанию GitHub Pages)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const i = args.indexOf('--public');
const PUB = (i >= 0 ? args[i + 1] : 'https://wortxxascendance.github.io/lisinashop-demo/').replace(/\/?$/, '/');
const DOCS = join(ROOT, 'docs');

const ver = async (rel) => createHash('sha1').update(await readFile(join(DOCS, rel))).digest('hex').slice(0, 8);

// Стили поверх Tilda: прячем её шапку, подвал и значок корзины, перекрашиваем окно корзины под фирменный стиль
const TILDA_CSS = `
#t-header, #t-footer { display: none !important; }
.t706__carticon { display: none !important; }
.t706__cartpage, .t706__cartwin, .t706__sidebar { font-family: "Golos Text", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif !important; color: #171214; }
.t706__cartpage-heading, .t706__cartwin-heading, .t706__sidebar-heading { font-family: "Oranienbaum", "Times New Roman", serif !important; font-weight: 400 !important; }
.t706 .t-submit, .t706 .t-btnflex, .t706 .t-btn, .t706__sidebar-continue, .t706__cartpage-open-form { background: #171214 !important; color: #fff !important; border: 0 !important; border-radius: 999px !important; }
.t706 .t-submit:hover, .t706 .t-btnflex:hover, .t706 .t-btn:hover, .t706__sidebar-continue:hover, .t706__cartpage-open-form:hover { background: #a8536e !important; }
.t706 .t-input { border: 1px solid #e8dddb !important; border-radius: 14px !important; background: #fff !important; }
.t706 .t-input:focus { border-color: #171214 !important; }
`;

function markupFromIndex(html) {
  const start = html.indexOf('<body>') + '<body>'.length;
  const end = html.indexOf('<script src="/assets/vendor/lenis.min.js"');
  if (start < 6 || end < 0) throw new Error('Не удалось найти разметку в index.html');
  return html
    .slice(start, end)
    .replace(/href="\/"/g, 'href="#/"')
    .replace(/href="\/(?!\/)([^"]*)"/g, 'href="#/$1"')
    .replace(/src="\/(?!\/)([^"]*)"/g, `src="${PUB}$1"`)
    .trim();
}

async function main() {
  const index = await readFile(join(ROOT, 'index.html'), 'utf8');
  const markup = markupFromIndex(index);
  const css = `${PUB}assets/styles.css?v=${await ver('assets/styles.css')}`;
  const scripts = [
    `${PUB}data/products.js?v=${await ver('data/products.js')}`,
    `${PUB}data/pages.js?v=${await ver('data/pages.js')}`,
    `${PUB}assets/app.js?v=${await ver('assets/app.js')}`
  ];

  const loader = `/* LisinaShop: пробная версия нового дизайна внутри страницы Tilda. Создан tools/build-tilda.mjs */
(function () {
  'use strict';
  if (window.__LS_TILDA) return;
  window.__LS_TILDA = true;
  window.LS_MODE = 'tilda';
  window.LS_ROUTING = 'hash';
  window.LS_BASE = '/';
  window.LS_ASSET_BASE = ${JSON.stringify(PUB)};
  window.LS_API = '';
  window.LS_SITE = '';
  var d = document, de = d.documentElement;
  de.classList.add('js');
  try { if (sessionStorage.getItem('ls_intro')) de.classList.add('no-intro'); } catch (e) {}
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) de.classList.add('no-intro');

  var st = d.createElement('style');
  st.textContent = ${JSON.stringify(TILDA_CSS)};
  d.head.appendChild(st);
  var fonts = d.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=Oranienbaum&display=swap';
  d.head.appendChild(fonts);

  var SCRIPTS = ${JSON.stringify(scripts)};
  function loadScripts(i) {
    if (i >= SCRIPTS.length) return;
    var s = d.createElement('script');
    s.src = SCRIPTS[i];
    s.onload = function () { loadScripts(i + 1); };
    s.onerror = function () { console.error('[LisinaShop] не загрузился файл', SCRIPTS[i]); };
    d.body.appendChild(s);
  }
  function mount() {
    var root = d.createElement('div');
    root.id = 'ls-root';
    root.innerHTML = ${JSON.stringify(markup)};
    d.body.insertBefore(root, d.body.firstChild);
    loadScripts(0);
  }
  // сначала стили, потом разметка: так страница не мигнёт без оформления
  var link = d.createElement('link');
  link.rel = 'stylesheet';
  link.href = ${JSON.stringify(css)};
  var started = false;
  function start() { if (started) return; started = true; if (d.body) mount(); else d.addEventListener('DOMContentLoaded', mount); }
  link.onload = start;
  link.onerror = start;
  setTimeout(start, 4000);
  d.head.appendChild(link);
})();
`;
  await mkdir(join(DOCS, 'tilda'), { recursive: true });
  await writeFile(join(DOCS, 'tilda/ls-tilda.js'), loader);
  console.log(`[build-tilda] docs/tilda/ls-tilda.js готов (${(loader.length / 1024).toFixed(0)} КБ), файлы берутся с ${PUB}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
