// Adviseur voor "Nu spelen": combineert stats, XP, quests (incl. voorwaarden), quest-XP,
// training per level (uit de skill guides), money-methodes, unlocks en de GE tot gescoorde suggesties.
import { useMemo } from 'react';
import { useAsync } from './api.js';
import { resolveTitle, parsePage, toDoc, extractQuestDetails, questStatus, stripTags, playerQuestPoints } from './wiki.js';
import { GAMES, guideCandidates, skillMax } from './games.js';
import { normTitle, nl, short } from './format.js';
import { xpFor, levelFor, progressToNext } from './xp.js';
import { LENGTH_MIN } from './intel.js';
import { pool } from './mmg.js';

// ---------- kleine helpers ----------
const num = (s = '') => {
  const m = String(s).replace(/\[[^\]]*\]/g, '').match(/\d[\d.,]*/g);
  if (!m) return null;
  const vals = m.map((x) => Number(x.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))).filter((v) => Number.isFinite(v) && v > 0);
  return vals.length ? vals[0] : null;
};
// "9,000–10,000" → gemiddelde; "45,000" → 45000
const xpRate = (s = '') => {
  const t = String(s).replace(/\[[^\]]*\]/g, '');
  const m = t.match(/(\d[\d.,]{2,})(?:\s*[-–—]\s*(\d[\d.,]{2,}))?/);
  if (!m) return null;
  const a = Number(m[1].replace(/[.,]/g, ''));
  const b = m[2] ? Number(m[2].replace(/[.,]/g, '')) : null;
  const v = b ? (a + b) / 2 : a;
  return v >= 2500 && v < 5e6 ? Math.round(v) : null; // < 2.500 is bijna altijd XP per actie, niet per uur
};
// "Levels 15–35/70: Iron" / "1–20/30" / "Levels 30+: x" / "Tai Bwo Wannai Cleanup (10+)"
export function levelRange(text = '') {
  const t = stripTags(text);
  let m = t.match(/(\d{1,3})\s*[-–—]\s*(\d{1,3})/);
  if (m && +m[2] >= +m[1]) return [+m[1], +m[2]];
  m = t.match(/(\d{1,3})\s*\+/) || t.match(/^\s*levels?\s*(\d{1,3})/i);
  if (m) return [+m[1], 120];
  return null;
}

// ---------- quest-XP per quest (Quest experience rewards) ----------
export async function loadQuestXp(game) {
  const cfg = GAMES[game];
  const hit = await resolveTitle(game, cfg.pages.questXp);
  if (!hit) return {};
  const p = await parsePage(game, hit.title);
  const root = toDoc(game, p.text);
  const out = {};
  let skill = null;
  root.querySelectorAll('h2, h3, table').forEach((node) => {
    if (/^H\d$/.test(node.tagName)) {
      const t = node.textContent.trim().toLowerCase();
      skill = cfg.skills.find((s) => t === s.toLowerCase() || t.startsWith(s.toLowerCase() + ' ')) || null;
      return;
    }
    if (!skill || node.parentElement?.closest('table')) return;
    const rows = [...node.rows];
    if (rows.length < 2) return;
    const head = [...rows[0].cells].map((c) => c.textContent.trim().toLowerCase());
    const qi = head.findIndex((h) => /quest/.test(h));
    const xi = head.findIndex((h) => /reward/.test(h) && /(xp|experience)/.test(h));
    if (qi < 0 || xi < 0) return;
    for (const r of rows.slice(1)) {
      const a = [...(r.cells[qi]?.querySelectorAll('a[data-title]') || [])].find((x) => x.textContent.trim());
      const xp = num(r.cells[xi]?.textContent);
      if (!a || !xp || xp > 1e6) continue;
      const k = normTitle(a.getAttribute('data-title'));
      (out[k] ||= {})[skill] = Math.max(out[k][skill] || 0, xp);
    }
  });
  return out;
}

