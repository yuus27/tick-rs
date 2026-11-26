import DOMPurify from 'dompurify';
import { wikiApi } from './api.js';
import { GAMES } from './games.js';
import { normTitle } from './format.js';
import { mapHref } from './map.js';

// ---------- API ----------
export async function parsePage(game, title, extra = {}) {
  const r = await wikiApi(game, {
    action: 'parse', page: title, prop: 'text|sections|displaytitle', redirects: '1',
    disableeditsection: '1', disabletoc: '1', ...extra,
  }, 30 * 60_000);
  if (r?.error) throw new Error(r.error.info || 'Pagina niet gevonden');
  return r.parse;
}

// Geeft de eerste titel uit de lijst die echt bestaat (volgt redirects).
export async function resolveTitle(game, candidates) {
  const list = candidates.filter(Boolean).slice(0, 40);
  if (!list.length) return null;
  const r = await wikiApi(game, { action: 'query', titles: list.join('|'), redirects: '1' });
  const q = r?.query || {};
  const norm = Object.fromEntries((q.normalized || []).map((n) => [n.from, n.to]));
  const redir = Object.fromEntries((q.redirects || []).map((n) => [n.from, { to: n.to, frag: n.tofragment }]));
  const exists = new Set((q.pages || []).filter((p) => !p.missing && !p.invalid).map((p) => p.title));
  for (const c of list) {
    let t = norm[c] || c;
    let frag = null;
    if (redir[t]) { frag = redir[t].frag || null; t = redir[t].to; }
    if (exists.has(t)) return { title: t, fragment: frag, requested: c };
  }
  return null;
}

export async function searchWiki(game, q, limit = 8) {
  const r = await wikiApi(game, { action: 'opensearch', search: q, limit: String(limit), namespace: '0' }, 5 * 60_000);
  const titles = r?.[1] || [];
  return titles.map((t) => ({ title: t }));
}

export async function fullSearch(game, q, limit = 20) {
  const r = await wikiApi(game, { action: 'query', list: 'search', srsearch: q, srlimit: String(limit) }, 5 * 60_000);
  return (r?.query?.search || []).map((s) => ({ title: s.title, snippet: stripTags(s.snippet), size: s.size }));
}

export async function recentUpdates(game, limit = 6) {
  try {
    const r = await wikiApi(game, { action: 'query', list: 'search', srsearch: 'prefix:Update:', srsort: 'create_timestamp_desc', srlimit: String(limit), srnamespace: '*' }, 30 * 60_000);
    return (r?.query?.search || []).map((s) => ({ title: s.title, date: s.timestamp }));
  } catch {
    return [];
  }
}

export const stripTags = (s = '') => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'");

// ---------- HTML opschonen ----------
const DROP = ['.mw-editsection', '#toc', '.toc', '.noprint.navigation-not-searchable', '.mw-empty-elt', 'audio', 'video', '.reference-tooltip', '.rs-calc-placeholder', '.jcConfig', '.mw-references-wrap .mw-cite-backlink',
  // verborgen wiki-data (bucket/SMW-rijen, league-vlaggen, alch-kolommen) die de wiki zelf met CSS verbergt
  '.advanced-data', '.leagues-global-flag', '.rs-external-header-links', '.alch-column', '.navbox-group-title-hidden'];

