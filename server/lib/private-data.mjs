// Закрытые данные магазина: ссылки на платные материалы и промокоды.
// Файлы лежат в server/private/ (в git не попадают) и никогда не отдаются браузеру.
import { readFileSync, existsSync } from 'node:fs';

const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});

// «art-07» и «art-7» считаем одним артикулом
const normSku = (s) => String(s || '').trim().toLowerCase().replace(/^(art|video)-0+(\d)/, '$1-$2');

export function loadDigital(file) {
  const map = new Map(Object.entries(readJson(file)).map(([sku, v]) => [normSku(sku), v]));
  return {
    size: map.size,
    /** Для строк заказа возвращает ссылки на материалы и список названий, для которых ссылки нет. */
    itemsForLines(lines) {
      const items = [];
      const missing = [];
      for (const l of lines) {
        if (!l.digital) continue;
        const entry = map.get(normSku(l.sku));
        if (entry?.links?.length) items.push({ title: l.title, links: entry.links });
        else missing.push(l.title);
      }
      return { items, missing };
    }
  };
}

/**
 * Файл промокодов: { "WELCOME10": { "type": "percent", "value": 10, "minRub": 0, "until": "2026-12-31" } }
 * type: percent (скидка в процентах) или fixed (скидка в рублях).
 */
export function loadPromos(file) {
  const map = new Map(Object.entries(readJson(file)).map(([code, v]) => [code.trim().toUpperCase(), { ...v, code: code.trim().toUpperCase() }]));
  return {
    size: map.size,
    find(code, now = new Date()) {
      const p = map.get(String(code ?? '').trim().toUpperCase());
      if (!p) return null;
      if (p.until && new Date(`${p.until}T23:59:59`) < now) return null;
      if (!['percent', 'fixed'].includes(p.type) || !(p.value > 0)) return null;
      return p;
    }
  };
}
