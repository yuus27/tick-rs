// Account-intelligentie: combineert jouw stats/quests met wiki-data.
import { useMemo } from 'react';
import { useApp } from './store.jsx';
import { useAsync } from './api.js';
import { resolveTitle, parsePage, toDoc, readTables, extractSkills, extractQuestDetails, questList, optimalRoute, questStatus, parseSkillText } from './wiki.js';
import { GAMES } from './games.js';
import { normTitle } from './format.js';
import { xpFor } from './xp.js';
import { useJudgedMethods, parseMmgReqs } from './mmg.js';

const REQ_PAGES = ['Quests/Skill requirements', 'Quest skill requirements', 'Skill requirements for quests', 'Quests/Requirements'];

export const LENGTH_MIN = (len = '') => {
  const l = len.toLowerCase();
  if (/very short/.test(l)) return 10;
  if (/very long/.test(l)) return 120;
  if (/short/.test(l)) return 20;
  if (/medium/.test(l)) return 40;
  if (/long/.test(l)) return 75;
  return 35;
};

// ---------- money making (gedeeld met Money-pagina) ----------
const parseNum = (s = '') => {
  const t = s.replace(/\s/g, '');
  const m = t.match(/-?[\d.,]+/);
  if (!m) return null;
  let v = Number(m[0].replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
  if (/[kK]\b/.test(t)) v *= 1e3;
  if (/[mM]\b/.test(t)) v *= 1e6;
  return Number.isFinite(v) ? v : null;
};

export async function loadMethods(game, cfg) {
  const hit = await resolveTitle(game, cfg.pages.money);
  if (!hit) return { methods: [], title: null };
  const p = await parsePage(game, hit.title);
  return { methods: methodsFromHtml(game, cfg, p.text), title: hit.title };
}

export function methodsFromHtml(game, cfg, html) {
  const root = toDoc(game, html);
  const out = [];
  const seen = new Set();
  for (const t of readTables(root, { headerMatch: /profit/ })) {
    // Kortste passende kop: de RS3-tabel heeft een legenda-kop die álle termen bevat
    const col = (re) => t.head.map((h, i) => [h, i]).filter(([h]) => re.test(h)).sort((a, b) => a[0].length - b[0].length)[0]?.[1] ?? -1;
    const mi = col(/method|activity|name/);
    const pi = col(/profit/);
    const si = col(/skill|requirement/);
    const ci = col(/category|type/);
    const ii = col(/intensity|attention|effort/);
    const memi = col(/member/);
    if (mi < 0 || pi < 0) continue;
    for (const cells of t.rows) {
      const a = cells[mi]?.querySelector('a[data-title]');
      const name = (cells[mi]?.textContent || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const profit = parseNum(cells[pi]?.textContent || '');
      if (profit == null) continue;
      // RS3 (en waar beschikbaar): gestructureerde eisen in de hele rij
      const tr = cells[0]?.closest('tr');
      const st = tr && tr.querySelector('.mmg-skill, .mmg-quest, .mmg-req-or') ? parseMmgReqs(tr, cfg.skills) : null;
      const parsed = st ? [] : si >= 0 ? parseSkillText(cells[si], cfg.skills) : [];
      out.push({
        name,
        title: a?.getAttribute('data-title') || null,
        profit,
        skills: st ? st.req : parsed.filter((s) => s.kind === 'req'),
        recSkills: st ? st.rec : parsed.filter((s) => s.kind === 'rec'),
        reqQuests: st ? st.reqQuests : [],
        recQuests: st ? st.recQuests : [],
        structured: !!st?.found,
        members: (() => {
          if (memi < 0 || !cells[memi]) return null;
          const c = cells[memi];
          const lk = [...c.querySelectorAll('a, img')].map((x) => x.getAttribute('data-title') || x.getAttribute('title') || x.getAttribute('alt') || '').join(' ');
          const tx = (lk + ' ' + c.textContent).toLowerCase();
          if (/free-to-play|f2p/.test(tx)) return false;
          if (/members|p2p|✓|yes/.test(tx)) return true;
          return null;
        })(),
        reqText: si >= 0 ? cells[si].textContent.trim().slice(0, 140) : '',
        category: ci >= 0 ? cells[ci].textContent.trim() : t.heading || 'Overig',
        intensity: ii >= 0 ? cells[ii].textContent.trim() : '',
      });
    }
  }
  return out;
}

// ---------- quest skill-requirements ----------
async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch { out[k] = null; } }
  }));
  return out;
}

