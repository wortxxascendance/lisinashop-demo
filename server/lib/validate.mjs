// Проверка данных покупателя и доставки. Всё, что пришло из браузера, считается недоверенным.
import { OrderError } from './catalog.mjs';

const stripCtl = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  return null;
}

export function isEmail(v) {
  const s = String(v ?? '').trim();
  return s.length <= 254 && /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(s);
}

export function parseCustomer(c) {
  const name = stripCtl(c?.name);
  const email = String(c?.email ?? '').trim().toLowerCase();
  const phone = normalizePhone(c?.phone);
  if (name.length < 2 || name.length > 100) throw new OrderError('Укажите имя', 'bad_name');
  if (!isEmail(email)) throw new OrderError('Проверьте адрес почты', 'bad_email');
  if (!phone) throw new OrderError('Проверьте номер телефона', 'bad_phone');
  return { name, email, phone };
}

export const CDEK_METHODS = ['cdek_pvz', 'cdek_courier'];

/** physical: в заказе есть товары, которые нужно отправлять. Для электронных товаров доставка не нужна. */
export function parseDelivery(d, { physical }) {
  if (!physical) return { method: 'email' };
  const method = String(d?.method ?? '');
  if (method === 'pickup') return { method };
  if (!CDEK_METHODS.includes(method)) throw new OrderError('Выберите способ доставки', 'bad_delivery');
  const cityCode = Number(d?.cityCode);
  if (!Number.isInteger(cityCode) || cityCode <= 0) throw new OrderError('Выберите город доставки', 'bad_city');
  const cityName = stripCtl(d?.cityName).slice(0, 120);
  if (method === 'cdek_pvz') {
    const pointCode = stripCtl(d?.pointCode).slice(0, 32);
    const pointAddress = stripCtl(d?.pointAddress).slice(0, 300);
    if (!pointCode) throw new OrderError('Выберите пункт выдачи СДЭК', 'bad_point');
    return { method, cityCode, cityName, pointCode, pointAddress };
  }
  const address = stripCtl(d?.address).slice(0, 300);
  if (address.length < 5) throw new OrderError('Укажите адрес доставки', 'bad_address');
  return { method, cityCode, cityName, address };
}

export const parseComment = (s) => stripCtl(s).slice(0, 500);
