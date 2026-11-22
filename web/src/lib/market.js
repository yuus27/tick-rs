import { useEffect, useMemo, useRef, useState } from 'react';
import { prices } from './api.js';
import { GAMES } from './games.js';

const unwrap = (r) => (r && typeof r === 'object' && 'data' in r ? r.data : r);

function vol1h(d) {
  if (!d) return 0;
  if (d.volume != null) return Number(d.volume) || 0;
  return (Number(d.highPriceVolume ?? d.highVolume ?? 0) || 0) + (Number(d.lowPriceVolume ?? d.lowVolume ?? 0) || 0);
}

// Laadt mapping + latest + 1h volume en ververst latest elke minuut.
export function useMarket(game, { poll = 60_000 } = {}) {
  const [state, setState] = useState({ mapping: null, latest: null, hour: null, error: null, updatedAt: null });
  const prevRef = useRef({});
  const [flash, setFlash] = useState({});

  useEffect(() => {
    let alive = true;
    setState({ mapping: null, latest: null, hour: null, error: null, updatedAt: null });
    prevRef.current = {};
    const load = async (first) => {
      try {
        const [m, l, h] = await Promise.all([
          prices(game, 'mapping', {}, 6 * 3600_000),
          prices(game, 'latest', {}, poll - 5000),
          first ? prices(game, '1h', {}, 5 * 60_000).catch(() => null) : prices(game, '1h', {}, 5 * 60_000).catch(() => null),
        ]);
        if (!alive) return;
        const latest = unwrap(l) || {};
        const f = {};
        const prev = prevRef.current;
        for (const [id, v] of Object.entries(latest)) {
          const p = prev[id];
          if (p && v.high != null && p.high != null && v.high !== p.high) f[id] = v.high > p.high ? 'up' : 'down';
        }
        prevRef.current = latest;
        setFlash(f);
        setState({ mapping: Array.isArray(unwrap(m)) ? unwrap(m) : [], latest, hour: unwrap(h) || {}, error: null, updatedAt: Date.now() });
      } catch (e) {
        if (alive) setState((s) => ({ ...s, error: e }));
      }
    };
    load(true);
    const t = setInterval(() => load(false), poll);
    return () => { alive = false; clearInterval(t); };
  }, [game, poll]);

  return { ...state, flash };
}

export function buildItems(game, mapping, latest, hour, settings) {
  if (!mapping || !latest) return [];
  const tax = GAMES[game].tax;
  const now = Date.now() / 1000;
  const out = [];
  for (const m of mapping) {
    const l = latest[m.id];
    const hi = l?.high ?? null;
    const lo = l?.low ?? null;
    const v = vol1h(hour?.[m.id]);
    let margin = null, roi = null, profit = null, t = null;
    if (hi != null && lo != null) {
      t = tax(hi, settings);
      margin = hi - t - lo;
      roi = lo > 0 ? (margin / lo) * 100 : null;
      const cap = Math.min(m.limit || Infinity, Math.max(0, Math.round(v)));
      profit = margin * (Number.isFinite(cap) ? cap : 0);
    }
    const age = Math.max(l?.highTime ? now - l.highTime : 1e9, l?.lowTime ? now - l.lowTime : 1e9);
    out.push({ id: m.id, name: m.name, icon: m.icon, limit: m.limit ?? null, members: m.members, highalch: m.highalch ?? null, value: m.value ?? null, examine: m.examine, high: hi, low: lo, highTime: l?.highTime, lowTime: l?.lowTime, tax: t, margin, roi, vol: v, profit, age });
  }
  return out;
}

export function useItemsIndex(items) {
  return useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
}

export async function timeseries(game, id, range) {
  const params = game === 'osrs' ? { id, timestep: range } : { id, lookback: range };
  const r = await prices(game, 'timeseries', params, 5 * 60_000);
  const arr = unwrap(r);
  const list = Array.isArray(arr) ? arr : Array.isArray(arr?.data) ? arr.data : [];
  return list.map((p) => ({
    t: p.timestamp ?? p.time ?? p.ts,
    hi: p.avgHighPrice ?? p.avgHigh ?? p.high ?? null,
    lo: p.avgLowPrice ?? p.avgLow ?? p.low ?? null,
    vol: (p.highPriceVolume ?? 0) + (p.lowPriceVolume ?? 0) || p.volume || 0,
  }));
}

export const RANGES = {
  osrs: [['5m', '~1 dag'], ['1h', '~2 wk'], ['6h', '~3 mnd'], ['24h', '1 jaar']],
  rs3: [['24h', '24 u'], ['7d', '7 d'], ['30d', '30 d'], ['6m', '6 mnd']],
};
