import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { GAMES } from '../lib/games.js';
import { Icon } from './ui.jsx';

// Eerste start: vraag welk spel je speelt, zodat RS3-spelers meteen in RS3 terechtkomen.
const CHOICES = [
  { id: 'osrs', title: 'Old School', short: 'OSRS', blurb: 'Het klassieke RuneScape van 2007, met RuneLite.' },
  { id: 'rs3', title: 'RuneScape 3', short: 'RS3', blurb: 'Het huidige RuneScape, met Necromancy, Invention en meer.' },
  { id: 'both', title: 'Allebei', short: 'OSRS + RS3', blurb: 'Je wisselt met één klik tussen de twee.' },
];

export default function FirstRun() {
  const { settings, update, toast } = useApp();
  const [pick, setPick] = useState(null);
  const [names, setNames] = useState({ osrs: '', rs3: '' });
  if (settings.welcomed || settings.osrsName || settings.rs3Name) return null;

  const games = pick === 'both' ? ['osrs', 'rs3'] : pick ? [pick] : [];
  const finish = (save) => {
    update('settings', (s) => ({
      ...s,
      welcomed: true,
      game: pick === 'rs3' ? 'rs3' : 'osrs',
      ...(save && names.osrs.trim() ? { osrsName: names.osrs.trim() } : {}),
      ...(save && names.rs3.trim() ? { rs3Name: names.rs3.trim() } : {}),
    }));
    if (save && (names.osrs.trim() || names.rs3.trim())) toast('Account gekoppeld. Welkom bij tick.!', 'ok');
  };

  return (
    <div className="firstrun" role="dialog" aria-modal="true" aria-labelledby="fr-title">
      <div className="firstrun-card rise">
        <span className="brand-mark" style={{ width: 46, height: 46, borderRadius: 14 }}><i /></span>
        {!pick ? (
          <>
            <h1 id="fr-title" className="title" style={{ fontSize: 32 }}>Welk RuneScape speel jij?</h1>
            <p className="sub" style={{ margin: 0 }}>tick. werkt voor allebei. Je kunt later altijd wisselen met de knop <b>OSRS / RS3</b> bovenaan.</p>
            <div className="firstrun-grid">
              {CHOICES.map((c) => (
                <button key={c.id} className={`firstrun-opt ${c.id}`} onClick={() => setPick(c.id)}>
                  <span className="firstrun-badge">{c.short}</span>
                  <b>{c.title}</b>
                  <span className="small dim">{c.blurb}</span>
                </button>
              ))}
            </div>
            <button className="btn ghost sm" onClick={() => finish(false)}>Overslaan</button>
          </>
        ) : (
          <form className="col" style={{ gap: 14, width: '100%' }} onSubmit={(e) => { e.preventDefault(); finish(true); }}>
            <h1 id="fr-title" className="title" style={{ fontSize: 30 }}>Hoe heet je in de game?</h1>
            <p className="sub" style={{ margin: 0 }}>Met je RSN haalt tick. je levels uit de hiscores en je quests uit WikiSync. Er gaat niets anders van je pc af.</p>
            {games.map((g) => (
              <label key={g} className="col" style={{ gap: 6 }}>
                <span className="small" style={{ color: GAMES[g].accent, fontWeight: 700 }}>{GAMES[g].label}</span>
                <input className="input" autoFocus={g === games[0]} maxLength={12} placeholder={`Jouw ${GAMES[g].short}-naam`} value={names[g]} onChange={(e) => setNames((n) => ({ ...n, [g]: e.target.value }))} />
              </label>
            ))}
            <div className="row wrap between">
              <button type="button" className="btn ghost sm" onClick={() => setPick(null)}><Icon name="back" size={14} /> Terug</button>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn ghost" onClick={() => finish(false)}>Later</button>
                <button type="submit" className="btn primary" disabled={!games.some((g) => names[g].trim())}>Koppelen <Icon name="arrow" size={15} /></button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
