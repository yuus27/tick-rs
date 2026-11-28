// tick. — lokale server
// - Bindt alleen op 127.0.0.1 (niet bereikbaar vanaf je netwerk)
// - Proxy't uitsluitend naar vaste, allowlisted bronnen (geen open proxy)
// - Zet een nette User-Agent zoals de RuneScape Wiki vraagt
// - Cachet antwoorden in het geheugen en bewaart jouw data in ./data/*.json

import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fss from 'node:fs';
import { setupMcp } from './mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// In de desktop-app komt je data in de gebruikersmap van Windows (TICK_DATA_DIR)
const DATA_DIR = process.env.TICK_DATA_DIR || path.join(ROOT, 'data');
const DIST_DIR = path.join(ROOT, 'web', 'dist');
const DEV = process.argv.includes('--dev');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 5177;

// Pas dit aan met je eigen Discord-naam als je wilt; de wiki waardeert contactinfo.
const USER_AGENT = process.env.TICK_UA || 'tick. (RSBuddy) - personal local OSRS/RS3 cockpit';

const GAMES = {
  osrs: {
    prices: 'https://prices.runescape.wiki/api/v1/osrs',
    wiki: 'https://oldschool.runescape.wiki/api.php',
  },
  rs3: {
    prices: 'https://prices.runescape.wiki/api/v2/rs',
    wiki: 'https://runescape.wiki/api.php',
  },
};

const RS3_SKILLS = ['Overall', 'Attack', 'Defence', 'Strength', 'Constitution', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecrafting', 'Hunter', 'Construction', 'Summoning', 'Dungeoneering', 'Divination', 'Invention', 'Archaeology', 'Necromancy'];

// ---------- cache ----------
const cache = new Map();
const inflight = new Map();
const MAX_CACHE = 900;

class UpstreamError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function fetchCached(url, ttlMs, kind = 'json') {
  const key = kind + ':' + url;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: kind === 'json' ? 'application/json' : 'text/plain' }, signal: ctrl.signal });
      if (!res.ok) throw new UpstreamError(res.status, `Bron gaf ${res.status}`);
      const data = kind === 'json' ? await res.json() : await res.text();
      if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(key, { exp: Date.now() + ttlMs, data });
      return data;
    } catch (e) {
      if (hit) return hit.data; // verlopen cache is beter dan niets
      if (e.name === 'AbortError') throw new UpstreamError(504, 'Time-out bij de bron');
      throw e instanceof UpstreamError ? e : new UpstreamError(502, 'Bron niet bereikbaar');
    } finally {
      clearTimeout(t);
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Alleen verzoeken van deze machine accepteren (extra laag naast de 127.0.0.1-binding)
app.use('/api', (req, res, next) => {
  const host = (req.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) return res.status(403).json({ error: 'forbidden' });
  next();
});

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  res.status(e.status && e.status >= 400 ? e.status : 500).json({ error: e.message || 'Onbekende fout' });
});

function gameOf(req) {
  const g = GAMES[req.params.game];
  if (!g) throw new UpstreamError(400, 'Onbekende game');
  return g;
}

// ---------- prijzen ----------
const PRICE_TTL = { latest: 60e3, mapping: 6 * 3600e3, '5m': 60e3, '1h': 300e3, timeseries: 300e3 };
app.get('/api/:game/prices/:ep', wrap(async (req, res) => {
  const g = gameOf(req);
  const ep = req.params.ep;
  if (!PRICE_TTL[ep]) throw new UpstreamError(400, 'Onbekend endpoint');
  const q = new URLSearchParams();
  const { id, timestep, lookback, timestamp } = req.query;
  if (id !== undefined) { if (!/^\d{1,7}$/.test(id)) throw new UpstreamError(400, 'id ongeldig'); q.set('id', id); }
  if (timestep !== undefined) { if (!['5m', '1h', '6h', '24h'].includes(timestep)) throw new UpstreamError(400, 'timestep ongeldig'); q.set('timestep', timestep); }
  if (lookback !== undefined) { if (!['6h', '24h', '7d', '30d', '6m', '1y'].includes(lookback)) throw new UpstreamError(400, 'lookback ongeldig'); q.set('lookback', lookback); }
  if (timestamp !== undefined) { if (!/^\d{1,11}$/.test(timestamp)) throw new UpstreamError(400, 'timestamp ongeldig'); q.set('timestamp', timestamp); }
  const qs = q.toString();
  // historische uur-snapshots veranderen niet meer: lang cachen
  const ttl = timestamp !== undefined ? 24 * 3600e3 : PRICE_TTL[ep];
  const data = await fetchCached(`${g.prices}/${ep}${qs ? '?' + qs : ''}`, ttl);
  res.set('Cache-Control', 'no-store').json(data);
}));

