// AI-koppeling (MCP, Model Context Protocol) voor tick.
// Laat een AI-app (bv. Claude Desktop) jouw tick.-data lezen: account, quests, wiki, GE-prijzen,
// money-making, diaries en het stappenplan. Alleen lezen, alleen op deze pc, alleen met de sleutel.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const GAME_ENUM = { type: 'string', enum: ['osrs', 'rs3'], description: 'Which game: "osrs" (Old School) or "rs3" (RuneScape 3). Defaults to the game currently selected in tick.' };

export function setupMcp({ app, DATA_DIR, ROOT, version }) {
  const FILE = path.join(DATA_DIR, 'mcp.json');
  const BRIDGE = path.join(ROOT, 'electron', 'mcp-bridge.cjs');
  let state = { enabled: false, token: null, port: null };
  let ai = null; // gebundelde rekenfuncties (server/ai/tick-ai.bundle.mjs)

  try {
    const s = JSON.parse(fss.readFileSync(FILE, 'utf8'));
    state = { ...state, enabled: !!s.enabled, token: s.token || null };
  } catch { /* nog niet aangemaakt */ }
  if (!state.token) state.token = crypto.randomBytes(24).toString('base64url');

  const save = async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify({ ...state, pid: process.pid, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  };
  const base = () => `http://127.0.0.1:${state.port}`;
  const local = async (url) => {
    const r = await fetch(base() + url);
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error(body?.error || `Fout ${r.status}`);
    return body;
  };
  const loadAi = async () => {
    if (ai) return ai;
    globalThis.__TICK_BASE = base();
    try {
      ai = await import(pathToFileURL(path.join(ROOT, 'server', 'ai', 'tick-ai.bundle.mjs')).href);
    } catch (e) {
      throw new Error('Deze functie is niet beschikbaar: de AI-bundel ontbreekt (draai "npm run build"). ' + e.message);
    }
    return ai;
  };

  // ---------- configuratie voor AI-apps ----------
  const clientConfig = () => {
    const desktop = !!process.versions.electron;
    return {
      command: process.execPath,
      args: [BRIDGE, '--data', DATA_DIR],
      ...(desktop ? { env: { ELECTRON_RUN_AS_NODE: '1' } } : {}),
    };
  };
  // Waar Claude Desktop zijn instellingen bewaart verschilt per versie en installatie:
  //  - klassiek: %APPDATA%\Claude
  //  - nieuwere Windows-versies: %LOCALAPPDATA%\Claude-Data\<naam>
  //  - oudere Store-versie: %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude
  // Een map met een ".user-data-left.<naam>"-markering is achtergelaten: Claude is verhuisd naar Claude-Data\<naam>.
  const claudeCandidates = () => {
    const out = new Set();
    const ls = (d) => { try { return fss.readdirSync(d); } catch { return []; } };
    if (process.platform === 'win32') {
      const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      out.add(path.join(roaming, 'Claude'));
      for (const d of ls(path.join(localApp, 'Claude-Data'))) out.add(path.join(localApp, 'Claude-Data', d));
      for (const d of ls(path.join(localApp, 'Packages'))) if (/^Claude_/i.test(d)) out.add(path.join(localApp, 'Packages', d, 'LocalCache', 'Roaming', 'Claude'));
      for (const dir of [...out]) for (const f of ls(dir)) {
        const m = f.match(/^\.user-data-left\.(.+)$/);
        if (m) out.add(path.join(localApp, 'Claude-Data', m[1]));
      }
    } else if (process.platform === 'darwin') {
      out.add(path.join(os.homedir(), 'Library', 'Application Support', 'Claude'));
    } else {
      out.add(path.join(os.homedir(), '.config', 'Claude'));
    }
    return [...out];
  };
  // Alleen mappen die Claude echt gebruikt: bestaan, zijn niet achtergelaten, en bevatten app-data (logs, cache, opslag)
  const claudeConfigPaths = () => {
    const ls = (d) => { try { return fss.readdirSync(d); } catch { return null; } };
    const scored = [];
    for (const dir of claudeCandidates()) {
      const files = ls(dir);
      if (!files) continue;
      if (files.some((f) => f.startsWith('.user-data-left'))) continue;
      const used = files.filter((f) => /^(logs|Local Storage|Cache|IndexedDB|Session Storage|Preferences|config\.json|main\.log)$/i.test(f)).length;
      scored.push({ dir, used });
    }
    const live = scored.filter((x) => x.used > 0);
    return (live.length ? live : scored).map((x) => x.dir);
  };

  // Alleen tick. zelf mag instellingen wijzigen: eigen header (dwingt een CORS-preflight af) en geen vreemde Origin
  const guard = (req) => {
    const o = req.headers.origin;
    if (o && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return false;
    return req.headers['x-tick'] === '1';
  };

  app.get('/api/mcp/info', (req, res) => {
    if (!guard(req)) return res.status(403).json({ error: 'forbidden' });
    res.json({
      enabled: state.enabled,
      token: state.token,
      port: state.port,
      url: `${base()}/api/mcp`,
      stdio: clientConfig(),
      bundle: fss.existsSync(path.join(ROOT, 'server', 'ai', 'tick-ai.bundle.mjs')),
      claudeFound: claudeConfigPaths().length > 0,
      claudeTargets: claudeConfigPaths().map((d) => path.join(d, 'claude_desktop_config.json')),
      tools: TOOLS.map((t) => ({ name: t.name, title: t.title })),
    });
  });
  app.post('/api/mcp/config', async (req, res) => {
    if (!guard(req)) return res.status(403).json({ error: 'forbidden' });
    if (typeof req.body?.enabled === 'boolean') state.enabled = req.body.enabled;
    if (req.body?.newToken) state.token = crypto.randomBytes(24).toString('base64url');
    await save();
    res.json({ ok: true, enabled: state.enabled, token: state.token });
  });
  app.post('/api/mcp/install/claude', async (req, res) => {
    if (!guard(req)) return res.status(403).json({ error: 'forbidden' });
    let files;
    if (req.body?.file) {
      const f = path.resolve(String(req.body.file).trim().replace(/^"|"$/g, ''));
      if (path.basename(f).toLowerCase() !== 'claude_desktop_config.json') return res.status(400).json({ error: 'Kies het bestand claude_desktop_config.json.' });
      if (!fss.existsSync(path.dirname(f))) return res.status(400).json({ error: 'Die map bestaat niet.' });
      files = [f];
    } else {
      files = claudeConfigPaths().map((d) => path.join(d, 'claude_desktop_config.json'));
    }
    if (!files.length) return res.status(404).json({ error: 'Claude Desktop niet gevonden op deze pc. Kies het configbestand zelf of gebruik de handmatige configuratie.' });
    const written = [];
    for (const file of files) {
      let cfg = {};
      try {
        const txt = await fs.readFile(file, 'utf8');
        cfg = txt.trim() ? JSON.parse(txt) : {};
        await fs.writeFile(file + '.voor-tick.bak', txt, 'utf8');
      } catch (e) {
        if (e.code !== 'ENOENT') return res.status(500).json({ error: `Kon ${file} niet lezen (${e.message}). Er is niets aangepast.` });
      }
      cfg.mcpServers = { ...(cfg.mcpServers || {}), tick: clientConfig() };
      await fs.writeFile(file, JSON.stringify(cfg, null, 2), 'utf8');
      written.push(file);
    }
    if (!state.enabled) { state.enabled = true; await save(); }
    res.json({ ok: true, written });
  });

  // ---------- MCP zelf (Streamable HTTP, alleen JSON-antwoorden) ----------
  const authed = (req) => {
    const h = String(req.headers.authorization || '');
    const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
    const want = Buffer.from(state.token || '');
    return got.length === want.length && want.length > 0 && crypto.timingSafeEqual(got, want);
  };
  app.all('/api/mcp', async (req, res) => {
    const o = req.headers.origin;
    if (o && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return res.status(403).json({ error: 'forbidden' });
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').end();
    if (!state.enabled) return res.status(403).json(rpcErr(null, -32001, 'De AI-koppeling staat uit. Zet hem aan in tick. → Instellingen → AI-koppeling.'));
    if (!authed(req)) return res.status(401).json(rpcErr(null, -32001, 'Ongeldige of ontbrekende sleutel voor tick.'));
    const msgs = Array.isArray(req.body) ? req.body : [req.body];
    const out = (await Promise.all(msgs.map((m) => handle(m)))).filter(Boolean);
    if (!out.length) return res.status(202).end();
    res.json(Array.isArray(req.body) ? out : out[0]);
  });

  const rpcOk = (id, result) => ({ jsonrpc: '2.0', id, result });
  function rpcErr(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

  async function handle(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcErr(msg?.id ?? null, -32600, 'Invalid request');
    const { id, method, params } = msg;
    if (id === undefined || id === null) return null; // notificatie
    switch (method) {
      case 'initialize': {
        const want = params?.protocolVersion;
        return rpcOk(id, {
          protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'tick', title: 'tick. – RuneScape cockpit', version },
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping': return rpcOk(id, {});
      case 'tools/list': return rpcOk(id, { tools: TOOLS.map(({ run, ...t }) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: true, ...(t.annotations || {}) } })) });
      case 'resources/list': return rpcOk(id, { resources: [] });
      case 'prompts/list': return rpcOk(id, { prompts: [] });
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === params?.name);
        if (!tool) return rpcErr(id, -32602, `Unknown tool: ${params?.name}`);
        try {
          const result = await tool.run(params.arguments || {});
          const text = typeof result === 'string' ? result : JSON.stringify(result, null, 1);
          return rpcOk(id, { content: [{ type: 'text', text }] });
        } catch (e) {
          return rpcOk(id, { content: [{ type: 'text', text: `Error: ${e.message || e}` }], isError: true });
        }
      }
      default: return rpcErr(id, -32601, `Method not found: ${method}`);
    }
  }

  // ---------- gereedschap ----------
  const settings = async () => (await local('/api/store/settings')) || {};
  const gameOf = async (a) => (a.game === 'osrs' || a.game === 'rs3' ? a.game : (await settings()).game === 'rs3' ? 'rs3' : 'osrs');
  const playerOf = async (game) => {
    const s = await settings();
    const rsn = s[`${game}Name`];
    if (!rsn) throw new Error(`Er is in tick. geen ${game.toUpperCase()}-naam (RSN) ingesteld. Vraag de gebruiker die in te stellen bij tick. → Instellingen.`);
    return { rsn, player: await local(`/api/${game}/player/${encodeURIComponent(rsn)}`) };
  };
  const clampInt = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);

  const TOOLS = [
    {
      name: 'get_account',
      title: 'Account overview',
      description: "The user's RuneScape account as known to tick.: name, combat and total level, every skill's level and XP, quest progress (completed/started/not started), ironman status and (OSRS) achievement diary progress. Call this first to know who you are helping.",
      inputSchema: { type: 'object', properties: { game: GAME_ENUM }, additionalProperties: false },
      async run(a) {
        const game = await gameOf(a);
        const { rsn, player } = await playerOf(game);
        const skills = Object.fromEntries((player.skills || []).map((s) => [s.name, s.xp != null ? { level: s.level, xp: s.xp } : { level: s.level }]));
        const q = Object.values(player.quests || {});
        const lv = Object.fromEntries((player.skills || []).map((s) => [s.name, s.level]));
        let combat = player.combat ?? null;
        let questPoints;
        try {
          const A = await loadAi();
          if (combat == null) combat = A.combatOf(game, lv);
        } catch { /* bundel optioneel */ }
        const s = await settings();
        const diaries = player.diaries ? Object.fromEntries(Object.entries(player.diaries).map(([r, t]) => [r, Object.fromEntries(Object.entries(t).map(([tier, v]) => [tier, v.complete ? 'complete' : `${(v.tasks || []).filter(Boolean).length}/${(v.tasks || []).length}`]))])) : undefined;
        return {
          game, rsn, combatLevel: combat, totalLevel: player.total?.level ?? null, totalXp: player.total?.xp ?? null,
          ironman: s.acct?.[game]?.iron ?? player.ironman ?? null,
          skills,
          quests: player.quests ? { completed: q.filter((x) => x === 'done').length, started: q.filter((x) => x === 'started').length, notStarted: q.filter((x) => x === 'none').length, source: player.questSource } : 'unknown (WikiSync not set up)',
          questPoints,
          achievementDiaries: diaries,
          activities: (player.activities || []).slice(0, 20),
          dataSources: player.sources, syncedAt: player.syncedAt || null,
        };
      },
    },
    {
      name: 'list_quests',
      title: 'Quest list by status',
      description: "Names of the user's quests filtered by status, from WikiSync. Use status 'not_started' to find quests the user can still do, then read_wiki_page for requirements.",
      inputSchema: { type: 'object', properties: { game: GAME_ENUM, status: { type: 'string', enum: ['done', 'started', 'not_started', 'all'], default: 'started' } }, additionalProperties: false },
      async run(a) {
        const game = await gameOf(a);
        const { player } = await playerOf(game);
        if (!player.quests) throw new Error('Geen questdata: WikiSync is niet ingesteld voor dit account.');
        const want = { done: 'done', started: 'started', not_started: 'none' }[a.status || 'started'];
        const list = Object.entries(player.quests).filter(([, v]) => !want || v === want).map(([k, v]) => (want ? k : `${k}: ${v === 'none' ? 'not started' : v}`));
        return { game, status: a.status || 'started', count: list.length, quests: list };
      },
    },
    {
      name: 'search_wiki',
      title: 'Search the RuneScape Wiki',
      description: 'Search the official OSRS or RS3 wiki and get matching page titles. Use read_wiki_page to read one.',
      inputSchema: { type: 'object', properties: { game: GAME_ENUM, query: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 } }, required: ['query'], additionalProperties: false },
      async run(a) {
        const game = await gameOf(a);
        const r = await local(`/api/${game}/wiki?${new URLSearchParams({ action: 'query', list: 'search', srsearch: String(a.query).slice(0, 200), srlimit: String(clampInt(a.limit, 1, 20, 8)), srnamespace: '0' })}`);
        return { game, results: (r?.query?.search || []).map((x) => ({ title: x.title, snippet: String(x.snippet || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').slice(0, 200) })) };
      },
    },
    {
      name: 'read_wiki_page',
      title: 'Read a wiki page',
      description: 'Read a page from the OSRS or RS3 wiki as wikitext (templates included; infobox parameters are readable). Optionally pass a section name or number to read only that part of long pages. Prefer this over your own memory for game facts.',
      inputSchema: { type: 'object', properties: { game: GAME_ENUM, title: { type: 'string', minLength: 1 }, section: { type: ['string', 'integer'], description: 'Section heading or index (0 = intro).' }, max_chars: { type: 'integer', minimum: 1000, maximum: 60000, default: 15000 } }, required: ['title'], additionalProperties: false },
      async run(a) {
        const game = await gameOf(a);
        const title = String(a.title).slice(0, 250);
        const meta = await local(`/api/${game}/wiki?${new URLSearchParams({ action: 'parse', page: title, prop: 'sections', redirects: '1' })}`);
        if (meta?.error) throw new Error(meta.error.info || 'Pagina niet gevonden');
        const sections = (meta?.parse?.sections || []).map((s) => ({ index: s.index, name: String(s.line).replace(/<[^>]+>/g, '') }));
        let sec;
        if (a.section !== undefined && a.section !== null && a.section !== '') {
          if (/^\d+$/.test(String(a.section))) sec = String(a.section);
          else {
            const hit = sections.find((s) => s.name.toLowerCase() === String(a.section).toLowerCase()) || sections.find((s) => s.name.toLowerCase().includes(String(a.section).toLowerCase()));
            if (!hit) throw new Error(`Sectie "${a.section}" niet gevonden. Beschikbaar: ${sections.map((s) => s.name).join(', ')}`);
            sec = hit.index;
          }
        }
        const p = await local(`/api/${game}/wiki?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', ...(sec !== undefined ? { section: sec } : {}) })}`);
        if (p?.error) throw new Error(p.error.info || 'Pagina niet gevonden');
        const max = clampInt(a.max_chars, 1000, 60000, 15000);
        const wt = String(p?.parse?.wikitext || '');
        const cfgBase = game === 'osrs' ? 'https://oldschool.runescape.wiki' : 'https://runescape.wiki';
        return {
          title: p?.parse?.title || title,
          url: `${cfgBase}/w/${encodeURIComponent((p?.parse?.title || title).replace(/ /g, '_'))}`,
          section: sec,
          truncated: wt.length > max,
          sections: sec === undefined ? sections.map((s) => `${s.index}: ${s.name}`) : undefined,
          wikitext: wt.slice(0, max),
          license: 'Content from the RuneScape Wiki, CC BY-NC-SA 3.0',
        };
      },
    },
    {
      name: 'get_ge_prices',
      title: 'Grand Exchange prices',
      description: 'Live Grand Exchange prices (RuneScape Wiki real-time prices) for up to 25 items by name: instant buy/sell, GE tax, margin after tax, buy limit, hourly volume and the realistic profit per buy-limit window. Item names are resolved via the wiki (e.g. "Rune bar" → Runite bar); items without a GE price are reported as most likely untradeable. Compare flips by maxProfitPerBuyLimit, not by ROI.',
      inputSchema: { type: 'object', properties: { game: GAME_ENUM, items: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 25 } }, required: ['items'], additionalProperties: false },
      async run(a) {
        const game = await gameOf(a);
        const A = await loadAi();
        return { game, ...(await A.gePrices(game, (a.items || []).map(String))) };
      },
    },
    {
      name: 'money_making_for_me',
      title: 'Money-making methods for this account',
      description: "Money-making methods from the wiki's money making guide that this account can actually do, judged against the user's levels and quests (same logic as tick.'s Money-making page). The first call can take 20+ seconds.",
      inputSchema: { type: 'object', properties: { game: GAME_ENUM, members: { type: 'boolean', description: 'Only members (true) or free-to-play (false) methods.' }, limit: { type: 'integer', minimum: 1, maximum: 30, default: 10 } }, additionalProperties: false },
      async run(a) {
        const game = await gameOf(a);
        const { player } = await playerOf(game);
        const A = await loadAi();
        return { game, ...(await A.moneyMaking(game, player, { members: typeof a.members === 'boolean' ? a.members : null, limit: clampInt(a.limit, 1, 30, 10) })) };
      },
    },
    {
      name: 'diary_tasks',
      title: 'Achievement diary tasks (OSRS)',
      description: "Old School achievement diary tasks judged against the user's account: 'ready' = doable now, 'near' = a few (boostable) levels short, 'all_open' = everything not done yet. Includes per-region tier progress.",
      inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['ready', 'near', 'all_open'], default: 'ready' }, region: { type: 'string', description: 'Optional region, e.g. "Varrock" or "Kandarin".' }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 } }, additionalProperties: false },
      async run(a) {
        const { player } = await playerOf('osrs');
        const A = await loadAi();
        return A.diaryTasks('osrs', player, { status: a.status || 'ready', region: a.region || null, limit: clampInt(a.limit, 1, 100, 25) });
      },
    },
    {
      name: 'pathway_next',
      title: 'Next steps in the progression guide',
      description: "Where the user is in a step-by-step progression guide from the wiki (RS3: Efficient Ironman Pathway Guide; OSRS: BRUHsailer or the Oziris route), and the next steps with what's still missing. Same as tick.'s Stappenplan page, including steps the user ticked off manually.",
      inputSchema: { type: 'object', properties: { game: GAME_ENUM, guide: { type: 'string', description: 'Guide id, e.g. "rs3-eipg", "osrs-bruhsailer", "osrs-oziris". Defaults to the guide chosen in tick.' }, count: { type: 'integer', minimum: 1, maximum: 15, default: 5 } }, additionalProperties: false },
      async run(a) {
        const game = await gameOf(a);
        const { player } = await playerOf(game);
        const A = await loadAi();
        return { game, ...(await A.pathwayNext(game, player, { guide: a.guide || null, count: clampInt(a.count, 1, 15, 5) })) };
      },
    },
    {
      name: 'get_tick_data',
      title: "The user's own tick. data",
      description: "Data the user keeps in tick.: 'goals' (their goals), 'watchlist' (GE items they follow), 'flips' (their GE flip journal), 'sessions' (play session history with XP gained).",
      inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['goals', 'watchlist', 'flips', 'sessions'] } }, required: ['kind'], additionalProperties: false },
      async run(a) {
        const key = { goals: 'goals', watchlist: 'watchlist', flips: 'journal', sessions: 'sessions' }[a.kind];
        if (!key) throw new Error('Onbekend soort data');
        let data = await local(`/api/store/${key}`);
        if (key === 'sessions' && data?.history) data = { active: data.active ? { since: new Date(data.active.start).toISOString(), game: data.active.game } : null, history: data.history.slice(-20) };
        if (key === 'journal' && Array.isArray(data)) data = data.slice(-100);
        return { kind: a.kind, data: data ?? null };
      },
    },
  ];

  const INSTRUCTIONS = [
    "tick. is the user's personal, local RuneScape cockpit for Old School RuneScape (osrs) and RuneScape 3 (rs3).",
    'Start with get_account to see the account (levels, quests). Base game facts on read_wiki_page/search_wiki instead of memory, and cite the wiki page.',
    'For "what should I do" questions combine pathway_next, money_making_for_me and (OSRS) diary_tasks with the account data.',
    'Everything is read-only. The user writes Dutch; answer in the language they use.',
  ].join(' ');

  return {
    async onListen(port) {
      state.port = port;
      globalThis.__TICK_BASE = base();
      await save().catch(() => {});
    },
  };
}
