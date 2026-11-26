import { GAMES } from './games.js';
import { parsePage, toDoc, extractSkills, questStatus } from './wiki.js';

// Stappengidsen van de wiki: een complete route door het spel, stap voor stap.
// tick. leest ze in en vinkt af wat je account al heeft gedaan.
export const GUIDES = {
  rs3: [
    {
      id: 'rs3-eipg',
      title: 'Efficient Ironman Pathway Guide',
      by: 'RuneScape Wiki',
      pages: ['Ironman Mode/Guide/Efficient Ironman Pathway Guide'],
      stopAt: /miniguide/i,
      about: 'Van een nieuw account tot en met bossing. Geschreven voor ironmen, maar met de GE kun je veel stappen overslaan.',
    },
  ],
  osrs: [
    {
      id: 'osrs-bruhsailer',
      title: 'BRUHsailer',
      by: 'So Iron BRUH & ParasailerOSRS (wikiversie)',
      pages: ['User:JustThespian/BRUHsailer/Chapter1', 'User:JustThespian/BRUHsailer/Chapter2', 'User:JustThespian/BRUHsailer/Chapter3'],
      about: 'Van Tutorial Island tot de quest cape, in drie hoofdstukken. Geschreven voor ironmen.',
    },
    {
      id: 'osrs-oziris',
      title: 'Oziris-route naar Barrows gloves',
      by: 'OzirisRS (wikiversie)',
      pages: ['User:JustThespian/IronPathway'],
      about: 'Kortere route tot en met Recipe for Disaster en Barrows gloves.',
    },
  ],
};

// Stappen die je als niet-ironman meestal gewoon op de GE koopt
const GATHER = /^\s*(buy|purchase|obtain|collect|gather|pick|steal|mine|chop|fish|catch|smith|craft|fletch|grab|get \d+|tan|spin)\b/i;

const clean = (s = '') => s.replace(/\s+/g, ' ').trim();

export async function loadGuide(game, guide) {
  const skills = GAMES[game].skills;
  const steps = [];
  for (const page of guide.pages) {
    const p = await parsePage(game, page);
    const root = toDoc(game, p.text);
    let section = '';
    let stop = false;
    for (const el of root.querySelectorAll('h2, h3, h4, table')) {
      if (stop) break;
      if (/^H\d$/.test(el.tagName)) {
        const t = clean(el.textContent);
        if (guide.stopAt?.test(t)) { stop = true; break; }
        section = t;
        continue;
      }
      if (el.parentElement?.closest('table')) continue; // tabellen in een cel horen bij die stap
      const head = [...(el.rows[0]?.cells || [])].map((c) => clean(c.textContent).toLowerCase());
      const ia = head.findIndex((h) => /^activity/.test(h));
      if (ia < 0 || (ia > 0 && !/^step/.test(head[0]))) continue; // alleen echte stappentabellen
      const iNotes = head.findIndex((h) => /^notes/.test(h));
      const iLv = head.findIndex((h) => /level/.test(h));
      for (const row of [...el.rows].slice(1)) {
        const cells = [...row.cells];
        // Kolommen schuiven als de stapkolom ontbreekt (rowspan); lijn uit op het aantal kolommen van de kop
        const off = head.length - cells.length;
        const at = (i) => (i < 0 ? null : cells[i - off] || null);
        const act = at(ia);
        if (!act || row.querySelector('th[colspan]')) continue;
        const text = clean(act.textContent);
        if (!text) continue;
        const startOnly = /^(start|begin)\b/i.test(text);
        const quests = [...new Set([...act.querySelectorAll('a[data-title]')].map((a) => a.getAttribute('data-title').replace(/\/Quick guide$/i, '')))];
        const lvCell = at(iLv);
        const levels = (lvCell ? extractSkills(lvCell, skills) : []).concat(extractSkills(act, skills))
          .filter((l, i, arr) => arr.findIndex((x) => x.skill === l.skill) === i);
        steps.push({
          id: `${page}#${steps.length}`,
          n: steps.length + 1,
          page,
          section,
          text,
          html: act.innerHTML,
          notes: at(iNotes) && !/^(n\/?a|[-–—\s]*)$/i.test(clean(at(iNotes).textContent)) ? at(iNotes).innerHTML : '',
          quests,
          startOnly,
          levels: levels.map(({ skill, level }) => ({ skill, level })),
          gather: !quests.length && !levels.length && GATHER.test(text) && !/\b(quest|start|complete|finish)\b/i.test(text),
        });
      }
    }
  }
  return steps;
}

