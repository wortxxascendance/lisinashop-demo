// Клиент ЮKassa: создание платежа с онлайн-чеком (54-ФЗ) и проверка статуса платежа.
// Документация: https://yookassa.ru/developers/api
import { kopToValue } from './pricing.mjs';

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildReceipt({ customer, items, cfg }) {
  return {
    customer: { full_name: clip(customer.name, 256), email: customer.email, phone: customer.phone.replace(/\D/g, '') },
    tax_system_code: cfg.taxSystemCode,
    items: items.map((it) => ({
      description: clip(it.description, 128),
      quantity: String(it.qty),
      amount: { value: kopToValue(it.unitKop), currency: 'RUB' },
      vat_code: cfg.vatCode,
      payment_mode: 'full_payment',
      payment_subject: it.subject
    }))
  };
}

export function createYooKassa(cfg, fetchImpl = fetch) {
  const auth = `Basic ${Buffer.from(`${cfg.shopId}:${cfg.secretKey}`).toString('base64')}`;

  async function call(method, path, body, idempotenceKey) {
    const res = await fetchImpl(`${cfg.api}${path}`, {
      method,
      headers: {
        authorization: auth,
        'content-type': 'application/json',
        ...(idempotenceKey ? { 'idempotence-key': idempotenceKey } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000)
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
    if (!res.ok) {
      const err = new Error(`ЮKassa ${method} ${path}: HTTP ${res.status} ${json?.description || text.slice(0, 200)}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  return {
    /** Один заказ = один платёж. Idempotence-Key = id заказа, поэтому повтор запроса не создаст второй платёж. */
    createPayment({ order, items, returnUrl }) {
      return call(
        'POST',
        '/payments',
        {
          amount: { value: kopToValue(order.total_kop), currency: 'RUB' },
          capture: true,
          confirmation: { type: 'redirect', return_url: returnUrl },
          description: clip(`Заказ ${order.number} в LisinaShop`, 128),
          metadata: { order_id: order.id, order_number: order.number },
          receipt: buildReceipt({ customer: order.customer, items, cfg })
        },
        order.id
      );
    },
    getPayment: (id) => call('GET', `/payments/${encodeURIComponent(id)}`)
  };
}
