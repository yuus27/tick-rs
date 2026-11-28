import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useApp } from '../lib/store.jsx';
import { wikiFile } from '../lib/theme.js';
import { Icon } from './ui.jsx';

// RuneScape-muziek, rechtstreeks van de wiki gestreamd (niet meegeleverd: de muziek is van Jagex).
// Standaard uit; aan/uit en volume worden onthouden in je instellingen.
export const TRACKS = {
  osrs: ['Harmony', 'Newbie Melody', 'Autumn Voyage', 'Adventure', 'Flute Salad', 'Scape Main', 'Garden', 'Medieval', 'Fanfare', 'Spirit', 'Wonder', 'Expanse', 'Still Night', 'Yesteryear', 'Workshop', 'Dream', 'Arabian', 'Venture', 'Sea Shanty 2', 'Scape Original'],
  rs3: ['Harmony', 'Newbie Melody', 'Autumn Voyage', 'Adventure', 'Scape Main', 'Garden', 'Medieval', 'Fanfare', 'Spirit', 'Wonder', 'Expanse', 'Still Night', 'Yesteryear', 'Workshop', 'Dream', 'Arabian', 'Venture', 'Scape Original'],
};
// Een paar pagina's hebben hun eigen nummer, zoals gebieden in de game
const PAGE_TRACK = { ge: 'The Trade Parade', market: 'The Trade Parade', quests: 'Quest', wiki: 'Book of Spells', map: 'Harmony', diaries: 'Adventure' };
const JINGLE = { osrs: 'Level_up_fireworks.ogg', rs3: 'Level_up.ogg' };

const audio = typeof Audio !== 'undefined' ? new Audio() : null;
if (audio) audio.preload = 'auto';
let state = { track: null, game: null, status: 'off' }; // status: off | loading | playing | blocked | error
const subs = new Set();
const set = (patch) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
const useMusicState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

let fails = 0;
let targetVol = 0.35;
let fadeT = null;
function fadeTo(v, ms = 700, done) {
  if (!audio) return;
  clearInterval(fadeT);
  const from = audio.volume;
  const t0 = performance.now();
  fadeT = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (v - from) * k));
    if (k >= 1) { clearInterval(fadeT); done?.(); }
  }, 30);
}

function pickNext(game, avoid) {
  const list = TRACKS[game] || TRACKS.osrs;
  const pool = list.filter((t) => t !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
}

async function play(game, track) {
  if (!audio) return;
  set({ track, game, status: 'loading' });
  const start = async () => {
    audio.src = wikiFile(game, `${track}.ogg`);
    audio.volume = 0;
    try {
      await audio.play();
      fails = 0;
      set({ status: 'playing' });
      fadeTo(targetVol, 900);
    } catch (e) {
      // Autoplay geblokkeerd (alleen in de browser): wacht op een klik
      if (e?.name === 'NotAllowedError') set({ status: 'blocked' });
    }
  };
  if (!audio.paused && audio.src) fadeTo(0, 500, start); else start();
}

function stop() {
  if (!audio) return;
  fadeTo(0, 400, () => audio.pause());
  set({ status: 'off' });
}

if (audio) {
  audio.addEventListener('ended', () => { if (state.status === 'playing') play(state.game, pickNext(state.game, state.track)); });
  audio.addEventListener('error', () => {
    if (state.status === 'off') return;
    fails += 1;
    if (fails >= 3) { set({ status: 'error' }); return; }
    play(state.game, pickNext(state.game, state.track));
  });
}

export function playJingle(game, settings) {
  if (typeof Audio === 'undefined' || !settings?.music?.on) return;
  const j = new Audio(wikiFile(game, JINGLE[game] || JINGLE.osrs));
  j.volume = Math.min(1, (settings.music.vol ?? 0.35) + 0.15);
  if (audio && !audio.paused) { fadeTo(targetVol * 0.25, 300); j.addEventListener('ended', () => fadeTo(targetVol, 900)); }
  j.play().catch(() => {});
}

// Stuurt de muziek aan: aan/uit, wisselen van spel en van pagina
export function MusicEngine({ section }) {
  const { settings, game } = useApp();
  const on = !!settings.music?.on;
  const pages = settings.music?.pages !== false;
  targetVol = settings.music?.vol ?? 0.35;
  const lastPage = useRef(null);

  useEffect(() => {
    if (!audio) return;
    if (!on) { if (state.status !== 'off') stop(); return; }
    const pageTrack = pages ? PAGE_TRACK[section] : null;
    const pageChanged = lastPage.current !== section;
    lastPage.current = section;
    if (state.game !== game || state.status === 'off' || state.status === 'error') { fails = 0; play(game, pageTrack || pickNext(game)); return; }
    if (pageChanged && pageTrack && pageTrack !== state.track) play(game, pageTrack);
  }, [on, game, section, pages]);

  useEffect(() => { if (audio && state.status === 'playing') fadeTo(targetVol, 250); }, [settings.music?.vol]);
  return null;
}

// Knop in de bovenbalk: muziek aan/uit, en wat er nu speelt met volgende en volume
export function MusicButton() {
  const { settings, update, game } = useApp();
  const m = useMusicState();
  const on = !!settings.music?.on;
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const setMusic = (patch) => update('settings', (s) => ({ ...s, music: { vol: 0.35, ...(s.music || {}), ...patch } }));

  useEffect(() => {
    if (!open) return;
    const c = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', c);
    return () => window.removeEventListener('mousedown', c);
  }, [open]);

  const label = m.status === 'blocked' ? 'Klik om te starten' : m.status === 'error' ? 'Muziek niet bereikbaar' : m.status === 'loading' ? 'Laden…' : m.track || '';
  return (
    <div className="music" ref={box}>
      <button className={`btn sm icon ${on ? 'primary' : ''}`} onClick={() => setMusic({ on: !on })} aria-pressed={on} aria-label={on ? 'Muziek uitzetten' : 'Muziek aanzetten'} title={on ? 'Muziek uit (mute)' : 'RuneScape-muziek aan'}>
        <Icon name={on ? 'music' : 'mute'} size={16} />
      </button>
      {on && (
        <button className="music-now" onClick={() => (m.status === 'blocked' ? play(game, m.track || pickNext(game)) : setOpen((o) => !o))} aria-expanded={open} title="Nu speelt">
          <span className={`eq ${m.status === 'playing' ? 'on' : ''}`} aria-hidden="true"><i /><i /><i /></span>
          <span className="trunc">{label}</span>
        </button>
      )}
      {open && on && (
        <div className="music-pop" role="dialog" aria-label="Muziek">
          <div className="small dim">Nu speelt · {game === 'rs3' ? 'RuneScape' : 'Old School'}</div>
          <div className="music-title">{m.track || '–'}</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm icon" onClick={() => play(game, pickNext(game, m.track))} aria-label="Ander nummer"><Icon name="next" size={14} /></button>
            <label className="row grow" style={{ gap: 8 }}>
              <span className="small dim">Volume</span>
              <input type="range" min="0" max="1" step="0.05" value={settings.music?.vol ?? 0.35} onChange={(e) => setMusic({ vol: Number(e.target.value) })} className="grow" aria-label="Volume" />
            </label>
          </div>
          <label className="row between small" style={{ cursor: 'pointer' }}>
            <span>Eigen nummer per pagina (GE, Quests, Wiki…)</span>
            <input type="checkbox" checked={settings.music?.pages !== false} onChange={(e) => setMusic({ pages: e.target.checked })} />
          </label>
          <div className="small dim">Muziek © Jagex, gestreamd van de RuneScape Wiki.</div>
        </div>
      )}
    </div>
  );
}
