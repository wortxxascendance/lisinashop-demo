// Импорт каталога из магазина Tilda (публичный API витрины) в data/products.json + data/products.js.
// Запуск: npm run import:tilda [-- --images]   (--images докачивает недостающие фото в assets/img/p)
// Пока сайт на Tilda, скрипт можно запускать повторно: каталог синхронизируется.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://store.tildaapi.com/api/getproductslist/';

// Группы товаров Tilda (storepartuid) -> раздел сайта и подраздел.
// Порядок важен: товар попадает в основной раздел первой найденной группы,
// остальные вхождения добавляются как дополнительные.
const PARTS = [
  ['870102572382', 'prof', 'Колор-добавки'],
  ['607263580471', 'home', 'Уход за волосами'],
  ['451135886322', 'home', 'Рост волос'],
  ['137248273552', 'home', 'Мисты для волос'],
  ['724367431762', 'home', 'Cloud of love'],
  ['897377975092', 'home', 'Тело и руки'],
  ['926658578592', 'prof', 'Профессиональная линия'],
  ['795663430411', 'badi', 'Боксы'],
  ['838877989631', 'badi', 'Основы'],
  ['957178389161', 'badi', 'Профессиональные активы'],
  ['929553320771', 'badi', 'Увлажняющие активы'],
  ['193185097271', 'badi', 'Протеины и аминокислоты'],
  ['795498095471', 'badi', 'Липиды и церамиды'],
  ['352549965931', 'badi', 'Силиконы и кондиционеры'],
  ['633110686221', 'badi', 'ПАВ и эмульгаторы'],
  ['934719894231', 'badi', 'Масла'],
  ['194568811531', 'badi', 'Экстракты'],
  ['891778197451', 'badi', 'Консерванты и загустители'],
  ['315090565642', 'rezept', 'Сборники и протоколы']
];

const KEEP = ['PILULYA', 'PROFESSIONAL', 'INCI', 'PRODEW', 'BADD', 'FLOCARE', 'DM', 'ReparAge', 'СДЭК'];
const num = (s) => Number(String(s ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
const text = (h) => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const ALLOWED = ['strong', 'b', 'br', 'ul', 'ol', 'li', 'em', 'i', 'u', 'p'];
const clean = (h) =>
  String(h ?? '')
    .replace(/<(\/?)(\w+)[^>]*>/g, (m, c, t) => {
      t = t.toLowerCase();
      return ALLOWED.includes(t) ? `<${c}${t === 'b' ? 'strong' : t}>` : '';
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .trim();

// Заголовки, набранные ЗАГЛАВНЫМИ, приводим к обычному регистру
function fixCase(t) {
  const letters = t.replace(/[^A-Za-zА-Яа-яЁё]/g, '');
  const upper = letters.replace(/[^A-ZА-ЯЁ]/g, '').length;
  if (letters.length < 6 || upper / letters.length < 0.7) return t;
  let r = t.toLowerCase();
  r = r.charAt(0).toUpperCase() + r.slice(1);
  r = r.replace(/«(.)/g, (m, c) => '«' + c.toUpperCase());
  r = r.replace(/\. (.)/g, (m, c) => '. ' + c.toUpperCase());
  for (const k of KEEP) r = r.replace(new RegExp(k, 'gi'), k);
  return r;
}

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
function slugify(title) {
  const s = title
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= 64) return s;
  const cut = s.slice(0, 64);
  return cut.slice(0, Math.max(cut.lastIndexOf('-'), 24));
}

async function getPart(uid) {
  const url = `${API}?storepartuid=${uid}&getparts=true&getoptions=true&slice=1&size=100`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 lisinashop-import' } });
  if (!res.ok) throw new Error(`Tilda API ${uid}: HTTP ${res.status}`);
  return res.json();
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  const withImages = process.argv.includes('--images');
  const byId = new Map();
  const images = new Map();
  let order = 0;

  for (const [part, cat, sub] of PARTS) {
    const json = await getPart(part);
    for (const x of json.products ?? []) {
      const id = String(x.uid);
      if (byId.has(id)) {
        const p = byId.get(id);
        if (!p.in.some((e) => e[0] === cat && e[1] === sub)) p.in.push([cat, sub]);
        continue;
      }
      let gallery = [];
      try { gallery = JSON.parse(x.gallery || '[]').map((o) => o.img).filter(Boolean); } catch { /* пустая галерея */ }
      const local = gallery.slice(0, 3).map((u, i) => {
        const f = `assets/img/p/${id}${i ? '-' + i : ''}.webp`;
        images.set(f, u);
        return f;
      });

      let opts = null;
      try {
        const o = JSON.parse(x.json_options || 'null');
        if (o?.[0] && x.editions?.length > 1) {
          const t = o[0].title;
          opts = { title: t, values: x.editions.map((e) => ({ label: e[t], sku: e.sku || '', price: num(e.price), old: num(e.priceold), qty: num(e.quantity) })) };
        }
      } catch { /* без вариантов */ }

      const ed0 = x.editions?.[0] ?? {};
      const title = fixCase(text(x.title).replace(/PROFFESSIONAL/g, 'PROFESSIONAL'));
      byId.set(id, {
        id,
        sku: String(x.sku || '').trim(),
        title,
        cat,
        sub,
        in: [[cat, sub]],
        price: num(x.price),
        old: num(x.priceold),
        qty: num(x.quantity ?? ed0.quantity),
        mark: x.mark || '',
        short: text(x.descr),
        html: clean(x.text),
        images: local,
        opts,
        weight: num(x.pack_m ?? ed0.pack_m),
        oldPath: x.url ? new URL(x.url).pathname : '',
        order: order++
      });
    }
  }

  // Уникальные читаемые адреса: /product/<slug>/
  const used = new Set();
  for (const p of byId.values()) {
    let s = slugify(p.title) || `item-${p.id}`;
    if (used.has(s)) s = `${s}-${p.id.slice(0, 4)}`;
    used.add(s);
    p.slug = s;
  }

  const list = [...byId.values()];
  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(join(ROOT, 'data/products.json'), JSON.stringify(list));
  await writeFile(
    join(ROOT, 'data/products.js'),
    '/* Каталог LisinaShop. Создан tools/import-tilda.mjs, вручную не править */\nwindow.LS_PRODUCTS = ' + JSON.stringify(list) + ';\n'
  );
  console.log(`Товаров: ${list.length}, фото: ${images.size}`);

  if (withImages) {
    const { default: sharp } = await import('sharp');
    let done = 0;
    for (const [f, u] of images) {
      const out = join(ROOT, f);
      if (await exists(out)) continue;
      const m = u.match(/static\.tildacdn\.com\/([^/]+)\/(.+)$/);
      const src = m ? `https://thb.tildacdn.com/${m[1]}/-/resize/720x/${m[2]}` : u;
      const res = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!res.ok) { console.warn('не скачалось', f, res.status); continue; }
      await mkdir(dirname(out), { recursive: true });
      await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
      done++;
    }
    console.log(`Докачано фото: ${done}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
