// HTTP-приложение: API магазина и (для локальной разработки) раздача собранного сайта.
import { timingSafeEqual } from 'node:crypto';
import { OrderError } from './lib/catalog.mjs';
import { HttpError, readJson, sendJson, createRateLimiter, clientIp, createStaticHandler, SECURITY_HEADERS } from './lib/http.mjs';

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function createApp({ cfg, orders, cdek, db, telegram, log = console }) {
  const serveStatic = createStaticHandler(cfg.publicDir);
  const limitLead = createRateLimiter({ windowMs: 10 * 60_000, max: 5 });
  const limitApi = createRateLimiter({ windowMs: 60_000, max: 120 });
  const limitQuote = createRateLimiter({ windowMs: 60_000, max: 40 });
  const limitOrder = createRateLimiter({ windowMs: 10 * 60_000, max: 12 });
  const limitCdek = createRateLimiter({ windowMs: 60_000, max: 60 });
  const cdekReady = cfg.features.cdek || cfg.cdek.flatRub > 0;

  function requireCdek() {
    if (!cfg.features.cdek || !cdek) throw new OrderError('Выбор пункта выдачи СДЭК сейчас недоступен', 'cdek_off', 503);
  }

  function isAdmin(req) {
    if (!cfg.adminToken) return false;
    const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    const want = Buffer.from(cfg.adminToken);
    return given.length === want.length && timingSafeEqual(given, want);
  }

  async function api(req, res, url) {
    const ip = clientIp(req, cfg.trustProxy);
    if (!limitApi(ip)) throw new HttpError(429, 'Слишком много запросов. Подождите минуту', 'rate_limit');
    const path = url.pathname;
    const method = req.method;

    if (method === 'GET' && path === '/api/health') return sendJson(res, 200, { ok: true });

    if (method === 'GET' && path === '/api/config') {
      return sendJson(res, 200, {
        payments: cfg.features.payments,
        cdek: cfg.features.cdek,
        delivery: cdekReady,
        freeShippingFromRub: cfg.freeShippingFromKop / 100,
        pickupCity: cfg.pickupCity
      });
    }

    if (method === 'GET' && path === '/api/cdek/cities') {
      requireCdek();
      if (!limitCdek(ip)) throw new HttpError(429, 'Слишком много запросов', 'rate_limit');
      const q = String(url.searchParams.get('q') || '').trim();
      if (q.length < 2) return sendJson(res, 200, { cities: [] });
      return sendJson(res, 200, { cities: await cdek.suggestCities(q.slice(0, 60)) });
    }

    if (method === 'GET' && path === '/api/cdek/points') {
      requireCdek();
      if (!limitCdek(ip)) throw new HttpError(429, 'Слишком много запросов', 'rate_limit');
      const city = Number(url.searchParams.get('city'));
      if (!Number.isInteger(city) || city <= 0) throw new OrderError('Выберите город', 'bad_city');
      return sendJson(res, 200, { points: await cdek.pickupPoints(city) });
    }

    if (method === 'POST' && path === '/api/quote') {
      if (!limitQuote(ip)) throw new HttpError(429, 'Слишком много запросов', 'rate_limit');
      return sendJson(res, 200, await orders.quote(await readJson(req)));
    }

    if (method === 'POST' && path === '/api/orders') {
      if (!limitOrder(ip)) throw new HttpError(429, 'Слишком много заказов с одного адреса. Попробуйте позже', 'rate_limit');
      return sendJson(res, 201, await orders.createOrder(await readJson(req)));
    }

    if (method === 'POST' && path === '/api/leads') {
      if (!limitLead(ip)) throw new HttpError(429, 'Слишком много заявок. Попробуйте позже', 'rate_limit');
      const body = await readJson(req);
      const name = clean(body.name, 100);
      const link = clean(body.link, 300);
      if (body.type !== 'collab') throw new OrderError('Неизвестный тип заявки', 'bad_lead');
      if (name.length < 2) throw new OrderError('Укажите имя', 'bad_name');
      if (link.length < 4) throw new OrderError('Укажите ссылку на канал или блог', 'bad_link');
      if (body.consent !== true) throw new OrderError('Нужно согласие на обработку персональных данных', 'no_consent');
      if (!telegram?.enabled) throw new HttpError(503, 'Приём заявок временно недоступен. Напишите нам в Telegram @piiilulya', 'leads_off');
      await telegram.send(`<b>Заявка блогера</b>\nИмя: ${escHtml(name)}\nСсылка: ${escHtml(link)}`);
      return sendJson(res, 201, { ok: true });
    }

    const m = path.match(/^\/api\/orders\/([0-9a-f-]{36})$/);
    if (method === 'GET' && m) return sendJson(res, 200, await orders.publicStatus(m[1]));

    if (method === 'POST' && path === '/api/yookassa/webhook') {
      const body = await readJson(req);
      const id = body?.object?.id;
      if (typeof id !== 'string' || !/^[0-9a-zA-Z-]{10,64}$/.test(id)) throw new HttpError(400, 'bad payment id', 'bad_payment');
      await orders.syncPayment(id); // при ошибке вернём 500, и ЮKassa повторит уведомление
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'GET' && path === '/api/admin/orders') {
      if (!isAdmin(req)) throw new HttpError(401, 'Нет доступа', 'unauthorized');
      const limit = Math.min(100, Number(url.searchParams.get('limit')) || 20);
      return sendJson(res, 200, { orders: db.recent(limit).map((o) => ({ number: o.number, status: o.status, createdAt: o.created_at, paidAt: o.paid_at, totalKop: o.total_kop, customer: o.customer, delivery: o.delivery, lines: o.lines, lastError: o.last_error })) });
    }

    throw new HttpError(404, 'Не найдено', 'not_found');
  }

  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
        return await api(req, res, url);
      }
      if (!(await serveStatic(req, res, url))) throw new HttpError(404, 'Не найдено', 'not_found');
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof OrderError || e instanceof HttpError) {
        return sendJson(res, e.status, { error: { code: e.code, message: e.message } });
      }
      log.error?.(`[http] ${req.method} ${req.url}: ${e.stack || e.message}`);
      return sendJson(res, 500, { error: { code: 'internal', message: 'Что-то пошло не так. Попробуйте ещё раз' } });
    }
  };
}
