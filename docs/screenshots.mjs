// Maakt de screenshots voor de README (draait in GitHub Actions, zie .github/workflows/screenshots.yml).
// Gebruikt een echt account voor levendige data, maar vervangt de naam overal door "Speler".
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const BASE = process.env.TICK_URL || 'http://127.0.0.1:5177';
const RSN = process.env.TICK_RSN || 'YuuS_27';
const OUT = 'docs/screenshots';
const NAME_RE = new RegExp(RSN.replace(/[_ ]/g, '[ _]'), 'gi');

const SHOTS = [
  { game: 'osrs', path: '#/', file: 'dashboard-osrs', h: 900 },
  { game: 'osrs', path: '#/play', file: 'nu-spelen', h: 1300, deep: true },
  { game: 'rs3', path: '#/money', file: 'money-making', h: 1000 },
  { game: 'osrs', path: '#/quests', file: 'quests', h: 1000 },
  { game: 'osrs', path: '#/quests/Dragon%20Slayer%20I', file: 'quest-guide', h: 1000 },
  { game: 'osrs', path: '#/skills/Woodcutting', file: 'skill-guide', h: 1000 },
  { game: 'osrs', path: '#/ge', file: 'ge-terminal', h: 1000 },
  { game: 'osrs', path: '#/market', file: 'markt-radar', h: 1000, slow: true },
  { game: 'rs3', path: '#/radar', file: 'unlock-radar', h: 1000 },
  { game: 'osrs', path: '#/wiki/Abyssal%20whip', file: 'wiki', h: 1000 },
  { game: 'rs3', path: '#/', file: 'dashboard-rs3', h: 900 },
];

const put = (key, value) => fetch(`${BASE}/api/store/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

async function settle(page, { deep, slow }) {
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  const until = Date.now() + (deep || slow ? 120000 : 45000);
  while (Date.now() < until) {
    const busy = await page.evaluate(() => {
      const skel = [...document.querySelectorAll('.skel')].some((e) => e.getBoundingClientRect().top < innerHeight);
      const loading = /ophalen|doorrekenen|laden…|bezig/i.test(document.querySelector('.page')?.innerText?.slice(0, 600) || '');
      return skel || loading;
    });
    if (!busy) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2500); // animaties (count-ups, grafieken) laten uitlopen
}

// Voorbeeld-doelen, zodat het dashboard en Nu spelen niet leeg ogen
await put('goals', [
  { id: 'demo1', type: 'skill', game: 'osrs', skill: 'Woodcutting', level: 60, startXp: 0, createdAt: Date.now() },
  { id: 'demo2', type: 'quest', game: 'osrs', title: 'Monkey Madness I', skills: [], createdAt: Date.now() },
  { id: 'demo3', type: 'skill', game: 'rs3', skill: 'Mining', level: 30, startXp: 0, createdAt: Date.now() },
]);

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
await fs.mkdir(OUT, { recursive: true });
let lastGame = null;
for (const s of SHOTS) {
  if (s.game !== lastGame) {
    await put('settings', { game: s.game, osrsName: RSN, rs3Name: RSN, notify: false, acct: { osrs: { members: true, iron: false }, rs3: { members: true, iron: false } } });
    lastGame = s.game;
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: s.h }, deviceScaleFactor: 2 });
  await page.addInitScript((src) => {
    const re = new RegExp(src, 'gi');
    const mask = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) if (re.test(n.nodeValue)) { re.lastIndex = 0; n.nodeValue = n.nodeValue.replace(re, 'Speler'); }
      document.querySelectorAll('.avatar').forEach((a) => { if (a.textContent !== 'S') a.textContent = 'S'; });
      document.querySelectorAll('input').forEach((i) => { if (re.test(i.value)) { re.lastIndex = 0; i.value = 'Speler'; } });
    };
    addEventListener('DOMContentLoaded', () => { mask(); new MutationObserver(mask).observe(document.body, { subtree: true, childList: true, characterData: true }); });
  }, NAME_RE.source);
  await page.goto(BASE + '/' + s.path);
  await settle(page, s);
  await page.screenshot({ path: `${OUT}/${s.file}.jpg`, type: 'jpeg', quality: 86 });
  console.log('✓', s.file);
  await page.close();
}
await browser.close();
