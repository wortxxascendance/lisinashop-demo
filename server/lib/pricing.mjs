// Расчёт заказа в копейках (целые числа, без плавающей точки) и позиции для онлайн-чека.
import { OrderError } from './catalog.mjs';

export const kopToValue = (k) => (k / 100).toFixed(2);
export const kopToRub = (k) => `${(k / 100).toLocaleString('ru-RU', { minimumFractionDigits: k % 100 ? 2 : 0, maximumFractionDigits: 2 })} ₽`;

/** Делит целое число копеек пропорционально весам методом наибольших остатков. Сумма долей всегда равна total. */
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k][1]]++;
  return out;
}

/**
 * promo: { code, type: 'percent' | 'fixed', value, minRub? }
 * Скидка не может превысить сумму заказа за вычетом 1 копейки на каждую единицу товара.
 */
export function promoDiscount(subtotalKop, totalQty, promo) {
  if (!promo) return 0;
  if (promo.minRub && subtotalKop < promo.minRub * 100) {
    throw new OrderError(`Промокод действует при заказе от ${promo.minRub} ₽`, 'promo_min');
  }
  let d = promo.type === 'percent' ? Math.round((subtotalKop * promo.value) / 100) : Math.round(promo.value * 100);
  d = Math.min(d, subtotalKop - totalQty);
  return Math.max(0, d);
}

/** Итоги заказа. deliveryKop считается отдельно (СДЭК), здесь только применяется правило бесплатной доставки. */
export function computeTotals({ lines, promo, deliveryKop, freeShippingFromKop, deliveryKind }) {
  const subtotal = lines.reduce((s, l) => s + l.unitKop * l.qty, 0);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const discount = promoDiscount(subtotal, totalQty, promo);
  const goods = subtotal - discount;
  const physicalGoods = lines.some((l) => !l.digital);
  let delivery = 0;
  let freeDelivery = false;
  if (deliveryKind === 'cdek' && physicalGoods) {
    freeDelivery = goods >= freeShippingFromKop;
    delivery = freeDelivery ? 0 : Math.max(0, Math.round(deliveryKop));
  }
  return { subtotal, discount, goods, delivery, freeDelivery, total: goods + delivery };
}

/**
 * Позиции чека для ЮKassa. Скидка распределяется по строкам, каждая строка делится на единицы так,
 * чтобы цена единицы была в целых копейках, а сумма всех позиций в точности равнялась total.
 */
export function receiptItems({ lines, discountKop, deliveryKop, subjects }) {
  const lineTotals = lines.map((l) => l.unitKop * l.qty);
  const disc = allocate(discountKop, lineTotals);
  const items = [];
  lines.forEach((l, i) => {
    const t = lineTotals[i] - disc[i];
    const base = Math.floor(t / l.qty);
    const rem = t - base * l.qty;
    const subject = l.digital ? subjects.digital : subjects.goods;
    if (rem > 0) items.push({ description: l.title, qty: rem, unitKop: base + 1, subject });
    if (l.qty - rem > 0) items.push({ description: l.title, qty: l.qty - rem, unitKop: base, subject });
  });
  if (deliveryKop > 0) items.push({ description: 'Доставка СДЭК', qty: 1, unitKop: deliveryKop, subject: subjects.delivery });
  for (const it of items) {
    if (!(it.unitKop > 0)) throw new OrderError('Не удалось сформировать чек для этого заказа', 'receipt');
  }
  return items;
}
