import { skillMax } from './games.js';
import { isElite, levelFor, xpFor, progressToNext } from './xp.js';

// Virtual levels: voorbij de echte max doortellen op XP, zoals de RS3-instelling in de game.
// RS3: elke skill tot 120 (Invention tot 150). OSRS: tot 126.
export const virtualMax = (game, skill) => (isElite(skill) ? 150 : game === 'rs3' ? 120 : 126);

// Standaard aan bij RS3 (daar zit de grind voorbij 99), uit bij OSRS
export const virtualOn = (settings, game) => settings?.virtualLevels?.[game] ?? game === 'rs3';

// Weergave van één skill. `level` blijft het echte level (voor requirements); `shown` is wat je ziet.
export function skillView(game, s, virtual) {
  const cap = skillMax(game, s.name);
  const xp = s.xp ?? null;
  const level = s.level ?? null;
  const top = virtual && xp != null ? virtualMax(game, s.name) : cap;
  const shown = level == null ? null : virtual && xp != null ? Math.max(level, levelFor(xp, s.name, top)) : level;
  const maxed = shown != null && shown >= top;
  const realMaxed = level != null && level >= cap;
  return {
    name: s.name, xp, cap, top, level, shown, maxed, realMaxed,
    virt: shown != null && shown > cap,
    toNext: xp != null && !maxed && shown != null ? Math.max(0, xpFor(shown + 1, s.name) - xp) : null,
    toTop: xp != null ? Math.max(0, xpFor(top, s.name) - xp) : null,
    toCap: xp != null ? Math.max(0, xpFor(cap, s.name) - xp) : null,
    prog: xp != null && shown != null ? progressToNext(xp, shown, s.name, top) : maxed ? 1 : 0,
  };
}
