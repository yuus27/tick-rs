import { prices, useAsync } from './api.js';

const unwrap = (x) => (x && x.data !== undefined ? x.data : x);

// Prijzen opzoeken op naam: { byName(lowercase) → { id, name, price, icon, limit } }
export async function loadPriceBook(game) {
  const [m, l] = await Promise.all([prices(game, 'mapping', {}, 6 * 3600e3), prices(game, 'latest', {}, 55e3)]);
  const mapping = unwrap(m) || [];
  const latest = unwrap(l) || {};
  const byName = {};
  const byId = {};
  for (const it of Array.isArray(mapping) ? mapping : []) {
    const p = latest[it.id];
    const price = p?.high != null && p?.low != null ? Math.round((p.high + p.low) / 2) : p?.high ?? p?.low ?? null;
    const row = { id: it.id, name: it.name, price, icon: it.icon, limit: it.limit ?? null, highalch: it.highalch ?? null };
    byName[it.name.toLowerCase()] = row;
    byId[it.id] = row;
  }
  byName.coins = { id: 995, name: 'Coins', price: 1, icon: 'Coins_10000.png' };
  return { byName, byId };
}

export function usePriceBook(game) {
  return useAsync(() => loadPriceBook(game), [game]);
}

// Prijs van een droppend item (ook "(noted)" en varianten met haakjes)
export function priceOf(book, name) {
  if (!book || !name) return null;
  const n = String(name).toLowerCase().replace(/\s*\(noted\)$/, '').trim();
  return book.byName[n] || book.byName[n.replace(/\s*\(.*\)$/, '')] || null;
}
