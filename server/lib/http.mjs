// HTTP-помощники: JSON, лимиты запросов, раздача статических файлов.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export class HttpError extends Error {
  constructor(status, message, code = 'http_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body), ...headers });
  res.end(body);
}

export async function readJson(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Слишком большой запрос', 'too_large');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Некорректный запрос', 'bad_json');
  }
}

/** Простой лимитер «не более max запросов за окно» на ключ (обычно IP). */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();
  return (key) => {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset <= now) {
      h = { n: 0, reset: now + windowMs };
      hits.set(key, h);
    }
    h.n++;
    return h.n <= max;
  };
}

/** IP клиента. За nginx берём первый адрес из X-Forwarded-For (включайте TRUST_PROXY только за прокси). */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || 'unknown';
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': CSP
};

async function fileFor(root, urlPath) {
  const p = decodeURIComponent(urlPath);
  if (p.includes('\0')) return null;
  const full = normalize(join(root, p));
  if (full !== root && !full.startsWith(root + sep)) return null;
  const candidates = p.endsWith('/') ? [join(full, 'index.html')] : extname(full) ? [full] : [join(full, 'index.html'), `${full}.html`];
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isFile()) return { path: c, size: s.size, mtime: s.mtime };
    } catch { /* пробуем следующий вариант */ }
  }
  return null;
}

/** Раздача собранного сайта (dist). В продакшене то же самое делает nginx, это запасной и локальный вариант. */
export function createStaticHandler(root) {
  return async function serve(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const f = await fileFor(root, url.pathname).catch(() => null);
    const headers = { ...SECURITY_HEADERS };
    let status = 200;
    let file = f;
    if (!file) {
      file = await fileFor(root, '/404.html').catch(() => null);
      status = 404;
      if (!file) return false;
    }
    const ext = extname(file.path);
    headers['content-type'] = TYPES[ext] || 'application/octet-stream';
    headers['content-length'] = file.size;
    if (ext === '.html') headers['cache-control'] = 'no-cache';
    else if (url.searchParams.has('v')) headers['cache-control'] = 'public, max-age=31536000, immutable';
    else headers['cache-control'] = 'public, max-age=86400';
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end(), true;
    createReadStream(file.path).pipe(res);
    return true;
  };
}
