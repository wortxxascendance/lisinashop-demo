import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { loadConfig, ROOT } from '../lib/config.mjs';
import { loadCatalog, OrderError } from '../lib/catalog.mjs';
import { allocate, computeTotals, receiptItems, promoDiscount, kopToValue } from '../lib/pricing.mjs';
import { normalizePhone, isEmail, parseCustomer, parseDelivery } from '../lib/validate.mjs';
import { openDb } from '../lib/db.mjs';
import { buildReceipt } from '../lib/yookassa.mjs';
import { createOrderService } from '../lib/orders.mjs';
import { loadDigital, loadPromos } from '../lib/private-data.mjs';
import { createApp } from '../app.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const catalog = loadCatalog(join(ROOT, 'data/products.json'));
const quiet = { log() {}, warn() {}, error() {} };

const physical = catalog.list.find((p) => p.cat === 'home' && !p.opts && p.price >= 700 && p.price < 800);
const book = catalog.list.find((p) => p.sku === 'art-1');
const bookOld = catalog.list.find((p) => p.sku === 'art-07');
const withOpts = catalog.list.find((p) => p.opts);

// ---------- деньги ----------
test('allocate: сумма долей равна делимому, остатки не теряются', () => {
  for (const [total, w] of [[100, [1, 1, 1]], [7, [3, 3, 3]], [1, [5, 1]], [999, [12300, 4500, 100]], [0, [1, 2]]]) {
    const parts = allocate(total, w);
    assert.equal(parts.reduce((a, b) => a + b, 0), total, `total=${total}`);
    assert.ok(parts.every((x) => x >= 0));
  }
});

test('receiptItems: сумма позиций чека точно равна сумме заказа при скидке и нечётных количествах', () => {
  const lines = [
    { title: 'A', unitKop: 79000, qty: 3, digital: false },
    { title: 'B', unitKop: 12345, qty: 7, digital: false },
    { title: 'C', unitKop: 20000, qty: 1, digital: true }
  ];
  const subjects = { goods: 'commodity', digital: 'service', delivery: 'service' };
  for (const discount of [0, 1, 777, 12345, 50001, 99999]) {
    for (const delivery of [0, 35050]) {
      const items = receiptItems({ lines, discountKop: discount, deliveryKop: delivery, subjects });
      const sum = items.reduce((s, i) => s + i.unitKop * i.qty, 0);
      const goods = lines.reduce((s, l) => s + l.unitKop * l.qty, 0) - discount;
      assert.equal(sum, goods + delivery, `discount=${discount} delivery=${delivery}`);
      assert.ok(items.every((i) => i.unitKop > 0 && Number.isInteger(i.unitKop) && Number.isInteger(i.qty) && i.qty > 0));
    }
  }
});

test('скидка не превращает цену единицы в ноль', () => {
  const d = promoDiscount(1000, 4, { type: 'percent', value: 100 });
  assert.equal(d, 996);
  assert.throws(() => promoDiscount(100000, 1, { type: 'fixed', value: 10, minRub: 2000 }), OrderError);
});

test('бесплатная доставка СДЭК от порога, электронные товары без доставки', () => {
  const l = (unitKop, qty, digital = false) => ({ unitKop, qty, digital });
  const common = { promo: null, freeShippingFromKop: 450000, deliveryKind: 'cdek' };
  assert.equal(computeTotals({ lines: [l(100000, 4)], deliveryKop: 30000, ...common }).delivery, 30000);
  assert.equal(computeTotals({ lines: [l(100000, 5)], deliveryKop: 30000, ...common }).delivery, 0);
  assert.equal(computeTotals({ lines: [l(20000, 1, true)], deliveryKop: 30000, ...common }).delivery, 0);
  assert.equal(kopToValue(123456), '1234.56');
});

