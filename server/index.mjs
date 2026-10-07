// Запуск сервера магазина: npm start. Настройки берутся из переменных окружения и файла .env (см. .env.example).
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { loadCatalog } from './lib/catalog.mjs';
import { openDb } from './lib/db.mjs';
import { createYooKassa } from './lib/yookassa.mjs';
import { createCdek } from './lib/cdek.mjs';
import { createTelegram, createMailer } from './lib/notify.mjs';
import { loadDigital, loadPromos } from './lib/private-data.mjs';
import { createOrderService } from './lib/orders.mjs';
import { createApp } from './app.mjs';

export function buildServices(cfg, log = console) {
  const db = openDb(join(cfg.dataDir, 'orders.sqlite'));
  const catalog = loadCatalog(cfg.catalogFile);
  const digital = loadDigital(cfg.digitalFile);
  const promos = loadPromos(cfg.promoFile);
  const yookassa = cfg.features.payments ? createYooKassa(cfg.yookassa) : null;
  const cdek = cfg.features.cdek ? createCdek(cfg.cdek) : null;
  const telegram = createTelegram(cfg.telegram);
  const mailer = createMailer(cfg.smtp);
  const orders = createOrderService({ cfg, db, catalog, digital, promos, yookassa, cdek, telegram, mailer, log });
  return { db, catalog, digital, promos, yookassa, cdek, telegram, mailer, orders };
}

function main() {
  const cfg = loadConfig();
  const log = console;
  const s = buildServices(cfg, log);

  const warn = (cond, msg) => cond || log.warn(`[config] ${msg}`);
  warn(cfg.features.payments, 'ЮKassa не настроена (YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY): оформление заказов отключено');
  warn(cfg.features.telegram, 'Telegram не настроен: менеджер не получит уведомления о заказах');
  warn(cfg.features.email, 'SMTP не настроен: покупатели не получат письма и ссылки на материалы');
  warn(cfg.features.cdek || cfg.cdek.flatRub > 0, 'СДЭК не настроен: доставка недоступна, останется только самовывоз и электронные товары');
  warn(s.digital.size > 0, `нет ссылок на электронные материалы (${cfg.digitalFile})`);

  const server = createServer(createApp({ cfg, orders: s.orders, cdek: s.cdek, db: s.db, telegram: s.telegram, log }));
  server.listen(cfg.port, cfg.host, () => log.log(`LisinaShop: http://${cfg.host}:${cfg.port} (сайт: ${cfg.publicDir})`));

  const tick = () => s.orders.maintenance().catch((e) => log.error(`[maintenance] ${e.message}`));
  setTimeout(tick, 5000).unref();
  setInterval(tick, 60_000).unref();

  const stop = () => server.close(() => { s.db.close(); process.exit(0); });
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