export async function questReqIndex(game, titles, routeOrder) {
  const cfg = GAMES[game];
  const known = new Set(titles.map(normTitle));
  const isQuest = (t) => known.has(normTitle(t)) || known.has(normTitle(t.split('/')[0]));
  const idx = new Map();
  const add = (title, skills) => {
    const k = normTitle(title);
    const e = idx.get(k) || { title, skills: {} };
    for (const s of skills) e.skills[s.skill] = Math.max(e.skills[s.skill] || 0, s.level);
    idx.set(k, e);
  };
  const hit = await resolveTitle(game, REQ_PAGES).catch(() => null);
  if (hit) {
    const p = await parsePage(game, hit.title);
    const root = toDoc(game, p.text);
    let headingSkill = null;
    root.querySelectorAll('h2, h3, h4, table, li').forEach((node) => {
      if (/^H\d$/.test(node.tagName)) {
        const t = node.textContent.trim().toLowerCase();
        headingSkill = cfg.skills.find((s) => t.startsWith(s.toLowerCase())) || null;
        return;
      }
      // RS3: per skill een lijst "10 - The Dig Site"
      if (node.tagName === 'LI') {
        if (!headingSkill || node.closest('table')) return;
        const m = node.textContent.match(/^\s*(\d{1,3})\b/);
        const links = [...node.querySelectorAll('a[data-title]')].map((a) => a.getAttribute('data-title')).filter(isQuest);
        if (m && +m[1] <= 120 && links.length) links.forEach((t) => add(t, [{ skill: headingSkill, level: +m[1] }]));
        return;
      }
      node.querySelectorAll('tr').forEach((tr) => {
        const links = [...new Set([...tr.querySelectorAll('a[data-title]')].map((a) => a.getAttribute('data-title')).filter(isQuest))];
        if (!links.length) return;
        let skills = extractSkills(tr, cfg.skills);
        if (!skills.length && headingSkill) {
          const m = tr.textContent.match(/\b(\d{1,3})\b/);
          if (m && +m[1] <= 120) skills = [{ skill: headingSkill, level: +m[1] }];
        }
        if (skills.length) links.forEach((t) => add(t, skills));
      });
    });
  }
  // Aanvullen: de eerstvolgende quests in de route rechtstreeks van hun pagina lezen
  const missing = (routeOrder?.length ? routeOrder : titles).filter((t) => !idx.has(normTitle(t))).slice(0, hit ? 12 : 30);
  const pages = await pool(missing, 4, async (t) => {
    const p = await parsePage(game, t);
    const d = extractQuestDetails(toDoc(game, p.text), cfg.skills);
    return { t, skills: d?.skills || [] };
  });
  const fetched = new Set();
  for (const r of pages) if (r) { add(r.t, r.skills); fetched.add(normTitle(r.t)); }
  return { idx, source: hit?.title || null, fetched };
}

// ---------- hook ----------

