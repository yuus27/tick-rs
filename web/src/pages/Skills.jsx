import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { Icon, PageHead, SkillIcon, Bar, CountUp, delay, Empty } from '../components/ui.jsx';
import { href } from '../lib/router.js';
import { nl, short } from '../lib/format.js';
import { xpFor, progressToNext, MAX_XP } from '../lib/xp.js';
import { SKILL_COLORS, skillMax } from '../lib/games.js';

export default function Skills() {
  const { cfg, player, rsn, game } = useApp();
  const [sort, setSort] = useState('game');
  const by = useMemo(() => Object.fromEntries((player.data?.skills || []).map((s) => [s.name, s])), [player.data]);

  const rows = useMemo(() => {
    const r = cfg.skills.map((name, i) => {
      const s = by[name];
      const xp = s?.xp ?? null;
      const level = s?.level ?? null;
      const cap = skillMax(game, name);
      const toCap = xp != null ? Math.max(0, xpFor(cap, name) - xp) : null;
      const maxed = level != null && level >= cap;
      return { name, i, level, xp, cap, toCap, maxed, prog: xp != null ? progressToNext(xp, level, name, cap) : maxed ? 1 : 0, f2p: cfg.f2p.includes(name) };
    });
    if (sort === 'low') r.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    if (sort === 'close') r.sort((a, b) => (b.prog || 0) - (a.prog || 0));
    return r;
  }, [cfg, by, sort, game]);

  const maxed = rows.filter((r) => r.maxed).length;
  const remaining = rows.reduce((a, r) => a + (r.toCap || 0), 0);
  const capLabel = game === 'rs3' ? 'max' : '99';

  return (
    <div className="page">
      <PageHead
        eyebrow={<><span>{cfg.label}</span><span className="tag">F2P · P2P · Ironman · Questing</span></>}
        title="Skill guides"
        sub={`Voor elke skill de route naar ${game === 'rs3' ? '99, 110 of 120' : '99'} van de wiki, in meerdere varianten, afgezet tegen jouw level`}
        right={<div className="seg">{[['game', 'Standaard'], ['low', 'Laagste eerst'], ['close', 'Bijna level-up']].map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div>}
      />

      {!rsn && <div className="card accent rise row wrap between"><span>Vul je RSN in om je levels en voortgang te zien.</span><a className="btn primary sm" href="#/settings">Naar instellingen</a></div>}

      {player.data && (
        <section className="grid g4">
          <div className="card rise stat"><div className="lbl">Total level</div><div className="val num"><CountUp value={player.data.total?.level} /></div></div>
          <div className="card rise stat" style={delay(1, 0, 0.06)}><div className="lbl">Total XP</div><div className="val num"><CountUp value={player.data.total?.xp} format={(v) => short(v)} /></div></div>
          <div className="card rise stat" style={delay(2, 0, 0.06)}><div className="lbl">Skills op {capLabel}</div><div className="val num"><CountUp value={maxed} /> <span className="muted" style={{ fontSize: 18 }}>/ {cfg.skills.length}</span></div></div>
          <div className="card rise stat" style={delay(3, 0, 0.06)}><div className="lbl">XP tot all-{capLabel}</div><div className="val num"><CountUp value={remaining} format={(v) => short(v)} /></div></div>
        </section>
      )}

      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
        {rows.map((r, i) => (
          <a key={r.name} href={href('skills', r.name)} className="card hover rise" style={{ ...delay(i, 0.05, 0.02), padding: 16, color: 'var(--tx)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="row" style={{ gap: 12 }}>
              <span className="icon-tile" style={{ width: 42, height: 42, borderColor: `color-mix(in srgb, ${SKILL_COLORS[r.name] || '#888'} 40%, var(--line2))` }}><SkillIcon skill={r.name} size={26} /></span>
              <div className="grow col" style={{ gap: 1, minWidth: 0 }}>
                <span className="trunc" style={{ fontWeight: 600 }}>{r.name}</span>
                <span className="small muted">{r.xp != null ? `${short(r.xp)} XP` : '—'}{r.f2p ? ' · F2P' : ''}</span>
              </div>
              <span className="num" style={{ flex: 'none', fontSize: r.level >= 100 ? 24 : 28, color: r.maxed ? 'var(--acc)' : 'var(--tx)' }}>{r.level ?? '–'}{r.cap > 99 && <span className="dim" style={{ fontSize: 13 }}>/{r.cap}</span>}</span>
            </div>
            <Bar value={r.prog} color={SKILL_COLORS[r.name]} />
            <div className="row between small">
              <span className="dim">{r.maxed ? (r.xp >= MAX_XP ? '200M XP · helemaal gemaxt' : r.xp != null ? `Gemaxt · ${short(r.xp)} / 200M XP` : 'Gemaxt') : r.toCap != null ? `${short(r.toCap)} XP tot ${r.cap}` : `Bekijk de 1–${r.cap} route`}</span>
              <Icon name="arrow" size={15} style={{ color: 'var(--dim)' }} />
            </div>
          </a>
        ))}
      </section>
      {!cfg.skills.length && <Empty title="Geen skills" />}
    </div>
  );
}
