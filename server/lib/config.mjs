// Конфигурация сервера: переменные окружения + необязательный файл .env в корне проекта.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function loadDotEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

const int = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

/** @param {Record<string,string|undefined>} [env] */
export function loadConfig(env = { ...loadDotEnv(join(ROOT, '.env')), ...process.env }) {
  const siteUrl = (env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const cfg = {
    root: ROOT,
    port: int(env.PORT, 3000),
    host: env.HOST || '127.0.0.1',
    siteUrl,
    publicDir: resolve(ROOT, env.PUBLIC_DIR || 'dist'),
    dataDir: resolve(ROOT, env.DATA_DIR || 'server/data'),
    catalogFile: resolve(ROOT, env.CATALOG_FILE || 'data/products.json'),
    digitalFile: resolve(ROOT, env.DIGITAL_FILE || 'server/private/digital.json'),
    promoFile: resolve(ROOT, env.PROMO_FILE || 'server/private/promo.json'),
    orderPrefix: env.ORDER_PREFIX || 'LS',
    adminToken: env.ADMIN_TOKEN || '',
    trustProxy: env.TRUST_PROXY === '1',
    supportEmail: env.SUPPORT_EMAIL || 'info@lisinashop.ru',

    // Правила магазина
    freeShippingFromKop: int(env.FREE_SHIPPING_FROM, 4500) * 100,
    pickupCity: env.PICKUP_CITY || 'Волгоград',

    yookassa: {
      shopId: env.YOOKASSA_SHOP_ID || '',
      secretKey: env.YOOKASSA_SECRET_KEY || '',
      api: env.YOOKASSA_API || 'https://api.yookassa.ru/v3',
      // 1 общая, 2 УСН доходы, 3 УСН доходы минус расходы, 4 ЕНВД, 5 ЕСХН, 6 патент
      taxSystemCode: int(env.YOOKASSA_TAX_SYSTEM_CODE, 3),
      // 1 без НДС, 2 НДС 0%, 3 НДС 10%, 4 НДС 20%
      vatCode: int(env.YOOKASSA_VAT_CODE, 1),
      subjectGoods: env.PAY_SUBJECT_GOODS || 'commodity',
      subjectDigital: env.PAY_SUBJECT_DIGITAL || 'service',
      subjectDelivery: env.PAY_SUBJECT_DELIVERY || 'service'
    },

    telegram: { token: env.TELEGRAM_BOT_TOKEN || '', chatId: env.TELEGRAM_CHAT_ID || '' },

    smtp: {
      host: env.SMTP_HOST || '',
      port: int(env.SMTP_PORT, 465),
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.MAIL_FROM || env.SMTP_USER || ''
    },

    cdek: {
      api: (env.CDEK_API || 'https://api.cdek.ru/v2').replace(/\/+$/, ''),
      account: env.CDEK_ACCOUNT || '',
      secure: env.CDEK_SECURE || '',
      fromCityCode: int(env.CDEK_FROM_CITY_CODE, 0),
      tariffPvz: int(env.CDEK_TARIFF_PVZ, 136), // посылка склад-склад
      tariffCourier: int(env.CDEK_TARIFF_COURIER, 137), // посылка склад-дверь
      defaultWeightG: int(env.DEFAULT_ITEM_WEIGHT_G, 300),
      pack: { length: int(env.PACK_LENGTH_CM, 20), width: int(env.PACK_WIDTH_CM, 15), height: int(env.PACK_HEIGHT_CM, 10) },
      flatRub: int(env.DELIVERY_FLAT_RUB, 0) // запасной вариант, если СДЭК не настроен
    }
  };
  cfg.features = {
    payments: Boolean(cfg.yookassa.shopId && cfg.yookassa.secretKey),
    telegram: Boolean(cfg.telegram.token && cfg.telegram.chatId),
    email: Boolean(cfg.smtp.host && cfg.smtp.user && cfg.smtp.pass),
    cdek: Boolean(cfg.cdek.account && cfg.cdek.secure && cfg.cdek.fromCityCode)
  };
  return cfg;
}
