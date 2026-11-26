// Rekenfuncties van tick. voor de AI-koppeling (MCP). Dezelfde code als in de app zelf,
// gebundeld voor Node met een virtuele DOM (happy-dom) in plaats van de browser.
import { Window } from 'happy-dom';
import { GAMES } from '../../web/src/lib/games.js';
import { questList, myQuestPoints, questStatus } from '../../web/src/lib/wiki.js';
import { loadAllDiaries, judgeDiaries } from '../../web/src/lib/diaries.js';
import { GUIDES, loadGuide, judgeSteps } from '../../web/src/lib/pathway.js';
import { loadMethods } from '../../web/src/lib/intel.js';
import { judgeMethod, methodDetails, pool } from '../../web/src/lib/mmg.js';
import { buildItems } from '../../web/src/lib/market.js';
import { osrsCombat, rs3Combat } from '../../web/src/lib/xp.js';
import { prices, storeGet } from './node-api.js';

const win = new Window();
globalThis.DOMParser = win.DOMParser;
globalThis.CSS = globalThis.CSS || { escape: (s) => String(s).replace(/["\\\]]/g, '\\$&') };

const unwrap = (r) => (r && typeof r === 'object' && 'data' in r ? r.data : r);
const levelsOf = (player) => Object.fromEntries((player?.skills || []).map((s) => [s.name, s.level]));
const combatOf = (game, lv) => (game === 'osrs' ? osrsCombat(lv) : rs3Combat(lv));

export { GAMES, GUIDES, questStatus };

// ---------- money-making ----------
export async function moneyMaking(game, player, { members = null, limit = 10, includeStretch = true } = {}) {
  const cfg = GAMES[game];
  const levels = levelsOf(player);
  const questMap = player?.quests || {};
  const { methods } = await loadMethods(game, cfg);
  const candidates = [...new Set(methods
    .filter((m) => m.title && m.profit > 0 && !m.structured)
    .filter((m) => { const st = judgeMethod(m, null, levels, questMap).status; return st !== 'locked' && st !== 'far'; })
    .sort((a, b) => b.profit - a.profit)
    .map((m) => m.title))].slice(0, 50);
  const res = await pool(candidates, 4, (t) => methodDetails(game, t));
  const det = Object.fromEntries(candidates.map((t, i) => [t, res[i]]));
  const judged = methods.map((m) => judgeMethod(m, det[m.title], levels, questMap))
    .filter((m) => m.profit > 0)
    .filter((m) => members == null || m.members == null || m.members === members);
  const pick = (st) => judged.filter((m) => st.includes(m.status)).sort((a, b) => b.profit - a.profit);
  const fmt = (m) => ({
    method: m.name,
    wikiPage: m.title,
    profitPerHour: m.profit,
    status: m.status,
    members: m.members,
    category: m.category,
    intensity: m.intensity || undefined,
    missingRecommended: (m.missRec || []).map((s) => `${s.skill} ${s.level} (you: ${s.cur})`),
    missingRecommendedQuests: m.missRecQuests?.length ? m.missRecQuests : undefined,
  });
  return {
    note: 'status "ok" = you meet the required and recommended levels/quests; "stretch" = requirements met but a few recommended levels short; "unverified" = requirements could not be read from the wiki.',
    canDoNow: pick(['ok']).slice(0, limit).map(fmt),
    almost: includeStretch ? pick(['stretch']).slice(0, Math.ceil(limit / 2)).map(fmt) : undefined,
    unverified: pick(['unverified']).slice(0, 5).map(fmt),
    source: `${cfg.wikiBase}/w/Money_making_guide`,
  };
}

// ---------- achievement diaries (OSRS) ----------
export async function diaryTasks(game, player, { status = 'ready', region = null, limit = 25 } = {}) {
  if (game !== 'osrs') throw new Error('Achievement diaries zijn alleen voor OSRS.');
  const levels = levelsOf(player);
  const questMap = player?.quests || {};
  const [data, list] = await Promise.all([loadAllDiaries(game), questList(game)]);
  const judged = judgeDiaries(data, player?.diaries || {}, levels, questMap, myQuestPoints(list, questMap), osrsCombat(levels));
  const regions = judged.filter((r) => !region || r.region.toLowerCase().includes(String(region).toLowerCase()));
  const tasks = regions.flatMap((r) => Object.values(r.tiers).flat())
    .filter((t) => (status === 'all_open' ? t.status !== 'done' : t.status === status))
    .slice(0, limit)
    .map((t) => ({
      region: t.region, tier: t.tier, task: t.text, status: t.status,
      missingSkills: t.missSk?.length ? t.missSk.map((s) => `${s.skill} ${s.level} (you: ${s.cur}${s.boostable ? ', boostable' : ''})`) : undefined,
      missingQuests: t.missQ?.length ? t.missQ : undefined,
    }));
  const progress = regions.map((r) => ({ region: r.region, ...Object.fromEntries(Object.entries(r.counts).map(([tier, c]) => [tier, `${c.done}/${c.total}${c.complete ? ' (claimed)' : ''}`])) }));
  return { note: '"ready" = you meet all requirements now; "near" = a few (boostable) levels short.', tasks, progress };
}

// ---------- stappenplan ----------
export async function pathwayNext(game, player, { guide = null, count = 5 } = {}) {
  const guides = GUIDES[game] || [];
  const settings = (await storeGet('settings')) || {};
  const gid = guide && guides.some((g) => g.id === guide) ? guide : settings.pathGuide?.[game] || guides[0]?.id;
  const g = guides.find((x) => x.id === gid);
  if (!g) throw new Error('Geen stappengids voor dit spel.');
  const manual = ((await storeGet('pathway')) || {})[gid] || {};
  const steps = await loadGuide(game, g);
  const j = judgeSteps(steps, { levels: levelsOf(player), questMap: player?.quests || {}, manual });
  const iron = settings.acct?.[game]?.iron ?? player?.ironman ?? false;
  const hideGE = settings.pathHideGE ?? !iron;
  const done = new Set(['done', 'likely']);
  const open = j.steps.filter((s, i) => i > j.front && !done.has(s.status) && !(hideGE && s.gather));
  const fmt = (s) => ({
    step: s.n, section: s.section, activity: s.text.length > 600 ? s.text.slice(0, 600) + '…' : s.text,
    missingQuests: s.qMiss?.length ? s.qMiss : undefined,
    missingLevels: s.lMiss?.length ? s.lMiss.map((l) => `${l.skill} ${l.level} (you: ${l.cur})`) : undefined,
  });
  return {
    guide: { id: g.id, title: g.title, by: g.by, pages: g.pages.map((p) => `${GAMES[game].wikiBase}/w/${encodeURIComponent(p.replace(/ /g, '_'))}`) },
    otherGuides: guides.filter((x) => x.id !== g.id).map((x) => ({ id: x.id, title: x.title })),
    progress: `${j.doneish}/${j.total} steps done (${Math.round((j.doneish / (j.total || 1)) * 100)}%)`,
    next: open.slice(0, count).map(fmt),
    missedEarlier: j.missed.slice(0, 5).map(fmt),
    note: 'Steps are auto-checked from quests and levels; steps without a quest or level are assumed done when they lie before your current position.',
  };
}

// ---------- GE-prijzen ----------
export async function gePrices(game, names = []) {
  const [m, l, h] = await Promise.all([
    prices(game, 'mapping', {}, 6 * 3600e3),
    prices(game, 'latest', {}, 55e3),
    prices(game, '1h', {}, 5 * 60e3).catch(() => null),
  ]);
  const settings = (await storeGet('settings')) || {};
  const items = buildItems(game, unwrap(m) || [], unwrap(l) || {}, unwrap(h) || {}, settings);
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  return names.slice(0, 25).map((q) => {
    const n = norm(q);
    const it = items.find((i) => norm(i.name) === n) || items.filter((i) => norm(i.name).includes(n)).sort((a, b) => (b.vol || 0) - (a.vol || 0))[0];
    if (!it) return { query: q, found: false };
    return {
      query: q, item: it.name, id: it.id, members: it.members,
      instantBuy: it.high, instantSell: it.low,
      geTax: it.tax, marginAfterTax: it.margin, roiPct: it.roi != null ? Math.round(it.roi * 100) / 100 : null,
      buyLimit: it.limit, volumeLastHour: it.vol, highAlch: it.highalch,
      lastTradeMinutesAgo: Number.isFinite(it.age) && it.age < 1e8 ? Math.round(it.age / 60) : null,
    };
  });
}

export { combatOf, levelsOf };
