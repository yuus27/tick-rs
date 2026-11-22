import { useApp } from '../lib/store.jsx';
import { useIntel } from '../lib/intel.js';
import { Icon, PageHead, SkelRows, Empty, ErrorBox, SkillIcon, CountUp, delay } from '../components/ui.jsx';
import { href, wikiHref } from '../lib/router.js';
import { nl, short } from '../lib/format.js';
import { SKILL_COLORS } from '../lib/games.js';

export default function Radar() {
  const { cfg, game, update, goals, toast, rsn, player } = useApp();
  const it = useIntel();
  const addGoal = (r) => {
    if ((goals || []).some((g) => g.type === 'skill' && g.game === game && g.skill === r.skill && g.level === r.to)) return;
    const s = (player.data?.skills || []).find((x) => x.name === r.skill);
    update('goals', (g) => [...(g || []), { id: Date.now().toString(36), type: 'skill', game, skill: r.skill, level: r.to, startXp: s?.xp ?? 0, createdAt: Date.now() }]);
    toast(`Doel: ${r.skill} ${r.to}`, 'ok');
  };

  return (
    <div className="page">
      <PageHead
        eyebrow={<><span>{cfg.label}</span><span className="dim">quest-requirements {it.reqSource ? `via “${it.reqSource}”` : 'uit questpagina’s'} · money making guide</span></>}
        title="Unlock-radar"
        sub="Waar levert een paar levels het meeste nieuwe op? Gesorteerd op unlocks per XP."
      />

      {!rsn && <div className="card accent row wrap between"><span>Stel je RSN in, dan rekent de radar met jouw levels.</span><a className="btn primary sm" href="#/settings">Instellingen</a></div>}

      <section className="grid g3">
        {[
          ['Quests die je nu kunt doen', it.doable.length, 'skill-requirements gehaald', 'var(--up)'],
          ['Bijna (≤ 8 levels weg)', it.near.length, 'max. 2 skills te kort', 'var(--acc)'],
          ['Unlock-kansen', it.radar.length, 'skill-drempels met nieuwe content'],
        ].map(([l, v, s, c], i) => (
          <div key={l} className="card rise stat" style={delay(i, 0.04, 0.06)}>
            <div className="lbl">{l}</div>
            <div className="val num" style={{ color: c }}>{it.ready ? <CountUp value={v} /> : '–'}</div>
            <div className="small dim">{s}</div>
          </div>
        ))}
      </section>

      {it.error && <div className="card"><ErrorBox error={it.error} /></div>}
      {!it.ready && !it.error && <div className="card col" style={{ gap: 12 }}><span className="small muted">Requirements van de wiki verzamelen… (eerste keer duurt dit even)</span><SkelRows n={5} h={70} /></div>}

      {it.ready && (
        <>
          <section className="col" style={{ gap: 12 }}>
            <div className="row between"><h2 className="h">Grootste unlocks voor de minste moeite</h2><span className="small muted">alleen content waarvoor maar één skill ontbreekt</span></div>
            {!it.radar.length && <div className="card"><Empty icon="target" title="Niets in zicht">Geen enkele drempel opent op zichzelf nieuwe quests of methodes. Kijk bij “Bijna” hieronder.</Empty></div>}
            <div className="grid g2">
              {it.radar.slice(0, 10).map((r, i) => (
                <div key={r.skill + r.to} className={`card hover rise col ${i === 0 ? 'accent glow' : ''}`} style={{ ...delay(i, 0.1, 0.05), gap: 14 }}>
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div className="row" style={{ gap: 14 }}>
                      <span className="icon-tile" style={{ width: 48, height: 48, borderRadius: 14, borderColor: `color-mix(in srgb, ${SKILL_COLORS[r.skill] || '#888'} 45%, var(--line2))` }}><SkillIcon skill={r.skill} size={28} /></span>
                      <div className="col" style={{ gap: 2 }}>
                        <span className="num" style={{ fontSize: 22 }}>{r.skill} {r.cur} → {r.to}</span>
                        <span className="small muted mono">+{r.to - r.cur} level{r.to - r.cur === 1 ? '' : 's'} · {nl(r.xp)} XP</span>
                      </div>
                    </div>
                    {i === 0 && <span className="tag acc">Beste deal</span>}
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {r.nq > 0 && <span className="tag ok">{r.nq} quest{r.nq === 1 ? '' : 's'}</span>}
                    {r.nm > 0 && <span className="tag acc">{r.nm} money-methode{r.nm === 1 ? '' : 's'}</span>}
                  </div>
                  <div className="col" style={{ gap: 4 }}>
                    {r.unlocks.slice(0, 6).map((u) => (
                      <a key={u.type + u.title} href={u.type === 'quest' ? href('quests', u.title) : wikiHref(u.title)} className="list-row" style={{ padding: '7px 8px' }}>
                        <Icon name={u.type === 'quest' ? 'quest' : 'coins'} size={15} style={{ color: u.type === 'quest' ? 'var(--up)' : 'var(--acc)' }} />
                        <span className="grow trunc small" style={{ fontWeight: 600 }}>{u.type === 'quest' ? u.title : u.name}</span>
                        <span className="small dim mono">{u.type === 'money' ? `${short(u.profit)}/u` : `lvl ${u.level}`}</span>
                      </a>
                    ))}
                    {r.unlocks.length > 6 && <span className="small dim" style={{ paddingLeft: 8 }}>+{r.unlocks.length - 6} meer</span>}
                  </div>
                  <div className="row wrap">
                    <button className="btn sm primary" onClick={() => addGoal(r)}><Icon name="target" size={14} /> Maak doel</button>
                    <a className="btn sm ghost" href={href('skills', r.skill)}><Icon name="skills" size={14} /> Training-route</a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid g2">
            <div className="card rise col" style={{ animationDelay: '.2s' }}>
              <div className="row between"><h2 className="h">Kun je nu al doen</h2><span className="small muted">in volgorde van de optimale route</span></div>
              {!it.doable.length && <Empty icon="quest" title="Geen quests klaar">Kijk bij “Bijna” of in de radar hierboven.</Empty>}
              <div className="col" style={{ gap: 2 }}>
                {it.doable.slice(0, 14).map((q, i) => (
                  <a key={q.title} className="list-row rise" style={delay(i, 0.25, 0.03)} href={href('quests', q.title)}>
                    <span className="tag ok" style={{ padding: '3px 6px' }}><Icon name="check" size={12} stroke={3} /></span>
                    <span className="grow col" style={{ gap: 1, minWidth: 0 }}>
                      <span className="trunc" style={{ fontWeight: 600 }}>{q.title.replace('/', ' · ')}</span>
                      <span className="small muted">{[q.meta?.difficulty, q.meta?.length, q.meta?.qp ? `${q.meta.qp} QP` : null].filter(Boolean).join(' · ') || 'geen skill-requirements'}</span>
                    </span>
                    <Icon name="arrow" size={15} style={{ color: 'var(--dim)' }} />
                  </a>
                ))}
              </div>
              <span className="small dim">Voorwaarde-quests staan in de route al vóór deze quest; check ze op de questpagina.</span>
            </div>
            <div className="card rise col" style={{ animationDelay: '.25s' }}>
              <div className="row between"><h2 className="h">Bijna</h2><span className="small muted">een paar levels te kort</span></div>
              {!it.near.length && <Empty icon="target" title="Niets bijna">Geen quests binnen 8 levels.</Empty>}
              <div className="col" style={{ gap: 2 }}>
                {it.near.slice(0, 14).map((q, i) => (
                  <a key={q.title} className="list-row rise" style={delay(i, 0.3, 0.03)} href={href('quests', q.title)}>
                    <span className="grow col" style={{ gap: 4, minWidth: 0 }}>
                      <span className="trunc" style={{ fontWeight: 600 }}>{q.title.replace('/', ' · ')}</span>
                      <span className="row wrap" style={{ gap: 5 }}>{q.miss.map((m) => <span key={m.skill} className="tag no"><SkillIcon skill={m.skill} size={12} /> {m.cur}→{m.level}</span>)}</span>
                    </span>
                    <span className="mono small acc">+{q.miss.reduce((a, m) => a + m.level - m.cur, 0)}</span>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