// ---------- training per level uit de P2P/F2P skill guide ----------
export function parseTrainingGuide(game, html, sections = []) {
  const root = toDoc(game, html);
  const steps = [];
  // XP/u per level onder een kopje (OSRS: tabel "level | XP/h" direct onder "Levels 15–35: Oak trees")
  const xpUnder = {};
  let heading = null;
  root.querySelectorAll('h2, h3, h4, table').forEach((node) => {
    if (/^H\d$/.test(node.tagName)) { heading = normTitle(node.textContent); return; }
    if (!heading || node.parentElement?.closest('table')) return;
    const rows = [...node.rows];
    if (rows.length < 2) return;
    const head = [...rows[0].cells].map((c) => c.textContent.trim().toLowerCase());
    const li = head.findIndex((h) => /^level/.test(h));
    const xi = head.findIndex((h) => /xp\/h|experience per hour|xp per hour/.test(h));
    if (li < 0 || xi < 0 || head.some((h) => /method|course|activity/.test(h))) return;
    const pts = rows.slice(1).map((r) => [num(r.cells[li]?.textContent), xpRate(r.cells[xi]?.textContent)]).filter(([l, x]) => l && x && l <= 120);
    if (pts.length && !xpUnder[heading]) xpUnder[heading] = pts.sort((a, b) => a[0] - b[0]);
  });
  // 1) samenvattingstabellen: Levels | Methode | XP/u
  for (const t of root.querySelectorAll('table')) {
    const rows = [...t.rows];
    if (rows.length < 3) continue;
    const head = [...rows[0].cells].map((c) => c.textContent.trim().toLowerCase());
    const li = head.findIndex((h) => /^levels?$|^level\b|levels?\s*$/.test(h));
    const xi = head.findIndex((h) => /xp\/h|experience per hour|xp per hour|per hour/.test(h));
    const mi = head.findIndex((h, i) => i !== li && i !== xi && /method|course|activity|location|tree|monster|training|where|item/.test(h));
    if (li < 0 || xi < 0 || mi < 0) continue;
    for (const r of rows.slice(1)) {
      const c = [...r.cells];
      if (c.length !== head.length) continue;
      const range = levelRange(c[li]?.textContent);
      const method = c[mi]?.textContent.trim().replace(/\s+/g, ' ').replace(/\[[^\]]*\]/g, '');
      if (!range || !method || method.length > 70) continue;
      steps.push({ a: range[0], b: range[1], method, xph: xpRate(c[xi]?.textContent), src: 'table' });
    }
  }
  // 2) kopjes: "Levels 15–35: Oak trees"
  for (const s of sections) {
    const line = stripTags(s.line || '');
    const range = levelRange(line);
    if (!range) continue;
    const method = ((line.split(':')[1] || line.replace(/\(?\d.*$/, '')).replace(/\s*\(?\s*levels?\s*$/i, '').replace(/[(\s]+$/, '').trim()) || line;
    const pts = xpUnder[normTitle(line)];
    steps.push({ a: range[0], b: range[1], method, xph: pts ? pts[0][1] : null, xpPts: pts || null, anchor: s.anchor, src: 'section' });
  }
  // kopjes en tabelrijen met dezelfde methode koppelen (XP/u + anker)
  for (const s of steps) {
    if (s.src !== 'table') continue;
    const sec = steps.find((x) => x.src === 'section' && (normTitle(x.method).includes(normTitle(s.method).split(' ')[0]) || normTitle(s.method).includes(normTitle(x.method).split(' ')[0])));
    if (sec) { s.anchor = sec.anchor; if (!sec.xph) sec.xph = s.xph; }
  }
  return steps;
}

export function pickStep(steps, level) {
  const fits = steps.filter((s) => s.a <= level && level < Math.max(s.b, s.a + 1));
  if (!fits.length) return null;
  const notQuest = fits.filter((s) => !/quest/i.test(s.method));
  const pool2 = notQuest.length ? notQuest : fits;
  // meest passend: hoogste startlevel (specifiek voor jouw level), dan hoogste XP/u
  pool2.sort((x, y) => (y.a - x.a) || ((y.xph || 0) - (x.xph || 0)) || (x.src === 'table' ? -1 : 1));
  const st = pool2[0];
  // XP/u bij jouw level als het kopje een level-tabel heeft
  if (st.xpPts) { const p = [...st.xpPts].reverse().find(([l]) => l <= level) || st.xpPts[0]; return { ...st, xph: p[1] }; }
  return st;
}

export async function loadTraining(game, skill, members) {
  const hit = await resolveTitle(game, guideCandidates(game, skill, members ? 'p2p' : 'f2p'));
  if (!hit) return null;
  const p = await parsePage(game, hit.title);
  return { title: hit.title, steps: parseTrainingGuide(game, p.text, p.sections || []) };
}

// ---------- skills die je pas kunt trainen na een quest of andere levels ----------
export const GATES = {
  osrs: { Herblore: { quest: 'Druidic Ritual' } },
  rs3: { Invention: { skills: { Crafting: 80, Divination: 80, Smithing: 80 } }, Necromancy: { quest: 'Necromancy!' } },
};

// ---------- quest-voorwaarden van de questpagina ----------
const prereqCache = new Map();
export async function loadPrereq(game, title, known) {
  const key = game + ':' + title;
  if (prereqCache.has(key)) return prereqCache.get(key);
  const p = await parsePage(game, title);
  const d = extractQuestDetails(toDoc(game, p.text), GAMES[game].skills);
  const self = normTitle(title);
  const quests = [...new Set((d?.questLinks || []).filter((t) => known.has(normTitle(t)) && normTitle(t) !== self))];
  const partial = (d?.questPartial || []).map(normTitle).filter((t) => quests.some((q) => normTitle(q) === t));
  const res = { quests, partial, skills: d?.skills || [], qp: d?.questPoints || null, combat: d?.combat || null, found: !!d };
  prereqCache.set(key, res);
  return res;
}

// ---------- selectie: welke quests/skills verder onderzoeken ----------
export function questCandidates(intel, members) {
  return intel.open.filter((q) => q.known && q.miss.length <= 2 && (members || q.meta?.members === false || q.meta?.members == null)).slice(0, 40);
}
export function questsToCheck(qCands) {
  return qCands.filter((q) => q.miss.length === 0).slice(0, 24).concat(qCands.filter((q) => q.miss.length > 0).slice(0, 8)).map((q) => q.title);
}
export function skillsToTrain({ intel, goals, game, levels, skills }) {
  const s = new Set();
  for (const r of intel.radar.slice(0, 6)) s.add(r.skill);
  for (const q of intel.near.slice(0, 6)) for (const m of q.miss) s.add(m.skill);
  for (const g of goals || []) if (g.game === game && g.type === 'skill' && g.skill) s.add(g.skill);
  Object.entries(levels).sort((a, b) => a[1] - b[1]).slice(0, 3).forEach(([k]) => s.add(k));
  return [...s].filter((x) => skills.includes(x)).slice(0, 10);
}

// ---------- hoofd-hook ----------
export function useAdvisor({ game, intel, levels, player, questMap, goals, flips, acct }) {
  const cfg = GAMES[game];
  const known = useMemo(() => new Set((intel.list || []).map((q) => normTitle(q.title))), [intel.list]);

  const questXp = useAsync(() => loadQuestXp(game), [game]);

  // Kandidaat-quests: skill-reqs ok volgens het index, members-filter; top in routevolgorde laten checken op voorwaarden
  const qCands = useMemo(() => questCandidates(intel, acct.members), [intel.open, acct.members]);
  const toCheck = useMemo(() => questsToCheck(qCands), [qCands]);
  const prereq = useAsync(async () => {
    const res = await pool(toCheck, 4, (t) => loadPrereq(game, t, known));
    return Object.fromEntries(toCheck.map((t, i) => [normTitle(t), res[i]]));
  }, [game, toCheck.join('|')], { enabled: toCheck.length > 0 && known.size > 0 });

  // Welke skills willen we een trainingsadvies voor geven?
  const trainSkills = useMemo(() => skillsToTrain({ intel, goals, game, levels, skills: cfg.skills }), [intel.radar, intel.near, goals, game, levels, cfg.skills]);
  const training = useAsync(async () => {
    const res = await pool(trainSkills, 3, (sk) => loadTraining(game, sk, acct.members));
    return Object.fromEntries(trainSkills.map((sk, i) => [sk, res[i]]));
  }, [game, trainSkills.join('|'), acct.members], { enabled: trainSkills.length > 0 });

  const skillsXp = useMemo(() => Object.fromEntries((player.data?.skills || []).map((s) => [s.name, s.xp])), [player.data]);

  const result = useMemo(() => (intel.ready ? computeAdvice({
    game, intel, levels, skillsXp, questXp: questXp.data, prereq: prereq.data, training: training.data, questMap, goals, flips, acct, player, qCands,
    loading: prereq.loading || training.loading || questXp.loading,
  }) : null), [intel, levels, skillsXp, questXp.data, prereq.data, training.data, questMap, goals, flips, acct, player.data, qCands, game, prereq.loading, training.loading, questXp.loading]);

  return { ...(result || {}), ready: !!result, loadingDeep: prereq.loading || training.loading || questXp.loading };
}


// Pure berekening van alle gescoorde suggesties
export function computeAdvice({ game, intel, levels, skillsXp, questXp, prereq, training, questMap, goals, flips, acct, player, qCands, loading }) {
  const memOk = (m) => acct.members || m === false || m == null;
    const lv = (s) => levels[s] ?? 1;
    const gates = GATES[game] || {};
    const gateOpen = (skill) => {
      const g = gates[skill];
      if (!g) return true;
      if (g.quest && questStatus(questMap, g.quest) !== 'done') return false;
      if (g.skills && Object.entries(g.skills).some(([k, l]) => lv(k) < l)) return false;
      return true;
    };
    const xpOf = (s) => skillsXp[s] ?? xpFor(lv(s), s);
    const myQp = playerQuestPoints(player, intel.list, questMap);
    const qx = questXp || {};
    const pq = prereq || {};
    const tr = training || {};
    const routeIdx = new Map((intel.route || []).map((t, i) => [normTitle(t), i]));
    const firstOpenIdx = (intel.route || []).findIndex((t) => questStatus(questMap, t) !== 'done');
    const radarBy = {};
    for (const r of intel.radar) (radarBy[r.skill] ||= []).push(r);

    // XP-beloning omzetten in level-ups (en of dat iets opent)
    const xpEffect = (rewards = {}) => {
      const ups = [];
      for (const [s, x] of Object.entries(rewards)) {
        const from = lv(s);
        const to = Math.max(from, levelFor(xpOf(s) + x, s, skillMax(game, s)));
        if (to > from) {
          const opens = (radarBy[s] || []).filter((r) => r.to > from && r.to <= to).flatMap((r) => r.unlocks.filter((u) => u.level > from && u.level <= to));
          ups.push({ skill: s, from, to, xp: x, opens });
        }
      }
      return ups;
    };

    // ---------- quests ----------
    const quests = [];
    const nearQuests = [];
    for (const q of qCands) {
      const k = normTitle(q.title);
      const pr = pq[k];
      const missQ = pr ? pr.quests.filter((t) => { const st = questStatus(questMap, t); return (pr.partial || []).includes(normTitle(t)) ? st !== 'done' && st !== 'started' : st !== 'done'; }) : [];
      if (pr?.qp && myQp < pr.qp) missQ.push(`${pr.qp} QP (jij ${myQp})`);
      const missSk = [...q.miss];
      if (pr?.skills?.length) for (const s of pr.skills) if (lv(s.skill) < s.level && !missSk.some((m) => m.skill === s.skill)) missSk.push({ skill: s.skill, level: s.level, cur: lv(s.skill), boostable: s.boostable });
      const mins = LENGTH_MIN(q.meta?.length);
      const rewards = qx[k] || qx[normTitle(q.title.split('/')[0])] || {};
      const ups = xpEffect(rewards);
      const totalXp = Object.values(rewards).reduce((a, b) => a + b, 0);
      const rank = routeIdx.has(k) ? routeIdx.get(k) : 999;
      const reasons = [];
      if (rank < 999) reasons.push(rank <= firstOpenIdx + 3 ? 'Volgende in de optimale route' : `Optimale route #${rank + 1}`);
      for (const u of ups.slice(0, 3)) reasons.push(`${u.skill} ${u.from} → ${u.to}${u.opens.length ? ` · opent ${u.opens.length}` : ''}`);
      if (!ups.length && totalXp) reasons.push(`+${nl(totalXp)} XP`);
      if (mins <= 20) reasons.push(`Kort (~${mins} min)`);
      if (q.meta?.qp) reasons.push(`${q.meta.qp} QP`);
      const base = {
        id: 'q:' + q.title, kind: 'quest', icon: 'quest', title: q.title.replace('/', ' · '), questTitle: q.title,
        sub: [q.meta?.difficulty, q.meta?.length, q.meta?.members === false ? 'F2P' : null].filter(Boolean).join(' · ') || 'Quest',
        mins, fixed: true, qp: q.meta?.qp || 0, rewards, ups, to: `#/quests/${encodeURIComponent(q.title)}`, cta: 'Quick guide',
        checked: !!pr, rank,
      };
      if (missQ.length || missSk.length) {
        nearQuests.push({ ...base, missQ, missSk });
        continue;
      }
      const unlocksSkill = Object.entries(gates).filter(([, g]) => g.quest && normTitle(g.quest) === k).map(([sk]) => sk);
      for (const sk of unlocksSkill) reasons.unshift(`Speelt ${sk}-training vrij`);
      let score = 50 + unlocksSkill.length * 14;
      score += Math.max(0, 30 - rank * 0.6);
      score += Math.min(25, ups.length * 8 + ups.reduce((a, u) => a + u.opens.length * 4, 0));
      score += Math.min(8, Math.sqrt(totalXp) / 12);
      score += mins <= 20 ? 6 : mins >= 90 ? -6 : 0;
      if (!pr) { score -= 18; reasons.push('Voorwaarden nog niet gecontroleerd'); }
      quests.push({ ...base, score, reasons, detail: ups.length ? `Beloning: ${Object.entries(rewards).map(([s, x]) => `${nl(x)} ${s}`).join(', ')}` : null });
    }
    quests.sort((a, b) => b.score - a.score);

    // ---------- training ----------
    const trainBlock = (skill, target, why, extraScore = 0, opens = []) => {
      const cur = lv(skill);
      if (target > skillMax(game, skill)) target = skillMax(game, skill);
      if (target <= cur || !gateOpen(skill)) return null;
      const need = Math.max(0, xpFor(target, skill) - xpOf(skill));
      const g = tr[skill];
      const step = g ? pickStep(g.steps, cur) : null;
      const xph = step?.xph || null;
      const est = xph ? Math.round((need / xph) * 60) : null;
      const reasons = [...why];
      if (step?.xph) reasons.push(`~${short(step.xph)} XP/u`);
      if (est != null) reasons.push(est <= 90 ? `~${est} min` : `~${Math.round(est / 6) / 10} u totaal`);
      return {
        id: `t:${skill}:${target}`, kind: 'skill', skill, title: `${skill} ${cur} → ${target}`,
        sub: step ? `${step.method}${step.b < 120 && step.b < target ? ` (tot ${step.b}, daarna verder in de guide)` : ''}` : `${nl(need)} XP`,
        need, est, method: step?.method || null, xph,
        to: g ? `#/wiki/${encodeURIComponent(g.title)}${step?.anchor ? `?a=${encodeURIComponent(step.anchor)}` : ''}` : `#/skills/${encodeURIComponent(skill)}`,
        cta: step ? 'Methode' : 'Training-route', reasons, opens,
        score: 40 + extraScore - Math.min(25, (est ?? 60) / 8),
      };
    };
    const train = [];
    for (const r of intel.radar.slice(0, 8)) {
      const why = [`Opent ${[r.nq ? `${r.nq} quest${r.nq === 1 ? '' : 's'}` : null, r.nm ? `${r.nm} money-methode${r.nm === 1 ? '' : 's'}` : null].filter(Boolean).join(' + ')}`];
      const b = trainBlock(r.skill, r.to, why, 10 + r.nq * 6 + r.nm * 4, r.unlocks);
      if (b) train.push(b);
    }
    for (const g of (goals || []).filter((x) => x.game === game && x.type === 'skill')) {
      const b = trainBlock(g.skill, Math.min(g.level, lv(g.skill) + 10), ['Staat in je doelen'], 14);
      if (b) train.push({ ...b, id: b.id + ':goal' });
    }
    // bijna een level: snelle winst
    const levelUps = [];
    for (const s of player.data?.skills || []) {
      if (s.level >= skillMax(game, s.name) || s.xp == null) continue;
      const p = progressToNext(s.xp, s.level, s.name, skillMax(game, s.name));
      const need = xpFor(s.level + 1, s.name) - s.xp;
      if (p >= 0.8) levelUps.push({ skill: s.name, level: s.level + 1, p, need });
    }
    levelUps.sort((a, b) => b.p - a.p);
    for (const u of levelUps.slice(0, 4)) {
      const b = trainBlock(u.skill, u.level, [`${Math.round(u.p * 100)}% van level ${u.level}`], 4);
      if (b) train.push({ ...b, id: `l:${u.skill}`, quick: true });
    }

    // ---------- combo's: trainen → quest ----------
    const combos = [];
    for (const q of nearQuests) {
      if (q.missQ.length || !q.missSk.length) continue;
      const gap = q.missSk.reduce((a, m) => a + (m.level - m.cur), 0);
      if (gap > 12) continue;
      const blocks = q.missSk.map((m) => trainBlock(m.skill, m.level, [`Voor ${q.title.replace('/', ' · ')}`], 20)).filter(Boolean);
      if (!blocks.length) continue;
      const mins = blocks.reduce((a, b) => a + Math.min(60, b.est ?? 30), 0);
      combos.push({
        id: 'c:' + q.questTitle, kind: 'combo', icon: 'route', title: `${q.missSk.map((m) => `${m.skill} ${m.cur}→${m.level}`).join(', ')}, dan ${q.title}`,
        steps: [...blocks, { ...q, reasons: ['Na het trainen direct te doen'], score: 0 }], mins: mins + q.mins,
        reasons: [`Nog ${gap} level${gap === 1 ? '' : 's'} te gaan`, ...(q.ups.length ? [`quest geeft ${q.ups.map((u) => `${u.skill} → ${u.to}`).join(', ')}`] : []), q.rank < 999 ? `Route #${q.rank + 1}` : null].filter(Boolean),
        score: 62 - gap * 2 + (q.rank < 999 ? Math.max(0, 15 - q.rank * 0.3) : 0),
      });
    }
    combos.sort((a, b) => b.score - a.score);

    // ---------- geld ----------
    const isIronBad = (m) => /^buying|^selling|^collecting .* from .* shop|exchang/i.test(m.name) || /processing/i.test(m.category || '');
    const money = [];
    const runs = [];
    for (const m of intel.methods) {
      if (!(m.profit > 0) || !memOk(m.members)) continue;
      if (acct.iron && isIronBad(m)) continue;
      const ok = m.status === 'ok';
      const okish = m.status === 'stretch' && m.recGap <= 10;
      const unver = m.status === 'unverified' && !m.missReq?.length;
      if (!ok && !okish && !unver) continue;
      const isRun = /\brun\b|runs\b|farm|herb|birdhouse|tree run|seaweed|kingdom|daily|dailies|contract|patch/i.test(m.name + ' ' + m.category);
      const reasons = [`${short(m.profit)}/u`];
      if (ok) reasons.push('Vereist én aanbevolen gehaald');
      if (okish) reasons.push(`${m.recGap} level${m.recGap === 1 ? '' : 's'} onder aanbevolen`);
      if (unver) reasons.push('Eisen niet volledig gecontroleerd');
      if (m.intensity) reasons.push(`Intensiteit: ${m.intensity}`);
      const it = {
        id: (isRun ? 'u:' : 'm:') + m.name, kind: isRun ? 'run' : 'money', icon: isRun ? 'clock' : 'coins', title: m.name,
        sub: [m.category, m.intensity, m.members === false ? 'F2P' : null].filter(Boolean).join(' · '), profit: m.profit, intensity: m.intensity || '', category: m.category || '',
        to: m.title ? `#/wiki/${encodeURIComponent(m.title)}` : '#/money', cta: 'Uitleg', reasons,
        score: 30 + Math.log10(Math.max(1e4, m.profit)) * 8 + (ok ? 8 : okish ? 0 : -10),
      };
      (isRun ? runs : money).push(it);
    }
    money.sort((a, b) => b.score - a.score);
    runs.sort((a, b) => b.score - a.score);
    // "bijna": betere methode binnen bereik
    const better = intel.methods
      .filter((m) => m.profit > (money[0]?.profit || 0) * 1.5 && memOk(m.members) && !(acct.iron && isIronBad(m)) && m.status === 'locked' && !m.missQuests?.length && m.missReq?.length === 1 && m.missReq[0].level - m.missReq[0].cur <= 6)
      .sort((a, b) => b.profit - a.profit).slice(0, 3)
      .map((m) => { const s = m.missReq[0]; const b = trainBlock(s.alts ? s.alts[0].skill : s.skill, s.alts ? s.alts[0].level : s.level, [`Opent ${m.name} (${short(m.profit)}/u)`], 18); return b && { ...b, id: 'b:' + m.name }; })
      .filter(Boolean);
    train.push(...better);
    const seenT = new Set();
    const trainU = train.sort((a, b) => b.score - a.score).filter((t) => { const key = t.quick ? t.id : 'skill:' + t.skill; return seenT.has(key) ? false : seenT.add(key); });

    const ge = !acct.iron && flips.length ? [{
      id: 'ge', kind: 'ge', icon: 'chart', title: 'Zet je GE-slots', sub: flips.slice(0, 4).map((f) => f.name).join(' · '),
      reasons: [`Samen tot +${short(flips.slice(0, 4).reduce((a, f) => a + f.profit, 0))} per 4 uur`, 'Loopt door terwijl je speelt'], mins: 5, fixed: true, to: '#/ge', cta: 'GE-terminal', score: 70,
    }] : [];

    // ---------- account-snapshot ----------
    const firstOpen = (intel.route || []).find((t) => questStatus(questMap, t) !== 'done');
    const firstState = firstOpen ? (() => {
      const k = normTitle(firstOpen);
      if (quests.some((q) => normTitle(q.questTitle) === k)) return { ok: true };
      const n = nearQuests.find((q) => normTitle(q.questTitle) === k);
      if (n) return { ok: false, miss: [...n.missSk.map((m) => `${m.skill} ${m.level}`), ...n.missQ] };
      const o = intel.open.find((q) => normTitle(q.title) === k);
      return { ok: false, miss: (o?.miss || []).map((m) => `${m.skill} ${m.level}`) };
    })() : null;
    const done = Object.values(questMap).filter((v) => v === 'done').length;
    const snapshot = {
      questsDone: done, questsTotal: (intel.list || []).length,
      nextRoute: firstOpen ? { title: firstOpen, ...firstState } : null,
      levelUps: levelUps.slice(0, 3),
      lowest: Object.entries(levels).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([skill, level]) => ({ skill, level })),
      bigUnlock: intel.radar.find((r) => gateOpen(r.skill)) || null,
      bestMoney: money[0] || null,
      checking: !!loading,
    };

    return { quests, nearQuests, train: trainU, combos, money, runs, ge, snapshot };
}

// ---------- plan maken ----------
const MOOD_W = {
  mix: { quest: 1, skill: 1, combo: 1.1, money: 0.9, run: 1, ge: 1 },
  quest: { quest: 1.6, skill: 0.8, combo: 1.4, money: 0.2, run: 0.4, ge: 0.6 },
  afk: { quest: 0.4, skill: 1.2, combo: 0.6, money: 1.1, run: 1.2, ge: 1.2 },
  actief: { quest: 1, skill: 0.9, combo: 1, money: 1.2, run: 0.8, ge: 0.8 },
  geld: { quest: 0.3, skill: 0.5, combo: 0.4, money: 1.6, run: 1.4, ge: 1.5 },
};
const AFK_RE = /low|afk|minimal|laag/i;
const HIGH_RE = /high|moderate|intense|hoog/i;

export function makePlan(adv, { time, mood, seed = 0, alt = {}, removed = [] }) {
  if (!adv?.ready) return [];
  const W = MOOD_W[mood] || MOOD_W.mix;
  const used = new Set(removed);
  const usedSkills = new Set();
  const blocks = [];
  let left = time;
  let slot = 0;

  const moodAdj = (it) => {
    let s = it.score * (W[it.kind] || 1);
    if (it.kind === 'money' || it.kind === 'run') {
      if (mood === 'afk') s *= AFK_RE.test(it.intensity) ? 1.3 : HIGH_RE.test(it.intensity) ? 0.6 : 1;
      if (mood === 'actief') s *= HIGH_RE.test(it.intensity) || /combat|boss|slayer/i.test(it.category) ? 1.3 : 0.85;
    }
    if (it.kind === 'skill' && mood === 'afk' && it.xph && /quest/i.test(it.method || '')) s *= 0.5;
    return s;
  };
  const candidates = [
    ...adv.ge, ...adv.runs.slice(0, 4), ...adv.combos.slice(0, 6), ...adv.quests.slice(0, 20), ...adv.train.slice(0, 12), ...adv.money.slice(0, 12),
  ].map((it) => ({ ...it, eff: moodAdj(it) })).sort((a, b) => b.eff - a.eff);

  const blockMins = (it) => {
    if (it.kind === 'ge') return 5;
    if (it.kind === 'run') return 10;
    if (it.kind === 'quest') return it.mins;
    if (it.kind === 'skill') return Math.max(10, Math.min(it.quick ? 20 : 60, it.est ?? 30));
    if (it.kind === 'money') return Math.min(60, Math.max(20, Math.round(left * 0.5)));
    return 30;
  };
  const counts = { quest: 0, skill: 0, money: 0, run: 0, combo: 0, ge: 0 };
  const cap = { quest: mood === 'quest' ? 8 : 4, skill: 3, money: mood === 'geld' ? 3 : 2, run: 2, combo: 2, ge: 1 };

  // seed/alt: kies uit de top van elke soort een andere variant
  const pickFrom = (list, k) => list[Math.min(list.length - 1, k)];
  const queue = [...candidates];
  let guard = 0;
  while (left >= 8 && queue.length && guard++ < 200) {
    // per soort de beste nog-beschikbare kandidaat; seed draait de keuze binnen de top-3
    const kinds = Object.keys(counts).filter((k) => counts[k] < cap[k]);
    let best = null;
    for (const k of kinds) {
      const avail = queue.filter((x) => x.kind === k && !used.has(x.id) && !(x.skill && usedSkills.has(x.skill)));
      if (!avail.length) continue;
      const it = pickFrom(avail, ((seed + (alt[slot] || 0)) % Math.min(3, avail.length)));
      const m = it.kind === 'combo' ? it.mins : blockMins(it);
      if (m > left + 15 && !(it.kind === 'quest' && blocks.length === 0)) continue;
      // afnemende waarde per soort zorgt voor afwisseling
      const v = it.eff * Math.pow(0.72, counts[k]);
      if (!best || v > best.v) best = { it, v, m, alts: avail.length - 1 };
    }
    if (!best) break;
    const { it } = best;
    used.add(it.id);
    counts[it.kind]++;
    if (it.kind === 'combo') {
      for (const st of it.steps) {
        if (used.has(st.id) && st.kind !== 'quest') continue;
        used.add(st.id);
        if (st.skill) usedSkills.add(st.skill);
        const mm = st.kind === 'quest' ? st.mins : Math.max(10, Math.min(60, st.est ?? 30));
        blocks.push({ ...st, mins: mm, slot, comboOf: it.title, alts: best.alts });
        left -= mm;
      }
      slot++;
      continue;
    }
    if (it.skill) usedSkills.add(it.skill);
    let m = best.m;
    let extra = {};
    if (it.kind === 'quest' && m > left) { m = Math.max(20, left); extra = { title: `Begin aan ${it.title}`, part: true, reasons: [`Lange quest (~${it.mins} min): je komt een flink eind`, ...it.reasons] }; }
    blocks.push({ ...it, ...extra, mins: Math.round(m), slot: slot++, alts: best.alts });
    left -= Math.round(m);
  }
  // korte dingen (GE, runs) eerst; combo-stappen blijven bij elkaar
  const order = { ge: 0, run: 1 };
  return blocks.map((b, i) => ({ b, i })).sort((x, y) => (order[x.b.kind] ?? 2) - (order[y.b.kind] ?? 2) || x.i - y.i).map((x) => x.b);
}