// ---------- wiki (MediaWiki API, alleen lezen) ----------
const WIKI_PARAMS = new Set(['action', 'page', 'pageid', 'prop', 'section', 'redirects', 'titles', 'list', 'search', 'srsearch', 'srlimit', 'srsort', 'srnamespace', 'srwhat', 'limit', 'namespace', 'disableeditsection', 'disabletoc', 'cmtitle', 'cmlimit', 'cmtype', 'cmsort', 'cmdir', 'rvprop', 'rvslots', 'exintro', 'explaintext', 'pithumbsize', 'piprop', 'useskin', 'mobileformat']);
const WIKI_ACTIONS = new Set(['parse', 'query', 'opensearch']);
app.get('/api/:game/wiki', wrap(async (req, res) => {
  const g = gameOf(req);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (!WIKI_PARAMS.has(k)) continue;
    if (typeof v !== 'string' || v.length > 600) throw new UpstreamError(400, 'Parameter ongeldig');
    q.set(k, v);
  }
  if (!WIKI_ACTIONS.has(q.get('action'))) throw new UpstreamError(400, 'Actie niet toegestaan');
  q.set('format', 'json');
  if (q.get('action') !== 'opensearch') q.set('formatversion', '2');
  const ttl = q.get('action') === 'parse' ? 30 * 60e3 : 10 * 60e3;
  const data = await fetchCached(`${g.wiki}?${q.toString()}`, ttl);
  res.json(data);
}));

// ---------- bucket-API (gestructureerde wiki-data), alleen vaste, server-side opgebouwde queries ----------
const BUCKETS = {
  osrs: {
    gear: {
      bucket: 'infobox_bonuses',
      fields: ['page_name', 'equipment_slot', 'stab_attack_bonus', 'slash_attack_bonus', 'crush_attack_bonus', 'range_attack_bonus', 'magic_attack_bonus',
        'stab_defence_bonus', 'slash_defence_bonus', 'crush_defence_bonus', 'range_defence_bonus', 'magic_defence_bonus',
        'strength_bonus', 'ranged_strength_bonus', 'magic_damage_bonus', 'prayer_bonus', 'weapon_attack_speed', 'combat_style'],
    },
    items: { bucket: 'infobox_item', fields: ['page_name', 'item_name', 'item_id', 'is_members_only', 'tradeable', 'buy_limit', 'high_alchemy_value', 'quest'] },
  },
  rs3: {
    gear: {
      bucket: 'infobox_bonuses',
      fields: ['page_name', 'equipment_slot', 'equipment_type', 'combat_class', 'equipment_tier', 'weapon_damage', 'weapon_accuracy', 'equipment_armour',
        'equipment_life_points', 'weapon_attack_speed', 'attack_style', 'prayer_bonus', 'strength_bonus', 'ranged_bonus', 'magic_bonus', 'necromancy_bonus'],
    },
    items: { bucket: 'infobox_item', fields: ['page_name', 'item_name', 'item_id', 'is_members_only', 'tradeable'] },
  },
};
app.get('/api/:game/bucket/:name', wrap(async (req, res) => {
  const g = gameOf(req);
  const def = BUCKETS[req.params.game]?.[req.params.name];
  if (!def) throw new UpstreamError(400, 'Onbekende dataset');
  const rows = [];
  for (let offset = 0; offset < 40000; offset += 5000) {
    const query = `bucket('${def.bucket}').select(${def.fields.map((f) => `'${f}'`).join(',')}).limit(5000).offset(${offset}).run()`;
    const data = await fetchCached(`${g.wiki}?action=bucket&format=json&query=${encodeURIComponent(query)}`, 24 * 3600e3);
    if (data?.error) throw new UpstreamError(502, 'Wiki-bucket: ' + (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)).slice(0, 120));
    const part = data?.bucket || [];
    rows.push(...part);
    if (part.length < 5000) break;
  }
  res.json({ rows, fields: def.fields });
}));

