// Клиент API СДЭК v2: подсказки городов, пункты выдачи, расчёт стоимости доставки.
// Документация: https://api-docs.cdek.ru/
export function createCdek(cfg, fetchImpl = fetch) {
  let token = null;
  let tokenUntil = 0;
  const cache = new Map();

  function remember(key, ttlMs, value) {
    cache.set(key, { value, until: Date.now() + ttlMs });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return value;
  }
  const recall = (key) => {
    const hit = cache.get(key);
    return hit && hit.until > Date.now() ? hit.value : undefined;
  };

  async function getToken() {
    if (token && Date.now() < tokenUntil - 30_000) return token;
    const res = await fetchImpl(`${cfg.api}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.account, client_secret: cfg.secure }),
      signal: AbortSignal.timeout(15_000)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new Error(`СДЭК: не удалось авторизоваться (HTTP ${res.status})`);
    token = json.access_token;
    tokenUntil = Date.now() + (json.expires_in ?? 3600) * 1000;
    return token;
  }

  async function call(method, path, { query, body } = {}) {
    const url = new URL(`${cfg.api}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const res = await fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${await getToken()}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.errors?.[0]?.message || json?.requests?.[0]?.errors?.[0]?.message || `HTTP ${res.status}`;
      const err = new Error(`СДЭК ${path}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  return {
    async suggestCities(name) {
      const key = `c:${name.toLowerCase()}`;
      const hit = recall(key);
      if (hit) return hit;
      const list = await call('GET', '/location/suggest/cities', { query: { name, country_code: 'RU' } });
      return remember(key, 3_600_000, (list ?? []).slice(0, 10).map((c) => ({ code: c.code, name: c.full_name || c.city })));
    },

    async pickupPoints(cityCode) {
      const key = `p:${cityCode}`;
      const hit = recall(key);
      if (hit) return hit;
      const list = await call('GET', '/deliverypoints', { query: { city_code: cityCode, type: 'PVZ', country_code: 'RU', is_handout: true } });
      const points = (list ?? []).map((p) => ({
        code: p.code,
        name: p.name || '',
        address: p.location?.address_full || p.location?.address || '',
        workTime: p.work_time || '',
        note: p.note || '',
        lat: p.location?.latitude ?? null,
        lon: p.location?.longitude ?? null
      }));
      return remember(key, 600_000, points);
    },

    /** Возвращает стоимость в копейках и срок в днях. weightG и габариты упаковки приблизительные (см. настройки). */
    async quote({ toCityCode, method, weightG }) {
      const tariff = method === 'cdek_courier' ? cfg.tariffCourier : cfg.tariffPvz;
      const key = `q:${cfg.fromCityCode}:${toCityCode}:${tariff}:${Math.ceil(weightG / 100)}`;
      const hit = recall(key);
      if (hit) return hit;
      const r = await call('POST', '/calculator/tariff', {
        body: {
          type: 1,
          tariff_code: tariff,
          from_location: { code: cfg.fromCityCode },
          to_location: { code: toCityCode },
          packages: [{ weight: Math.max(100, Math.round(weightG)), ...cfg.pack }]
        }
      });
      if (r?.delivery_sum == null) throw new Error('СДЭК: не удалось рассчитать доставку для этого направления');
      return remember(key, 900_000, { sumKop: Math.round(r.delivery_sum * 100), daysMin: r.period_min ?? null, daysMax: r.period_max ?? null });
    }
  };
}
