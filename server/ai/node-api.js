// Node-versie van web/src/lib/api.js voor de AI-koppeling (MCP).
// Wordt in de bundel gebruikt i.p.v. de browser-versie: praat met tick.'s eigen lokale server.
const memo = new Map();
const base = () => globalThis.__TICK_BASE || 'http://127.0.0.1:5177';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function getJSON(url, ttl = 60_000) {
  const hit = memo.get(url);
  if (hit && hit.exp > Date.now()) return hit.promise;
  const promise = fetch(base() + url).then(async (r) => {
    let body = null;
    try { body = await r.json(); } catch { /* leeg */ }
    if (!r.ok) throw new ApiError(r.status, body?.error || `Fout ${r.status}`);
    return body;
  });
  memo.set(url, { exp: Date.now() + ttl, promise });
  promise.catch(() => memo.delete(url));
  if (memo.size > 500) memo.delete(memo.keys().next().value);
  return promise;
}

export function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  return u.toString();
}

export const prices = (game, ep, params = {}, ttl = 55_000) => getJSON(`/api/${game}/prices/${ep}${Object.keys(params).length ? '?' + qs(params) : ''}`, ttl);
export const wikiApi = (game, params, ttl = 10 * 60_000) => getJSON(`/api/${game}/wiki?${qs(params)}`, ttl);
export const playerApi = (game, name) => getJSON(`/api/${game}/player/${encodeURIComponent(name)}`, 110_000);
export const storeGet = (key) => getJSON(`/api/store/${key}`, 0);
export async function storePut() { throw new Error('De AI-koppeling kan alleen lezen.'); }
export function useAsync() { return { data: undefined, error: null, loading: false, reload() {} }; }