// ---------- kaart: actuele tegelversie + lijst met kaarten ----------
const MAPS = {
  osrs: { probe: 'Lumbridge', re: /maps\.runescape\.wiki\/osrs\/versions\/([^/]+)\//, base: 'https://maps.runescape.wiki/osrs/versions/' },
  rs3: { probe: 'Lumbridge', re: /maps\.runescape\.wiki\/rs\/versions\/([^/]+)\//, base: 'https://maps.runescape.wiki/rs/versions/' },
};
// basemaps.json (welke kaarten er zijn) ontbreekt soms in een nieuwe kaartversie (OSRS 2026-11-25_a),
// terwijl de tegels er wel zijn. Dan: laatst bekende lijst van schijf, of de vorige versie opzoeken.
// De lijst verandert zelden, dus een oudere werkt prima naast de nieuwe tegels.
const basemapMemo = new Map();
async function loadBasemaps(game, m, version) {
  try {
    const list = await fetchCached(`${m.base}${version}/basemaps.json`, 24 * 3600e3);
    saveBasemaps(game, version, list);
    return list;
  } catch (e) {
    const memo = basemapMemo.get(game);
    if (memo && memo.exp > Date.now()) return memo.list;
    let list = null;
    try { const disk = JSON.parse(await fs.readFile(path.join(DATA_DIR, `basemaps-${game}.json`), 'utf8')); list = disk.list; } catch { /* nog niets bewaard */ }
    if (!list) {
      const mm = String(version).match(/^(\d{4}-\d{2}-\d{2})([_-])([a-z])$/);
      if (mm) {
        const day = Date.parse(mm[1] + 'T00:00:00Z');
        for (let i = 0; i <= 60 && !list; i++) {
          const d = new Date(day - i * 864e5).toISOString().slice(0, 10);
          for (const suf of ['c', 'b', 'a']) {
            const v = `${d}${mm[2]}${suf}`;
            if (v === version) continue;
            try {
              const r = await fetch(`${m.base}${v}/basemaps.json`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
              if (r.ok) { list = await r.json(); saveBasemaps(game, v, list); break; }
            } catch { /* volgende */ }
          }
        }
      }
    }
    if (!list) throw e;
    basemapMemo.set(game, { list, exp: Date.now() + 24 * 3600e3 });
    return list;
  }
}
function saveBasemaps(game, version, list) {
  if (!Array.isArray(list) || !list.length) return;
  fs.mkdir(DATA_DIR, { recursive: true }).then(() => fs.writeFile(path.join(DATA_DIR, `basemaps-${game}.json`), JSON.stringify({ version, savedAt: Date.now(), list }))).catch(() => {});
}

app.get('/api/:game/map', wrap(async (req, res) => {
  const g = gameOf(req);
  const m = MAPS[req.params.game];
  const page = await fetchCached(`${g.wiki}?action=parse&format=json&formatversion=2&prop=text&page=${encodeURIComponent(m.probe)}`, 6 * 3600e3);
  const version = (page?.parse?.text || '').match(m.re)?.[1];
  if (!version) throw new UpstreamError(502, 'Kaartversie niet gevonden');
  const basemaps = await loadBasemaps(req.params.game, m, version);
  res.json({
    version,
    tiles: req.params.game === 'osrs' ? `${m.base}${version}/tiles/rendered/{mapId}/{z}/{p}_{x}_{y}.png` : `${m.base}${version}/map_squares/{mapId}/{z}/{p}_{x}_{y}.png`,
    iconTiles: req.params.game === 'rs3' ? `${m.base}${version}/map_icon_squares/{mapId}/{z}/{p}_{x}_{y}.png` : null,
    zoom: req.params.game === 'osrs' ? { min: -3, max: 3 } : { min: -2, max: 3 },
    basemaps: (Array.isArray(basemaps) ? basemaps : []).map((b) => ({ mapId: b.mapId, name: b.name, bounds: b.bounds, center: b.center })),
  });
}));

// ---------- quest-startpunten voor de kaart ----------
// Uit de wikitekst van elke quest: OSRS "|startmap = x,y[,plane]", RS3 "|start_path = {{Map|mapID=..|plane=..|x=..|y=..}}".
function parseQuestStart(wt) {
  let m = wt.match(/\|\s*startmap\s*=\s*([^\n|]+)/i);
  let pos = null;
  if (m) {
    const n = m[1].match(/-?\d+/g)?.map(Number) || [];
    if (n.length >= 2) pos = { x: n[0], y: n[1], plane: n[2] ?? 0, mapId: -1 };
  }
  if (!pos) {
    m = wt.match(/\|\s*start_path\s*=\s*\{\{\s*Map(?:link)?\s*\|([^}]*)\}\}/i) || wt.match(/\|\s*start\s*=[^\n]*?\{\{\s*Map(?:link)?\s*\|([^}]*)\}\}/i);
    if (m) {
      const kv = Object.fromEntries([...m[1].matchAll(/(\w+)\s*=\s*(-?\d+)/g)].map((a) => [a[1].toLowerCase(), +a[2]]));
      if (kv.x != null && kv.y != null) pos = { x: kv.x, y: kv.y, plane: kv.plane ?? 0, mapId: kv.mapid ?? -1 };
    }
  }
  if (!pos) return null;
  const st = (wt.match(/\|\s*start\s*=\s*([^\n]*)/i)?.[1] || '')
    .replace(/\{\{\s*FloorNumber\s*\|\s*(\d+)[^}]*\}\}/gi, 'verdieping $1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}|<[^>]+>/g, '')
    .trim();
  return { ...pos, start: st.slice(0, 220) };
}
const questStartMemo = new Map();
app.get('/api/:game/queststarts', wrap(async (req, res) => {
  const g = gameOf(req);
  const key = req.params.game;
  const memo = questStartMemo.get(key);
  if (memo && memo.exp > Date.now()) return res.json(memo.data);
  let titles = [];
  for (const cat of ['Category:Quests', 'Category:Miniquests']) {
    let cont = '';
    for (let i = 0; i < 6; i++) {
      const r = await fetchCached(`${g.wiki}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(cat)}&cmnamespace=0&cmlimit=500&format=json&formatversion=2${cont}`, 24 * 3600e3);
      titles.push(...(r?.query?.categorymembers || []).map((m) => m.title));
      if (!r?.continue?.cmcontinue) break;
      cont = '&cmcontinue=' + encodeURIComponent(r.continue.cmcontinue);
    }
  }
  titles = [...new Set(titles)].filter((t) => !t.includes('/'));
  const quests = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = await fetchCached(`${g.wiki}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(batch.join('|'))}`, 60e3);
    for (const p of j?.query?.pages || []) {
      const s = parseQuestStart(p.revisions?.[0]?.slots?.main?.content || '');
      if (s) quests.push({ title: p.title, ...s });
    }
  }
  const data = { quests, checked: titles.length };
  if (quests.length) questStartMemo.set(key, { exp: Date.now() + 24 * 3600e3, data });
  res.json(data);
}));

