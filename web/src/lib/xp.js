// Officiële RuneScape XP-formule (zelfde voor OSRS en RS3 t/m 99/120).
const TABLE = [0, 0];
let pts = 0;
for (let l = 1; l < 127; l++) {
  pts += Math.floor(l + 300 * Math.pow(2, l / 7));
  TABLE[l + 1] = Math.floor(pts / 4);
}

export const xpFor = (level) => TABLE[Math.max(1, Math.min(126, level))];

export function levelFor(xp) {
  let l = 1;
  while (l < 126 && TABLE[l + 1] <= xp) l++;
  return l;
}

export function progressToNext(xp, level) {
  if (xp == null) return 0;
  if (level >= 99) return 1;
  const a = xpFor(level);
  const b = xpFor(level + 1);
  return Math.max(0, Math.min(1, (xp - a) / (b - a)));
}

export function osrsCombat(lv) {
  const g = (n) => lv[n] ?? 1;
  const base = 0.25 * (g('Defence') + (lv.Hitpoints ?? 10) + Math.floor(g('Prayer') / 2));
  const melee = 0.325 * (g('Attack') + g('Strength'));
  const range = 0.325 * Math.floor(g('Ranged') * 1.5);
  const mage = 0.325 * Math.floor(g('Magic') * 1.5);
  return Math.floor(base + Math.max(melee, range, mage));
}

// RS3: officiële formule (max 138), werkt zonder RuneMetrics
export function rs3Combat(lv) {
  const g = (k) => lv?.[k] || 1;
  const off = Math.max(g('Attack') + g('Strength'), 2 * g('Magic'), 2 * g('Ranged'));
  return Math.floor((1.3 * off + g('Defence') + Math.max(10, g('Constitution')) + Math.floor(g('Prayer') / 2) + Math.floor(g('Summoning') / 2)) / 4);
}