// Pure berekening (ook bruikbaar buiten React, bv. voor tests met echte wiki-data)
export function computeIntel({ list, reqs, route, titles, questMap, levels, judged, skillsXp }) {
    const meta = Object.fromEntries(list.map((q) => [normTitle(q.title), q]));
    const order = route?.length ? route : titles;
    const seen = new Set();
    const open = [];
    for (const t of [...order, ...titles]) {
      const k = normTitle(t);
      if (seen.has(k)) continue;
      seen.add(k);
      if (questStatus(questMap, t) === 'done') continue;
      const r = reqs.idx.get(k);
      const known = !!r || !!reqs.source || reqs.fetched.has(k);
      const req = r?.skills || {};
      const miss = Object.entries(req).filter(([s, l]) => (levels[s] ?? 1) < l).map(([s, l]) => ({ skill: s, level: l, cur: levels[s] ?? 1 }));
      open.push({ title: t, meta: meta[k] || meta[normTitle(t.split('/')[0])] || null, req, miss, known, inRoute: !!route?.some((x) => normTitle(x) === k) });
    }
    const doable = open.filter((q) => q.known && q.miss.length === 0);
    const near = open.filter((q) => q.known && q.miss.length > 0 && q.miss.length <= 2 && q.miss.reduce((a, m) => a + (m.level - m.cur), 0) <= 8);

    // ok = vereist én aanbevolen gehaald; okish = vereist gehaald maar onder aanbevolen
    const methods = judged.map((m) => ({ ...m, miss: m.missReq, ok: m.status === 'ok', okish: m.status === 'stretch' && m.recGap <= 10 }));

    // Unlock-radar: per skill de drempels waarboven content vrijkomt (alleen die skill mist)
    const bySkill = {};
    const push = (skill, level, item) => { (bySkill[skill] ||= []).push({ level, ...item }); };
    for (const q of open) if (q.known && q.miss.length && q.miss.every((m) => m.skill === q.miss[0].skill)) push(q.miss[0].skill, Math.max(...q.miss.map((m) => m.level)), { type: 'quest', title: q.title, meta: q.meta });
    for (const m of methods) if (!m.missQuests.length && m.miss.length && m.miss.every((x) => x.skill === m.miss[0].skill) && m.profit > 0) push(m.miss[0].skill, Math.max(...m.miss.map((x) => x.level)), { type: 'money', title: m.title || m.name, name: m.name, profit: m.profit });
    const radar = [];
    for (const [skill, arr] of Object.entries(bySkill)) {
      const cur = levels[skill] ?? 1;
      const curXp = skillsXp[skill] ?? xpFor(cur);
      const levelsSorted = [...new Set(arr.map((a) => a.level))].sort((a, b) => a - b).filter((l) => l <= 99);
      const picks = new Set([levelsSorted[0]]);
      // grootste sprong binnen +10 levels van de eerste drempel
      let best = null;
      for (const L of levelsSorted.filter((l) => l <= levelsSorted[0] + 10)) {
        const n = arr.filter((a) => a.level <= L).length;
        if (!best || n > best.n) best = { L, n };
      }
      if (best) picks.add(best.L);
      for (const L of picks) {
        if (L == null) continue;
        const unlocks = arr.filter((a) => a.level <= L).sort((a, b) => a.level - b.level);
        const xp = Math.max(0, xpFor(L) - curXp);
        const nq = unlocks.filter((u) => u.type === 'quest').length;
        const nm = unlocks.filter((u) => u.type === 'money').length;
        const score = (nq * 1 + nm * 0.8) / Math.pow(Math.max(xp, 500), 0.55);
        radar.push({ skill, cur, to: L, xp, unlocks, nq, nm, score });
      }
    }
    radar.sort((a, b) => b.score - a.score);
    return { open, doable, near, methods, radar };
}

export function useIntel({ withMoney = true } = {}) {
  const { game, cfg, levels, questMap, player } = useApp();
  const list = useAsync(() => questList(game), [game]);
  const titles = useMemo(() => (list.data || []).map((q) => q.title), [list.data]);
  const route = useAsync(() => optimalRoute(game, titles), [game, titles.length], { enabled: titles.length > 0 });
  const reqs = useAsync(() => questReqIndex(game, titles, route.data || []), [game, titles.length, route.data?.length ?? -1], { enabled: titles.length > 0 && !route.loading });
  const money = useAsync(() => loadMethods(game, cfg), [game], { enabled: withMoney });
  const J = useJudgedMethods(game, money.data?.methods, levels, questMap, { limit: 30 });
  const skillsXp = useMemo(() => Object.fromEntries((player.data?.skills || []).map((s) => [s.name, s.xp])), [player.data]);
  const hasLevels = Object.keys(levels).length > 0;

  const computed = useMemo(() => (list.data && reqs.data ? computeIntel({ list: list.data, reqs: reqs.data, route: route.data, titles, questMap, levels, judged: J.judged, skillsXp }) : null),
    [list.data, reqs.data, route.data, titles, questMap, levels, J.judged, skillsXp]);

  return {
    loading: list.loading || route.loading || reqs.loading,
    error: list.error || reqs.error,
    reqSource: reqs.data?.source,
    hasLevels,
    route: route.data,
    list: list.data,
    ...(computed || { open: [], doable: [], near: [], methods: [], radar: [] }),
    ready: !!computed,
    moneyLoading: money.loading,
  };
}
