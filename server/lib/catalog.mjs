// Каталог на стороне сервера. Цены и названия берутся ТОЛЬКО отсюда, из браузера им доверять нельзя.
import { readFileSync } from 'node:fs';

export class OrderError extends Error {
  constructor(message, code = 'bad_request', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function optionLabel(p, v) {
  const unit = /вес/i.test(p.opts.title) ? ' г' : /объ/i.test(p.opts.title) ? ' мл' : '';
  return `${v.label}${unit}`;
}

export function loadCatalog(file) {
  const list = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(list.map((p) => [String(p.id), p]));

  function resolveLine(item) {
    const p = byId.get(String(item?.id));
    if (!p) throw new OrderError('Товар не найден в каталоге', 'unknown_product');
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new OrderError('Неверное количество товара', 'bad_qty');
    let opt = 0;
    let variant = null;
    if (p.opts) {
      opt = Number.isInteger(item.opt) ? item.opt : 0;
      variant = p.opts.values[opt];
      if (!variant) throw new OrderError('Неверный вариант товара', 'bad_option');
    }
    const unitKop = Math.round((variant ? variant.price : p.price) * 100);
    if (!(unitKop > 0)) throw new OrderError('У товара не указана цена', 'no_price');
    return {
      id: String(p.id),
      opt,
      qty,
      title: variant ? `${p.title} (${p.opts.title}: ${optionLabel(p, variant)})` : p.title,
      unitKop,
      sku: (variant && variant.sku) || p.sku || '',
      digital: p.cat === 'rezept',
      weightG: Number(p.weight) || 0
    };
  }

  /** Превращает корзину из браузера в проверенные строки. Одинаковые позиции склеиваются. */
  function resolveLines(items) {
    if (!Array.isArray(items) || items.length === 0) throw new OrderError('Корзина пуста', 'empty_cart');
    if (items.length > 60) throw new OrderError('Слишком много позиций в заказе', 'too_many_items');
    const merged = new Map();
    for (const item of items) {
      const line = resolveLine(item);
      const key = `${line.id}:${line.opt}`;
      const prev = merged.get(key);
      if (prev) {
        prev.qty += line.qty;
        if (prev.qty > 99) throw new OrderError('Неверное количество товара', 'bad_qty');
      } else merged.set(key, line);
    }
    return [...merged.values()];
  }

  return { list, byId, resolveLine, resolveLines };
}
