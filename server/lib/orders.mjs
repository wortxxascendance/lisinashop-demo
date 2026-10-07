// Сервис заказов: расчёт, оформление, оплата (ЮKassa), уведомления, повторные попытки.
import { randomUUID } from 'node:crypto';
import { OrderError } from './catalog.mjs';
import { computeTotals, receiptItems, kopToValue } from './pricing.mjs';
import { parseCustomer, parseDelivery, parseComment, CDEK_METHODS } from './validate.mjs';
import { orderTelegramText } from './notify.mjs';

const HOUR = 3_600_000;

export function createOrderService({ cfg, db, catalog, digital, promos, yookassa, cdek, telegram, mailer, log = console }) {
  const lastSync = new Map();

  function resolvePromo(code) {
    if (!code) return null;
    const p = promos.find(code);
    if (!p) throw new OrderError('Промокод не найден или срок его действия закончился', 'promo_invalid');
    return p;
  }

  function weightOf(lines) {
    return lines.filter((l) => !l.digital).reduce((s, l) => s + (l.weightG || cfg.cdek.defaultWeightG) * l.qty, 0);
  }

  async function deliveryQuote(lines, d) {
    if (cdek && cfg.features.cdek) {
      try {
        const q = await cdek.quote({ toCityCode: Number(d.cityCode), method: d.method, weightG: weightOf(lines) });
        return { kind: 'cdek', kop: q.sumKop, daysMin: q.daysMin, daysMax: q.daysMax };
      } catch (e) {
        log.error?.(`[cdek] ${e.message}`);
        throw new OrderError('Не удалось рассчитать доставку СДЭК. Попробуйте ещё раз или выберите самовывоз', 'delivery_failed', 502);
      }
    }
    if (cfg.cdek.flatRub > 0) return { kind: 'cdek', kop: cfg.cdek.flatRub * 100, daysMin: null, daysMax: null };
    throw new OrderError('Расчёт доставки сейчас недоступен. Выберите самовывоз или напишите нам', 'delivery_unavailable', 503);
  }

  /** Считает итоги заказа (корзина, промокод, доставка). Цены берутся из каталога на сервере. */
  async function quote(input) {
    const lines = catalog.resolveLines(input?.items);
    const promo = resolvePromo(input?.promo);
    const physical = lines.some((l) => !l.digital);
    const d = input?.delivery ?? {};
    let ship = { kind: 'none', kop: 0 };
    if (physical && d.method === 'pickup') ship = { kind: 'pickup', kop: 0 };
    else if (physical && CDEK_METHODS.includes(d.method) && Number(d.cityCode) > 0) {
      const preview = computeTotals({ lines, promo, deliveryKop: 0, freeShippingFromKop: cfg.freeShippingFromKop, deliveryKind: 'cdek' });
      ship = preview.freeDelivery ? { kind: 'cdek', kop: 0 } : await deliveryQuote(lines, d);
    }
    const totals = computeTotals({ lines, promo, deliveryKop: ship.kop, freeShippingFromKop: cfg.freeShippingFromKop, deliveryKind: ship.kind === 'cdek' ? 'cdek' : 'none' });
    return {
      ...totals,
      physical,
      deliveryReady: !physical || ship.kind !== 'none',
      deliveryDays: ship.daysMin != null ? [ship.daysMin, ship.daysMax] : null,
      promo: promo ? { code: promo.code } : null,
      lines: lines.map((l) => ({ id: l.id, opt: l.opt, qty: l.qty, title: l.title, unitKop: l.unitKop }))
    };
  }

  async function createOrder(input) {
    if (!cfg.features.payments) throw new OrderError('Оплата на сайте временно недоступна. Напишите нам в Telegram @piiilulya', 'payments_off', 503);
    const lines = catalog.resolveLines(input?.items);
    const customer = parseCustomer(input?.customer);
    const physical = lines.some((l) => !l.digital);
    const deliveryInfo = parseDelivery(input?.delivery, { physical });
    if (input?.consent !== true) throw new OrderError('Нужно принять условия оферты и политики конфиденциальности', 'no_consent');
    const comment = parseComment(input?.comment);
    const q = await quote({ items: input.items, promo: input.promo, delivery: deliveryInfo });
    if (!q.deliveryReady) throw new OrderError('Выберите способ доставки', 'bad_delivery');

    const order = db.insertOrder({
      id: randomUUID(),
      prefix: cfg.orderPrefix,
      goods: q.goods,
      discount: q.discount,
      delivery: q.delivery,
      total: q.total,
      promo: q.promo?.code ?? null,
      lines,
      customer,
      deliveryInfo,
      comment
    });

    try {
      const items = receiptItems({
        lines,
        discountKop: q.discount,
        deliveryKop: q.delivery,
        subjects: { goods: cfg.yookassa.subjectGoods, digital: cfg.yookassa.subjectDigital, delivery: cfg.yookassa.subjectDelivery }
      });
      const sum = items.reduce((s, it) => s + it.unitKop * it.qty, 0);
      if (sum !== q.total) throw new Error(`сумма чека ${sum} не равна сумме заказа ${q.total}`);
      const payment = await yookassa.createPayment({ order, items, returnUrl: `${cfg.siteUrl}/order/${order.id}/` });
      const url = payment?.confirmation?.confirmation_url;
      if (!payment?.id || !url) throw new Error('ЮKassa не вернула ссылку на оплату');
      db.setPayment(order.id, payment.id, url);
      return { orderId: order.id, number: order.number, total: q.total, confirmationUrl: url };
    } catch (e) {
      log.error?.(`[order ${order.number}] платёж не создан: ${e.message}`);
      db.setError(order.id, e.message);
      db.markCanceled(order.id);
      throw new OrderError('Не удалось создать платёж. Попробуйте ещё раз чуть позже', 'payment_failed', 502);
    }
  }

  async function notifyPaid(order) {
    const { items, missing } = digital.itemsForLines(order.lines);
    const hasDigital = order.lines.some((l) => l.digital);
    let emailOk = order.email_sent ? true : null;
    if (!order.email_sent) {
      if (mailer.enabled) {
        db.bumpEmailAttempts(order.id);
        try {
          await mailer.sendOrderPaid(order, { digitalItems: items, siteCfg: cfg });
          db.setEmailSent(order.id);
          emailOk = true;
        } catch (e) {
          emailOk = false;
          db.setError(order.id, e.message);
          log.error?.(`[order ${order.number}] письмо не отправлено: ${e.message}`);
        }
      } else if (hasDigital) emailOk = false;
    }
    if (!order.tg_sent && telegram.enabled) {
      try {
        await telegram.send(orderTelegramText(order, cfg, { digitalMissing: missing, emailOk }));
        db.setTelegramSent(order.id);
      } catch (e) {
        db.setError(order.id, e.message);
        log.error?.(`[order ${order.number}] Telegram: ${e.message}`);
      }
    }
  }

  /** Сверяет платёж с ЮKassa. Уведомлению (вебхуку) не доверяем: статус всегда берём из API. */
  async function syncPayment(paymentId) {
    const payment = await yookassa.getPayment(paymentId);
    const order = db.byId(String(payment?.metadata?.order_id ?? ''));
    if (!order || order.payment_id !== payment.id) {
      log.warn?.(`[payment ${paymentId}] заказ не найден или платёж не совпадает`);
      return null;
    }
    if (payment.status === 'succeeded' && payment.paid) {
      if (payment.amount?.value !== kopToValue(order.total_kop)) {
        db.setError(order.id, `сумма платежа ${payment.amount?.value} не равна сумме заказа ${kopToValue(order.total_kop)}`);
        log.error?.(`[order ${order.number}] несовпадение суммы платежа`);
        return db.byId(order.id);
      }
      if (db.markPaid(order.id)) await notifyPaid(db.byId(order.id));
    } else if (payment.status === 'canceled') {
      db.markCanceled(order.id);
    }
    return db.byId(order.id);
  }

  async function publicStatus(id) {
    let order = db.byId(String(id));
    if (!order) throw new OrderError('Заказ не найден', 'not_found', 404);
    if (order.status === 'pending' && order.payment_id && Date.now() - (lastSync.get(id) ?? 0) > 5000) {
      lastSync.set(id, Date.now());
      try { order = (await syncPayment(order.payment_id)) ?? order; } catch (e) { log.warn?.(`[order ${order.number}] sync: ${e.message}`); }
    }
    return {
      number: order.number,
      status: order.status,
      totalKop: order.total_kop,
      hasDigital: order.lines.some((l) => l.digital),
      hasPhysical: order.lines.some((l) => !l.digital),
      payUrl: order.status === 'pending' ? order.confirmation_url : null,
      email: order.customer.email,
      emailSent: Boolean(order.email_sent)
    };
  }

  /** Фоновая работа: добиваем недоставленные письма, проверяем «зависшие» платежи, закрываем брошенные заказы. */
  async function maintenance() {
    for (const o of db.pendingPayments(new Date(Date.now() - 48 * HOUR).toISOString())) {
      if (Date.now() - Date.parse(o.created_at) < 60_000) continue;
      try { await syncPayment(o.payment_id); } catch (e) { log.warn?.(`[order ${o.number}] sync: ${e.message}`); }
    }
    for (const o of db.unfinishedPaid()) await notifyPaid(o);
    db.cancelStale(new Date(Date.now() - 72 * HOUR).toISOString());
  }

  return { quote, createOrder, syncPayment, publicStatus, notifyPaid, maintenance, resolvePromo };
}
