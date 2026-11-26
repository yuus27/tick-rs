// Officiële RuneScape XP-formule (zelfde voor OSRS en RS3 t/m 99/120).
const TABLE = [0, 0];
let pts = 0;
for (let l = 1; l < 127; l++) {
  pts += Math.floor(l + 300 * Math.pow(2, l / 7));
  TABLE[l + 1] = Math.floor(pts / 4);
}

// Elite skills (RS3 Invention) volgen een eigen curve, t/m level 150 (bron: RuneScape Wiki, Experience/Table)
const ELITE = [0, 0, 830, 1861, 2902, 3980, 5126, 6380, 7787, 9400, 11275, 13605, 16372, 19656, 23546, 28134, 33520, 39809, 47109, 55535, 65209, 77190, 90811, 106221, 123573, 143025, 164742, 188893, 215651, 245196, 277713, 316311, 358547, 404634, 454796, 509259, 568254, 632019, 700797, 774834, 854383, 946227, 1044569, 1149696, 1261903, 1381488, 1508756, 1644015, 1787581, 1939773, 2100917, 2283490, 2476369, 2679917, 2894505, 3120508, 3358307, 3608290, 3870846, 4146374, 4435275, 4758122, 5096111, 5449685, 5819299, 6205407, 6608473, 7028964, 7467354, 7924122, 8399751, 8925664, 9472665, 10041285, 10632061, 11245538, 11882262, 12542789, 13227679, 13937496, 14672812, 15478994, 16313404, 17176661, 18069395, 18992239, 19945833, 20930821, 21947856, 22997593, 24080695, 25259906, 26475754, 27728955, 29020233, 30350318, 31719944, 33129852, 34580790, 36073511, 37608773, 39270442, 40978509, 42733789, 44537107, 46389292, 48291180, 50243611, 52247435, 54303504, 56412678, 58575824, 60793812, 63067521, 65397835, 67785643, 70231841, 72737330, 75303019, 77929820, 80618654, 83370445, 86186124, 89066630, 92012904, 95025896, 98106559, 101255855, 104474750, 107764216, 111125230, 114558777, 118065845, 121647430, 125304532, 129038159, 132849323, 136739041, 140708338, 144758242, 148889790, 153104021, 157401983, 161784728, 166253312, 170808801, 175452262, 180184770, 185007406, 189921255, 194927409];
const ELITE_SKILLS = new Set(['Invention']);

export const MAX_XP = 200_000_000;
export const isElite = (skill) => ELITE_SKILLS.has(skill);
const tableOf = (skill) => (isElite(skill) ? ELITE : TABLE);
const topOf = (skill) => (isElite(skill) ? 150 : 126);

// XP nodig voor een level (standaard of elite curve)
export const xpFor = (level, skill) => {
  const t = tableOf(skill);
  return t[Math.max(1, Math.min(topOf(skill), level))];
};

// Level bij een hoeveelheid XP; met cap (bv. 99 of 120) of zonder (virtuele levels)
export function levelFor(xp, skill, cap) {
  const t = tableOf(skill);
  const top = Math.min(topOf(skill), cap || topOf(skill));
  let l = 1;
  while (l < top && t[l + 1] <= xp) l++;
  return l;
}

// Voortgang naar het volgende level; voorbij de max (cap) telt de weg naar 200M XP
export function progressToNext(xp, level, skill, cap = 99) {
  if (xp == null) return 0;
  if (xp >= MAX_XP) return 1;
  if (level >= cap) return Math.max(0, Math.min(1, xp / MAX_XP));
  const a = xpFor(level, skill);
  const b = xpFor(level + 1, skill);
  return Math.max(0, Math.min(1, (xp - a) / (b - a)));
}

// XP die nog nodig is tot een level (0 als je er al bent)
export const xpTo = (xp, level, skill) => (xp == null ? null : Math.max(0, xpFor(level, skill) - xp));

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
