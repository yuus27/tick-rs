import { useEffect, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { Icon } from './ui.jsx';
import { href } from '../lib/router.js';
import { initials, nl } from '../lib/format.js';
import { osrsCombat, rs3Combat } from '../lib/xp.js';

const NAV = [
  { key: '', label: 'Dashboard', icon: 'home' },
  { key: 'play', label: 'Nu spelen', icon: 'spark' },
  { key: 'path', label: 'Stappenplan', icon: 'steps', badge: 'NIEUW' },
  { key: 'radar', label: 'Unlock-radar', icon: 'route' },
  { key: 'ge', label: 'GE-terminal', icon: 'chart', badge: 'LIVE' },
  { key: 'market', label: 'Markt-radar', icon: 'bell' },
  { key: 'quests', label: 'Quests', icon: 'quest' },
  { key: 'skills', label: 'Skill guides', icon: 'skills' },
  { key: 'wiki', label: 'Wiki', icon: 'book' },
  { key: 'map', label: 'Kaart', icon: 'map' },
  { key: 'money', label: 'Money-making', icon: 'coins' },
  { key: 'diaries', label: 'Diaries', icon: 'star' },
  { key: 'goals', label: 'Doelen', icon: 'target' },
  { key: 'sessions', label: 'Sessies', icon: 'clock' },
  { key: 'tools', label: 'Calculators', icon: 'calc' },
];

export default function Sidebar({ section }) {
  const { game, setGame, cfg, rsn, player, levels } = useApp();
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 600));
  useEffect(() => {
    const t = setInterval(() => setTick(Math.floor(Date.now() / 600)), 600);
    return () => clearInterval(t);
  }, []);
  const p = player.data;
  const combat = !p ? null : game === 'osrs' ? osrsCombat(levels) : (p.combat || rs3Combat(levels));

  return (
    <aside className="side">
      <a className="brand" href={href()} aria-label="tick. home">
        <span className="brand-mark"><i /></span>
        <span className="brand-name">tick<b>.</b></span>
      </a>

      <div className="switch" role="tablist" aria-label="Game">
        <span className={`knob ${game === 'rs3' ? 'r' : ''}`} />
        <button role="tab" aria-selected={game === 'osrs'} className={game === 'osrs' ? 'on' : ''} onClick={() => setGame('osrs')}>OSRS<small>Old School</small></button>
        <button role="tab" aria-selected={game === 'rs3'} className={game === 'rs3' ? 'on' : ''} onClick={() => setGame('rs3')}>RS3<small>RuneScape</small></button>
      </div>

      <nav aria-label="Hoofdmenu">
        <div className="nav-title">Cockpit</div>
        <div className="nav-list">
          {NAV.map((n) => (
            <a key={n.key} href={'#/' + n.key} className={`nav ${section === n.key ? 'on' : ''}`} aria-current={section === n.key ? 'page' : undefined}>
              <Icon name={n.icon} size={19} />
              <span>{n.label}</span>
              {n.badge && <span className="badge tag ok" style={{ fontSize: 10, padding: '2px 7px' }}>{n.badge}</span>}
            </a>
          ))}
        </div>
      </nav>

      <div className="side-extra col" style={{ gap: 4 }}>
        <div className="nav-title">Bronnen · {cfg.short}</div>
        {[
          ['Wiki-prijzen', 'live'],
          ['Hiscores', p ? (p.sources?.hiscores || '–') : rsn ? '…' : 'geen RSN'],
          ['WikiSync', p ? (p.sources?.wikisync || '–') : '–'],
        ].map(([a, b]) => (
          <div key={a} className="row small" style={{ padding: '6px 10px', color: 'var(--tx2)' }} title={String(b)}>
            <span className={`dot ${b === 'live' || String(b).startsWith('ok') ? 'live' : ''}`} style={{ background: b === 'live' || String(b).startsWith('ok') ? 'var(--up)' : b === '…' ? 'var(--acc)' : String(b).startsWith('fout') ? 'var(--down)' : 'var(--dim)' }} />
            <span className="grow">{a}</span>
            <span className="mono dim" style={{ fontSize: 11 }}>{String(b).split(/[:(]/)[0].trim()}</span>
          </div>
        ))}
      </div>

      <div className="me">
        <div className="me-row">
          <span className="avatar">{rsn ? initials(rsn) || 'S' : '?'}</span>
          <div className="grow col" style={{ gap: 1 }}>
            <span className="trunc" style={{ fontWeight: 600 }}>{rsn || 'Geen RSN'}</span>
            <span className="small muted trunc">
              {p ? `Combat ${combat ?? '–'} · Total ${nl(p.total?.level)}` : rsn ? (player.loading ? 'Laden…' : 'Niet gevonden') : 'Stel in bij Instellingen'}
            </span>
          </div>
          <a className={`btn sm icon ghost ${section === 'settings' ? 'on' : ''}`} href="#/settings" aria-label="Instellingen"><Icon name="gear" size={17} /></a>
        </div>
        <div className="tickrow"><span>Game tick</span><span>#{nl(tick % 1_000_000)}</span></div>
      </div>
    </aside>
  );
}
