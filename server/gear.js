// Gear-advisor: DPS-data (osrs-dps-calc van Weird Gloop), aanbevolen uitrusting per boss en itemvereisten van de wiki.
import fs from 'node:fs/promises';
import path from 'node:path';

const DPS_BASE = 'https://raw.githubusercontent.com/weirdgloop/osrs-dps-calc/main/cdn/json/';
// Varianten die je in de praktijk niet draagt (zelfde item, andere staat)
const JUNK_VERSION = /Broken|Locked|Empty|Uncharged|Inactive|Deadman|Emir's Arena|Soul Wars|Last Man Standing|Beta|Damaged/i;
const SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Magic', 'Prayer', 'Hitpoints', 'Agility', 'Slayer', 'Crafting', 'Smithing', 'Herblore', 'Fletching', 'Firemaking', 'Woodcutting', 'Mining', 'Fishing', 'Cooking', 'Runecraft', 'Thieving', 'Construction', 'Hunter', 'Farming', 'Sailing'];

function compactEquipment(list) {
  const byName = new Map();
  for (const x of list) {
    if (!x?.name || !x.slot) continue;
    const cur = byName.get(x.name);
    // Liefst de variant zonder versie, dan een bruikbare versie, als laatste een kapotte/lege
    const score = JUNK_VERSION.test(x.version || '') ? 2 : x.version ? 1 : 0;
    if (cur && cur.score <= score) continue;
    byName.set(x.name, {
      score,
      row: {
        n: x.name, id: x.id, s: x.slot, sp: x.speed || 0, c: x.category || '', h: x.isTwoHanded ? 1 : 0,
        ...(x.image && x.image !== `${x.name}.png` ? { i: x.image } : {}),
        o: [x.offensive?.stab || 0, x.offensive?.slash || 0, x.offensive?.crush || 0, x.offensive?.magic || 0, x.offensive?.ranged || 0],
        b: [x.bonuses?.str || 0, x.bonuses?.ranged_str || 0, x.bonuses?.magic_str || 0, x.bonuses?.prayer || 0],
      },
    });
  }
  return [...byName.values()].map((e) => e.row);
}

