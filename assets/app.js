/* LisinaShop — демо-витрина. Роутинг по #якорям, корзина и избранное в localStorage. */
(function () {
  'use strict';

  var PRODUCTS = window.LS_PRODUCTS || [];
  var byId = {};
  PRODUCTS.forEach(function (p) { byId[p.id] = p; });

  var FREE_SHIP = 4500;
  var app = document.getElementById('app');

  var CATS = {
    prof: { title: 'Pilulya Prof', lead: 'Профессиональная линия PILULYA для салонов и мастеров: шампунь, маска, лосьон-концентрат и колор-добавки, которые берегут волосы во время окрашивания.' },
    home: { title: 'Уход дома', lead: 'Средства PILULYA для домашнего ухода: восстановление, рост волос, мисты с гиалуроновой кислотой, серия Cloud of love и парфюмированные кремы.' },
    badi: { title: 'Бады и активы', lead: 'Активы и ингредиенты для создания уходовой косметики своими руками. У каждого указаны INCI, рекомендованный ввод и pH.' },
    rezept: { title: 'Сборники', lead: 'Авторские рецепты и протоколы Татьяны Лисиной в электронном формате. Ссылка приходит на почту сразу после оплаты.' },
    sale: { title: 'Акции и новинки', lead: 'Выгодные наборы PILULYA и свежие поступления. Количество акционных наборов ограничено.' },
    all: { title: 'Весь каталог', lead: 'Профессиональная косметика PILULYA, активы для тритментологов и электронные сборники рецептов.' }
  };
  var CAT_ORDER = ['all', 'prof', 'home', 'badi', 'rezept', 'sale'];

  var REVIEWS = [
    { n: 'Людмила Чеснокова', r: 'колорист, Архангельск', t: 'Отличные компоненты. Заказываю постоянно, только здесь. Если всё сделать правильно, получается рабочий продукт, который быстро восстанавливает волосы. Все мои блондинки обожают эту косметику.' },
    { n: 'Евгения Крюкова', r: 'руководитель салона, Волгодонск', t: 'Заказываю бады для создания индивидуальных масок для клиентов. Качество и упаковка продукции отличные. Клиенты стоят в очереди за нашими масками. Спасибо за знания и такую шикарную продукцию!' },
    { n: 'Муяссара Курбанова', r: 'парикмахер-колорист, Калуга', t: 'Не первый раз беру в этом надёжном магазине БАДы для изготовления уходовой косметики. Всегда хорошо упаковано, доставка в срок. На продукцию нареканий не было и нет.' },
    { n: 'Александра Филина', r: 'парикмахер, Мытищи', t: 'Очень нравятся в работе все концентраты. Прохожу все обучения у Татьяны. Работать стала увереннее, применяю знания и БАДы. Заметила, что увеличила свой чек услуг.' },
    { n: 'Татьяна Игнатова', r: 'женский мастер', t: 'Прошла обучение на курсе «Тритментолог-лаборант» и активно использую БАДы в работе. Делаю собственную косметику для волос. Очень качественные продукты — я и мои клиенты в восторге от результата.' },
    { n: 'Екатерина Гусева', r: 'мастер', t: 'Уже два года заказываю активы с сайта LisinaShop и всегда уверена, что качество отличное. Все составы рабочие! Вижу результат на своих клиентах.' },
    { n: 'Елена Петренко', r: 'мастер по наращиванию, Междуреченск', t: 'Курс «Тритментолог» — это просто восхищение. Теперь я могу сама делать косметику для волос! Все активы куплены в этом магазине, и они работают на 100%.' },
    { n: 'Олеся Горелова', r: 'парикмахер-колорист', t: 'Пользуюсь косметикой от LisinaShop уже почти год и всегда довольна продукцией и доставкой. Огромная благодарность за ваш магазин!' }
  ];

  /* ---------- Утилиты ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽'; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
  function icon(id, cls) { return '<svg class="i' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function fox(cls) { return '<svg class="' + (cls || 'fox') + '" viewBox="0 0 64 64" aria-hidden="true"><use href="#fox"/></svg>'; }
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? a : (m >= 2 && m <= 4 && (h < 12 || h > 14)) ? b : c; }
  function find(part) { part = norm(part); for (var i = 0; i < PRODUCTS.length; i++) if (norm(PRODUCTS[i].title).indexOf(part) !== -1) return PRODUCTS[i]; return null; }
  function pick(list) { return list.map(find).filter(Boolean); }
  function inCat(p, cat) {
    if (cat === 'all') return true;
    if (cat === 'sale') return p.old > 0 || p.mark === 'NEW';
    return p.in.some(function (x) { return x[0] === cat; });
  }
  function subsOf(p, cat) {
    if (cat === 'sale') return [p.old > 0 ? 'Спецпредложения' : 'Новинки'];
    if (cat === 'all') return [p.sub];
    return p.in.filter(function (x) { return x[0] === cat; }).map(function (x) { return x[1]; });
  }
  function isDigital(p) { return p.cat === 'rezept'; }
  function minPrice(p) { return p.opts ? Math.min.apply(null, p.opts.values.map(function (v) { return v.price; })) : p.price; }
  function optPrice(p, opt) { return p.opts && p.opts.values[opt] ? p.opts.values[opt].price : p.price; }
  function optLabel(p, opt) {
    if (!p.opts || !p.opts.values[opt]) return '';
    var unit = /вес/i.test(p.opts.title) ? ' г' : /объ/i.test(p.opts.title) ? ' мл' : '';
    return p.opts.values[opt].label + unit;
  }
  function img(p, i) { return p.images[i || 0] || ''; }
  function imgTag(src, alt, extra) {
    return src ? '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '" loading="lazy" decoding="async"' + (extra || '') + '>' : '';
  }
  function textBtn(action, label) {
    return '<button type="button" class="link-arrow linklike" data-action="' + action + '">' + label + '</button>';
  }

  /* Достаём INCI, ввод и pH из описания актива */
  function specOf(p) {
    if (p._spec) return p._spec;
    var spec = {};
    String(p.html || '').split(/<br\s*\/?>|<\/?p>|<\/li>/i).forEach(function (line) {
      var t = line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      var m = t.match(/^(INCI|Ввод|pH)\s*:\s*(.+)$/i);
      if (m && !spec[m[1].toLowerCase()]) spec[m[1].toLowerCase()] = m[2].trim();
    });
    p._spec = spec;
    return spec;
  }

  /* ---------- Хранилище ---------- */
  function load(key, def) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* хранилище недоступно — работаем в памяти */ } }
  var cart = load('ls_cart', []).filter(function (l) { return l && byId[l.id]; });
  var favs = load('ls_fav', []).filter(function (id) { return byId[id]; });

  function keyOf(id, opt) { return id + ':' + (opt || 0); }
  function lineByKey(key) { for (var i = 0; i < cart.length; i++) if (keyOf(cart[i].id, cart[i].opt) === key) return cart[i]; return null; }
  function qtyOf(id, opt) { var l = lineByKey(keyOf(id, opt)); return l ? l.qty : 0; }
  function cartTotal() { return cart.reduce(function (s, l) { return s + optPrice(byId[l.id], l.opt) * l.qty; }, 0); }
  function cartCount() { return cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function cartDigitalOnly() { return cart.length > 0 && cart.every(function (l) { return isDigital(byId[l.id]); }); }

  function addToCart(id, opt) {
    opt = opt || 0;
    var l = lineByKey(keyOf(id, opt));
    if (l) l.qty += 1; else cart.push({ id: id, opt: opt, qty: 1 });
    save('ls_cart', cart);
    cartChanged(id, true);
  }
  function setQty(key, qty) {
    var l = lineByKey(key);
    if (!l) return;
    var id = l.id;
    if (qty <= 0) cart.splice(cart.indexOf(l), 1); else l.qty = qty;
    save('ls_cart', cart);
    cartChanged(id);
  }
  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i === -1) favs.push(id); else favs.splice(i, 1);
    save('ls_fav', favs);
    var on = i === -1;
    $all('[data-fav="' + id + '"]').forEach(function (b) {
      b.classList.toggle('is-fav', on);
      b.setAttribute('aria-pressed', on);
      b.innerHTML = icon(on ? 'i-heart-fill' : 'i-heart');
    });
    updateBadges(false, on);
    if (on) toast('Сохранено в избранном', 'i-heart-fill', 'Открыть', 'go-favs');
    if (route().name === 'favorites') render();
  }

  /* ---------- Значки в шапке ---------- */
  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function updateBadges(bumpCart, bumpFav) {
    var c = cartCount();
    $all('[data-cart-count]').forEach(function (b) { b.textContent = c; b.hidden = !c; if (bumpCart) bump(b); });
    $all('[data-cart-sum]').forEach(function (b) { b.textContent = c ? money(cartTotal()) : ''; });
    $all('[data-fav-count]').forEach(function (b) { b.textContent = favs.length; b.hidden = !favs.length; if (bumpFav) bump(b); });
  }

  function cartChanged(id, added) {
    updateBadges(added);
    $all('[data-foot="' + id + '"]').forEach(function (el) { el.innerHTML = footInner(byId[id]); });
    var buy = $('[data-buy="' + id + '"]');
    if (buy) buy.outerHTML = buyBlock(byId[id], pdpOpt);
    if (!$('#cart').hidden) renderCart();
    if (route().name === 'checkout') renderSummary();
    if (added && $('#cart').hidden) toast('В корзине: ' + byId[id].title, 'i-check', 'Корзина', 'open-cart');
  }

  /* ---------- Карточка ---------- */
  function marks(p) {
    var out = '';
    if (p.mark === 'NEW') out += '<span class="mark">New</span>';
    else if (p.mark) out += '<span class="mark mark--sale">' + esc(p.mark.replace('-', '−')) + '</span>';
    if (p.old > 0 && !/^-/.test(p.mark)) out += '<span class="mark mark--sale">−' + Math.round((1 - p.price / p.old) * 100) + '%</span>';
    if (isDigital(p)) out += '<span class="mark mark--soft">PDF</span>';
    return out ? '<div class="card__marks">' + out + '</div>' : '';
  }
  function priceHTML(p) {
    return '<div class="price"><b>' + (p.opts ? 'от ' : '') + money(minPrice(p)) + '</b>' + (p.old > 0 ? '<s>' + money(p.old) + '</s>' : '') + '</div>';
  }
  function stepper(key, q, light) {
    return '<div class="stepper' + (light ? ' stepper--light' : '') + '"><button type="button" data-action="dec" data-key="' + key + '" aria-label="Уменьшить количество">' + icon('i-minus') + '</button><span aria-live="polite">' + q + '</span><button type="button" data-action="inc" data-key="' + key + '" aria-label="Увеличить количество">' + icon('i-plus') + '</button></div>';
  }
  function footInner(p) {
    var q = qtyOf(p.id, 0);
    var ctrl = q ? stepper(keyOf(p.id, 0), q)
      : '<button type="button" class="add" data-action="add" data-id="' + p.id + '" aria-label="Добавить в корзину: ' + esc(p.title) + '">' + icon('i-plus') + '</button>';
    return priceHTML(p) + ctrl;
  }
  function favBtn(p, cls) {
    var on = favs.indexOf(p.id) !== -1;
    return '<button type="button" class="icon-btn ' + cls + (on ? ' is-fav' : '') + '" data-action="fav" data-fav="' + p.id + '" aria-pressed="' + on + '" aria-label="В избранное">' + icon(on ? 'i-heart-fill' : 'i-heart') + '</button>';
  }
  function card(p, ctx) {
    var spec = p.cat === 'badi' ? specOf(p) : null;
    var sub = ctx ? (subsOf(p, ctx)[0] || p.sub) : p.sub;
    var line = spec && spec.inci ? '<p class="card__inci" title="' + esc(spec.inci) + '">INCI: ' + esc(spec.inci) + '</p>' : '';
    return '<article class="card">' +
      '<a class="card__media" href="#p-' + p.id + '" aria-label="' + esc(p.title) + '">' + imgTag(img(p, 0), p.title) + (p.images[1] ? imgTag(img(p, 1), '', ' aria-hidden="true"') : '') + marks(p) + '</a>' +
      favBtn(p, 'card__fav') +
      '<div class="card__body"><span class="card__sub">' + esc(sub) + '</span>' +
      '<a class="card__title" href="#p-' + p.id + '">' + esc(p.title) + '</a>' + line +
      '<div class="card__foot" data-foot="' + p.id + '">' + footInner(p) + '</div></div></article>';
  }

  /* ---------- Роутинг ---------- */
  function route() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h || h === 'home') return { name: 'home' };
    if (h === 'catalog') return { name: 'catalog', cat: 'all' };
    var m = h.match(/^catalog-(\w+)$/);
    if (m && CATS[m[1]]) return { name: 'catalog', cat: m[1] };
    m = h.match(/^p-(\d+)$/);
    if (m && byId[m[1]]) return { name: 'product', id: m[1] };
    if (h === 'checkout' || h === 'delivery' || h === 'favorites' || h === 'done') return { name: h };
    return { name: 'home' };
  }

  var catState = { cat: null, sub: '', q: '', sort: 'pop' };
  var pdpOpt = 0;
  var lastOrder = null;

  function render(resetScroll) {
    var r = route();
    closeAll(true);
    if (r.name === 'home') app.innerHTML = homeView();
    else if (r.name === 'catalog') app.innerHTML = catalogView(r.cat);
    else if (r.name === 'product') app.innerHTML = productView(byId[r.id]);
    else if (r.name === 'checkout') app.innerHTML = checkoutView();
    else if (r.name === 'delivery') app.innerHTML = deliveryView();
    else if (r.name === 'favorites') app.innerHTML = favoritesView();
    else if (r.name === 'done') app.innerHTML = doneView();
    if (r.name === 'catalog') catalogResults();
    if (r.name === 'checkout') renderSummary();
    $all('.nav a[data-nav]').forEach(function (a) { a.classList.toggle('is-active', r.name === 'catalog' && a.getAttribute('data-nav') === r.cat); });
    var titles = { catalog: r.cat && CATS[r.cat].title, product: r.id && byId[r.id].title, checkout: 'Оформление заказа', delivery: 'Доставка и оплата', favorites: 'Избранное', done: 'Заказ оформлен' };
    document.title = titles[r.name] ? titles[r.name] + ' — LisinaShop' : 'LisinaShop';
    if (resetScroll) scrollTop();
    setupReveal(app);
    setupMagnetic(app);
    if (r.name === 'home' && booted) heroEnter();
  }

  /* ---------- Главная ---------- */
  function homeView() {
    var filler = find('MOLECULAR LIPID');
    var kit = find('тартовый набор');
    var set1 = find('Шампунь + Маска + Подарок');
    var set2 = find('КОЛОР СТРАХОВКА');
    var box = find('ТРИТМЕНТОЛОГА');
    var protocol = find('Молекулярный каркас');
    var count = function (c) { return PRODUCTS.filter(function (p) { return inCat(p, c); }).length; };

    var hero = '<section class="hero"><div class="wrap hero__grid">' +
      '<div class="hero__text">' +
        (filler ? '<a class="hero__tag" data-in style="--d:.05s" href="#p-' + filler.id + '"><b>NEW</b> Филлер-реконструктор Molecular Lipid ' + icon('i-arrow', 'i--xs') + '</a>' : '') +
        '<h1 class="h1"><span class="hl"><span style="--i:0">Уход за волосами</span></span><span class="hl"><span style="--i:1"><em>профессионального</em></span></span><span class="hl"><span style="--i:2">уровня</span></span></h1>' +
        '<p class="lead" data-in style="--d:.45s">Косметика PILULYA, активы и рецепты Татьяны Лисиной для мастеров, тритментологов и тех, кто ухаживает за волосами дома.</p>' +
        '<div class="hero__actions" data-in style="--d:.6s"><a class="btn" data-magnetic href="#catalog">Перейти в каталог ' + icon('i-arrow') + '</a><button type="button" class="btn btn--ghost" data-magnetic data-action="open-quiz">Подобрать уход</button></div>' +
        '<div class="hero__facts" data-in style="--d:.75s"><div><b data-count="' + PRODUCTS.length + '">' + PRODUCTS.length + '</b><span>товаров в каталоге</span></div><div><b data-count="15" data-prefix="−" data-suffix="%">−15%</b><span>к ценам на WB</span></div><div><b data-count="4500" data-suffix=" ₽">4 500 ₽</b><span>бесплатная доставка от</span></div></div>' +
      '</div>' +
      '<div class="hero__visual">' +
        '<div class="arch"><div class="arch__px"><img src="assets/img/hero-tall.webp" alt="Профессиональная линия PILULYA" fetchpriority="high"></div></div>' +
        (kit ? '<a class="hero__seal" data-in style="--d:1.1s" href="#p-' + kit.id + '" aria-label="Стартовый набор со скидкой 62%"><svg class="seal__ring" viewBox="0 0 120 120" aria-hidden="true"><defs><path id="seal-path" d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0"/></defs><text><textPath href="#seal-path" textLength="290">СТАРТОВЫЙ НАБОР · ВЫГОДА · PILULYA ·</textPath></text></svg><span class="seal__c">−62%</span></a>' : '') +
        (filler ? '<a class="hero__card" data-in style="--d:1.25s" href="#p-' + filler.id + '">' + imgTag(img(filler, 0), '') + '<p><b>Molecular Lipid</b>Филлер для повреждённых волос · ' + money(filler.price) + '</p></a>' : '') +
      '</div></div></section>';

    var perks = '<section class="perks" aria-label="Преимущества"><div class="wrap perks__grid">' +
      perk('i-tag', 'На 15% дешевле, чем на WB', 'Покупайте напрямую у бренда') +
      perk('i-truck', 'Бесплатная доставка', 'СДЭК при заказе от 4 500 ₽') +
      perk('i-flask', 'Составы с INCI', 'Ввод и pH для каждого актива') +
      perk('i-cap', 'Обучение', 'Академия Татьяны Лисиной') +
      '</div></section>';

    var cats = '<section class="section"><div class="wrap">' +
      '<div class="section-head"><div><p class="eyebrow">Каталог</p><h2 class="h2">Всё для ухода — <em>в одном месте</em></h2></div><a class="link-arrow" href="#catalog">Весь каталог ' + icon('i-arrow') + '</a></div>' +
      '<div class="cats">' +
        catTile('prof', 'cat--lg', 'assets/img/prof-shampoo.webp', 'Профессиональная линия для салонов: шампунь, маска и колор-добавки.', count('prof')) +
        catTile('home', 'cat--md', 'assets/img/growth.webp', 'Восстановление, рост волос, мисты и кремы с феромонами.', count('home')) +
        catTile('badi', '', box ? img(box, 0) : '', 'Активы с INCI для своей косметики.', count('badi')) +
        catTile('rezept', '', protocol ? img(protocol, 0) : '', 'Рецепты и протоколы в PDF.', count('rezept')) +
      '</div></div></section>';

    var kitBlock = '';
    if (kit) {
      var items = (kit.html.match(/<li>(.*?)<\/li>/g) || []).map(function (s) { return s.replace(/<[^>]+>/g, '').trim(); }).filter(function (s) { return /\d\s*шт/.test(s); });
      kitBlock = '<section class="section kit"><div class="wrap kit__grid">' +
        '<div class="kit__img">' + imgTag('assets/img/starter-kit.webp', 'Стартовый набор PILULYA') + '<span class="mark mark--sale">−62%</span></div>' +
        '<div class="kit__text"><p class="eyebrow">Специальное предложение</p>' +
          '<h2 class="h2">Стартовый набор «Пилюля»</h2>' +
          '<p class="lead">69 единиц продукции: полный розничный ассортимент бренда и профессиональные средства для работы в салоне.</p>' +
          '<div class="kit__save">' +
            '<div class="kit__row"><span>Стоимость по розничным ценам</span><s>' + money(kit.old) + '</s></div>' +
            '<div class="kit__row"><strong data-count="' + kit.price + '" data-from="' + kit.old + '" data-suffix=" ₽">' + money(kit.price) + '</strong><span class="kit__save-badge">Экономия ' + money(kit.old - kit.price) + '</span></div>' +
            '<div class="kit__bar" aria-hidden="true"><i></i></div>' +
            '<p class="kit__note">Вы платите 38% от розничной стоимости. Всего 100 наборов.</p>' +
          '</div>' +
          (items.length ? '<ul class="kit__list">' + items.slice(0, 6).map(function (s) { return '<li>' + icon('i-check') + '<span>' + esc(s) + '</span></li>'; }).join('') + '</ul>' : '') +
          '<div class="kit__actions"><button type="button" class="btn btn--rose" data-magnetic data-action="add" data-id="' + kit.id + '">Добавить в корзину ' + icon('i-bag') + '</button><a class="btn btn--outline-light" href="#p-' + kit.id + '">Весь состав набора</a></div>' +
        '</div></div></section>';
    }

    var promos = '<section class="section"><div class="wrap">' +
      '<div class="section-head"><div><p class="eyebrow">Акции</p><h2 class="h2">Выгодные наборы <em>PILULYA</em></h2></div><a class="link-arrow" href="#catalog-sale">Все акции и новинки ' + icon('i-arrow') + '</a></div>' +
      '<div class="promos">' +
        (set1 ? promo(set1, '', 'Маска + шампунь, филлер в подарок', 'Купите шампунь и маску серии PROFESSIONAL и получите филлер Molecular Lipid в подарок.', 'assets/img/hero-wide.webp') : '') +
        (set2 ? promo(set2, 'promo--alt', 'Колор страховка 3 + 1', 'Профессиональный пакет добавок PILULYA защищает волосы при обесцвечивании, окрашивании и тонировании.', 'assets/img/color-additives.webp') : '') +
      '</div></div></section>';

    var hits = '<section class="section section--tight"><div class="wrap">' +
      '<div class="section-head"><div><p class="eyebrow">Выбор покупателей</p><h2 class="h2">Хиты и новинки</h2></div>' +
        '<div class="head-tools"><div class="tabs" role="tablist" aria-label="Подборки">' +
          '<button type="button" class="chip is-active" role="tab" aria-selected="true" data-action="hits" data-set="hits">Хиты PILULYA</button>' +
          '<button type="button" class="chip" role="tab" aria-selected="false" data-action="hits" data-set="new">Новинки</button>' +
          '<button type="button" class="chip" role="tab" aria-selected="false" data-action="hits" data-set="pro">Для тритментологов</button>' +
        '</div>' + railNav('hits-rail') + '</div>' +
      '</div><div class="rail" id="hits-rail">' + hitsSet('hits') + '</div></div></section>';

    var quiz = '<section class="section section--tight"><div class="wrap"><div class="quiz-cta">' + fox('quiz-cta__fox') +
      '<div class="quiz-cta__text"><p class="eyebrow">Протокол ухода</p><h2 class="h2">Подберём уход за&nbsp;1&nbsp;минуту</h2><p class="lead">Ответьте на три вопроса о волосах, а мы соберём персональный протокол из средств PILULYA и активов.</p><button type="button" class="btn" data-magnetic data-action="open-quiz">Пройти тест ' + icon('i-arrow') + '</button></div>' +
      '<div class="quiz-cta__steps"><div><b>1</b>Какие у вас волосы</div><div><b>2</b>Где вы за ними ухаживаете</div><div><b>3</b>Какой результат нужен</div></div>' +
      '</div></div></section>';

    var nBooks = count('rezept');
    var booksBlock = '<section class="section section--blush"><div class="wrap books">' +
      '<div class="books__intro"><p class="eyebrow">Сборники и уроки</p><h2 class="h2">Рецепты от&nbsp;тритментолога</h2>' +
        '<ul><li>' + icon('i-mail') + 'Электронный формат: ссылка приходит на почту сразу после оплаты</li><li>' + icon('i-flask') + 'Точные формулы с вводом каждого актива</li><li>' + icon('i-spark') + 'От ' + money(200) + ' за сборник</li></ul>' +
        '<a class="btn" href="#catalog-rezept">Все ' + nBooks + ' ' + plural(nBooks, 'сборник', 'сборника', 'сборников') + ' ' + icon('i-arrow') + '</a></div>' +
      '<div class="grid grid--3">' + pick(['Протокол - Молекулярный каркас', 'протокол реконструкции блондированных', 'Протокол SOS', 'Шелковое полотно', 'Сборник №1', 'Видеоурок №3']).map(function (p) { return card(p); }).join('') + '</div>' +
      '</div></section>';

    var school = '<section class="section"><div class="wrap"><div class="school">' +
      '<div class="school__img">' + imgTag('assets/img/trio.webp', 'Академия Татьяны Лисиной') + '</div>' +
      '<div class="school__text"><p class="eyebrow">Обучение</p><h2 class="h2">Академия Татьяны Лисиной</h2>' +
        '<p class="lead">Курсы «Тритментолог» и «Тритментолог-лаборант»: научитесь создавать косметику для волос и выстраивать протоколы ухода для клиентов.</p>' +
        '<ul class="school__list"><li>' + icon('i-check') + 'Работа с активами и расчёт формул</li><li>' + icon('i-check') + 'Индивидуальные маски и уходы в салоне</li><li>' + icon('i-check') + 'Рост среднего чека услуг</li></ul>' +
        '<a class="btn" href="https://lisinaschool.ru" target="_blank" rel="noopener">Перейти на lisinaschool.ru ' + icon('i-arrow-up-right') + '</a></div>' +
      '</div></div></section>';

    var reviews = '<section class="section section--tight reviews"><div class="wrap">' +
      '<div class="section-head"><div><p class="eyebrow">Отзывы мастеров</p><h2 class="h2">Нам доверяют колористы и&nbsp;салоны</h2></div>' +
      '<div class="head-tools">' + railNav('rev-rail') + '</div></div>' +
      '<div class="rail" id="rev-rail">' + REVIEWS.map(function (r) {
        var ini = r.n.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
        return '<figure class="review" style="margin:0"><div class="review__stars" role="img" aria-label="Оценка 5 из 5">' + icon('i-star') + icon('i-star') + icon('i-star') + icon('i-star') + icon('i-star') + '</div><blockquote>' + esc(r.t) + '</blockquote><figcaption class="review__who"><span class="avatar" aria-hidden="true">' + esc(ini) + '</span><div><b>' + esc(r.n) + '</b><span>' + esc(r.r) + '</span></div></figcaption></figure>';
      }).join('') + '</div></div></section>';

    var collab = '<section class="section section--tight"><div class="wrap"><div class="collab">' +
      '<div class="collab__img">' + imgTag('assets/img/pool.webp', 'Косметика PILULYA у бассейна') + '</div>' +
      '<div class="collab__text"><p class="eyebrow">Для блогеров</p><h2 class="h2">Дарим косметику PILULYA за&nbsp;честный отзыв</h2>' +
        '<p class="lead">Ведёте Telegram-канал или блог ВКонтакте от 500 подписчиков? Оставьте заявку, мы пришлём косметику и обсудим детали.</p>' +
        '<form class="form" data-form="collab" novalidate>' +
          '<div class="form__row"><div class="field"><label for="c-name">Имя</label><input class="input input--dark" id="c-name" name="name" placeholder="Как к вам обращаться" required></div>' +
          '<div class="field"><label for="c-link">Ссылка на канал или блог</label><input class="input input--dark" id="c-link" name="link" placeholder="t.me/… или vk.com/…" required></div></div>' +
          '<label class="check"><input type="checkbox" id="c-agree" required checked> Даю согласие на обработку персональных данных</label>' +
          '<button class="btn btn--rose" type="submit">Отправить заявку</button>' +
        '</form></div>' +
      '</div></div></section>';

    var support = '<section class="section section--tight"><div class="wrap">' +
      '<div class="section-head"><div><p class="eyebrow">Поддержка</p><h2 class="h2">Остались вопросы?</h2></div><p class="muted" style="max-width:40ch">Поможем подобрать уход, рассчитать формулу или отследить заказ.</p></div>' +
      '<div class="support">' +
        '<a class="support__item" href="https://t.me/piiilulya" target="_blank" rel="noopener"><span class="perk__ic">' + icon('i-send') + '</span><div><b>Техподдержка в Telegram</b><span>@piiilulya</span></div></a>' +
        '<a class="support__item" href="tel:+79275103030"><span class="perk__ic">' + icon('i-phone') + '</span><div><b>+7 (927) 510-30-30</b><span>Звонок по России</span></div></a>' +
        '<a class="support__item" href="mailto:info@lisinashop.ru"><span class="perk__ic">' + icon('i-mail') + '</span><div><b>info@lisinashop.ru</b><span>Для заказов и предложений</span></div></a>' +
      '</div></div></section>';

    var words = ['Молекулярная реконструкция', 'Протеины шёлка', 'Церамиды', 'Гиалуроновая кислота', 'PILULYA Professional', 'Кератин', 'Феромоны', 'Биомиметики'];
    var row = words.map(function (w) { return '<span class="marquee__item">' + esc(w) + fox('') + '</span>'; }).join('');
    var marquee = '<div class="marquee" aria-hidden="true"><div class="marquee__skew"><div class="marquee__track">' + row + row + '</div></div></div>';

    return hero + perks + cats + kitBlock + marquee + promos + hits + quiz + booksBlock + school + reviews + collab + support;
  }

  function railNav(target) {
    return '<div class="rail-nav"><button type="button" data-action="rail" data-dir="-1" data-target="' + target + '" aria-label="Прокрутить назад">' + icon('i-chevron-left') + '</button><button type="button" data-action="rail" data-dir="1" data-target="' + target + '" aria-label="Прокрутить вперёд">' + icon('i-chevron') + '</button></div>';
  }
  function perk(ic, t, s) { return '<div class="perk"><span class="perk__ic">' + icon(ic) + '</span><div><b>' + t + '</b><span>' + s + '</span></div></div>'; }
  function catTile(cat, cls, src, text, n) {
    return '<a class="cat ' + cls + '" href="#catalog-' + cat + '">' + imgTag(src, '') +
      '<span class="cat__count">' + n + ' ' + plural(n, 'товар', 'товара', 'товаров') + '</span><span class="cat__go" aria-hidden="true">' + icon('i-arrow') + '</span>' +
      '<h3>' + CATS[cat].title + '</h3><p>' + text + '</p></a>';
  }
  function promo(p, cls, title, text, src) {
    return '<article class="promo ' + cls + '"><div class="promo__text">' +
      '<span class="promo__limit">' + icon('i-gift') + ' Всего 100 наборов</span>' +
      '<h3 class="h3">' + title + '</h3><p>' + text + '</p>' +
      '<div class="promo__foot"><div class="price"><b style="font-size:24px">' + money(p.price) + '</b><s>' + money(p.old) + '</s></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn--sm" data-action="add" data-id="' + p.id + '">В корзину</button><a class="btn btn--sm btn--ghost" href="#p-' + p.id + '">Подробнее</a></div></div>' +
      '</div><div class="promo__img">' + imgTag(src, '') + '</div></article>';
  }
  function hitsSet(set) {
    var lists = {
      hits: ['Маска для волос PILULYA PROFESSIONAL', 'Шампунь для волос PILULYA PROFESSIONAL', 'MOLECULAR LIPID', 'Лосьон-концентрат', 'Маска липидная', 'Биоэликсир', 'Термозащитный разглаживающий', 'Amino 20 в 1', 'Лосьон для роста волос'],
      pro: ['Церамиды', 'Гиалуроновая кислота', 'Кератин гидролизованный', 'BADD', 'CUTISSENTIAL', 'Протеины шелка', 'Д-пантенол', 'БАЗОВАЯ МАСКА', 'Аргинин']
    };
    var items = set === 'new' ? PRODUCTS.filter(function (p) { return p.mark === 'NEW'; }).slice(0, 10) : pick(lists[set]);
    return items.map(function (p) { return card(p); }).join('');
  }

  /* ---------- Каталог ---------- */
  function catalogView(cat) {
    if (catState.cat !== cat) catState = { cat: cat, sub: '', q: catState.pendingQ || '', sort: 'pop' };
    var info = CATS[cat];
    var all = PRODUCTS.filter(function (p) { return inCat(p, cat); });
    var subs = [];
    all.forEach(function (p) { subsOf(p, cat).forEach(function (s) { if (subs.indexOf(s) === -1) subs.push(s); }); });
    var box = find('ТРИТМЕНТОЛОГА');

    var tabs = CAT_ORDER.map(function (c) {
      var n = PRODUCTS.filter(function (p) { return inCat(p, c); }).length;
      return '<a class="chip' + (c === cat ? ' is-active' : '') + '" href="#catalog' + (c === 'all' ? '' : '-' + c) + '">' + CATS[c].title + ' <span class="count">' + n + '</span></a>';
    }).join('');
    function opt(v, t) { return '<option value="' + v + '"' + (catState.sort === v ? ' selected' : '') + '>' + t + '</option>'; }

    return '<section class="page-head"><div class="wrap">' +
      '<nav class="crumbs" aria-label="Навигация"><a href="#home">Главная</a>' + icon('i-chevron') + '<span>' + info.title + '</span></nav>' +
      '<div class="page-head__row"><div><h1 class="h2">' + info.title + '</h1><p class="lead">' + info.lead + '</p></div></div>' +
      '<div class="cat-tabs">' + tabs + '</div>' +
      '</div></section>' +
      '<div class="toolbar"><div class="wrap toolbar__in">' +
        '<div class="toolbar__subs">' + (subs.length > 1 ? subChips(subs, all, cat) : '') + '</div>' +
        '<div class="toolbar__right"><label class="mini-search">' + icon('i-search') + '<input type="search" id="cat-q" placeholder="Поиск в разделе" value="' + esc(catState.q) + '" aria-label="Поиск в разделе"></label>' +
        '<select class="select" id="cat-sort" aria-label="Сортировка">' +
          opt('pop', 'По популярности') + opt('cheap', 'Сначала дешевле') + opt('exp', 'Сначала дороже') + opt('az', 'По названию') +
        '</select></div>' +
      '</div></div>' +
      '<section class="catalog-body"><div class="wrap">' +
        (cat === 'rezept' ? '<div class="note">' + icon('i-mail') + '<span>Если в заказе только сборники и видеоуроки, выберите электронную доставку: ссылка придёт на почту, указанную при оформлении.</span></div>' : '') +
        (cat === 'badi' && box ? '<div class="note">' + icon('i-flask') + '<span>Не знаете, с чего начать? Посмотрите <a href="#p-' + box.id + '" style="text-decoration:underline">Бокс тритментолога</a>: три набора активов для создания профессионального ухода.</span></div>' : '') +
        '<div data-results></div>' +
      '</div></section>';
  }
  function subChips(subs, all, cat) {
    return '<button type="button" class="chip' + (!catState.sub ? ' is-active' : '') + '" data-action="sub" data-sub="">Все <span class="count">' + all.length + '</span></button>' +
      subs.map(function (s) {
        var n = all.filter(function (p) { return subsOf(p, cat).indexOf(s) !== -1; }).length;
        return '<button type="button" class="chip' + (catState.sub === s ? ' is-active' : '') + '" data-action="sub" data-sub="' + esc(s) + '">' + esc(s) + ' <span class="count">' + n + '</span></button>';
      }).join('');
  }
  function catalogResults() {
    var box = $('[data-results]');
    if (!box) return;
    var cat = catState.cat;
    var q = norm(catState.q).trim();
    var list = PRODUCTS.filter(function (p) {
      if (!inCat(p, cat)) return false;
      if (catState.sub && subsOf(p, cat).indexOf(catState.sub) === -1) return false;
      if (q && norm(p.title + ' ' + p.short + ' ' + p.sub).indexOf(q) === -1) return false;
      return true;
    });
    var s = catState.sort;
    list.sort(function (a, b) {
      if (s === 'cheap') return minPrice(a) - minPrice(b);
      if (s === 'exp') return minPrice(b) - minPrice(a);
      if (s === 'az') return a.title.localeCompare(b.title, 'ru');
      return a.order - b.order;
    });
    box.innerHTML = list.length
      ? '<p class="result-count">' + list.length + ' ' + plural(list.length, 'товар', 'товара', 'товаров') + (q ? ' по запросу «' + esc(catState.q) + '»' : '') + '</p><div class="grid grid--pop">' + list.map(function (p) { return card(p, cat); }).join('') + '</div>'
      : '<div class="empty">' + fox() + '<h3 class="h3">Ничего не нашлось</h3><p>Попробуйте изменить запрос или выбрать другой раздел каталога.</p><button type="button" class="btn btn--ghost" data-action="reset-filters">Сбросить фильтры</button></div>';
  }

  /* ---------- Товар ---------- */
  function productView(p) {
    pdpOpt = 0;
    var spec = specOf(p);
    var ctxCat = p.in[0][0];
    var thumbs = p.images.length > 1 ? '<div class="gallery__thumbs">' + p.images.map(function (src, i) {
      return '<button type="button" class="' + (i === 0 ? 'is-active' : '') + '" data-action="thumb" data-src="' + esc(src) + '" aria-label="Фото ' + (i + 1) + '">' + imgTag(src, '') + '</button>';
    }).join('') + '</div>' : '';
    var specs = [];
    if (spec.inci) specs.push('<div class="spec--wide"><span>INCI</span><b>' + esc(spec.inci) + '</b></div>');
    if (spec['ввод']) specs.push('<div><span>Ввод</span><b>' + esc(spec['ввод']) + '</b></div>');
    if (spec.ph) specs.push('<div><span>pH</span><b>' + esc(spec.ph) + '</b></div>');
    if (isDigital(p)) specs.push('<div><span>Формат</span><b>Электронный, PDF</b></div><div><span>Доставка</span><b>На e-mail после оплаты</b></div>');

    var related = PRODUCTS.filter(function (x) { return x.id !== p.id && x.sub === p.sub; }).slice(0, 8);
    if (related.length < 4) related = related.concat(PRODUCTS.filter(function (x) { return x.id !== p.id && x.cat === p.cat && related.indexOf(x) === -1; }).slice(0, 8 - related.length));

    return '<section class="page-head"><div class="wrap"><nav class="crumbs" aria-label="Навигация"><a href="#home">Главная</a>' + icon('i-chevron') +
      '<a href="#catalog-' + ctxCat + '">' + CATS[ctxCat].title + '</a>' + icon('i-chevron') + '<span>' + esc(p.sub) + '</span></nav></div></section>' +
      '<div class="wrap pdp">' +
        '<div class="gallery' + (thumbs ? '' : ' gallery--single') + '">' + thumbs + '<div class="gallery__main" data-main>' + imgTag(img(p, 0), p.title) + marks(p) + '</div></div>' +
        '<div class="pdp__info">' +
          '<div style="display:grid;gap:12px"><span class="eyebrow">' + esc(p.sub) + '</span><h1 class="pdp__title">' + esc(p.title) + '</h1></div>' +
          '<div class="pdp__price" data-pdp-price>' + pdpPrice(p, 0) + '</div>' +
          (p.short && p.cat !== 'badi' ? '<p class="pdp__short">' + esc(p.short) + '</p>' : '') +
          (p.opts ? '<div class="opts"><span class="opts__label">' + esc(p.opts.title) + '</span><div class="opts__list">' + p.opts.values.map(function (v, i) {
            return '<button type="button" class="' + (i === 0 ? 'is-active' : '') + '" data-action="opt" data-i="' + i + '">' + esc(optLabel(p, i)) + '</button>';
          }).join('') + '</div></div>' : '') +
          buyBlock(p, 0) +
          (specs.length ? '<div class="spec">' + specs.join('') + '</div>' : '') +
          '<div class="assure">' +
            (isDigital(p)
              ? '<div>' + icon('i-mail') + 'Ссылка на сборник придёт на почту сразу после оплаты</div>'
              : '<div>' + icon('i-truck') + 'Бесплатная доставка СДЭК при заказе от 4 500 ₽</div>') +
            '<div>' + icon('i-shield') + 'Оригинальная продукция напрямую от бренда</div>' +
            '<div>' + icon('i-chat') + 'Поможем с выбором в Telegram: @piiilulya</div>' +
          '</div>' +
          '<div class="acc"><details open><summary>Описание и применение ' + icon('i-plus') + '</summary><div class="prose">' + (p.html || esc(p.short)) + '</div></details>' +
          '<details><summary>Доставка и оплата ' + icon('i-plus') + '</summary><div class="prose">Отправляем заказы через СДЭК в пункт выдачи или курьером. При заказе от 4 500 ₽ доставка бесплатная. Электронные сборники и видеоуроки приходят на e-mail, указанный при оформлении. <a href="#delivery" style="text-decoration:underline">Подробнее</a></div></details></div>' +
        '</div>' +
      '</div>' +
      (related.length ? '<section class="section section--tight" style="border-top:1px solid var(--line)"><div class="wrap"><div class="section-head"><div><p class="eyebrow">Рекомендуем</p><h2 class="h2">С этим товаром покупают</h2></div>' +
        '<div class="head-tools">' + railNav('rel-rail') + '</div></div>' +
        '<div class="rail" id="rel-rail">' + related.map(function (x) { return card(x); }).join('') + '</div></div></section>' : '');
  }
  function pdpPrice(p, opt) {
    return '<b>' + money(optPrice(p, opt)) + '</b>' + (p.old > 0 ? '<s>' + money(p.old) + '</s><span class="mark mark--sale">Экономия ' + money(p.old - p.price) + '</span>' : '');
  }
  function buyBlock(p, opt) {
    var key = keyOf(p.id, opt);
    var q = qtyOf(p.id, opt);
    var main = q
      ? stepper(key, q, true) + '<button type="button" class="btn" data-action="open-cart">В корзине · оформить ' + icon('i-arrow') + '</button>'
      : '<button type="button" class="btn" data-action="add" data-id="' + p.id + '" data-opt="' + opt + '">Добавить в корзину ' + icon('i-bag') + '</button>';
    return '<div class="buy" data-buy="' + p.id + '">' + main + favBtn(p, 'buy__fav') + '</div>';
  }

  /* ---------- Корзина ---------- */
  function renderCart() {
    var body = $('[data-cart-body]');
    var n = cartCount();
    $('#cart-title').innerHTML = 'Корзина' + (n ? '<small>' + n + ' ' + plural(n, 'товар', 'товара', 'товаров') + '</small>' : '');
    if (!cart.length) {
      body.innerHTML = '<div class="cart__empty">' + fox() + '<h3 class="h3">В корзине пока пусто</h3><p>Загляните в каталог: там больше ' + (Math.floor(PRODUCTS.length / 10) * 10) + ' средств и активов.</p><a class="btn" href="#catalog" data-action="close">Перейти в каталог</a></div>';
      return;
    }
    var total = cartTotal();
    var left = Math.max(0, FREE_SHIP - total);
    var meter = cartDigitalOnly()
      ? '<div class="ship-meter is-done"><span>Электронные товары: <b>доставка на e-mail бесплатно</b></span></div>'
      : '<div class="ship-meter' + (left ? '' : ' is-done') + '"><span>' + (left ? 'До бесплатной доставки осталось <b>' + money(left) + '</b>' : '<b>Доставка СДЭК бесплатная</b>') + '</span><div class="meter"><i style="width:' + Math.min(100, total / FREE_SHIP * 100) + '%"></i></div></div>';
    var lines = cart.map(function (l) {
      var p = byId[l.id], key = keyOf(l.id, l.opt);
      return '<div class="line"><a class="line__img" href="#p-' + p.id + '" data-action="close">' + imgTag(img(p, 0), '') + '</a><div class="line__body">' +
        '<a class="line__title" href="#p-' + p.id + '" data-action="close">' + esc(p.title) + '</a>' +
        (p.opts ? '<span class="line__opt">' + esc(p.opts.title) + ': ' + esc(optLabel(p, l.opt)) + '</span>' : isDigital(p) ? '<span class="line__opt">Электронный формат</span>' : '') +
        '<div class="line__row">' + stepper(key, l.qty, true) +
        '<b>' + money(optPrice(p, l.opt) * l.qty) + '</b><button type="button" class="line__del" data-action="del" data-key="' + key + '" aria-label="Удалить из корзины">' + icon('i-trash') + '</button></div>' +
        '</div></div>';
    }).join('');
    var inCartIds = cart.map(function (l) { return l.id; });
    var ups = pick(['MOLECULAR LIPID', 'Биоэликсир', 'Сборник №1']).filter(function (p) { return inCartIds.indexOf(p.id) === -1; }).slice(0, 2);
    body.innerHTML = meter + '<div class="cart__list">' + lines + '</div>' +
      (ups.length ? '<div class="cart__upsell"><h4>Добавьте к заказу</h4><div style="display:grid;gap:10px">' + ups.map(function (p) {
        return '<div class="upsell">' + imgTag(img(p, 0), '') + '<div><div style="font-weight:500;line-height:1.3">' + esc(p.title) + '</div><span class="muted">' + money(minPrice(p)) + '</span></div><button type="button" class="add" data-action="add" data-id="' + p.id + '" aria-label="Добавить: ' + esc(p.title) + '">' + icon('i-plus') + '</button></div>';
      }).join('') + '</div></div>' : '') +
      '<div class="cart__foot"><div class="cart__total"><span>Итого</span><b>' + money(total) + '</b></div>' +
      '<a class="btn btn--block" href="#checkout" data-action="close">Оформить заказ ' + icon('i-arrow') + '</a>' +
      '<button type="button" class="btn btn--ghost btn--block btn--sm" data-action="close">Продолжить покупки</button></div>';
  }

  /* ---------- Оформление ---------- */
  var checkoutState = { ship: 'pvz', promo: '' };
  function checkoutView() {
    if (!cart.length) {
      return '<div class="wrap"><div class="empty" style="padding-block:120px">' + fox() + '<h1 class="h2">Корзина пуста</h1><p>Добавьте товары, чтобы оформить заказ.</p><a class="btn" href="#catalog">Перейти в каталог</a></div></div>';
    }
    var digitalOnly = cartDigitalOnly();
    if (digitalOnly) checkoutState.ship = 'email';
    else if (checkoutState.ship === 'email') checkoutState.ship = 'pvz';
    var ships = [
      ['pvz', 'СДЭК — пункт выдачи', 'Самовывоз из ближайшего ПВЗ'],
      ['courier', 'СДЭК — курьер', 'Доставка до двери'],
      ['email', 'Электронная доставка', 'Только для сборников и видеоуроков']
    ];
    return '<section class="page-head"><div class="wrap"><nav class="crumbs" aria-label="Навигация"><a href="#home">Главная</a>' + icon('i-chevron') + '<span>Оформление заказа</span></nav><h1 class="h2">Оформление заказа</h1></div></section>' +
      '<div class="wrap"><form class="checkout" data-form="checkout" novalidate>' +
        '<div class="checkout__main">' +
          '<div class="panel"><h2 class="panel__title"><b>1</b>Контакты</h2><div class="form">' +
            '<div class="field"><label for="o-name">Имя и фамилия</label><input class="input" id="o-name" name="name" autocomplete="name" placeholder="Анна Иванова" required></div>' +
            '<div class="form__row"><div class="field"><label for="o-phone">Телефон</label><input class="input" id="o-phone" name="phone" type="tel" autocomplete="tel" placeholder="+7 (900) 000-00-00" required></div>' +
            '<div class="field"><label for="o-email">E-mail</label><input class="input" id="o-email" name="email" type="email" autocomplete="email" placeholder="anna@mail.ru" required></div></div>' +
            '<p class="muted" style="font-size:13px">На e-mail придёт подтверждение заказа и ссылки на электронные товары.</p>' +
          '</div></div>' +
          '<div class="panel"><h2 class="panel__title"><b>2</b>Доставка</h2><div class="ship">' +
            ships.map(function (s) {
              var disabled = (s[0] === 'email') !== digitalOnly;
              var on = checkoutState.ship === s[0];
              return '<label class="' + (on ? 'is-checked' : '') + '"' + (disabled ? ' style="opacity:.45;cursor:not-allowed"' : '') + '><input type="radio" name="ship" value="' + s[0] + '"' + (on ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="ship__t"><b>' + s[1] + '</b><span>' + s[2] + '</span></span><span class="ship__p" data-ship-price="' + s[0] + '"></span></label>';
            }).join('') +
          '</div>' +
          (digitalOnly ? '' : '<div class="form" style="margin-top:16px"><div class="form__row"><div class="field"><label for="o-city">Город</label><input class="input" id="o-city" name="city" autocomplete="address-level2" placeholder="Москва" required></div>' +
            '<div class="field"><label for="o-addr">Адрес или пункт выдачи</label><input class="input" id="o-addr" name="addr" autocomplete="street-address" placeholder="ул. Тверская, 1" required></div></div></div>') +
          '</div>' +
          '<div class="panel"><h2 class="panel__title"><b>3</b>Комментарий</h2><div class="field"><label for="o-comment" class="muted">Пожелания к заказу (необязательно)</label><textarea class="input" id="o-comment" name="comment" placeholder="Например: позвонить перед доставкой"></textarea></div>' +
          '<label class="check" style="margin-top:16px"><input type="checkbox" id="o-agree" name="agree" checked required> Принимаю условия договора оферты и политики конфиденциальности</label></div>' +
        '</div>' +
        '<aside class="summary panel" data-summary></aside>' +
      '</form></div>';
  }
  function renderSummary() {
    var box = $('[data-summary]');
    if (!box) return;
    if (!cart.length) { render(); return; }
    var total = cartTotal();
    var free = total >= FREE_SHIP;
    var ship = checkoutState.ship;
    $all('[data-ship-price]').forEach(function (el) {
      el.textContent = el.getAttribute('data-ship-price') === 'email' || free ? 'Бесплатно' : 'По тарифу СДЭК';
    });
    var shipFree = ship === 'email' || free;
    box.innerHTML = '<h2 class="panel__title">Ваш заказ</h2>' +
      '<div class="sum-items">' + cart.map(function (l) {
        var p = byId[l.id];
        return '<div class="sum-item">' + imgTag(img(p, 0), '') + '<div>' + esc(p.title) + '<small>' + (p.opts ? esc(optLabel(p, l.opt)) + ' · ' : '') + l.qty + ' шт.</small></div><b>' + money(optPrice(p, l.opt) * l.qty) + '</b></div>';
      }).join('') + '</div>' +
      '<div class="sum-line"><span>Товары (' + cartCount() + ')</span><span>' + money(total) + '</span></div>' +
      '<div class="sum-line' + (shipFree ? ' sum-line--ok' : '') + '"><span>Доставка</span><span>' + (shipFree ? 'Бесплатно' : 'По тарифу СДЭК') + '</span></div>' +
      (!shipFree ? '<p class="muted" style="font-size:13px">Добавьте товаров на ' + money(FREE_SHIP - total) + ', и доставка станет бесплатной.</p>' : '') +
      '<div class="promo-code"><input class="input" id="o-promo" placeholder="Промокод" value="' + esc(checkoutState.promo) + '" aria-label="Промокод"><button type="button" class="btn btn--ghost" data-action="promo">Применить</button></div>' +
      '<p class="muted" style="font-size:13px" data-promo-msg>' + (checkoutState.promo ? 'Промокод «' + esc(checkoutState.promo) + '» будет применён при оплате.' : '') + '</p>' +
      '<div class="sum-line sum-line--total"><span>К оплате</span><span>' + money(total) + '</span></div>' +
      '<button type="submit" class="btn btn--block" style="margin-top:16px">Оплатить заказ ' + icon('i-arrow') + '</button>' +
      '<div class="demo-note">' + icon('i-spark') + '<span>Демоверсия: заказ не отправляется и оплата не списывается.</span></div>';
  }
  function doneView() {
    var o = lastOrder;
    return '<div class="wrap success"><div class="success__ic">' + icon('i-check') + '</div><p class="eyebrow">' + (o ? 'Заказ № ' + o.no : 'Заказ оформлен') + '</p><h1 class="h2">Спасибо за заказ!</h1>' +
      '<p class="lead">' + (o ? 'Подтверждение придёт на <b>' + esc(o.email) + '</b>. ' : '') + 'Менеджер свяжется с вами, если понадобится уточнить детали доставки.</p>' +
      '<div class="hero__actions" style="justify-content:center"><a class="btn" href="#catalog">Вернуться в каталог</a><a class="btn btn--ghost" href="https://t.me/lisinashopGroop" target="_blank" rel="noopener">Наш Telegram-канал</a></div>' +
      '<p class="demo-note" style="max-width:460px">' + icon('i-spark') + '<span>Это демоверсия магазина: заказ никуда не отправлен.</span></p></div>';
  }

  /* ---------- Доставка ---------- */
  function deliveryView() {
    return '<section class="page-head"><div class="wrap"><nav class="crumbs" aria-label="Навигация"><a href="#home">Главная</a>' + icon('i-chevron') + '<span>Доставка и оплата</span></nav>' +
      '<h1 class="h2">Доставка и оплата</h1><p class="lead">Отправляем заказы по всей России через СДЭК. Электронные товары приходят на почту сразу после оплаты.</p></div></section>' +
      '<div class="wrap"><div class="info-grid">' +
        '<div class="info-card"><span class="perk__ic">' + icon('i-truck') + '</span><h3>СДЭК по России</h3><p>Доставка в пункт выдачи или курьером до двери. При заказе от 4 500 ₽ доставка бесплатная, при меньшей сумме — по тарифу СДЭК.</p></div>' +
        '<div class="info-card"><span class="perk__ic">' + icon('i-mail') + '</span><h3>Электронные товары</h3><p>Сборники и видеоуроки приходят ссылкой на e-mail, указанный при заказе. Если в заказе только они, выбирайте электронную доставку.</p></div>' +
        '<div class="info-card"><span class="perk__ic">' + icon('i-shield') + '</span><h3>Оплата онлайн</h3><p>Оплачивайте заказ на сайте сразу после оформления. Полная информация о заказе придёт на вашу почту.</p></div>' +
      '</div>' +
      '<div class="panel" style="margin-bottom:clamp(56px,7vw,96px)"><h2 class="panel__title">Гарантия и документы</h2><div class="prose" style="padding:0">Вся продукция поставляется напрямую от бренда. Условия возврата и обмена описаны в договоре оферты. Если с заказом что-то не так, напишите в техподдержку: <b>@piiilulya</b> в Telegram или <b>info@lisinashop.ru</b>.<br><br><span class="muted">ООО «ЛИСИНА» · ИНН 3460085337 · ОГРН 1233400011833</span></div></div>' +
      '</div>';
  }

  /* ---------- Избранное ---------- */
  function favoritesView() {
    var list = favs.map(function (id) { return byId[id]; }).filter(Boolean);
    return '<section class="page-head"><div class="wrap"><nav class="crumbs" aria-label="Навигация"><a href="#home">Главная</a>' + icon('i-chevron') + '<span>Избранное</span></nav><h1 class="h2">Избранное</h1></div></section>' +
      '<section class="catalog-body" style="padding-top:0"><div class="wrap">' +
      (list.length ? '<p class="result-count">' + list.length + ' ' + plural(list.length, 'товар', 'товара', 'товаров') + '</p><div class="grid">' + list.map(function (p) { return card(p); }).join('') + '</div>'
        : '<div class="empty">' + fox() + '<h3 class="h3">Здесь пока пусто</h3><p>Нажмите на сердечко на карточке товара, чтобы сохранить его и вернуться к нему позже.</p><a class="btn" href="#catalog">Перейти в каталог</a></div>') +
      '</div></section>';
  }

  /* ---------- Тест «Протокол ухода» ---------- */
  var QUIZ = [
    { q: 'Какие у вас волосы?', a: [
      ['color', 'Окрашенные или блонд', 'Нужно сохранить цвет и качество'],
      ['dry', 'Сухие и повреждённые', 'Ломкость, пористость, секущиеся кончики'],
      ['growth', 'Выпадают или медленно растут', 'Хочется густоты и плотности'],
      ['thin', 'Тонкие, без блеска', 'Нужны лёгкость, блеск и защита']
    ] },
    { q: 'Где вы ухаживаете за волосами?', a: [
      ['home', 'Дома', 'Готовые средства для себя'],
      ['salon', 'В салоне — я мастер', 'Профессиональные объёмы и протоколы'],
      ['diy', 'Хочу делать косметику сама', 'Активы, основы и рецепты']
    ] },
    { q: 'Какой результат для вас главный?', a: [
      ['repair', 'Восстановление структуры', 'Плотность и эластичность'],
      ['moist', 'Увлажнение и блеск', 'Мягкость и сияние'],
      ['protect', 'Защита', 'От горячей укладки и окрашивания']
    ] }
  ];
  var quizAns = [];
  var quizResult = [];
  function quizPool() {
    var base = {
      color: ['Лосьон-концентрат', 'Маска для волос PILULYA PROFESSIONAL', 'Добавка в краситель'],
      dry: ['Маска липидная', 'Несмываемая маска-биомиметик', 'Биоэликсир'],
      growth: ['Лосьон для роста волос', 'Шампунь для роста волос', 'Несмываемая сыворотка для роста'],
      thin: ['Каникулы в Дубае', 'Amino 20 в 1', 'Баттер PILULYA']
    }[quizAns[0]] || [];
    var where = { salon: ['Шампунь для волос PILULYA PROFESSIONAL', 'КОЛОР СТРАХОВКА'], diy: ['БАЗОВАЯ МАСКА', 'Кератин гидролизованный', 'Сборник №1'], home: [] }[quizAns[1]] || [];
    var goal = { repair: ['MOLECULAR LIPID'], moist: [quizAns[1] === 'diy' ? 'Гиалуроновая кислота' : 'Первая любовь'], protect: ['Термозащитный разглаживающий'] }[quizAns[2]] || [];
    var seen = {};
    return pick(goal.concat(base, where)).filter(function (p) { if (seen[p.id]) return false; seen[p.id] = 1; return true; }).slice(0, 4);
  }
  function renderQuiz() {
    var body = $('[data-quiz-body]');
    var step = quizAns.length;
    var progress = '<div class="quiz__progress" aria-hidden="true">' + QUIZ.map(function (_, i) { return '<i class="' + (i <= step ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    if (step < QUIZ.length) {
      var s = QUIZ[step];
      body.innerHTML = '<div class="quiz">' + progress + '<div style="display:grid;gap:10px"><p class="eyebrow">Вопрос ' + (step + 1) + ' из ' + QUIZ.length + '</p><h2 class="h3" id="quiz-title">' + s.q + '</h2></div>' +
        '<div class="quiz__opts">' + s.a.map(function (a) { return '<button type="button" class="quiz__opt" data-action="quiz" data-v="' + a[0] + '"><b>' + a[1] + '</b><span>' + a[2] + '</span></button>'; }).join('') + '</div>' +
        (step ? '<div>' + textBtn('quiz-back', icon('i-chevron-left') + ' Назад') + '</div>' : '') + '</div>';
    } else {
      quizResult = quizPool();
      var sum = quizResult.reduce(function (t, p) { return t + minPrice(p); }, 0);
      body.innerHTML = '<div class="quiz">' + progress + '<div style="display:grid;gap:10px"><p class="eyebrow">Ваш протокол ухода</p><h2 class="h3" id="quiz-title">Мы подобрали ' + quizResult.length + ' ' + plural(quizResult.length, 'средство', 'средства', 'средств') + '</h2><p class="muted">Используйте их вместе: так средства усиливают действие друг друга.</p></div>' +
        '<div class="quiz__res">' + quizResult.map(function (p, i) {
          return '<div class="quiz__item">' + imgTag(img(p, 0), '') + '<a href="#p-' + p.id + '" data-action="close"><b>' + (i + 1) + '. ' + esc(p.title) + '</b><span>' + esc(p.sub) + ' · ' + money(minPrice(p)) + '</span></a><button type="button" class="add" data-action="add" data-id="' + p.id + '" aria-label="Добавить: ' + esc(p.title) + '">' + icon('i-plus') + '</button></div>';
        }).join('') + '</div>' +
        '<div class="quiz__foot">' + textBtn('quiz-restart', 'Пройти заново') + '<button type="button" class="btn" data-action="quiz-all">Добавить всё · ' + money(sum) + '</button></div></div>';
    }
  }

  /* ---------- Поиск ---------- */
  function renderSearch(q) {
    var box = $('[data-search-results]');
    var nq = norm(q).trim();
    if (!nq) { box.innerHTML = ''; return; }
    var list = PRODUCTS.filter(function (p) { return norm(p.title + ' ' + p.short + ' ' + p.sub).indexOf(nq) !== -1; });
    var re = new RegExp('(' + esc(q.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    box.innerHTML = list.length
      ? list.slice(0, 8).map(function (p) {
          return '<a class="s-item" href="#p-' + p.id + '" data-action="close">' + imgTag(img(p, 0), '') + '<div><b>' + esc(p.title).replace(re, '<mark>$1</mark>') + '</b><span>' + esc(p.sub) + '</span></div><span class="s-item__p">' + money(minPrice(p)) + '</span></a>';
        }).join('') + (list.length > 8 ? '<div class="search__all">' + textBtn('search-all', 'Показать все результаты (' + list.length + ') ' + icon('i-arrow')) + '</div>' : '')
      : '<p class="search__empty">По запросу «' + esc(q) + '» ничего не нашлось. Попробуйте «маска» или «масло».</p>';
  }

  /* ---------- Оверлеи ---------- */
  var lastFocus = null;
  function openLayer(id) {
    closeAll(true);
    var el = document.getElementById(id);
    lastFocus = document.activeElement;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    if (lenis) lenis.stop();
    var f = id === 'search' ? $('#search-input') : el.querySelector('.sheet__panel button, .modal__panel button, .sheet__panel a');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeAll(silent) {
    var any = false;
    ['menu', 'cart', 'search', 'quiz'].forEach(function (id) { var el = document.getElementById(id); if (!el.hidden) { el.hidden = true; any = true; } });
    document.body.style.overflow = '';
    if (lenis && booted) lenis.start();
    if (any && !silent && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  var toastTimer;
  function toast(text, ic, btnText, btnAction) {
    var t = $('#toast');
    t.innerHTML = icon(ic || 'i-check') + '<span>' + esc(text) + '</span>' + (btnText ? '<button type="button" data-action="' + btnAction + '">' + btnText + '</button>' : '');
    t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /* ---------- Движение ---------- */
  var REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FINE = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var body = document.body;
  var header = $('#header');
  var lenis = null;
  var booted = false;

  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function countUp(el) {
    if (REDUCED || el._counted) return;
    el._counted = true;
    var to = +el.getAttribute('data-count'), from = +(el.getAttribute('data-from') || 0);
    var pre = el.getAttribute('data-prefix') || '', suf = (el.getAttribute('data-suffix') || '').replace(/^ /, ' ');
    var t0 = null, dur = 1800;
    function frame(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      el.textContent = pre + Math.round(from + (to - from) * easeOutExpo(p)).toLocaleString('ru-RU') + suf;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* Вход hero: снимаем и заново ставим is-ready, чтобы анимация проигралась */
  function heroEnter() {
    if (!$('.hero')) return;
    body.classList.remove('is-ready');
    void body.offsetWidth;
    requestAnimationFrame(function () {
      body.classList.add('is-ready');
      setTimeout(function () { $all('.hero [data-count]').forEach(countUp); }, 900);
    });
  }

  /* Заставка: лиса прорисовывается, затем шторка уходит вверх и стартует hero */
  function boot() {
    var root = document.documentElement;
    var intro = $('#intro');
    function finish() {
      if (booted) return;
      booted = true;
      root.classList.add('booted');
      root.style.overflow = '';
      if (lenis) lenis.start();
      heroEnter();
    }
    if (!intro || root.classList.contains('no-intro')) { if (intro) intro.remove(); finish(); return; }
    try { sessionStorage.setItem('ls_intro', '1'); } catch (e) { /* без sessionStorage заставка покажется снова */ }
    root.style.overflow = 'hidden';
    if (lenis) lenis.stop();
    var t0 = Date.now(), closed = false;
    function close() {
      if (closed) return;
      closed = true;
      setTimeout(function () {
        intro.classList.add('is-done');
        setTimeout(finish, 280);
        setTimeout(function () { intro.remove(); }, 1100);
      }, Math.max(0, 1800 - (Date.now() - t0)));
    }
    if (document.readyState === 'complete') close(); else window.addEventListener('load', close);
    setTimeout(close, 2600);
  }

  /* Появление при прокрутке: только то, что ниже первого экрана */
  var REVEAL = '.section-head, .cat, .kit__img, .kit__text > *, .promo, .rail > *, .grid:not(.grid--pop) > .card, .quiz-cta, .books__intro, .school, .collab, .support__item, .perk, .info-card, .panel, .marquee';
  var io = (!REDUCED && 'IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
      $all('[data-count]', e.target).forEach(countUp);
    });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;

  function setupReveal(root) {
    if (!io) { $all('.kit__save', root).forEach(function (el) { el.classList.add('in'); }); return; }
    var vh = window.innerHeight;
    $all(REVEAL, root).forEach(function (el) {
      if (el.closest('.hero') || el.closest('.rv, .rv-clip')) return;
      if (el.getBoundingClientRect().top < vh * 0.9) { el.classList.add('in'); return; }
      el.classList.add(el.classList.contains('cat') ? 'rv-clip' : 'rv');
      var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty('--d', (Math.min(idx % 6, 5) * 0.08) + 's');
      io.observe(el);
    });
  }
  document.addEventListener('transitionend', function (e) {
    var t = e.target;
    if (!t.classList || !t.classList.contains('in')) return;
    if (t.classList.contains('rv') && e.propertyName === 'transform') { t.classList.remove('rv'); t.style.removeProperty('--d'); }
    if (t.classList.contains('rv-clip') && e.propertyName === 'clip-path') { t.classList.remove('rv-clip'); t.style.removeProperty('--d'); }
  });

  /* «Магнитные» кнопки */
  function setupMagnetic(root) {
    if (!FINE || REDUCED) return;
    $all('[data-magnetic]', root).forEach(function (el) {
      if (el._mag) return;
      el._mag = true;
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.35).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* Параллакс hero за курсором и свечение в блоке набора */
  if (FINE && !REDUCED) {
    document.addEventListener('pointermove', function (e) {
      if (!e.target.closest) return;
      var hero = e.target.closest('.hero');
      if (hero) {
        var r = hero.getBoundingClientRect();
        hero.style.setProperty('--mx', (((e.clientX - r.left) / r.width - 0.5) * 2).toFixed(3));
        hero.style.setProperty('--my', (((e.clientY - r.top) / r.height - 0.5) * 2).toFixed(3));
      }
      var kit = e.target.closest('.kit');
      if (kit) {
        var k = kit.getBoundingClientRect();
        kit.style.setProperty('--gx', ((e.clientX - k.left) / k.width * 100).toFixed(1) + '%');
        kit.style.setProperty('--gy', ((e.clientY - k.top) / k.height * 100).toFixed(1) + '%');
      }
    }, { passive: true });
  }

  /* Прокрутка: шапка прячется вниз, фото hero уплывает, бегущая строка наклоняется */
  var lastY = 0, ticking = false, skew = 0, skewTimer;
  function overlayOpen() { return ['cart', 'menu', 'search', 'quiz'].some(function (id) { return !document.getElementById(id).hidden; }); }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY || 0, dy = y - lastY;
      header.classList.toggle('is-scrolled', y > 8);
      if (!REDUCED && !overlayOpen()) {
        if (y > 420 && dy > 4) { header.classList.add('is-hidden'); body.classList.add('hdr-hidden'); }
        else if (dy < -4 || y < 200) { header.classList.remove('is-hidden'); body.classList.remove('hdr-hidden'); }
      }
      if (!REDUCED) {
        var px = $('.arch__px');
        if (px && y < window.innerHeight * 1.5) px.style.transform = 'translate3d(0,' + (y * 0.12).toFixed(1) + 'px,0)';
        var m = $('.marquee__skew');
        if (m) {
          skew += (Math.max(-7, Math.min(7, dy * 0.25)) - skew) * 0.5;
          m.style.setProperty('--skew', skew.toFixed(2) + 'deg');
          clearTimeout(skewTimer);
          skewTimer = setTimeout(function () { skew = 0; m.style.setProperty('--skew', '0deg'); }, 140);
        }
      }
      lastY = y;
    });
  }

  /* Плавный скролл */
  function initLenis() {
    if (!window.Lenis || REDUCED) return;
    try {
      lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
      var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    } catch (e) { lenis = null; }
  }
  function scrollTop() {
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    header.classList.remove('is-hidden');
    body.classList.remove('hdr-hidden');
  }

  /* Товар улетает в корзину */
  function flyFrom(el) {
    if (REDUCED) return;
    var src = null, c;
    if ((c = el.closest('.card'))) src = c.querySelector('.card__media img');
    else if ((c = el.closest('.quiz__item, .upsell'))) src = c.querySelector('img');
    else if (el.closest('.buy')) src = $('[data-main] img');
    else if (el.closest('.kit')) src = $('.kit__img img');
    else if ((c = el.closest('.promo'))) src = c.querySelector('.promo__img img');
    var target = $('.cart-btn');
    if (!src || !target || !src.animate) return;
    var r = src.getBoundingClientRect();
    if (!r.width) return;
    var hidden = header.classList.contains('is-hidden');
    header.classList.remove('is-hidden');
    body.classList.remove('hdr-hidden');
    var t = target.getBoundingClientRect();
    var ty = t.top + t.height / 2 + (hidden ? header.offsetHeight : 0);
    var size = Math.min(r.width, r.height, 200);
    var x0 = r.left + r.width / 2 - size / 2, y0 = r.top + r.height / 2 - size / 2;
    var dx = t.left + t.width / 2 - (x0 + size / 2), dy = ty - (y0 + size / 2);
    var f = document.createElement('img');
    f.src = src.currentSrc || src.src;
    f.className = 'fly';
    f.alt = '';
    f.style.cssText = 'left:' + x0 + 'px;top:' + y0 + 'px;width:' + size + 'px;height:' + size + 'px';
    document.body.appendChild(f);
    var a = f.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '18px' },
      { transform: 'translate(' + (dx * 0.45).toFixed(1) + 'px,' + (dy * 0.45 - 90).toFixed(1) + 'px) scale(.55)', opacity: 1, offset: 0.5 },
      { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(.08)', opacity: 0.4, borderRadius: '50%' }
    ], { duration: 900, easing: 'cubic-bezier(.55,0,.35,1)' });
    a.onfinish = function () {
      f.remove();
      target.classList.remove('hit');
      void target.offsetWidth;
      target.classList.add('hit');
    };
  }

  /* ---------- События ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.getAttribute('data-action');
    var key = el.getAttribute('data-key');
    var line;
    switch (a) {
      case 'add': flyFrom(el); addToCart(el.getAttribute('data-id'), parseInt(el.getAttribute('data-opt') || '0', 10)); break;
      case 'inc': line = lineByKey(key); if (line) setQty(key, line.qty + 1); break;
      case 'dec': line = lineByKey(key); if (line) setQty(key, line.qty - 1); break;
      case 'del': setQty(key, 0); break;
      case 'fav': e.preventDefault(); toggleFav(el.getAttribute('data-fav')); break;
      case 'go-favs': $('#toast').hidden = true; location.hash = 'favorites'; break;
      case 'open-cart': {
        $('#toast').hidden = true;
        renderCart();
        var cartEl = $('#cart');
        cartEl.classList.add('is-opening');
        setTimeout(function () { cartEl.classList.remove('is-opening'); }, 800);
        openLayer('cart');
        break;
      }
      case 'open-menu': openLayer('menu'); break;
      case 'open-search': openLayer('search'); break;
      case 'open-quiz': quizAns = []; renderQuiz(); openLayer('quiz'); break;
      case 'close': closeAll(el.tagName === 'A'); break;
      case 'quiz': quizAns.push(el.getAttribute('data-v')); renderQuiz(); break;
      case 'quiz-back': quizAns.pop(); renderQuiz(); break;
      case 'quiz-restart': quizAns = []; renderQuiz(); break;
      case 'quiz-all':
        quizResult.forEach(function (p) { if (!qtyOf(p.id, 0)) cart.push({ id: p.id, opt: 0, qty: 1 }); });
        save('ls_cart', cart);
        updateBadges(true);
        quizResult.forEach(function (p) { $all('[data-foot="' + p.id + '"]').forEach(function (f) { f.innerHTML = footInner(p); }); });
        renderCart(); openLayer('cart');
        break;
      case 'hits': {
        $all('[data-action="hits"]').forEach(function (b) { b.classList.toggle('is-active', b === el); b.setAttribute('aria-selected', b === el); });
        var rail = $('#hits-rail'); rail.innerHTML = hitsSet(el.getAttribute('data-set')); rail.scrollLeft = 0;
        break;
      }
      case 'rail': {
        var r = document.getElementById(el.getAttribute('data-target'));
        if (r) r.scrollBy({ left: r.clientWidth * 0.85 * parseInt(el.getAttribute('data-dir'), 10), behavior: 'smooth' });
        break;
      }
      case 'sub':
        catState.sub = el.getAttribute('data-sub');
        $all('[data-action="sub"]').forEach(function (b) { b.classList.toggle('is-active', b === el); });
        catalogResults();
        break;
      case 'reset-filters': {
        catState.sub = ''; catState.q = '';
        var qi = $('#cat-q'); if (qi) qi.value = '';
        $all('[data-action="sub"]').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-sub') === ''); });
        catalogResults();
        break;
      }
      case 'thumb': {
        $all('.gallery__thumbs button').forEach(function (b) { b.classList.toggle('is-active', b === el); });
        var main = $('[data-main] img');
        if (main) { main.src = el.getAttribute('data-src'); main.style.animation = 'none'; void main.offsetWidth; main.style.animation = ''; }
        break;
      }
      case 'opt': {
        var p = byId[route().id];
        pdpOpt = parseInt(el.getAttribute('data-i'), 10);
        $all('.opts__list button').forEach(function (b) { b.classList.toggle('is-active', b === el); });
        $('[data-pdp-price]').innerHTML = pdpPrice(p, pdpOpt);
        $('[data-buy="' + p.id + '"]').outerHTML = buyBlock(p, pdpOpt);
        break;
      }
      case 'promo': {
        var v = ($('#o-promo').value || '').trim();
        checkoutState.promo = v;
        $('[data-promo-msg]').textContent = v ? 'Промокод «' + v + '» будет применён при оплате.' : 'Введите промокод.';
        break;
      }
      case 'search-all': {
        catState = { cat: null, pendingQ: $('#search-input').value };
        closeAll(true);
        if (location.hash === '#catalog') render(true); else location.hash = 'catalog';
        break;
      }
    }
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'search-input') renderSearch(e.target.value);
    if (e.target.id === 'cat-q') { catState.q = e.target.value; catalogResults(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'cat-sort') { catState.sort = e.target.value; catalogResults(); }
    if (e.target.name === 'ship') {
      checkoutState.ship = e.target.value;
      $all('.ship label').forEach(function (l) { l.classList.toggle('is-checked', l.contains(e.target)); });
      renderSummary();
    }
  });
  $all('[data-search]').forEach(function (b) {
    b.addEventListener('click', function () { var i = $('#search-input'); i.value = b.getAttribute('data-search'); renderSearch(i.value); i.focus(); });
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    e.preventDefault();
    var ok = true;
    $all('.field__err', f).forEach(function (x) { x.remove(); });
    $all('[required]', f).forEach(function (inp) {
      var v = inp.value.trim();
      var bad = inp.type === 'checkbox' ? !inp.checked
        : !v || (inp.type === 'email' && !/^\S+@\S+\.\S+$/.test(v)) || (inp.type === 'tel' && v.replace(/\D/g, '').length < 10);
      inp.classList.toggle('is-error', bad);
      if (bad && inp.type !== 'checkbox') {
        var msg = !v ? 'Заполните поле' : inp.type === 'email' ? 'Проверьте адрес почты' : 'Проверьте номер телефона';
        inp.insertAdjacentHTML('afterend', '<span class="field__err">' + msg + '</span>');
      }
      if (bad) ok = false;
    });
    if (!ok) { var first = $('.is-error', f); if (first) first.focus(); return; }
    var kind = f.getAttribute('data-form');
    if (kind === 'collab') {
      f.outerHTML = '<div class="form-success">' + icon('i-check') + '<span>Заявка принята! Мы напишем вам в течение двух рабочих дней. (Демоверсия: заявка не отправлена.)</span></div>';
    } else if (kind === 'checkout') {
      lastOrder = { no: 'LS-' + String(Date.now()).slice(-6), email: $('#o-email').value };
      cart = []; save('ls_cart', cart); updateBadges();
      location.hash = 'done';
    }
  });

  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('is-error') && t.value && t.value.trim()) {
      t.classList.remove('is-error');
      var n = t.nextElementSibling; if (n && n.classList.contains('field__err')) n.remove();
    }
  });

  window.addEventListener('scroll', onScroll, { passive: true });

  window.addEventListener('hashchange', function () {
    if (location.hash === '#contacts' || location.hash === '#app') return;
    if (REDUCED) { render(true); return; }
    app.classList.add('view-leave');
    setTimeout(function () {
      render(true);
      app.classList.remove('view-leave');
      app.classList.remove('view-enter');
      void app.offsetWidth;
      app.classList.add('view-enter');
    }, 200);
  });
  app.addEventListener('animationend', function (e) { if (e.target === app) app.classList.remove('view-enter'); });

  initLenis();
  render(true);
  updateBadges();
  boot();
})();