// ---------- speler ----------
// Zelfde correcties als de questchecker van de RS3 Wiki: naam uit de sync-data -> wiki-paginanaam
const RS3_QUEST_FIX = {
  'Finale': 'Once Upon a Time in Gielinor: Finale',
  'Flashback': 'Once Upon a Time in Gielinor: Flashback',
  'Foreshadowing': 'Once Upon a Time in Gielinor: Foreshadowing',
  'Fortunes': 'Once Upon a Time in Gielinor: Fortunes',
  'Father and Son': 'Father and Son (miniquest)',
  'Helping Laniakea': 'Helping Laniakea (miniquest)',
  'My One and Only Lute': 'That Old Black Magic: My One and Only Lute',
  'Skelly By Everlight': 'That Old Black Magic: Skelly By Everlight',
  'Flesh and Bone': 'That Old Black Magic: Flesh and Bone',
  'Hermy and Bass': 'That Old Black Magic: Hermy and Bass',
};
const NAME_RE = /^[A-Za-z0-9 _-]{1,12}$/;

async function settle(p) {
  try { return { ok: true, value: await p }; } catch (e) { return { ok: false, error: e.message, status: e.status }; }
}

// OSRS-hiscores: de hiscores van Jagex haperen soms (time-out, 5xx, tijdelijke blokkade).
// Probeer de JSON-versie twee keer en val terug op de oude CSV-versie (index_lite.ws).
const OSRS_HS_SKILLS = ['Overall', 'Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecraft', 'Hunter', 'Construction', 'Sailing'];
async function osrsHiscores(enc) {
  const json = `https://secure.runescape.com/m=hiscore_oldschool/index_lite.json?player=${enc}`;
  let r = await settle(fetchCached(json, 120e3));
  if (r.ok || r.status === 404) return r;
  await new Promise((ok) => setTimeout(ok, 800));
  r = await settle(fetchCached(json, 120e3));
  if (r.ok || r.status === 404) return r;
  const first = r;
  const csv = await settle(fetchCached(`https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=${enc}`, 120e3, 'text'));
  if (!csv.ok) return { ...first, error: `${first.error}${first.status ? ` (${first.status})` : ''}; CSV: ${csv.error}${csv.status ? ` (${csv.status})` : ''}` };
  const rows = String(csv.value).trim().split(/\r?\n/).map((l) => l.split(',').map(Number));
  const skills = OSRS_HS_SKILLS.map((name, i) => ({ name, rank: rows[i]?.[0] ?? -1, level: rows[i]?.[1] ?? 1, xp: rows[i]?.[2] ?? 0 }));
  if (!skills.some((x) => x.xp > 0)) return { ...first, error: 'CSV-hiscores onleesbaar' };
  return { ok: true, value: { skills, activities: [] }, via: 'CSV-terugval' };
}

