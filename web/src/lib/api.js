import { useEffect, useRef, useState, useCallback } from 'react';

const memo = new Map();

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function getJSON(url, ttl = 60_000) {
  const hit = memo.get(url);
  if (hit && hit.exp > Date.now()) return hit.promise;
  const promise = fetch(url).then(async (r) => {
    let body = null;
    try { body = await r.json(); } catch { /* leeg */ }
    if (!r.ok) throw new ApiError(r.status, body?.error || `Fout ${r.status}`);
    return body;
  });
  memo.set(url, { exp: Date.now() + ttl, promise });
  promise.catch(() => memo.delete(url));
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

export async function storeGet(key) {
  const r = await fetch(`/api/store/${key}`);
  return r.ok ? r.json() : null;
}
export async function storePut(key, value) {
  await fetch(`/api/store/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
}

// Generieke async-hook: (re)laadt wanneer deps veranderen, negeert verouderde antwoorden.
export function useAsync(fn, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled });
  const seq = useRef(0);
  const run = useCallback(() => {
    if (!enabled) { setState({ data: undefined, error: null, loading: false }); return; }
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve().then(fn).then(
      (data) => { if (id === seq.current) setState({ data, error: null, loading: false }); },
      (error) => { if (id === seq.current) setState({ data: undefined, error, loading: false }); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}