// Questnamen in gewone tekst herkennen (sommige gidsen linken quests niet). Langste namen eerst,
// zodat "Dragon Slayer II" niet ook als "Dragon Slayer I" telt.
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let nameCache = { key: '', list: [] };
function questNames(questMap) {
  const names = Object.keys(questMap || {});
  const key = names.length + ':' + names[0];
  if (nameCache.key !== key) {
    nameCache = {
      key,
      list: names.filter((n) => n.length >= 5).sort((a, b) => b.length - a.length)
        .map((n) => ({ name: n, low: n.toLowerCase(), re: new RegExp(`(^|[^\\w'])${esc(n)}(?![\\w'])`, 'i') })),
    };
  }
  return nameCache.list;
}
function mentions(step, questMap) {
  const out = new Map();
  // Gelinkte quests waarvan de naam niet letterlijk in de tekst staat (bv. afkortingen)
  const lowText = step.text.toLowerCase();
  for (const t of step.quests) if (questStatus(questMap, t) != null && !lowText.includes(t.toLowerCase())) out.set(t, { title: t, start: step.startOnly });
  let text = step.text;
  let low = text.toLowerCase();
  for (const q of questNames(questMap)) {
    if (!low.includes(q.low)) continue;
    const m = text.match(q.re);
    if (!m) continue;
    const at = m.index + m[1].length;
    const before = text.slice(Math.max(0, at - 30), at);
    // Tussen haakjes is meestal een verwijzing ("tot Song of the Elves af is"), geen opdracht
    const inParens = (text.slice(0, at).match(/\(/g) || []).length > (text.slice(0, at).match(/\)/g) || []).length;
    const start = /\b(start|starting|begin|partially|part of)\s+(the\s+)?(quest\s+)?$/i.test(before);
    if (!out.has(q.name) && !inParens) out.set(q.name, { title: q.name, start });
    // Weghalen, zodat een kortere naam binnen deze naam niet nog eens telt
    text = text.slice(0, at) + ' '.repeat(q.name.length) + text.slice(at + q.name.length);
    low = text.toLowerCase();
  }
  return [...out.values()];
}

// Bepaal per stap of je hem al hebt gedaan, en waar je nu ongeveer bent in de route.
export function judgeSteps(steps, { levels = {}, questMap = {}, manual = {} } = {}) {
  const known = questMap && Object.keys(questMap).length > 0;
  const lv = (s) => levels[s] ?? 1;
  const out = steps.map((s) => {
    const ms = known ? mentions(s, questMap) : [];
    const qs = ms.map((m) => m.title);
    const qMiss = ms.filter((m) => {
      const st = questStatus(questMap, m.title);
      return m.start ? !st || st === 'none' : st !== 'done';
    }).map((m) => m.title);
    const lMiss = s.levels.filter((l) => lv(l.skill) < l.level).map((l) => ({ ...l, cur: lv(l.skill) }));
    const evidence = qs.length + s.levels.length;
    const auto = !evidence ? 'unknown' : !qMiss.length && !lMiss.length ? 'done' : 'todo';
    const m = manual?.[s.id];
    return { ...s, qs, qMiss, lMiss, evidence, auto, gather: s.gather && !qs.length, manual: m, status: m === true || m === 'skip' ? 'done' : m === false ? 'todo' : auto };
  });

  // Frontlinie: de laatste afgeronde stap waarbij de route tot daar grotendeels (≥70%) af is.
  // Zo trekt één quest die je toevallig vroeg deed je positie niet scheef.
  let ev = 0, ok = 0, front = -1;
  out.forEach((s, i) => {
    if (s.status === 'unknown') return;
    ev++;
    if (s.status === 'done') ok++;
    if (s.status === 'done' && ok / ev >= 0.7) front = i;
  });
  // Stappen zonder controle vóór je eerste afgeronde stap (account aanmaken, tutorial overslaan) zijn vrijwel zeker gedaan
  const firstDone = out.findIndex((s) => s.status === 'done');
  const before = Math.max(front, firstDone);
  out.forEach((s, i) => {
    if (s.status === 'unknown') s.status = i < before ? 'likely' : 'open';
  });
  const nextIdx = out.findIndex((s, i) => i > front && s.status !== 'done' && s.status !== 'likely');
  const missed = out.filter((s, i) => i < front && s.status === 'todo');
  const doneish = out.filter((s) => s.status === 'done' || s.status === 'likely').length;
  return { steps: out, front, nextIdx, missed, doneish, total: out.length };
}