// RS3: XP per maand (laatste 12 maanden) uit RuneMetrics, per skill. Geeft je tempo zonder dat je iets bijhoudt.
const RM_SKILL_ID = ['Attack', 'Defence', 'Strength', 'Constitution', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecrafting', 'Hunter', 'Construction', 'Summoning', 'Dungeoneering', 'Divination', 'Invention', 'Archaeology', 'Necromancy'];
app.get('/api/rs3/xpmonthly/:name/:skill', wrap(async (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!NAME_RE.test(name)) throw new UpstreamError(400, 'Ongeldige RSN');
  const id = RM_SKILL_ID.indexOf(req.params.skill);
  if (id < 0) throw new UpstreamError(400, 'Onbekende skill');
  const j = await fetchCached(`https://apps.runescape.com/runemetrics/xp-monthly?searchName=${encodeURIComponent(name)}&skillid=${id}`, 3600e3);
  const m = (j?.monthlyXpGain || [])[0];
  if (!m) throw new UpstreamError(404, 'Geen maanddata (profiel privé?)');
  res.json({
    skill: req.params.skill,
    totalXp: m.totalXp ?? null,
    months: (m.monthData || []).map((d) => ({ t: d.timestamp, xp: d.xpGain ?? 0 })).filter((d) => d.t).sort((a, b) => a.t - b.t),
  });
}));

