import { useEffect, useRef } from 'react';
import { useApp } from '../lib/store.jsx';
import { prices } from '../lib/api.js';
import { nl } from '../lib/format.js';

// Controleert elke minuut je watchlist-alerts zolang de app open staat.
export default function Watcher() {
  const { game, watchlist, toast, settings } = useApp();
  const fired = useRef({});
  const list = (watchlist?.[game] || []).filter((w) => w.below || w.above);

  useEffect(() => {
    if (!list.length) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await prices(game, 'latest', {}, 55_000);
        const latest = r?.data ?? r ?? {};
        for (const w of list) {
          const p = latest[w.id];
          if (!p) continue;
          const checks = [
            ['below', w.below && p.low != null && p.low <= w.below, `${w.name} staat op ${nl(p.low)} (onder ${nl(w.below)})`],
            ['above', w.above && p.high != null && p.high >= w.above, `${w.name} staat op ${nl(p.high)} (boven ${nl(w.above)})`],
          ];
          for (const [k, hit, msg] of checks) {
            const key = `${game}:${w.id}:${k}`;
            if (hit && !fired.current[key]) {
              fired.current[key] = true;
              if (!alive) return;
              toast(msg, 'warn');
              if (settings.notify && 'Notification' in window && Notification.permission === 'granted') {
                try { new Notification('tick. prijsalert', { body: msg }); } catch { /* ok */ }
              }
            } else if (!hit) {
              fired.current[key] = false;
            }
          }
        }
      } catch { /* volgende ronde */ }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, JSON.stringify(list), settings.notify]);

  return null;
}
