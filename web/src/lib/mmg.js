// Money making guide: details per methode (vereist / aanbevolen / quests) van de subpagina's.
import { useMemo } from 'react';
import { useAsync } from './api.js';
import { parsePage, toDoc, questStatus, parseSkillText } from './wiki.js';
import { GAMES } from './games.js';
import { osrsCombat, rs3Combat } from './xp.js';

// ---------- gestructureerde wiki-eisen (RS3: <span class="mmg-req mmg-skill" data-mmg-skill data-mmg-level data-mmg-imp>) ----------
const SPECIAL = { combat: 'Combat', melee: 'Melee' };
const impKind = (v) => (v === 'recommended' ? 'rec' : v === 'optional' ? 'opt' : 'req');

// Parseert alle .mmg-req binnen el. "Of"-groepen (.mmg-req-or) worden één eis met alternatieven.
export function parseMmgReqs(el, skillNames) {
  const out = { req: [], rec: [], reqQuests: [], recQuests: [], found: false };
  if (!el) return out;
  const norm = (n) => SPECIAL[String(n).toLowerCase()] || skillNames.find((s) => s.toLowerCase() === String(n).toLowerCase()) || null;
  const push = (kind, s) => { if (kind === 'req') out.req.push(s); else if (kind === 'rec') out.rec.push(s); };
  for (const or of el.querySelectorAll('.mmg-req-or')) {
    if (or.parentElement?.closest('.mmg-req-or')) continue;
    const kind = impKind(or.getAttribute('data-mmg-imp'));
    const alts = [...or.querySelectorAll('.mmg-skill')].map((e) => ({ skill: norm(e.getAttribute('data-mmg-skill')), level: +e.getAttribute('data-mmg-level') })).filter((a) => a.skill && a.level > 0);
    if (!alts.length) continue;
    out.found = true;
    const level = Math.min(...alts.map((a) => a.level));
    push(kind, { skill: alts.map((a) => a.skill).join(' / '), level, alts });
  }
  for (const e of el.querySelectorAll('.mmg-skill')) {
    if (e.closest('.mmg-req-or')) continue;
    const skill = norm(e.getAttribute('data-mmg-skill'));
    const level = +e.getAttribute('data-mmg-level');
    if (!skill || !(level > 0)) continue;
    out.found = true;
    push(impKind(e.getAttribute('data-mmg-imp')), { skill, level });
  }
  for (const e of el.querySelectorAll('.mmg-quest')) {
    const t = e.getAttribute('data-mmg-quest');
    if (!t) continue;
    out.found = true;
    if (e.closest('.mmg-req-or')) continue; // "quest A of quest B": niet blokkerend
    const k = impKind(e.getAttribute('data-mmg-imp'));
    if (k === 'req') out.reqQuests.push(t); else if (k === 'rec') out.recQuests.push(t);
  }
  out.req = mergeSkills([], out.req);
  out.rec = mergeSkills([], out.rec);
  out.reqQuests = [...new Set(out.reqQuests)];
  out.recQuests = [...new Set(out.recQuests)];
  return out;
}

// Level van de speler voor een eis, ook voor "of"-groepen, Combat en Melee
export function lvOf(levels, s) {
  const g = (k) => levels?.[k] ?? 1;
  if (s.alts) return Math.max(...s.alts.map((a) => lvOf(levels, a)));
  if (s.skill === 'Combat') return levels?.Necromancy != null || levels?.Constitution != null ? rs3Combat(levels) : osrsCombat(levels);
  if (s.skill === 'Melee') return Math.max(g('Attack'), g('Strength'));
  return g(s.skill);
}
export const meets = (levels, s) => {
  if (!s.alts) return lvOf(levels, s) >= s.level;
  return s.alts.some((a) => lvOf(levels, a) >= a.level);
};

export async function pool(items, n, fn, onProgress) {
  const out = [];
  let i = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k]); } catch { out[k] = null; }
      onProgress?.(++done, items.length);
    }
  }));
  return out;
}

const mergeSkills = (a, b) => {
  const m = new Map();
  for (const s of [...a, ...b]) { const p = m.get(s.skill); if (!p || p.level < s.level) m.set(s.skill, { ...s }); }
  return [...m.values()];
};