app.get('/api/:game/player/:name', wrap(async (req, res) => {
  const game = req.params.game;
  gameOf(req);
  const name = String(req.params.name || '').trim();
  if (!NAME_RE.test(name)) throw new UpstreamError(400, 'Ongeldige RSN');
  const enc = encodeURIComponent(name);
  const out = { game, name, skills: [], total: null, quests: null, questSource: null, activities: [], sources: {}, fetchedAt: Date.now() };

  if (game === 'osrs') {
    const [hs, sync] = await Promise.all([
      osrsHiscores(enc),
      settle(fetchCached(`https://sync.runescape.wiki/runelite/player/${enc}/STANDARD`, 120e3)),
    ]);
    out.sources.hiscores = hs.ok ? (hs.via ? `ok (${hs.via})` : 'ok') : (hs.status === 404 ? 'niet gevonden' : `fout: ${hs.error || 'onbekend'}`);
    out.sources.wikisync = sync.ok ? 'ok' : (sync.status === 404 ? 'geen WikiSync-data' : 'fout');
    if (hs.ok && Array.isArray(hs.value.skills)) {
      for (const s of hs.value.skills) {
        const row = { name: s.name, level: Math.max(1, s.level), xp: Math.max(0, s.xp), rank: s.rank };
        if (s.name === 'Overall') out.total = { level: row.level, xp: row.xp, rank: row.rank };
        else out.skills.push(row);
      }
      out.activities = (hs.value.activities || []).filter((a) => a.score > 0).map((a) => ({ name: a.name, score: a.score, rank: a.rank }));
    }
    if (sync.ok && sync.value) {
      const v = sync.value;
      if (v.quests) {
        out.quests = {};
        for (const [title, st] of Object.entries(v.quests)) out.quests[title] = st === 2 ? 'done' : st === 1 ? 'started' : 'none';
        out.questSource = 'WikiSync';
      }
      if (!out.skills.length && v.levels) {
        for (const [n, lvl] of Object.entries(v.levels)) out.skills.push({ name: n, level: lvl, xp: null, rank: null });
      }
      out.syncedAt = v.timestamp || null;
      // Achievement diaries: { Regio: { Easy: { complete, tasks: [bool] }, ... } }
      if (v.achievement_diaries && typeof v.achievement_diaries === 'object') out.diaries = v.achievement_diaries;
    }
  } else {
    const [hs, sync, rm, rq] = await Promise.all([
      settle(fetchCached(`https://secure.runescape.com/m=hiscore/index_lite.ws?player=${enc}`, 120e3, 'text')),
      settle(fetchCached(`https://sync.runescape.wiki/runescape/player/${enc}/STANDARD`, 120e3)),
      settle(fetchCached(`https://apps.runescape.com/runemetrics/profile/profile?user=${enc}&activities=20`, 120e3)),
      settle(fetchCached(`https://apps.runescape.com/runemetrics/quests?user=${enc}`, 300e3)),
    ]);
    out.sources.hiscores = hs.ok ? 'ok' : (hs.status === 404 ? 'niet gevonden' : `fout: ${hs.error || 'onbekend'}${hs.status ? ` (${hs.status})` : ''}`);
    out.sources.wikisync = sync.ok && sync.value?.quests ? 'ok' : (sync.status === 400 || sync.status === 404 ? 'geen WikiSync-data' : 'fout');
    out.sources.runemetrics = rm.ok && !rm.value.error ? 'ok' : 'offline';
    if (hs.ok) {
      const lines = hs.value.trim().split('\n');
      RS3_SKILLS.forEach((sk, i) => {
        const parts = (lines[i] || '').split(',').map(Number);
        if (parts.length < 3) return;
        const row = { name: sk, rank: parts[0], level: Math.max(1, parts[1]), xp: Math.max(0, parts[2]) };
        if (sk === 'Overall') out.total = { level: row.level, xp: row.xp, rank: row.rank };
        else out.skills.push(row);
      });
    }
    if (rm.ok && !rm.value.error) {
      const v = rm.value;
      out.combat = v.combatlevel;
      out.activities = (v.activities || []).map((a) => ({ date: a.date, text: a.text, details: a.details }));
      if (!out.skills.length && Array.isArray(v.skillvalues)) {
        for (const s of v.skillvalues) {
          const nm = RS3_SKILLS[s.id + 1];
          if (nm) out.skills.push({ name: nm, level: s.level, xp: Math.floor(s.xp / 10), rank: s.rank });
        }
        out.total = { level: v.totalskill, xp: v.totalxp, rank: null };
      }
    }
    if (sync.ok && sync.value?.quests) {
      const v = sync.value;
      out.quests = {};
      for (const [title, st] of Object.entries(v.quests)) {
        const val = st === 2 ? 'done' : st === 1 ? 'started' : 'none';
        out.quests[RS3_QUEST_FIX[title] || title] = val;
      }
      out.questSource = 'WikiSync';
      out.syncedAt = v.timestamp || null;
      if (Array.isArray(v.ach)) out.achievements = v.ach.length;
      if (typeof v.im === 'boolean') out.ironman = v.im;
      if (!out.skills.length && v.levels) {
        for (const [n, lvl] of Object.entries(v.levels)) out.skills.push({ name: n, level: lvl, xp: null, rank: null });
      }
    } else if (rq.ok && Array.isArray(rq.value.quests)) {
      out.quests = {};
      for (const q of rq.value.quests) out.quests[q.title] = q.status === 'COMPLETED' ? 'done' : q.status === 'STARTED' ? 'started' : 'none';
      out.questSource = 'RuneMetrics';
      out.questPoints = rq.value.quests.filter((q) => q.status === 'COMPLETED').reduce((a, q) => a + (q.questPoints || 0), 0);
    }
  }
  if (!out.total && out.skills.length) out.total = { level: out.skills.reduce((a, s) => a + (s.level || 0), 0), xp: null, rank: null };
  if (!out.skills.length && !out.quests) throw new UpstreamError(404, 'Speler niet gevonden in hiscores of sync-bronnen');
  res.set('Cache-Control', 'no-store').json(out);
}));