// ---------- каталог и проверка данных ----------
test('каталог: цену определяет сервер, мусор отвергается, одинаковые позиции склеиваются', () => {
  const lines = catalog.resolveLines([{ id: physical.id, qty: 1, price: 1, unitKop: 1 }, { id: physical.id, qty: 2 }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 3);
  assert.equal(lines[0].unitKop, Math.round(physical.price * 100));
  for (const bad of [[], null, [{ id: 'nope', qty: 1 }], [{ id: physical.id, qty: 0 }], [{ id: physical.id, qty: 1.5 }], [{ id: physical.id, qty: 100 }], [{ id: withOpts.id, qty: 1, opt: 99 }]]) {
    assert.throws(() => catalog.resolveLines(bad), OrderError);
  }
  const v = catalog.resolveLines([{ id: withOpts.id, qty: 1, opt: 1 }])[0];
  assert.equal(v.unitKop, Math.round(withOpts.opts.values[1].price * 100));
});

test('валидация: телефоны, почта, доставка', () => {
  assert.equal(normalizePhone('8 (927) 510-30-30'), '+79275103030');
  assert.equal(normalizePhone('+7 927 510 30 30'), '+79275103030');
  assert.equal(normalizePhone('9275103030'), '+79275103030');
  assert.equal(normalizePhone('12345'), null);
  assert.ok(isEmail('a@b.ru'));
  assert.ok(!isEmail('a@b'));
  assert.ok(!isEmail('<script>@b.ru'));
  assert.throws(() => parseCustomer({ name: 'А', email: 'a@b.ru', phone: '89275103030' }), OrderError);
  assert.deepEqual(parseDelivery({ method: 'whatever' }, { physical: false }), { method: 'email' });
  assert.throws(() => parseDelivery({ method: 'cdek_pvz', cityCode: 44 }, { physical: true }), OrderError);
  assert.equal(parseDelivery({ method: 'pickup' }, { physical: true }).method, 'pickup');
});

test('чек: данные покупателя и налоговые коды попадают в запрос ЮKassa', () => {
  const cfg = loadConfig({}).yookassa;
  const r = buildReceipt({ customer: { name: 'Анна', email: 'a@b.ru', phone: '+79275103030' }, items: [{ description: 'Товар', qty: 2, unitKop: 79000, subject: 'commodity' }], cfg });
  assert.equal(r.tax_system_code, 3);
  assert.equal(r.customer.phone, '79275103030');
  assert.deepEqual(r.items[0], { description: 'Товар', quantity: '2', amount: { value: '790.00', currency: 'RUB' }, vat_code: 1, payment_mode: 'full_payment', payment_subject: 'commodity' });
});

// ---------- поток заказа с подменёнными внешними сервисами ----------
function harness({ cdekFlat = 0, payments = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ls-test-'));
  const digitalFile = join(dir, 'digital.json');
  const promoFile = join(dir, 'promo.json');
  writeFileSync(digitalFile, JSON.stringify({ 'art-1': { title: 'Сборник 1', links: ['https://example.test/secret-art-1'] }, 'art-7': { title: 'Сборник 7', links: ['https://example.test/secret-art-7'] } }));
  writeFileSync(promoFile, JSON.stringify({ TEST10: { type: 'percent', value: 10 }, OLD: { type: 'fixed', value: 100, until: '2020-01-01' } }));
  const cfg = loadConfig({ SITE_URL: 'https://shop.test', DIGITAL_FILE: digitalFile, PROMO_FILE: promoFile, DATA_DIR: dir, YOOKASSA_SHOP_ID: payments ? '1' : '', YOOKASSA_SECRET_KEY: payments ? 's' : '', DELIVERY_FLAT_RUB: String(cdekFlat), ADMIN_TOKEN: 'adm' });
  const db = openDb(':memory:');
  const payments_ = new Map();
  const created = [];
  const yookassa = {
    async createPayment({ order, items, returnUrl }) {
      const id = `pay-${created.length + 1}-xxxxxxxxxx`;
      const p = { id, status: 'pending', paid: false, amount: { value: kopToValue(order.total_kop) }, metadata: { order_id: order.id } };
      payments_.set(id, p);
      created.push({ order, items, returnUrl, id });
      return { ...p, confirmation: { confirmation_url: `https://pay.test/${id}` } };
    },
    async getPayment(id) { return structuredClone(payments_.get(id)); }
  };
  const sent = { tg: [], mail: [] };
  const telegram = { enabled: true, async send(t) { sent.tg.push(t); } };
  let mailFails = 0;
  const mailer = { enabled: true, async sendOrderPaid(o, x) { if (mailFails > 0) { mailFails--; throw new Error('smtp down'); } sent.mail.push({ order: o, ...x }); } };
  const orders = createOrderService({ cfg, db, catalog, digital: loadDigital(digitalFile), promos: loadPromos(promoFile), yookassa, cdek: null, telegram, mailer, log: quiet });
  return { cfg, db, orders, yookassa, payments: payments_, created, sent, failMail: (n) => { mailFails = n; } };
}

const customer = { name: 'Анна Иванова', phone: '+7 927 510-30-30', email: 'Anna@Mail.ru' };

test('заказ: платёж создаётся на правильную сумму, подтверждение оплаты обрабатывается один раз', async () => {
  const h = harness();
  const r = await h.orders.createOrder({ items: [{ id: physical.id, qty: 2 }], customer, delivery: { method: 'pickup' }, consent: true, promo: 'test10' });
  assert.match(r.number, /^LS-\d+$/);
  assert.equal(r.confirmationUrl, 'https://pay.test/pay-1-xxxxxxxxxx');
  const c = h.created[0];
  assert.equal(c.returnUrl, `https://shop.test/order/${r.orderId}/`);
  const goods = Math.round(physical.price * 100) * 2;
  assert.equal(c.order.total_kop, goods - Math.round(goods * 0.1));
  assert.equal(c.items.reduce((s, i) => s + i.unitKop * i.qty, 0), c.order.total_kop);
  assert.equal(c.order.customer.email, 'anna@mail.ru');

  assert.equal((await h.orders.publicStatus(r.orderId)).status, 'pending');
  h.payments.get(c.id).status = 'succeeded';
  h.payments.get(c.id).paid = true;
  await h.orders.syncPayment(c.id);
  await h.orders.syncPayment(c.id); // повторное уведомление ЮKassa
  await h.orders.syncPayment(c.id);
  assert.equal(h.sent.tg.length, 1, 'Telegram ровно один раз');
  assert.equal(h.sent.mail.length, 1, 'письмо ровно один раз');
  assert.match(h.sent.tg[0], /Оплачен заказ LS-/);
  assert.equal((await h.orders.publicStatus(r.orderId)).status, 'paid');
});

test('заказ: подмена суммы платежа не переводит заказ в «оплачен»', async () => {
  const h = harness();
  const r = await h.orders.createOrder({ items: [{ id: physical.id, qty: 1 }], customer, delivery: { method: 'pickup' }, consent: true });
  const pay = h.payments.get(h.created[0].id);
  pay.status = 'succeeded'; pay.paid = true; pay.amount.value = '1.00';
  await h.orders.syncPayment(pay.id);
  assert.equal(h.db.byId(r.orderId).status, 'pending');
  assert.equal(h.sent.tg.length, 0);
});

test('заказ: чужой платёж и платёж без заказа игнорируются', async () => {
  const h = harness();
  h.payments.set('stranger-0000000', { id: 'stranger-0000000', status: 'succeeded', paid: true, amount: { value: '10.00' }, metadata: { order_id: 'nope' } });
  assert.equal(await h.orders.syncPayment('stranger-0000000'), null);
  assert.equal(h.sent.tg.length, 0);
});

test('заказ: отмена платежа закрывает заказ, электронные материалы не выдаются', async () => {
  const h = harness();
  const r = await h.orders.createOrder({ items: [{ id: book.id, qty: 1 }], customer, consent: true });
  h.payments.get(h.created[0].id).status = 'canceled';
  await h.orders.syncPayment(h.created[0].id);
  assert.equal(h.db.byId(r.orderId).status, 'canceled');
  assert.equal(h.sent.mail.length, 0);
});

test('электронные товары: ссылки уходят в письмо только после оплаты, артикулы art-07 и art-7 равнозначны', async () => {
  const h = harness();
  const r = await h.orders.createOrder({ items: [{ id: book.id, qty: 1 }, { id: bookOld.id, qty: 1 }], customer, consent: true });
  assert.equal(h.created[0].order.delivery_kop, 0);
  assert.equal(h.created[0].items[0].subject, 'service');
  assert.equal(h.sent.mail.length, 0);
  const pid = h.created[0].id;
  Object.assign(h.payments.get(pid), { status: 'succeeded', paid: true });
  await h.orders.syncPayment(pid);
  const mail = h.sent.mail[0];
  assert.equal(mail.digitalItems.length, 2);
  assert.ok(mail.digitalItems.every((d) => d.links[0].startsWith('https://example.test/secret-')));
  assert.doesNotMatch(h.sent.tg[0], /secret-art/, 'ссылки не дублируются в Telegram');
  assert.equal((await h.orders.publicStatus(r.orderId)).hasDigital, true);
});

test('письмо не ушло: сервер повторяет попытку и менеджер предупреждён', async () => {
  const h = harness();
  await h.orders.createOrder({ items: [{ id: book.id, qty: 1 }], customer, consent: true });
  const pid = h.created[0].id;
  h.failMail(1);
  Object.assign(h.payments.get(pid), { status: 'succeeded', paid: true });
  await h.orders.syncPayment(pid);
  assert.equal(h.sent.mail.length, 0);
  assert.match(h.sent.tg[0], /Письмо покупателю не ушло/);
  await h.orders.maintenance();
  assert.equal(h.sent.mail.length, 1, 'повтор доставил письмо');
  await h.orders.maintenance();
  assert.equal(h.sent.mail.length, 1, 'и больше не повторяет');
});

test('заказ: валидация и защита', async () => {
  const h = harness();
  const base = { items: [{ id: physical.id, qty: 1 }], customer, delivery: { method: 'pickup' }, consent: true };
  await assert.rejects(h.orders.createOrder({ ...base, consent: false }), { code: 'no_consent' });
  await assert.rejects(h.orders.createOrder({ ...base, customer: { ...customer, email: 'x' } }), { code: 'bad_email' });
  await assert.rejects(h.orders.createOrder({ ...base, delivery: { method: 'cdek_pvz', cityCode: 44, pointCode: 'X1' } }), { code: 'delivery_unavailable' });
  await assert.rejects(h.orders.createOrder({ ...base, promo: 'OLD' }), { code: 'promo_invalid' });
  await assert.rejects(h.orders.createOrder({ ...base, promo: 'NOPE' }), { code: 'promo_invalid' });
  assert.equal(h.created.length, 0, 'ни одного платежа по неверным заказам');
  const off = harness({ payments: false });
  await assert.rejects(off.orders.createOrder(base), { code: 'payments_off' });
});

test('доставка СДЭК по запасной фиксированной цене и бесплатная доставка от порога', async () => {
  const h = harness({ cdekFlat: 350 });
  const d = { method: 'cdek_courier', cityCode: 44, cityName: 'Москва', address: 'Тверская 1' };
  const small = await h.orders.quote({ items: [{ id: physical.id, qty: 1 }], delivery: d });
  assert.equal(small.delivery, 35000);
  assert.equal(small.total, small.goods + 35000);
  const big = await h.orders.quote({ items: [{ id: physical.id, qty: 7 }], delivery: d });
  assert.ok(big.goods >= 450000);
  assert.equal(big.delivery, 0);
  assert.equal(big.freeDelivery, true);
});

// ---------- HTTP ----------
async function withServer(h, fn) {
  const app = createApp({ cfg: h.cfg, orders: h.orders, cdek: null, db: h.db, log: quiet });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('HTTP: полный сценарий, ошибки и закрытые данные', async () => {
  const h = harness();
  await withServer(h, async (base) => {
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.equal(cfg.payments, true);
    assert.equal(cfg.freeShippingFromRub, 4500);

    const q = await (await post(`${base}/api/quote`, { items: [{ id: physical.id, qty: 1, price: 1 }], delivery: { method: 'pickup' } })).json();
    assert.equal(q.total, Math.round(physical.price * 100));

    const bad = await post(`${base}/api/orders`, { items: [] });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, 'empty_cart');
    assert.equal((await post(`${base}/api/orders`, 'not json')).status, 400);

    const ok = await post(`${base}/api/orders`, { items: [{ id: book.id, qty: 1 }], customer, consent: true });
    assert.equal(ok.status, 201);
    const order = await ok.json();
    assert.match(order.confirmationUrl, /^https:\/\/pay\.test\//);

    const pid = h.created[0].id;
    Object.assign(h.payments.get(pid), { status: 'succeeded', paid: true });
    const hook = await post(`${base}/api/yookassa/webhook`, { type: 'notification', event: 'payment.succeeded', object: { id: pid } });
    assert.equal(hook.status, 200);
    assert.equal((await post(`${base}/api/yookassa/webhook`, { object: { id: 'x' } })).status, 400);

    const statusText = await (await fetch(`${base}/api/orders/${order.orderId}`)).text();
    const status = JSON.parse(statusText);
    assert.equal(status.status, 'paid');
    assert.doesNotMatch(statusText, /secret-art|example\.test/, 'ссылки на материалы не попадают в публичный API');

    assert.equal((await fetch(`${base}/api/orders/00000000-0000-0000-0000-000000000000`)).status, 404);
    assert.equal((await fetch(`${base}/api/admin/orders`)).status, 401);
    assert.equal((await fetch(`${base}/api/admin/orders`, { headers: { authorization: 'Bearer wrong' } })).status, 401);
    const adm = await fetch(`${base}/api/admin/orders`, { headers: { authorization: 'Bearer adm' } });
    assert.equal(adm.status, 200);
    assert.equal((await adm.json()).orders.length, 1);
    assert.equal((await fetch(`${base}/api/cdek/cities?q=мос`)).status, 503);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  });
});

test('HTTP: заявка блогера уходит в Telegram с экранированием, без согласия отклоняется', async () => {
  const h = harness();
  const tg = [];
  const app = createApp({ cfg: h.cfg, orders: h.orders, cdek: null, db: h.db, telegram: { enabled: true, async send(t) { tg.push(t); } }, log: quiet });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ok = await post(`${base}/api/leads`, { type: 'collab', name: 'Аня <b>', link: 't.me/anya', consent: true });
    assert.equal(ok.status, 201);
    assert.match(tg[0], /Аня &lt;b&gt;/);
    assert.equal((await post(`${base}/api/leads`, { type: 'collab', name: 'Аня', link: 't.me/anya' })).status, 400);
    assert.equal((await post(`${base}/api/leads`, { type: 'other', name: 'Аня', link: 't.me/anya', consent: true })).status, 400);
    assert.equal(tg.length, 1);
  } finally { await new Promise((r) => server.close(r)); }
  await withServer(h, async (b) => {
    assert.equal((await post(`${b}/api/leads`, { type: 'collab', name: 'Аня', link: 't.me/anya', consent: true })).status, 503);
  });
});

test('HTTP: лимит на создание заказов с одного адреса', async () => {
  const h = harness();
  await withServer(h, async (base) => {
    let last = 0;
    for (let i = 0; i < 14; i++) last = (await post(`${base}/api/orders`, { items: [] })).status;
    assert.equal(last, 429);
  });
});