function compactMonsters(list) {
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m?.name || !(m.skills?.hp > 0)) continue;
    const key = `${m.name}|${m.version || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const d = m.defensive || {};
    out.push({
      id: m.id, n: m.name, v: m.version || '', lvl: m.level || 0, img: m.image || '',
      hp: m.skills.hp, def: m.skills.def || 0, mag: m.skills.magic || 0,
      d: [d.stab || 0, d.slash || 0, d.crush || 0, d.magic || 0, d.light || 0, d.standard || 0, d.heavy || 0, d.flat_armour || 0],
      a: m.attributes || [],
    });
  }
  return out;
}

// "[[Masori mask (f)|Masori mask (f)]] / [[Void ranger helm|...]]" -> ['Masori mask (f)', 'Void ranger helm']
function linksOf(wt) {
  const out = [];
  for (const m of String(wt || '').matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const t = m[1].trim();
    if (/^(File|Category|Image):/i.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

// Vereisten uit de introtekst: "requires level 80 [[Ranged]] and [[Defence]] to equip", "[[Attack]] level of 70 to wield"
export function parseReqs(wikitext) {
  const body = String(wikitext || '')
    .replace(/\{\{Infobox[\s\S]*?\n\}\}/gi, '')
    .replace(/\{\{SCP\|([A-Za-z]+)\|(\d+)[^}]*\}\}/gi, (_, s, n) => `${n} [[${s}]]`);
  const req = {};
  for (const raw of body.match(/[^.\n]*\b(wield|equip|wear)[^.\n]*/gi) || []) {
    const s = raw.slice(0, raw.search(/\b(wield|equip|wear)/i) + 8);
    if (!/requir|need/i.test(s)) continue;
    let cur = null;
    let pending = [];
    for (const t of s.matchAll(/(\d{1,3})(?![\d,])|\[\[([A-Za-z]+)(?:\|[^\]]*)?\]\]/g)) {
      if (t[1]) {
        const n = Number(t[1]);
        if (n < 1 || n > 99) continue;
        cur = n;
        for (const p of pending) req[p] = n;
        pending = [];
      } else if (SKILLS.includes(t[2])) {
        if (cur != null) req[t[2]] = cur; else pending.push(t[2]);
      }
    }
    if (Object.keys(req).length) break;
  }
  return req;
}

export function setupGear(app, { fetchCached, wrap, UpstreamError, dataDir, wikiApi }) {
  const mem = new Map();
  async function dpsData(which) {
    const hit = mem.get(which);
    if (hit && hit.exp > Date.now()) return hit.data;
    const file = path.join(dataDir, `dps-${which}.json`);
    try {
      const raw = await fetchCached(DPS_BASE + `${which}.json`, 24 * 3600e3);
      const data = which === 'equipment' ? compactEquipment(raw) : compactMonsters(raw);
      if (!data.length) throw new Error('leeg');
      mem.set(which, { data, exp: Date.now() + 24 * 3600e3 });
      fs.mkdir(dataDir, { recursive: true }).then(() => fs.writeFile(file, JSON.stringify(data))).catch(() => {});
      return data;
    } catch (e) {
      // Geen internet of GitHub hapert: laatst bewaarde kopie
      try {
        const data = JSON.parse(await fs.readFile(file, 'utf8'));
        mem.set(which, { data, exp: Date.now() + 3600e3 });
        return data;
      } catch { throw e instanceof UpstreamError ? e : new UpstreamError(502, 'DPS-data niet bereikbaar'); }
    }
  }

  app.get('/api/osrs/dps/:which', wrap(async (req, res) => {
    const which = req.params.which;
    if (!['equipment', 'monsters'].includes(which)) throw new UpstreamError(400, 'Onbekende dataset');
    res.set('Cache-Control', 'private, max-age=3600');
    res.json(await dpsData(which));
  }));

  const bucket = (q) => fetchCached(`${wikiApi}?action=bucket&format=json&query=${encodeURIComponent(q)}`, 24 * 3600e3);

  app.get('/api/osrs/recommended', wrap(async (req, res) => {
    const data = await bucket("bucket('recommended_equipment').select('page_name').limit(5000).run()");
    if (data?.error) throw new UpstreamError(502, 'Wiki-bucket gaf een fout');
    res.json({ pages: [...new Set((data?.bucket || []).map((r) => r.page_name))].sort() });
  }));

  app.get('/api/osrs/recommended/:page', wrap(async (req, res) => {
    const page = String(req.params.page || '').slice(0, 100);
    if (!page || /['\\]/.test(page)) throw new UpstreamError(400, 'Ongeldige pagina');
    const data = await bucket(`bucket('recommended_equipment').select('page_name','json').where('page_name','${page}').limit(20).run()`);
    if (data?.error) throw new UpstreamError(502, 'Wiki-bucket gaf een fout');
    const setups = [];
    for (const row of data?.bucket || []) {
      let j;
      try { j = JSON.parse(row.json || '{}'); } catch { continue; }
      const eq = j['Recommended Equipment'] || {};
      const slots = {};
      for (const [slot, tiers] of Object.entries(eq)) {
        const list = (Array.isArray(tiers) ? tiers : [tiers]).map(linksOf).filter((t) => t.length);
        if (list.length) slots[slot] = list;
      }
      setups.push({ style: j.style || 'Algemeen', slots });
    }
    res.json({ page, setups });
  }));

  app.get('/api/osrs/itemreq/:item', wrap(async (req, res) => {
    const item = String(req.params.item || '').slice(0, 100);
    if (!item) throw new UpstreamError(400, 'Ongeldig item');
    const data = await fetchCached(`${wikiApi}?action=parse&format=json&prop=wikitext&section=0&redirects=1&page=${encodeURIComponent(item)}`, 7 * 24 * 3600e3);
    const wt = data?.parse?.wikitext?.['*'];
    if (!wt) return res.json({ item, req: null });
    res.json({ item, req: parseReqs(wt) });
  }));
}
