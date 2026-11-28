// Sessie-rapport: momentopname bij start, vergelijking met nu.
import { GAMES } from './games.js';

export function snapshot(game, player, questMap, journal) {
  const skills = {};
  for (const s of player?.skills || []) skills[s.name] = { level: s.level, xp: s.xp ?? null };
  const done = Object.entries(questMap || {}).filter(([, v]) => v === 'done').map(([k]) => k);
  // Boss- en clue-tellers (OSRS-hiscores) voor kills per sessie
  const kc = {};
  if (game === 'osrs') for (const x of player?.activities || []) if (x.name && Number(x.score) > 0) kc[x.name] = Number(x.score);
  return { skills, done, kc, totalXp: player?.total?.xp ?? null, totalLevel: player?.total?.level ?? null, journalIds: (journal || []).filter((j) => j.game === game).map((j) => j.id) };
}

export function flipProfit(game, j, settings) {
  const tax = GAMES[game].tax;
  return ((j.sell || 0) - (j.buy || 0) - (tax(j.sell || 0, settings) || 0)) * (j.qty || 1);
}

export function diff(game, start, now, questMap, journal, settings) {
  const skills = [];
  let xp = 0;
  for (const [name, s0] of Object.entries(start.skills || {})) {
    const s1 = now.skills?.[name];
    if (!s1) continue;
    const dxp = s0.xp != null && s1.xp != null ? s1.xp - s0.xp : null;
    const dl = (s1.level || 0) - (s0.level || 0);
    if ((dxp && dxp > 0) || dl > 0) {
      skills.push({ skill: name, xp: dxp, from: s0.level, to: s1.level });
      if (dxp > 0) xp += dxp;
    }
  }
  skills.sort((a, b) => (b.xp || 0) - (a.xp || 0) || b.to - b.from - (a.to - a.from));
  const before = new Set(start.done || []);
  const quests = Object.entries(questMap || {}).filter(([k, v]) => v === 'done' && !before.has(k)).map(([k]) => k);
  const seen = new Set(start.journalIds || []);
  const flips = (journal || []).filter((j) => j.game === game && !seen.has(j.id));
  const gp = flips.reduce((a, j) => a + flipProfit(game, j, settings), 0);
  const levels = skills.reduce((a, s) => a + Math.max(0, (s.to || 0) - (s.from || 0)), 0);
  const kills = [];
  for (const [name, v] of Object.entries(now.kc || {})) {
    const n = v - (start.kc?.[name] ?? v);
    if (n > 0 && !/^Clue Scrolls/.test(name)) kills.push({ name, n });
  }
  kills.sort((a, b) => b.n - a.n);
  return { skills, xp, levels, quests, flips: flips.length, gp, kills };
}