// Leest de requirements van een "Money making guide/..."-pagina.
// Echte opmaak (OSRS-wiki): rijen "Skills", "Items", "Quest", "Other" onder "Requirements";
// aanbevolen levels staan per regel gemarkeerd met "recommended".
export function parseMethodPage(game, html) {
  const cfg = GAMES[game];
  const root = toDoc(game, html);
  const st = parseMmgReqs(root, cfg.skills);
  if (st.found) return { reqSkills: st.req, recSkills: st.rec, reqQuests: st.reqQuests, found: true, variants: [], structured: true };
  const out = { reqSkills: [], recSkills: [], reqQuests: [], found: false, variants: [] };
  const rows = [];
  // Navigatiebalken onderaan (met o.a. een rij "Quest" vol bosses) nooit als eisen lezen
  const isNav = (el) => !!el.closest('.navbox, .navbox-subgroup, .navigation-not-searchable');
  const tables = [...root.querySelectorAll('table')].filter((t) => !isNav(t));
  const main = tables.find((t) => t.classList.contains('mmg-table')) || tables.find((t) => /^\s*requirements/i.test(t.rows[0]?.textContent || ''));
  for (const t of main ? [main] : tables.slice(0, 3)) {
    let label = null;
    for (const tr of t.querySelectorAll('tr')) {
      if (tr.closest('table') !== t) continue;
      const cells = [...tr.children];
      // Echte opmaak: label in een eigen <th>-rij, inhoud in de <td>-rij eronder
      if (cells.length === 1 && cells[0].tagName === 'TH') { label = cells[0].textContent.trim().toLowerCase(); continue; }
      if (cells.length === 1 && cells[0].tagName === 'TD' && label) { rows.push({ label, el: cells[0] }); label = null; continue; }
      // Oudere opmaak: label en inhoud in dezelfde rij
      if (cells.length >= 2 && cells[0].tagName === 'TH') rows.push({ label: cells[0].textContent.trim().toLowerCase(), el: cells[cells.length - 1] });
      label = null;
    }
  }
  if (main) out.found = true;
  for (const r of rows) {
    if (/^skills?\b|^levels?\b/.test(r.label)) {
      const s = parseSkillText(r.el, cfg.skills);
      if (s.length) out.found = true;
      out.reqSkills = mergeSkills(out.reqSkills, s.filter((x) => x.kind === 'req'));
      out.recSkills = mergeSkills(out.recSkills, s.filter((x) => x.kind === 'rec'));
    } else if (/^quests?\b/.test(r.label)) {
      const qs = [...r.el.querySelectorAll('a[data-title]')].map((a) => a.getAttribute('data-title')).filter((t) => !/^(none|n\/a)$/i.test(t) && !/^Money making guide/i.test(t));
      out.reqQuests.push(...qs);
      out.found = true;
    } else if (/^other\b/.test(r.label)) {
      // "Construction 82+ for an Ornate rejuvenation pool": nuttig, niet verplicht
      const s = parseSkillText(r.el, cfg.skills).map((x) => ({ ...x, kind: 'rec' }));
      out.recSkills = mergeSkills(out.recSkills, s);
    }
  }
  // Doorverwijspagina (bv. Vorkath met blowpipe/lance-varianten)
  if (!out.found) {
    out.variants = [...root.querySelectorAll('li a[data-title]')].filter((a) => !isNav(a)).map((a) => a.getAttribute('data-title')).filter((t) => /^Money making guide\//i.test(t)).slice(0, 4);
  }
  out.reqQuests = [...new Set(out.reqQuests)];
  return out;
}

export async function methodDetails(game, title) {
  const p = await parsePage(game, title);
  const d = parseMethodPage(game, p.text);
  if (d.found || !d.variants.length) return d;
  // Bij varianten: neem de variant met de laagste eisen (die past het best bij een groeiend account)
  const vs = (await Promise.all(d.variants.map((t) => parsePage(game, t).then((x) => ({ t, d: parseMethodPage(game, x.text) })).catch(() => null)))).filter((x) => x?.d.found);
  if (!vs.length) return d;
  const cost = (x) => [...x.d.reqSkills, ...x.d.recSkills].reduce((a, s) => a + s.level, 0);
  vs.sort((a, b) => cost(a) - cost(b));
  return { ...vs[0].d, variant: vs[0].t };
}

export const FAR_SKILL = 10; // max levels onder aanbevolen per skill
export const FAR_TOTAL = 20; // max levels onder aanbevolen in totaal

// Oordeel per methode. Conservatief: wat vereist is maar ontbreekt = locked.
export function judgeMethod(m, det, levels, questMap) {
  // Gestructureerde hoofdtabel (RS3) is al volledig: de subpagina voegt dan niets toe
  if (m.structured) det = { found: true, reqSkills: [], recSkills: [], reqQuests: [] };
  const req = mergeSkills(m.skills || [], det?.reqSkills || []);
  const gap = (s) => (s.alts ? Math.min(...s.alts.map((a) => Math.max(0, a.level - lvOf(levels, a)))) : Math.max(0, s.level - lvOf(levels, s)));
  const missReq = req.filter((s) => !meets(levels, s)).map((s) => ({ ...s, cur: lvOf(levels, s) }));
  const reqQ = [...new Set([...(m.reqQuests || []), ...(det?.reqQuests || [])])];
  const missQuests = reqQ.filter((t) => questStatus(questMap, t) !== 'done');
  const reqNames = new Set(req.map((s) => s.skill));
  const recAll = mergeSkills(m.recSkills || [], det?.recSkills || []);
  const missRec = recAll.filter((s) => !meets(levels, s) && !missReq.some((x) => x.skill === s.skill)).map((s) => ({ ...s, cur: lvOf(levels, s), gap: gap(s) }));
  const recGap = missRec.reduce((a, s) => a + s.gap, 0);
  const recQuests = m.recQuests || [];
  const missRecQuests = recQuests.filter((t) => questStatus(questMap, t) !== 'done');
  // Ook zonder subpagina weten we via de hoofdtabel vaak al vereist + aanbevolen
  const known = det?.found || m.structured || (m.skills || []).length + (m.recSkills || []).length > 0;
  let status = 'unverified';
  if (missReq.length || missQuests.length) status = 'locked';
  // "Kan ik" alleen als je dicht bij aanbevolen zit; ver eronder = in de praktijk niet doenlijk
  else if (missRec.some((s) => s.gap > FAR_SKILL) || recGap > FAR_TOTAL) status = 'far';
  else if (missRec.length || missRecQuests.length) status = 'stretch';
  else if (known) status = 'ok';
  return { ...m, req, rec: recAll, variant: det?.variant, reqQuests: reqQ, recQuests, missRecQuests, missReq, missQuests, missRec, recGap, status, verified: !!det?.found, reqNames, known };
}

export function useJudgedMethods(game, methods, levels, questMap, { limit = 50 } = {}) {
  // Alleen subpagina's checken van methodes die volgens de hoofdtabel nog haalbaar zijn;
  // wat daar al locked of ver onder aanbevolen is, hoeft niet verder gecontroleerd te worden.
  const lvKey = Object.entries(levels || {}).map(([k, v]) => k + v).join(',');
  const candidates = useMemo(() => [...new Set((methods || [])
    .filter((m) => m.title && m.profit > 0 && !m.structured)
    .filter((m) => { const st = judgeMethod(m, null, levels, questMap).status; return st !== 'locked' && st !== 'far'; })
    .sort((a, b) => b.profit - a.profit)
    .map((m) => m.title))].slice(0, limit), [methods, limit, lvKey, questMap]);
  const det = useAsync(async () => {
    const res = await pool(candidates, 4, (t) => methodDetails(game, t));
    return Object.fromEntries(candidates.map((t, i) => [t, res[i]]));
  }, [game, candidates.join('|')], { enabled: candidates.length > 0 });
  const judged = useMemo(() => (methods || []).map((m) => judgeMethod(m, det.data?.[m.title], levels, questMap)), [methods, det.data, levels, questMap]);
  const structured = (methods || []).filter((m) => m.structured).length;
  return { judged, loading: candidates.length > 0 && det.loading, checked: structured + (det.data ? Object.values(det.data).filter((d) => d?.found).length : 0), total: structured + candidates.length };
}
