import { useEffect } from 'react';
import { useApp } from '../lib/store.jsx';
import { skillMax } from '../lib/games.js';
import { wikiFile, skillCapeFile } from '../lib/theme.js';
import { playJingle } from './Music.jsx';

// Ziet level-ups tussen twee keer ophalen van je stats en viert ze. Een nieuwe max (99/110/120) krijgt de skillcape.
export default function LevelWatcher() {
  const { player, game, rsn, cfg, toast, settings } = useApp();
  const p = player.data;

  useEffect(() => {
    if (!p?.skills?.length || !rsn) return;
    // Na het wisselen van spel staan heel even nog de stats van het andere spel klaar: die niet vergelijken
    if (!p.skills.every((s) => s.name === 'Overall' || cfg.skills.includes(s.name))) return;
    const key = `tick.levels.${game}.${rsn.toLowerCase()}`;
    const now = Object.fromEntries(p.skills.filter((s) => s.level != null).map((s) => [s.name, s.level]));
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* geen opslag */ }
    try { localStorage.setItem(key, JSON.stringify(now)); } catch { /* geen opslag */ }
    if (!prev) return;
    const ups = Object.entries(now).filter(([n, l]) => n !== 'Overall' && prev[n] != null && l > prev[n]);
    if (!ups.length) return;
    ups.sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([name, lvl], i) => {
      const max = lvl >= skillMax(game, name);
      setTimeout(() => toast(max ? `${lvl} ${name}!` : `Level ${lvl} ${name}`, {
        kind: 'milestone',
        eyebrow: max ? 'Mijlpaal · skillcape' : 'Level-up',
        sub: max ? 'Je hebt de max gehaald. Gefeliciteerd!' : `${lvl - prev[name] > 1 ? `+${lvl - prev[name]} levels sinds de vorige keer` : 'Mooi gedaan.'}`,
        img: max ? wikiFile(game, skillCapeFile(game, name)) : cfg.skillIcon(name),
      }), i * 900);
    });
    playJingle(game, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, game, rsn]);

  return null;
}
