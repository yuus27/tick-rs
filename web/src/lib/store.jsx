import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { storeGet, storePut, playerApi } from './api.js';
import { GAMES, skillMax } from './games.js';
import { levelFor } from './xp.js';

const AppCtx = createContext(null);

// Hiscores tonen soms een lager level dan de XP waard is (RS3 boven 99): leid het level dan af uit de XP,
// tot de echte max van die skill (99, 110 of 120). Zo kloppen sorteren, 'bijna level-up' en requirements overal.
export function normalizeLevels(game, d) {
  if (!d?.skills) return d;
  return { ...d, skills: d.skills.map((s) => (s.xp != null && s.level != null && s.name !== 'Overall' ? { ...s, level: Math.max(s.level, levelFor(s.xp, s.name, skillMax(game, s.name))) } : s)) };
}

const DEFAULTS = {
  settings: { game: 'osrs', osrsName: '', rs3Name: '', rs3TaxPct: 0, notify: true, lastVisit: null },
  watchlist: { osrs: [], rs3: [] },
  journal: [],
  goals: [],
  history: [],
  quests: { osrs: {}, rs3: {} },
  sessions: { active: null, history: [] },
  portfolio: { osrs: [], rs3: [] },
  pathway: {},
  paper: { osrs: { cash: 10000000, positions: [], trades: [] }, rs3: { cash: 100000000, positions: [], trades: [] } },
};

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState(DEFAULTS);
  const [prevVisit, setPrevVisit] = useState(null);
  const timers = useRef({});
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    (async () => {
      const keys = Object.keys(DEFAULTS);
      const vals = await Promise.all(keys.map((k) => storeGet(k).catch(() => null)));
      const next = { ...DEFAULTS };
      keys.forEach((k, i) => {
        if (vals[i] == null) return;
        next[k] = Array.isArray(DEFAULTS[k]) ? vals[i] : { ...DEFAULTS[k], ...vals[i] };
      });
      setPrevVisit(next.settings.lastVisit);
      const today = new Date().toISOString().slice(0, 10);
      const days = Array.from(new Set([...(next.settings.days || []), today])).sort().slice(-180);
      next.settings = { ...next.settings, lastVisit: Date.now(), days };
      setData(next);
      setReady(true);
      storePut('settings', next.settings).catch(() => {});
    })();
  }, []);

  const update = useCallback((key, fn) => {
    setData((d) => {
      const value = typeof fn === 'function' ? fn(d[key]) : fn;
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => storePut(key, value).catch(() => {}), 350);
      return { ...d, [key]: value };
    });
  }, []);

  const toast = useCallback((msg, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const game = data.settings.game in GAMES ? data.settings.game : 'osrs';
  const cfg = GAMES[game];
  const rsn = game === 'osrs' ? data.settings.osrsName : data.settings.rs3Name;

  // Speler-data per game
  const [player, setPlayer] = useState({ data: null, error: null, loading: false });
  const loadPlayer = useCallback(() => {
    if (!rsn) { setPlayer({ data: null, error: null, loading: false }); return; }
    setPlayer((p) => ({ ...p, loading: true, error: null }));
    playerApi(game, rsn).then(
      (d) => setPlayer({ data: normalizeLevels(game, d), error: null, loading: false }),
      (e) => setPlayer({ data: null, error: e, loading: false }),
    );
  }, [game, rsn]);
  useEffect(() => {
    if (!ready) return;
    loadPlayer();
    const t = setInterval(loadPlayer, 5 * 60_000);
    return () => clearInterval(t);
  }, [ready, loadPlayer]);

  const levels = useMemo(() => {
    const m = {};
    for (const s of player.data?.skills || []) m[s.name] = s.level;
    return m;
  }, [player.data]);

  // Questvoortgang: sync-bron (WikiSync) als die er is, anders je handmatige lijst
  const syncQuests = player.data?.quests || null;
  const manualQuests = !syncQuests;
  const questMap = syncQuests || data.quests?.[game] || {};
  const questSource = syncQuests ? player.data.questSource : 'handmatig';
  const setQuest = useCallback((title, status) => {
    update('quests', (q) => {
      const cur = { ...(q?.[game] || {}) };
      if (status && status !== 'none') cur[title] = status; else delete cur[title];
      return { ...(q || {}), [game]: cur };
    });
  }, [update, game]);
  const setQuestsBulk = useCallback((titles, status) => {
    update('quests', (q) => {
      const cur = { ...(q?.[game] || {}) };
      for (const t of titles) { if (status) cur[t] = status; else delete cur[t]; }
      return { ...(q || {}), [game]: cur };
    });
  }, [update, game]);

  const pushHistory = useCallback((entry) => {
    update('history', (h) => [{ ...entry, at: Date.now() }, ...(h || []).filter((x) => !(x.title === entry.title && x.game === entry.game))].slice(0, 40));
  }, [update]);

  const value = {
    ready, ...data, update, toast, toasts,
    game, cfg, rsn, prevVisit,
    setGame: (g) => update('settings', (s) => ({ ...s, game: g })),
    player, levels, loadPlayer, pushHistory,
    questMap, questSource, manualQuests, setQuest, setQuestsBulk,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);
