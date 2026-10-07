# Запуск lisinashop.ru на своём сервере

Схема: nginx раздаёт готовый сайт из `dist/` и передаёт запросы `/api/` небольшому серверу на Node.js (заказы, оплата ЮKassa, СДЭК, Telegram, почта). База заказов лежит в одном файле SQLite.

## Что нужно

- Сервер (VPS) **в России**: закон 152-ФЗ требует хранить персональные данные россиян (имя, телефон, адрес из заказов) на российских серверах. Хватит Ubuntu 22.04 или 24.04 с 1 ГБ памяти (Timeweb, Selectel, Beget и т. п.).
- Node.js 22.13 или новее, nginx, certbot (сертификат HTTPS).
- Доступ к ЮKassa, СДЭК, почтовому ящику `info@lisinashop.ru` и бот в Telegram (см. `.env.example`).

## Установка

```bash
# 1. Пользователь и программы
sudo adduser --system --group --home /var/www/lisinashop lisinashop
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx

# 2. Проект (скопируйте содержимое репозитория в /var/www/lisinashop)
cd /var/www/lisinashop
sudo -u lisinashop npm ci --omit=dev

# 3. Сайт собирается на вашем компьютере (нужен Chrome) и загружается готовым:
#    у себя:   npm run build
#    на сервер: rsync -a dist/ user@server:/var/www/lisinashop/dist/
#               rsync -a deploy/redirects.generated.conf user@server:/var/www/lisinashop/deploy/

# 4. Настройки: заполните .env по образцу .env.example и закройте доступ
sudo -u lisinashop cp .env.example .env && sudo -u lisinashop nano .env && sudo chmod 600 .env

# 5. Закрытые файлы (в git их нет, переносите вручную и только по защищённому каналу):
#    server/private/digital.json   ссылки на платные материалы по артикулам
#    server/private/promo.json     промокоды (см. server/promo.example.json)

# 6. Автозапуск сервера
sudo cp deploy/lisinashop.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now lisinashop
journalctl -u lisinashop -n 30       # в логе будут предупреждения о ненастроенных частях

# 7. nginx и HTTPS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/lisinashop
sudo ln -s /etc/nginx/sites-available/lisinashop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d lisinashop.ru -d www.lisinashop.ru
```

## Настройка ЮKassa

В личном кабинете ЮKassa: **Интеграция → HTTP-уведомления**. Укажите адрес `https://lisinashop.ru/api/yookassa/webhook` и включите события `payment.succeeded` и `payment.canceled`. Ключи API (`shopId` и секретный ключ) впишите в `.env`.

Внимание: адрес уведомлений в магазине ЮKassa один. Пока он указывает на Tilda, оплаты старого сайта подтверждаются через него. Меняйте его **в момент переключения домена**. Для проверок заведите отдельный тестовый магазин ЮKassa и временный `.env`.

## Проверка перед запуском

1. `curl https://lisinashop.ru/api/health` отвечает `{"ok":true}`, `/api/config` показывает `payments: true` и `cdek: true`.
2. Оформите тестовый заказ тестовыми картами ЮKassa: в Telegram пришло сообщение, на почту пришло письмо, чек есть в кабинете ЮKassa.
3. Закажите один электронный сборник: ссылка пришла в письме.
4. Закажите товар с доставкой СДЭК в пункт выдачи и курьером: сумма доставки совпадает с калькулятором СДЭК.
5. Сверьте с бухгалтером содержимое чека: система налогообложения, НДС, предмет расчёта.

## Обновление и резервные копии

- Новая версия: обновить файлы, `npm ci --omit=dev`, `sudo systemctl restart lisinashop`. Сайт заново собирается командой `npm run build` и загружается в `dist/`.
- Заказы лежат в `server/data/orders.sqlite`. Копируйте каждый день: `sqlite3 server/data/orders.sqlite ".backup '/var/backups/orders-$(date +%F).sqlite'"`.
- Список заказов: `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://lisinashop.ru/api/admin/orders`.

## Переключение домена lisinashop.ru с Tilda

Сейчас: DNS-серверы `ns1/ns2.tildadns.com` (зона у Tilda), сайт `176.57.65.37` (Tilda), почта на Mail.ru для домена (`MX emx.mail.ru`, SPF, DKIM, запись `mailru-domain`).

1. Подготовьте и полностью проверьте новый сайт на временном адресе (поддомен `new.lisinashop.ru` или адрес сервера).
2. За 1-2 дня до переключения уменьшите TTL записей до 300 секунд.
3. Измените запись **A** для `lisinashop.ru` на IP нового сервера (и `www`). Записи зоны сейчас хранятся у Tilda, поэтому либо правьте их в настройках домена в Tilda, либо верните управление зоной регистратору и перенесите записи туда.
4. **Не трогайте** `MX`, SPF, DKIM и `mailru-domain`: иначе перестанет работать почта `info@lisinashop.ru`, а письма магазина будут попадать в спам.
5. Выпустите сертификат (`certbot`), включите HTTPS и `Strict-Transport-Security`.
6. Переключите адрес HTTP-уведомлений в ЮKassa на `https://lisinashop.ru/api/yookassa/webhook` и сделайте реальный платёж на минимальную сумму.
7. Проверьте старые адреса: `/pilulya_prof`, `/badi`, `/payment` и страницы товаров должны давать редирект 301 на новые.
8. Отправьте `https://lisinashop.ru/sitemap.xml` в Яндекс Вебмастер и Google Search Console. Верните Яндекс Метрику (код нужно добавить в сборку).
9. Tilda не отключайте 2-4 недели: это запасной вариант.

Откат: вернуть прежнюю запись A (и адрес уведомлений ЮKassa на Tilda). Из-за малого TTL сайт вернётся за несколько минут.
