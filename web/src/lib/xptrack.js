import { xpFor as _xpFor } from './xp.js';
// XP-geschiedenis: tick. legt bij elke keer ophalen een momentopname vast (per uur de laatste 2 dagen,
// per dag ruim een jaar). Daarmee rekent de XP-tracker je echte tempo uit, zonder dat je iets invult.
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const keyOf = (game, rsn) => `${game}:${String(rsn || '').toLowerCase()}`;
const localDate = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function xpMap(skills) {
  const o = {};
  for (const s of skills || []) if (s.xp != null && s.name !== 'Overall') o[s.name] = s.xp;
  return o;
}

// Geeft de bijgewerkte geschiedenis terug, of null als er niets te bewaren valt
export function kcMap(activities) {
  const o = {};
  for (const a of activities || []) if (a.name && Number(a.score) > 0) o[a.name] = Number(a.score);
  return o;
}

export function recordSnapshot(hist, game, rsn, skills, activities = null, now = Date.now()) {
  if (!rsn || !skills?.length) return null;
  const xp = xpMap(skills);
  if (!Object.keys(xp).length) return null;
  const kc = kcMap(activities);
  const hasKc = Object.keys(kc).length > 0;
  const k = keyOf(game, rsn);
  const cur = hist?.[k] || { hourly: [], daily: [] };
  const hourly = [...(cur.hourly || [])];
  const daily = [...(cur.daily || [])];
  const lastH = hourly[hourly.length - 1];
  const same = lastH && Object.keys(xp).every((n) => lastH.xp[n] === xp[n]) && Object.keys(kc).every((n) => lastH.kc?.[n] === kc[n]);
  const snap = (t) => (hasKc ? { t, xp, kc } : { t, xp });
  if (lastH && now - lastH.t < 55 * 60e3) {
    if (same) return null;
    hourly[hourly.length - 1] = snap(lastH.t); // binnen het uur: bijwerken
  } else {
    hourly.push(snap(now));
  }
  const d = localDate(now);
  const lastD = daily[daily.length - 1];
  if (lastD && lastD.d === d) daily[daily.length - 1] = { d, ...snap(now) };
  else daily.push({ d, ...snap(now) });
  return {
    ...(hist || {}),
    [k]: { hourly: hourly.filter((h) => now - h.t <= 50 * HOUR).slice(-60), daily: daily.slice(-400) },
  };
}

function snapshots(hist, game, rsn) {
  const h = hist?.[keyOf(game, rsn)];
  if (!h) return [];
  const all = [...(h.daily || []), ...(h.hourly || [])].sort((a, b) => a.t - b.t);
  return all;
}

// Oudste momentopname binnen de periode (of de oudste die er is, als de geschiedenis korter is)
function baseline(hist, game, rsn, ms, now = Date.now()) {
  const all = snapshots(hist, game, rsn);
  if (!all.length) return null;
  const from = now - ms;
  return all.find((s) => s.t >= from) || null;
}

// XP gewonnen per skill in de periode, t.o.v. je huidige stats
export function gains(hist, game, rsn, skills, ms, now = Date.now()) {
  const base = baseline(hist, game, rsn, ms, now);
  if (!base) return null;
  const xp = xpMap(skills);
  const per = {};
  let total = 0;
  for (const [n, v] of Object.entries(xp)) {
    const g = base.xp[n] != null ? Math.max(0, v - base.xp[n]) : 0;
    per[n] = g;
    total += g;
  }
  return { per, total, since: base.t, span: now - base.t };
}

// Tempo per dag voor één skill over de laatste N dagen (alleen als er minstens een dag aan data is)
export function dailyRate(hist, game, rsn, skill, curXp, days = 7, now = Date.now()) {
  const base = baseline(hist, game, rsn, days * DAY, now);
  if (!base || base.xp[skill] == null || curXp == null) return null;
  const span = now - base.t;
  if (span < 20 * HOUR) return null;
  return { perDay: Math.max(0, curXp - base.xp[skill]) / (span / DAY), days: span / DAY };
}

// Kills per boss in de periode (uit de KC in je momentopnames)
export function kcGains(hist, game, rsn, activities, ms, now = Date.now()) {
  const all = snapshots(hist, game, rsn).filter((x) => x.kc);
  const base = all.find((x) => x.t >= now - ms);
  if (!base) return null;
  const kc = kcMap(activities);
  const per = {};
  for (const [n, v] of Object.entries(kc)) per[n] = Math.max(0, v - (base.kc[n] ?? v));
  return { per, since: base.t, span: now - base.t };
}

// Kills per uur uit je sessies waarin deze boss de meeste kills had
export function sessionKph(sessions, game, boss) {
  let n = 0;
  let ms = 0;
  for (const h of sessions?.history || []) {
    if (h.game !== game || !h.kills?.length || h.kills[0].name !== boss) continue;
    const dur = (h.end || 0) - (h.start || 0);
    if (dur < 10 * 60e3) continue;
    n += h.kills[0].n;
    ms += dur;
  }
  return n ? { perHour: n / (ms / HOUR), hours: ms / HOUR } : null;
}

// XP per uur uit je eigen sessies waarin deze skill het meest XP gaf
export function sessionRate(sessions, game, skill) {
  let xp = 0;
  let ms = 0;
  let n = 0;
  for (const h of sessions?.history || []) {
    if (h.game !== game || !h.skills?.length || h.skills[0].skill !== skill) continue;
    const dur = (h.end || 0) - (h.start || 0);
    if (dur < 10 * 60e3 || !(h.skills[0].xp > 0)) continue;
    xp += h.skills[0].xp;
    ms += dur;
    n += 1;
  }
  return n ? { perHour: xp / (ms / HOUR), sessions: n, hours: ms / HOUR } : null;
}

// "50m", "1,5m", "200M", "750k" of een kaal getal
export function parseXp(txt) {
  const m = String(txt || '').trim().toLowerCase().replace(/\s/g, '').replace(',', '.').match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
  return Math.round(Number(m[1]) * mult);
}

// Skill-doelen kunnen een level of een XP-bedrag (tot 200M) als doel hebben
const fmtXp = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
export const goalTargetXp = (g) => (g.targetXp != null ? g.targetXp : _xpFor(g.level, g.skill));
export const goalLabel = (g) => (g.targetXp != null ? `${g.skill} → ${fmtXp(g.targetXp)} XP` : `${g.skill} → ${g.level}`);
