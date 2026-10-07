// Хранилище заказов: SQLite из стандартной библиотеки Node (никаких внешних баз и пакетов).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,                 -- new, pending, paid, canceled
  created_at TEXT NOT NULL,
  paid_at TEXT,
  goods_kop INTEGER NOT NULL,
  discount_kop INTEGER NOT NULL,
  delivery_kop INTEGER NOT NULL,
  total_kop INTEGER NOT NULL,
  promo TEXT,
  lines_json TEXT NOT NULL,
  customer_json TEXT NOT NULL,
  delivery_json TEXT NOT NULL,
  comment TEXT,
  payment_id TEXT,
  confirmation_url TEXT,
  tg_sent INTEGER NOT NULL DEFAULT 0,
  email_sent INTEGER NOT NULL DEFAULT 0,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_payment ON orders(payment_id);
`;

const parse = (row) =>
  row && {
    ...row,
    lines: JSON.parse(row.lines_json),
    customer: JSON.parse(row.customer_json),
    delivery: JSON.parse(row.delivery_json)
  };

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);

  const q = {
    insert: db.prepare(`INSERT INTO orders (id, number, status, created_at, goods_kop, discount_kop, delivery_kop, total_kop, promo, lines_json, customer_json, delivery_json, comment)
      VALUES (?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    byId: db.prepare('SELECT * FROM orders WHERE id = ?'),
    byNumber: db.prepare('SELECT * FROM orders WHERE number = ?'),
    setNumber: db.prepare('UPDATE orders SET number = ? WHERE id = ?'),
    setPayment: db.prepare("UPDATE orders SET payment_id = ?, confirmation_url = ?, status = 'pending' WHERE id = ? AND status = 'new'"),
    markPaid: db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status != 'paid'"),
    markCanceled: db.prepare("UPDATE orders SET status = 'canceled' WHERE id = ? AND status IN ('new', 'pending')"),
    setError: db.prepare('UPDATE orders SET last_error = ? WHERE id = ?'),
    setTg: db.prepare('UPDATE orders SET tg_sent = 1 WHERE id = ?'),
    setEmail: db.prepare('UPDATE orders SET email_sent = 1 WHERE id = ?'),
    bumpEmail: db.prepare('UPDATE orders SET email_attempts = email_attempts + 1 WHERE id = ?'),
    pendingPay: db.prepare("SELECT * FROM orders WHERE status = 'pending' AND created_at > ? ORDER BY created_at"),
    unfinished: db.prepare("SELECT * FROM orders WHERE status = 'paid' AND (tg_sent = 0 OR (email_sent = 0 AND email_attempts < 8)) ORDER BY created_at"),
    recent: db.prepare('SELECT * FROM orders ORDER BY seq DESC LIMIT ?'),
    stale: db.prepare("UPDATE orders SET status = 'canceled' WHERE status IN ('new', 'pending') AND created_at < ?")
  };

  return {
    raw: db,
    close: () => db.close(),
    insertOrder(o) {
      const created = new Date().toISOString();
      // порядковый номер известен только после вставки: сначала временный номер, затем настоящий
      const r = q.insert.run(o.id, `tmp-${o.id}`, created, o.goods, o.discount, o.delivery, o.total, o.promo ?? null, JSON.stringify(o.lines), JSON.stringify(o.customer), JSON.stringify(o.deliveryInfo), o.comment ?? '');
      q.setNumber.run(`${o.prefix}-${1000 + Number(r.lastInsertRowid)}`, o.id);
      return parse(q.byId.get(o.id));
    },
    byId: (id) => parse(q.byId.get(id)),
    byNumber: (n) => parse(q.byNumber.get(n)),
    setPayment: (id, paymentId, url) => q.setPayment.run(paymentId, url, id).changes === 1,
    /** true, только если именно этот вызов перевёл заказ в «оплачен» (защита от повторных уведомлений) */
    markPaid: (id) => q.markPaid.run(new Date().toISOString(), id).changes === 1,
    markCanceled: (id) => q.markCanceled.run(id).changes === 1,
    setError: (id, msg) => q.setError.run(String(msg).slice(0, 500), id),
    setTelegramSent: (id) => q.setTg.run(id),
    setEmailSent: (id) => q.setEmail.run(id),
    bumpEmailAttempts: (id) => q.bumpEmail.run(id),
    pendingPayments: (sinceIso) => q.pendingPay.all(sinceIso).map(parse),
    unfinishedPaid: () => q.unfinished.all().map(parse),
    recent: (limit = 20) => q.recent.all(limit).map(parse),
    cancelStale: (beforeIso) => q.stale.run(beforeIso).changes
  };
}
