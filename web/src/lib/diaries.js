// Achievement diaries (OSRS): taken + eisen van de wiki, voortgang via WikiSync.
import { parsePage, toDoc, extractSkills, questStatus } from './wiki.js';
import { GAMES } from './games.js';
import { pool } from './mmg.js';

export const REGIONS = ['Ardougne', 'Desert', 'Falador', 'Fremennik', 'Kandarin', 'Karamja', 'Kourend & Kebos', 'Lumbridge & Draynor', 'Morytania', 'Varrock', 'Western Provinces', 'Wilderness'];
export const TIERS = ['Easy', 'Medium', 'Hard', 'Elite'];
const NOT_SKILL = /quest points|combat level|total level/i;

function parseReq(cell, skills) {
  const sk = extractSkills(cell, skills).filter((s) => !NOT_SKILL.test(s.skill));
  const quests = [];
  for (const a of cell.querySelectorAll('a[data-title]')) {
    const t = a.getAttribute('data-title');
    if (!t || skills.includes(t) || /^(Quest points|Combat level|Members|Free-to-play)$/i.test(t)) continue;
    const li = (a.closest('li') || cell).textContent;
    if (!/completion|complete|started|partial|quest/i.test(li)) continue;
    quests.push({ title: t, partial: /started|partial/i.test(li) && !/completion of/i.test(li) });
  }
  const qp = (cell.textContent.match(/(\d{1,3})\s*quest points?/i) || [])[1];
  const cb = (cell.textContent.match(/(\d{1,3})\s*combat/i) || [])[1];
  const text = cell.textContent.replace(/\s+/g, ' ').trim();
  return { skills: sk, quests, qp: qp ? +qp : null, combat: cb ? +cb : null, text: /^none$/i.test(text) ? '' : text };
}

export async function loadRegion(game, region) {
  const cfg = GAMES[game];
  const p = await parsePage(game, `${region} Diary`);
  const root = toDoc(game, p.text);
  const tables = [...root.querySelectorAll('table.diary-table')].filter((t) => /^task/i.test(t.rows[0]?.cells[0]?.textContent.trim() || ''));
  const tiers = {};
  tables.slice(0, 4).forEach((t, i) => {
    tiers[TIERS[i]] = [...t.rows].slice(1).map((r, idx) => {
      const c = [...r.cells];
      const task = c[0]?.cloneNode(true);
      task?.querySelectorAll('p, sup, .reference').forEach((x) => x.remove());
      return { idx, text: (task?.textContent || '').replace(/^\s*\d+\.\s*/, '').replace(/\s+/g, ' ').trim(), req: c[1] ? parseReq(c[1], cfg.skills) : { skills: [], quests: [], text: '' } };
    });
  });
  return { region, title: p.title || `${region} Diary`, tiers };
}

export async function loadAllDiaries(game) {
  const res = await pool(REGIONS, 4, (r) => loadRegion(game, r));
  return REGIONS.map((r, i) => res[i]).filter(Boolean);
}

// Beoordeel elke taak tegen je account
export function judgeDiaries(data, progress, levels, questMap, myQp, combat) {
  const lv = (s) => levels[s] ?? 1;
  // Links naar plaatsen (bv. Sophanem) zijn geen quests: alleen titels die WikiSync als quest kent tellen mee.
  const known = questMap && Object.keys(questMap).length > 0;
  return (data || []).map((reg) => {
    const tiers = {};
    for (const tier of TIERS) {
      const done = progress?.[reg.region]?.[tier]?.tasks || [];
      tiers[tier] = (reg.tiers[tier] || []).map((t) => {
        const isDone = !!done[t.idx];
        const missSk = t.req.skills.filter((s) => lv(s.skill) < s.level).map((s) => ({ ...s, cur: lv(s.skill), gap: s.level - lv(s.skill) }));
        const missQ = t.req.quests.filter((q) => { const st = questStatus(questMap, q.title); if (st == null && known) return false; return q.partial ? !st || st === 'none' : st !== 'done'; }).map((q) => q.title);
        const missQp = t.req.qp && myQp < t.req.qp ? t.req.qp : null;
        const missCb = t.req.combat && combat != null && combat < t.req.combat ? t.req.combat : null;
        const gap = missSk.reduce((a, s) => a + s.gap, 0);
        const status = isDone ? 'done' : !missSk.length && !missQ.length && !missQp && !missCb ? 'ready' : !missQ.length && !missQp && (!missCb || missCb - combat <= 3) && gap <= 5 && missSk.every((s) => s.gap <= 3 || s.boostable) ? 'near' : 'locked';
        return { ...t, region: reg.region, tier, status, missSk, missQ, missQp, missCb, gap };
      });
    }
    const count = (tier) => ({ done: tiers[tier].filter((t) => t.status === 'done').length, total: tiers[tier].length, complete: !!progress?.[reg.region]?.[tier]?.complete });
    return { ...reg, tiers, counts: Object.fromEntries(TIERS.map((t) => [t, count(t)])) };
  });
}
