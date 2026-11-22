// Import van Flipping Utilities (RuneLite-plugin).
// Leest het accountbestand (~/.runelite/flipping/<naam>.json) of een CSV-export, defensief:
// de exacte veldnamen verschillen per plugin-versie.

const pick = (o, keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };

function toMs(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  if (typeof t === 'string') { const n = Number(t); if (Number.isFinite(n)) return toMs(n); const d = Date.parse(t); return Number.isFinite(d) ? d : null; }
  if (typeof t === 'object') { const s = pick(t, ['seconds', 'epochSecond', 'epochSeconds']); if (s != null) return Number(s) * 1000 + Math.round(Number(t.nanos || t.nano || 0) / 1e6); }
  return null;
}

const PRICE_KEYS = ['p', 'price', 'listedPrice', 'preTaxPrice'];
const QTY_KEYS = ['cQIT', 'currentQuantityInTrade', 'qty', 'quantity', 'tQIT', 'totalQuantityInTrade'];
const looksLikeOffer = (o) => o && typeof o === 'object' && PRICE_KEYS.some((k) => typeof o[k] === 'number') && QTY_KEYS.some((k) => typeof o[k] === 'number');

function normOffer(o, ctx) {
  const state = String(pick(o, ['st', 'state', 'status']) || '');
  let buy = pick(o, ['b', 'isBuy', 'buy', 'buyState']);
  if (typeof buy !== 'boolean') buy = /BUY|BOUGHT/i.test(state) ? true : /SELL|SOLD/i.test(state) ? false : null;
  return {
    uuid: pick(o, ['uuid', 'u', 'offerId']) ?? null,
    itemId: Number(pick(o, ['id', 'itemId', 'i']) ?? ctx.id) || ctx.id || null,
    name: ctx.name || null,
    buy,
    qty: Number(pick(o, QTY_KEYS)) || 0,
    price: Number(pick(o, PRICE_KEYS)) || 0,
    time: toMs(pick(o, ['t', 'time', 'timestamp', 'tradeStartedAt'])),
    state,
  };
}

export function offersFromJson(root) {
  const out = [];
  const walk = (node, ctx, depth) => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      const objs = node.filter((x) => x && typeof x === 'object');
      if (objs.length && objs.filter(looksLikeOffer).length >= Math.max(1, objs.length * 0.6)) {
        for (const o of objs) if (looksLikeOffer(o)) out.push(normOffer(o, ctx));
        return;
      }
      for (const x of node) walk(x, ctx, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      const id = pick(node, ['id', 'itemId']);
      const name = pick(node, ['name', 'itemName', 'n']);
      const next = typeof id === 'number' && (typeof name === 'string' || node.h || node.history) ? { id, name: typeof name === 'string' ? name : ctx.name } : ctx;
      for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, next, depth + 1);
    }
  };
  walk(root, {}, 0);
  return out;
}

export function offersFromCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (l) => { const r = []; let cur = ''; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r.map((x) => x.trim()); };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const ci = { name: col(/name|item/), id: col(/^id$|item ?id/), type: col(/type|state|buy|sell|side/), qty: col(/quant|qty|amount/), price: col(/price/), time: col(/time|date/), uuid: col(/uuid|offer/) };
  return lines.slice(1).map((l) => {
    const c = split(l);
    const t = (c[ci.type] || '').toLowerCase();
    return {
      uuid: ci.uuid >= 0 ? c[ci.uuid] : null,
      itemId: ci.id >= 0 ? Number(c[ci.id]) || null : null,
      name: ci.name >= 0 ? c[ci.name] : null,
      buy: /buy|bought|koop/.test(t) ? true : /sell|sold|verkoop/.test(t) ? false : null,
      qty: Number(String(c[ci.qty] || '').replace(/[^\d.-]/g, '')) || 0,
      price: Number(String(c[ci.price] || '').replace(/[^\d.-]/g, '')) || 0,
      time: toMs(c[ci.time]),
      state: t,
    };
  });
}

// Per offer (uuid) alleen de eindstand; dan FIFO kopen tegen verkopen.
export function flipsFromOffers(offers, mapping) {
  const names = Object.fromEntries((mapping || []).map((m) => [m.id, m.name]));
  const final = new Map();
  let anon = 0;
  for (const o of offers) {
    if (o.buy == null || !o.price) continue;
    const key = o.uuid || `${o.itemId}:${o.buy}:${o.time}:${anon++}`;
    const p = final.get(key);
    if (!p || o.qty >= p.qty) final.set(key, { ...o, key });
  }
  const byItem = new Map();
  for (const o of final.values()) {
    if (o.qty <= 0) continue;
    const k = o.itemId || o.name;
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(o);
  }
  const flips = [];
  let unmatchedSells = 0;
  for (const list of byItem.values()) {
    list.sort((a, b) => (a.time || 0) - (b.time || 0));
    const queue = [];
    for (const o of list) {
      if (o.buy) { queue.push({ qty: o.qty, price: o.price }); continue; }
      let need = o.qty, cost = 0, got = 0;
      while (need > 0 && queue.length) {
        const b = queue[0];
        const take = Math.min(need, b.qty);
        cost += take * b.price; got += take; need -= take; b.qty -= take;
        if (b.qty <= 0) queue.shift();
      }
      if (got <= 0) { unmatchedSells++; continue; }
      flips.push({
        id: 'fu:' + o.key,
        game: 'osrs',
        itemId: o.itemId,
        name: o.name || names[o.itemId] || `Item ${o.itemId}`,
        qty: got,
        buy: Math.round(cost / got),
        sell: o.price,
        at: o.time || Date.now(),
        source: 'Flipping Utilities',
      });
    }
  }
  flips.sort((a, b) => b.at - a.at);
  return { flips, offers: final.size, unmatchedSells };
}