// ---------- lokale opslag ----------
const STORE_KEYS = new Set(['settings', 'watchlist', 'journal', 'goals', 'history', 'quests', 'sessions', 'portfolio', 'paper', 'pathway', 'xphist']);
let writeChain = Promise.resolve();

app.get('/api/store/:key', wrap(async (req, res) => {
  const key = req.params.key;
  if (!STORE_KEYS.has(key)) throw new UpstreamError(400, 'Onbekende sleutel');
  try {
    const txt = await fs.readFile(path.join(DATA_DIR, key + '.json'), 'utf8');
    res.json(JSON.parse(txt));
  } catch {
    res.json(null);
  }
}));

app.put('/api/store/:key', wrap(async (req, res) => {
  const key = req.params.key;
  if (!STORE_KEYS.has(key)) throw new UpstreamError(400, 'Onbekende sleutel');
  const body = JSON.stringify(req.body ?? null, null, 2);
  writeChain = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, key + '.json');
    const tmp = file + '.tmp';
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, file);
  });
  await writeChain;
  res.json({ ok: true });
}));

// ---------- Flipping Utilities (RuneLite) ----------
// Leest alleen de vaste map ~/.runelite/flipping; geen andere paden.
app.get('/api/import/flipping', wrap(async (req, res) => {
  const dir = path.join(os.homedir(), '.runelite', 'flipping');
  let names = [];
  try { names = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json')); } catch { return res.json({ dir, files: [] }); }
  const files = [];
  for (const f of names.slice(0, 20)) {
    const fp = path.join(dir, f);
    try {
      const st = await fs.stat(fp);
      if (!st.isFile() || st.size > 60e6) continue;
      files.push({ file: f, size: st.size, mtime: st.mtimeMs, data: JSON.parse(await fs.readFile(fp, 'utf8')) });
    } catch { files.push({ file: f, error: 'onleesbaar' }); }
  }
  res.json({ dir, files });
}));

app.get('/api/health', (req, res) => res.json({ ok: true, dev: DEV, desktop: !!process.env.TICK_DESKTOP }));

// ---------- AI-koppeling (MCP) ----------
const PKG_VERSION = (() => { try { return JSON.parse(fss.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0'; } })();
const mcp = setupMcp({ app, DATA_DIR, ROOT, version: PKG_VERSION });
app.use('/api', (req, res) => res.status(404).json({ error: 'Niet gevonden' }));

// ---------- frontend ----------
let frontendReady = false;
async function mountFrontend() {
  if (frontendReady) return;
  frontendReady = true;
  if (DEV) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: path.join(ROOT, 'web'), configFile: path.join(ROOT, 'vite.config.js'), server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    try {
      await fs.access(path.join(DIST_DIR, 'index.html'));
    } catch {
      throw new Error('Geen build gevonden. Draai eerst: npm run build');
    }
    app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
  }
}

// Start de server; probeert de volgende poort als deze bezet is.
export async function startServer({ port = PORT, tries = 10 } = {}) {
  await mountFrontend();
  for (let p = port; p < port + tries; p++) {
    const server = await new Promise((resolve, reject) => {
      const srv = app.listen(p, HOST);
      srv.once('listening', () => resolve(srv));
      srv.once('error', (e) => (e.code === 'EADDRINUSE' ? resolve(null) : reject(e)));
    });
    if (server) { await mcp.onListen(p); return { port: p, server }; }
  }
  throw new Error(`Geen vrije poort gevonden vanaf ${port}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  startServer().then(({ port }) => {
    console.log(`\n  tick. draait op  http://localhost:${port}   ${DEV ? '(dev)' : ''}\n  Sluit dit venster om te stoppen.\n`);
  }).catch((e) => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
}
