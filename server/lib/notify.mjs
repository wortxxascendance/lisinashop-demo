// Уведомления: заказ в Telegram (менеджеру) и письмо покупателю с составом и ссылками на электронные материалы.
import nodemailer from 'nodemailer';
import { kopToRub } from './pricing.mjs';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function deliveryText(d, cfg) {
  switch (d.method) {
    case 'cdek_pvz': return `СДЭК, пункт выдачи: ${d.cityName || ''}, ${d.pointAddress || ''} (код ${d.pointCode})`;
    case 'cdek_courier': return `СДЭК, курьер: ${d.cityName || ''}, ${d.address || ''}`;
    case 'pickup': return `Самовывоз (${cfg.pickupCity})`;
    default: return 'Электронные материалы, отправка на почту';
  }
}

export function createTelegram(cfg, fetchImpl = fetch) {
  const enabled = Boolean(cfg.token && cfg.chatId);
  return {
    enabled,
    async send(text) {
      if (!enabled) return false;
      for (let i = 0; i < text.length; i += 3900) {
        const res = await fetchImpl(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: cfg.chatId, text: text.slice(i, i + 3900), parse_mode: 'HTML', disable_web_page_preview: true }),
          signal: AbortSignal.timeout(15_000)
        });
        if (!res.ok) throw new Error(`Telegram: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      return true;
    }
  };
}

/** Текст сообщения менеджеру. extra: { digitalMissing: [названия товаров без ссылки], emailOk: boolean|null } */
export function orderTelegramText(order, cfg, extra = {}) {
  const lines = order.lines.map((l) => `• ${esc(l.title)} × ${l.qty} = ${kopToRub(l.unitKop * l.qty)}`).join('\n');
  const parts = [
    `<b>Оплачен заказ ${esc(order.number)}</b> на ${kopToRub(order.total_kop)}`,
    '',
    `<b>Покупатель:</b> ${esc(order.customer.name)}`,
    `${esc(order.customer.phone)} · ${esc(order.customer.email)}`,
    '',
    `<b>Доставка:</b> ${esc(deliveryText(order.delivery, cfg))}${order.delivery_kop ? ` (${kopToRub(order.delivery_kop)})` : ''}`,
    '',
    `<b>Состав:</b>\n${lines}`
  ];
  if (order.discount_kop) parts.push('', `Скидка по промокоду ${esc(order.promo || '')}: −${kopToRub(order.discount_kop)}`);
  if (order.comment) parts.push('', `<b>Комментарий:</b> ${esc(order.comment)}`);
  if (extra.digitalMissing?.length) parts.push('', `⚠️ <b>Нет ссылки на материалы, отправьте вручную:</b>\n${extra.digitalMissing.map(esc).join('\n')}`);
  if (extra.emailOk === false) parts.push('', '⚠️ Письмо покупателю не ушло, сервер повторит попытку. Если не получится, напишите сами.');
  return parts.join('\n');
}

export function createMailer(cfg, transportFactory = nodemailer.createTransport) {
  const enabled = Boolean(cfg.host && cfg.user && cfg.pass);
  const transport = enabled ? transportFactory({ host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.user, pass: cfg.pass } }) : null;

  return {
    enabled,
    /** digitalItems: [{ title, links: [url] }] */
    async sendOrderPaid(order, { digitalItems = [], siteCfg }) {
      if (!enabled) return false;
      const rows = order.lines.map((l) => `<tr><td style="padding:6px 0">${esc(l.title)} × ${l.qty}</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${kopToRub(l.unitKop * l.qty)}</td></tr>`).join('');
      const digital = digitalItems.length
        ? `<h3 style="margin:24px 0 8px">Ваши материалы</h3>${digitalItems.map((d) => `<p style="margin:6px 0"><b>${esc(d.title)}</b><br>${d.links.map((u) => `<a href="${esc(u)}">${esc(u)}</a>`).join('<br>')}</p>`).join('')}`
        : '';
      const physical = order.lines.some((l) => !l.digital);
      const ship = physical ? `<p><b>Доставка:</b> ${esc(deliveryText(order.delivery, siteCfg))}. Мы передадим заказ в доставку и свяжемся с вами, если понадобится что-то уточнить.</p>` : '';
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#171214;line-height:1.5">
<h2 style="margin:0 0 4px">Спасибо за заказ!</h2>
<p style="margin:0 0 16px;color:#77696e">Заказ ${esc(order.number)} оплачен. Чек придёт отдельным письмом от платёжного сервиса.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #e8dddb;border-bottom:1px solid #e8dddb">${rows}
${order.discount_kop ? `<tr><td style="padding:6px 0">Скидка</td><td style="text-align:right">−${kopToRub(order.discount_kop)}</td></tr>` : ''}
${physical ? `<tr><td style="padding:6px 0">Доставка</td><td style="text-align:right">${order.delivery_kop ? kopToRub(order.delivery_kop) : 'Бесплатно'}</td></tr>` : ''}
<tr><td style="padding:10px 0;font-weight:bold">Итого</td><td style="text-align:right;font-weight:bold">${kopToRub(order.total_kop)}</td></tr></table>
${ship}${digital}
<p style="margin-top:24px;color:#77696e;font-size:13px">Вопросы по заказу: ${esc(siteCfg.supportEmail || cfg.from)}, Telegram @piiilulya. ООО «ЛИСИНА», ИНН 3460085337.</p></div>`;
      const text = [`Спасибо за заказ! Заказ ${order.number} оплачен на ${kopToRub(order.total_kop)}.`, ...order.lines.map((l) => `${l.title} × ${l.qty}`), ...digitalItems.flatMap((d) => [d.title, ...d.links])].join('\n');
      await transport.sendMail({ from: cfg.from, to: order.customer.email, subject: `Заказ ${order.number} оплачен · LisinaShop`, text, html });
      return true;
    }
  };
}