export function toDoc(game, html) {
  const clean = DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-skill', 'data-level', 'data-src', 'data-sort-value', 'colspan', 'rowspan', 'srcset'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'object', 'embed'],
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: true,
  });
  const doc = new DOMParser().parseFromString(`<div id="w">${clean}</div>`, 'text/html');
  const root = doc.getElementById('w');
  const base = GAMES[game].wikiBase;
  root.querySelectorAll(DROP.join(',')).forEach((n) => n.remove());

  root.querySelectorAll('img').forEach((img) => {
    const ds = img.getAttribute('data-src');
    if (ds) img.setAttribute('src', ds);
    const src = img.getAttribute('src') || '';
    if (src.startsWith('/')) img.setAttribute('src', base + src);
    const ss = img.getAttribute('srcset');
    if (ss) img.setAttribute('srcset', ss.replace(/(^|,\s*)\/(?!\/)/g, `$1${base}/`));
    img.setAttribute('loading', 'lazy');
    img.setAttribute('referrerpolicy', 'no-referrer');
  });

  root.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href');
    let m;
    if (h.startsWith('#')) {
      a.setAttribute('data-anchor', decodeURIComponent(h.slice(1)));
      a.setAttribute('href', 'javascript:void(0)');
    } else if ((m = h.match(/^(?:https?:\/\/(?:oldschool\.)?runescape\.wiki)?\/w\/([^#?]+)(?:#(.*))?$/))) {
      const sameWiki = !h.startsWith('http') || h.startsWith(base);
      const title = decodeURIComponent(m[1]).replace(/_/g, ' ');
      if (sameWiki && !/^(File|Special|Template|Category|User|RuneScape|Exchange|Calculator|Module|MediaWiki|Help|Talk):/i.test(title)) {
        a.setAttribute('href', `#/wiki/${encodeURIComponent(title)}${m[2] ? '?a=' + encodeURIComponent(m[2]) : ''}`);
        a.setAttribute('data-title', title);
      } else {
        a.setAttribute('href', (h.startsWith('http') ? h : base + h));
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    } else if (h.startsWith('/')) {
      a.setAttribute('href', base + h);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    } else if (/^https?:/.test(h)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  // "Show on map"-links en kaartjes van de wiki openen de ingebouwde kaart
  root.querySelectorAll('a.mw-kartographer-maplink, a.mw-kartographer-map, .mw-kartographer-map').forEach((a) => {
    const x = Number(a.getAttribute('data-lon')), y = Number(a.getAttribute('data-lat'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const ctx = (a.closest('td, li, p, dd') || a.parentElement)?.textContent.replace(/show on map/gi, '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const url = mapHref({ x, y, plane: Number(a.getAttribute('data-plane')) || 0, mapId: Number(a.getAttribute('data-mapid') ?? -1), zoom: a.getAttribute('data-zoom'), label: ctx || undefined });
    if (a.classList.contains('mw-kartographer-maplink')) {
      a.setAttribute('href', url);
      a.classList.add('tk-maplink');
    } else {
      const card = doc.createElement('a');
      card.className = 'tk-mapcard';
      card.setAttribute('href', url);
      card.innerHTML = '<span>Kaart</span><b>' + x + ', ' + y + '</b>';
      a.replaceWith(card);
    }
  });

  root.querySelectorAll('table').forEach((t) => {
    if (t.parentElement?.classList.contains('tbl')) return;
    const wrap = doc.createElement('div');
    wrap.className = 'tbl';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });
  root.querySelectorAll('.mw-collapsible, .collapsible').forEach((n) => n.classList.remove('mw-collapsed', 'collapsed'));
  return root;
}

// ---------- skills uit een cel halen ----------
export function extractSkills(el, skillNames) {
  const found = new Map();
  const add = (skill, level, boost) => {
    const s = skillNames.find((n) => n.toLowerCase() === String(skill).toLowerCase());
    const l = Number(level);
    if (!s || !l || l > 120) return;
    const prev = found.get(s);
    if (!prev || prev.level < l) found.set(s, { skill: s, level: l, boostable: !!boost || prev?.boostable });
  };
  const boostNear = (node) => /boost/i.test((node.closest('li') || node.parentElement || node).textContent || '');

  el.querySelectorAll('[data-skill][data-level]').forEach((n) => add(n.getAttribute('data-skill'), n.getAttribute('data-level'), boostNear(n)));

  // icoon/link gevolgd door een getal: <a title="Cooking"><img alt="Cooking icon"></a> 70
  el.querySelectorAll('a[title], img[alt]').forEach((n) => {
    const label = (n.getAttribute('title') || n.getAttribute('alt') || '').replace(/[-_ ]?icon(\.png)?$/i, '').replace(/\.png$/i, '').trim();
    if (!skillNames.some((s) => s.toLowerCase() === label.toLowerCase())) return;
    let holder = n.tagName === 'IMG' && n.parentElement?.tagName === 'A' ? n.parentElement : n;
    // Afbeelding verpakt in <span typeof="mw:File"><a><img></a></span> 70: klim naar de buitenste verpakking
    for (let i = 0; i < 2 && !holder.nextSibling && holder.parentElement && holder.parentElement !== el && /^(SPAN|A)$/.test(holder.parentElement.tagName); i++) holder = holder.parentElement;
    let txt = '';
    let sib = holder.nextSibling;
    for (let i = 0; i < 3 && sib; i++, sib = sib.nextSibling) { txt += sib.textContent || ''; if (/\d/.test(txt)) break; }
    const m = txt.match(/^\s*(\d{1,3})\b/);
    if (m) add(label, m[1], boostNear(holder));
    else {
      let prevT = '';
      let p = holder.previousSibling;
      for (let i = 0; i < 2 && p; i++, p = p.previousSibling) prevT = (p.textContent || '') + prevT;
      const m2 = prevT.match(/(\d{1,3})\s*$/);
      if (m2) add(label, m2[1], boostNear(holder));
    }
  });

  // tekst-fallback: "70 Cooking" of "Cooking 70" / "level 70 Cooking"
  const text = el.textContent || '';
  for (const s of skillNames) {
    const re1 = new RegExp(`(\\d{1,3})\\s+(?:\\[\\w+\\]\\s*)?${s}\\b`, 'gi');
    const re2 = new RegExp(`\\b${s}(?: level)?\\s*[:(]?\\s*(\\d{1,3})\\b`, 'gi');
    let m;
    while ((m = re1.exec(text))) add(s, m[1], /boost/i.test(text.slice(m.index, m.index + 60)));
    while ((m = re2.exec(text))) add(s, m[1], /boost/i.test(text.slice(m.index, m.index + 60)));
    const re3 = new RegExp(`\\b${s}\\s+(?:up\\s+)?to\\s+(?:level\\s+)?(\\d{1,3})\\b`, 'gi');
    while ((m = re3.exec(text))) add(s, m[1], false);
  }
  return [...found.values()].sort((a, b) => b.level - a.level);
}

// ---------- quest details ----------
// RS3 zet extra eisen voor ironmen in een ingeklapt blok; die gelden niet voor een normaal account
function withoutIronman(el) {
  const c = el.cloneNode(true);
  c.querySelectorAll('table').forEach((t) => { if (/ironm[ae]n/i.test(t.querySelector('th')?.textContent || '')) t.remove(); });
  return c;
}

export function extractQuestDetails(root, skillNames) {
  const tables = [...root.querySelectorAll('table')];
  const t = tables.find((x) => x.classList.contains('questdetails')) || tables.find((x) => [...x.querySelectorAll('tr')].some((tr) => /^\s*requirements\s*$/i.test(tr.firstElementChild?.textContent || '')));
  if (!t) return null;
  const rows = {};
  t.querySelectorAll('tr').forEach((tr) => {
    const cells = [...tr.children];
    if (cells.length < 2) return;
    const label = cells[0].textContent.trim().replace(/\s+/g, ' ');
    if (!label) return;
    rows[label.toLowerCase()] = cells[1];
  });
  const pick = (...keys) => keys.map((k) => Object.entries(rows).find(([l]) => l.startsWith(k))?.[1]).find(Boolean) || null;
  const req = pick('requirements');
  const out = {
    start: pick('start point', 'start'),
    difficulty: pick('official difficulty', 'difficulty'),
    length: pick('official length', 'length'),
    description: pick('description'),
    requirements: req,
    items: pick('items required', 'items'),
    recommended: pick('recommended'),
    enemies: pick('enemies to defeat', 'enemies'),
    skills: req ? extractSkills(withoutIronman(req), skillNames) : [],
    questPoints: null,
    questLinks: [],
  };
  if (req) {
    const qp = (req.textContent || '').match(/(\d{1,3})\s*quest points?/i) || (req.textContent || '').match(/quest points?\D{0,12}(\d{1,3})/i);
    if (qp) out.questPoints = Number(qp[1]);
    out.questLinks = [...req.querySelectorAll('a[data-title]')].map((a) => a.getAttribute('data-title'));
    const c = (req.textContent || '').match(/combat level\D{0,6}(\d{1,3})/i);
    if (c) out.combat = Number(c[1]);
  }
  t.closest('.tbl')?.remove() || t.remove();
  return out;
}

// ---------- tabellen generiek ----------
export function readTables(root, { headerMatch } = {}) {
  const res = [];
  let heading = '';
  const walker = root.querySelectorAll('h2, h3, h4, table');
  walker.forEach((node) => {
    if (/^H\d$/.test(node.tagName)) { heading = node.textContent.trim(); return; }
    const trs = [...node.querySelectorAll('tr')];
    if (!trs.length) return;
    // Kop zonder tekst (alleen een icoon, bv. de QP-kolom op de OSRS-questlijst): neem alt/title/data-skill
    const head = [...trs[0].children].map((c) => (c.textContent.trim() || c.querySelector('[data-skill]')?.getAttribute('data-skill') || c.querySelector('img[alt]')?.getAttribute('alt') || c.querySelector('a[title]')?.getAttribute('title') || '').trim().toLowerCase());
    if (headerMatch && !head.some((h) => headerMatch.test(h))) return;
    res.push({ heading, head, rows: trs.slice(1).map((tr) => [...tr.children]).filter((cells) => cells.length >= 2) });
  });
  return res;
}

// Jouw quest points: som van de QP van voltooide quests uit de questlijst
export function myQuestPoints(list, questMap) {
  return (list || []).filter((q) => questStatus(questMap, q.title) === 'done').reduce((a, q) => a + (q.qp || 0), 0);
}

// ---------- questlijst ----------
export async function questList(game) {
  const cfg = GAMES[game];
  const hit = await resolveTitle(game, cfg.pages.questList);
  if (!hit) return [];
  const p = await parsePage(game, hit.title);
  const root = toDoc(game, p.text);
  const tables = readTables(root);
  const seen = new Map();
  for (const t of tables) {
    const idx = (re) => t.head.findIndex((h) => re.test(h));
    let ni = idx(/^(name|quest)/);
    if (ni < 0) ni = t.head.findIndex((h) => /quest|name/.test(h));
    if (ni < 0) continue;
    const di = idx(/difficulty/);
    const li = idx(/length/);
    const qi = idx(/^qp|quest points/);
    const si = idx(/series/);
    const members = /member|pay-to-play|p2p/i.test(t.heading) ? true : /free/i.test(t.heading) ? false : null;
    for (const cells of t.rows) {
      const cell = cells[ni];
      const a = cell?.querySelector('a[data-title]');
      if (!a) continue;
      const title = a.getAttribute('data-title');
      if (seen.has(title) || /\/Quick guide$/i.test(title)) continue;
      // RS3: per rij een icoon-link naar "Members" of "Free-to-play"
      const rowLinks = cells.flatMap((c) => [...c.querySelectorAll('a[data-title], a[title]')].map((x) => x.getAttribute('data-title') || x.getAttribute('title')));
      const rowMembers = rowLinks.includes('Members') ? true : rowLinks.some((x) => /^Free-to-play$/i.test(x || '')) ? false : null;
      seen.set(title, {
        title,
        name: a.textContent.trim() || title,
        difficulty: di >= 0 ? cells[di]?.textContent.trim() : '',
        length: li >= 0 ? cells[li]?.textContent.trim() : '',
        qp: qi >= 0 ? Number((cells[qi]?.textContent.match(/\d+/) || [0])[0]) : null,
        series: si >= 0 ? cells[si]?.textContent.trim() : '',
        members: rowMembers ?? members,
      });
    }
  }
  return [...seen.values()];
}

export async function optimalRoute(game, known) {
  const cfg = GAMES[game];
  const hit = await resolveTitle(game, cfg.pages.optimal);
  if (!hit) return [];
  const p = await parsePage(game, hit.title);
  const root = toDoc(game, p.text);
  const knownSet = new Set(known.map((k) => normTitle(k)));
  const out = [];
  const seen = new Set();
  // De route staat in de grote tabel ("Quest/Activity"). Lijstjes erboven (bv. "Notable quest unlocks")
  // noemen ook quests, maar niet in route-volgorde: die negeren we als er een route-tabel is.
  const routeTables = [...root.querySelectorAll('table')].filter((t) => {
    const head = (t.rows[0]?.textContent || '').toLowerCase();
    return /quest/.test(head) && t.rows.length > 20;
  });
  const scope = routeTables.length ? routeTables : [root];
  scope.flatMap((el) => [...el.querySelectorAll('a[data-title]')]).forEach((a) => {
    const t = a.getAttribute('data-title');
    const n = normTitle(t);
    const parent = normTitle(t.split('/')[0]);
    if ((knownSet.has(n) || knownSet.has(parent)) && !seen.has(n) && !/quick guide/i.test(t)) {
      seen.add(n);
      out.push(t);
    }
  });
  return out;
}

export function questStatus(playerQuests, title) {
  if (!playerQuests) return null;
  if (playerQuests[title]) return playerQuests[title];
  const n = normTitle(title.replace('/', ' - '));
  const n2 = normTitle(title);
  for (const [k, v] of Object.entries(playerQuests)) {
    const nk = normTitle(k);
    if (nk === n || nk === n2) return v;
  }
  return null;
}

// ---------- skills met vereist/aanbevolen uit een cel ----------
// Herkent wiki-notatie zoals "Attack 90+, Strength 95, Defence 80+ recommended; Magic 94+ recommended; Prayer 77+".
// "recommended"/"optional" geldt voor de hele groep tot de vorige ";" of regel.
export function parseSkillText(el, skillNames) {
  if (!el) return [];
  const doc = el.ownerDocument;
  const c = el.cloneNode(true);
  const marks = [];
  const mark = (skill, level) => { marks.push({ skill, level }); return doc.createTextNode(` ⟦${marks.length - 1}⟧ `); };
  const find = (name) => skillNames.find((s) => s.toLowerCase() === String(name || '').toLowerCase().replace(/[-_ ]?icon(\.png)?$/i, '').replace(/\.png$/i, '').trim());
  c.querySelectorAll('li').forEach((li) => li.appendChild(doc.createTextNode(' ; ')));
  c.querySelectorAll('br').forEach((br) => br.replaceWith(doc.createTextNode(' ; ')));
  c.querySelectorAll('[data-skill]').forEach((n) => {
    const s = find(n.getAttribute('data-skill'));
    if (!s) return;
    const lv = ((n.getAttribute('data-level') || '').match(/\d{1,3}/) || (n.textContent || '').match(/\d{1,3}/) || [])[0];
    n.replaceWith(mark(s, lv ? +lv : null));
  });
  c.querySelectorAll('a[title], img[alt]').forEach((n) => {
    if (!n.isConnected) return;
    const s = find(n.getAttribute('title') || n.getAttribute('alt'));
    if (!s) return;
    const holder = n.tagName === 'IMG' && n.parentElement?.tagName === 'A' && find(n.parentElement.getAttribute('title')) ? n.parentElement : n;
    holder.replaceWith(mark(s, null));
  });
  let text = c.textContent.replace(/\s+/g, ' ');
  // platte tekst zonder icoon, bv. "70 Cooking" of "Cooking 70"
  for (const s of skillNames) {
    text = text.replace(new RegExp(`(\\d{1,3})\\+?\\s+${s}\\b`, 'g'), (m0, l) => { marks.push({ skill: s, level: +l }); return ` ⟦${marks.length - 1}⟧ `; });
    text = text.replace(new RegExp(`\\b${s}\\b(?![^\\u27E6]*\\u27E7)`, 'g'), () => { marks.push({ skill: s, level: null }); return ` ⟦${marks.length - 1}⟧ `; });
  }
  const out = [];
  for (const group of text.split(';')) {
    const kind = /\(required\)/i.test(group) ? 'req' : /recommend|optional|\baanbevolen\b/i.test(group) ? 'rec' : 'req';
    const re = /⟦(\d+)⟧\s*(\d{1,3})?\+?/g;
    const found = [];
    let m;
    while ((m = re.exec(group))) {
      const mk = marks[+m[1]];
      found.push({ skill: mk.skill, level: mk.level ?? (m[2] ? +m[2] : null), boostable: /boost/i.test(group) });
    }
    // skills zonder getal erven het level van de buur in dezelfde groep ("Attack 90+, Strength, Hitpoints")
    for (let i = 0; i < found.length; i++) {
      if (found[i].level == null) {
        const prev = [...found.slice(0, i)].reverse().find((f) => f.level != null);
        const next = found.slice(i + 1).find((f) => f.level != null);
        found[i].level = (prev || next)?.level ?? null;
      }
    }
    for (const f of found) if (f.level && f.level <= 120) out.push({ ...f, kind });
  }
  // samenvoegen per skill+soort (hoogste level)
  const merged = new Map();
  for (const f of out) {
    const k = f.skill + ':' + f.kind;
    const p = merged.get(k);
    if (!p || p.level < f.level) merged.set(k, f);
  }
  return [...merged.values()];
}
