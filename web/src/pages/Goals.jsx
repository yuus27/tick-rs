import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { Icon, PageHead, Ring, Bar, SkillIcon, Empty, delay, CountUp } from '../components/ui.jsx';
import { href } from '../lib/router.js';
import { nl, short } from '../lib/format.js';
import { xpFor } from '../lib/xp.js';
import { goalMax } from '../lib/games.js';
import { questStatus } from '../lib/wiki.js';

function Streak({ days = [] }) {
  const set = new Set(days);
  const cells = [];
  const today = new Date();
  for (let i = 7 * 12 - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    cells.push({ key: d.toISOString().slice(0, 10), on: set.has(d.toISOString().slice(0, 10)) });
  }
  let streak = 0;
  for (let i = cells.length - 1; i >= 0 && cells[i].on; i--) streak++;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 14 }}>
        <span className="icon-tile" style={{ width: 46, height: 46, borderRadius: 13 }}><Icon name="flame" size={22} style={{ color: 'var(--down)', animation: 'flame 1.6s ease-in-out infinite' }} /></span>
        <div className="col" style={{ gap: 1 }}>
          <span className="num" style={{ fontSize: 26 }}>{streak} {streak === 1 ? 'dag' : 'dagen'}</span>
          <span className="small muted">op rij tick. geopend · {days.length} dagen totaal</span>
        </div>
      </div>
      <div role="img" aria-label="Activiteit laatste 12 weken" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 15px)', gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 15px)', gap: 4 }}>
        {cells.map((c, i) => <span key={c.key} title={c.key} style={{ borderRadius: 4, background: c.on ? 'var(--acc)' : 'var(--s3)', opacity: c.on ? 1 : 0.7, animation: `pop .4s ${0.2 + i * 0.006}s both` }} />)}
      </div>
    </div>
  );
}

export default function Goals() {
  const { game, cfg, goals, update, player, levels, settings, toast, questMap } = useApp();
  const skills = player.data?.skills || [];
  const pq = questMap;
  const [skill, setSkill] = useState(cfg.skills[0]);
  const [lvl, setLvl] = useState(70);
  const [rate, setRate] = useState({});

  const mine = (goals || []).filter((g) => g.game === game);
  const rows = useMemo(() => mine.map((g) => {
    if (g.type === 'skill') {
      const s = skills.find((x) => x.name === g.skill);
      const start = g.startXp ?? 0;
      const target = xpFor(g.level, g.skill);
      const left = s?.xp != null ? Math.max(0, target - s.xp) : null;
      const prog = s?.xp != null ? Math.max(0, Math.min(1, (s.xp - start) / Math.max(1, target - start))) : 0;
      return { ...g, prog, left, done: left === 0, cur: s?.level };
    }
    const reqs = (g.skills || []).map((r) => ({ ...r, mine: levels[r.skill] ?? null, ok: (levels[r.skill] ?? 1) >= r.level, left: Math.max(0, xpFor(r.level, r.skill) - (skills.find((x) => x.name === r.skill)?.xp ?? 0)) }));
    const st = questStatus(pq, g.title);
    const prog = st === 'done' ? 1 : reqs.length ? reqs.filter((r) => r.ok).length / reqs.length * 0.9 : 0;
    return { ...g, reqs, prog, done: st === 'done', status: st };
  }), [mine, skills, levels, pq]);

  const add = (e) => {
    e.preventDefault();
    const s = skills.find((x) => x.name === skill);
    if (s && s.level >= lvl) { toast(`Je bent al ${s.level} ${skill}`, 'warn'); return; }
    update('goals', (g) => [...(g || []), { id: Date.now().toString(36), type: 'skill', game, skill, level: Number(lvl), startXp: s?.xp ?? 0, createdAt: Date.now() }]);
  };
  const del = (id) => update('goals', (g) => (g || []).filter((x) => x.id !== id));
  const avg = rows.length ? rows.reduce((a, r) => a + r.prog, 0) / rows.length : 0;

  // weekplan: openstaande XP per skill-doel, verdeeld over stappen
  const plan = rows.flatMap((r) => r.type === 'skill' && !r.done && r.left ? [{ key: r.id, label: `${r.skill} → ${r.level}`, skill: r.skill, xp: r.left }] : (r.reqs || []).filter((q) => !q.ok).map((q) => ({ key: r.id + q.skill, label: `${q.skill} ${q.mine ?? '?'} → ${q.level} (voor ${r.title})`, skill: q.skill, xp: q.left })));

  return (
    <div className="page">
      <PageHead eyebrow={<><span>{cfg.label}</span><span className="dim">voortgang uit hiscores &amp; {cfg.questSourceName}</span></>} title="Doelen" sub="Grote doelen, opgeknipt in stappen die je per sessie kunt afvinken" />

      <section className="row wrap" style={{ gap: 16, alignItems: 'stretch' }}>
        <div className="card accent rise col" style={{ flex: '1 1 280px', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Ring value={avg} size={170} stroke={14}><span className="num" style={{ fontSize: 40 }}>{Math.round(avg * 100)}%</span><span className="small muted">gemiddeld</span></Ring>
          <span className="muted small">{rows.filter((r) => r.done).length} van {rows.length} doelen gehaald</span>
        </div>
        <div className="card rise col" style={{ flex: '2 1 420px', animationDelay: '.06s', gap: 16 }}>
          <h2 className="h">Nieuw skill-doel</h2>
          <form onSubmit={add} className="row wrap">
            <select className="input" style={{ flex: '1 1 180px' }} value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill">{cfg.skills.map((s) => <option key={s}>{s}</option>)}</select>
            <input className="input mono" style={{ width: 110 }} type="number" min="2" max={goalMax(game, skill)} value={lvl} onChange={(e) => setLvl(Math.max(2, Math.min(goalMax(game, skill), Number(e.target.value) || 2)))} aria-label="Doel-level" />
            <button className="btn primary" type="submit"><Icon name="plus" size={16} /> Toevoegen</button>
          </form>
          <span className="small muted">Quest-doelen voeg je toe vanaf een questpagina (“Maak er een doel van”). De skill-requirements komen dan automatisch mee.</span>
          <Streak days={settings.days || []} />
        </div>
      </section>

      {!rows.length && <div className="card"><Empty icon="target" title="Nog geen doelen" action={<a className="btn sm" href={href('quests')}>Kies een quest</a>}>Begin met een skill-doel hierboven of een quest uit de optimale route.</Empty></div>}

      <section className="grid g2">
        {rows.map((r, i) => (
          <div key={r.id} className="card hover rise col" style={{ ...delay(i, 0.1, 0.05), gap: 14 }}>
            <div className="row between">
              <a className="row" style={{ gap: 12, color: 'var(--tx)' }} href={r.type === 'skill' ? href('skills', r.skill) : href('quests', r.title)}>
                <span className="icon-tile" style={{ width: 44, height: 44 }}>{r.type === 'skill' ? <SkillIcon skill={r.skill} size={26} /> : <Icon name="quest" size={20} style={{ color: 'var(--acc)' }} />}</span>
                <div className="col" style={{ gap: 1 }}>
                  <span className="num" style={{ fontSize: 18 }}>{r.type === 'skill' ? `${r.skill} ${r.level}` : r.title}</span>
                  <span className="small muted">{r.type === 'skill' ? (r.cur ? `nu level ${r.cur}` : '–') : r.status === 'done' ? 'voltooid' : r.status === 'started' ? 'bezig' : `${(r.reqs || []).filter((q) => !q.ok).length} skill-reqs open`}</span>
                </div>
              </a>
              <div className="row" style={{ gap: 6 }}>
                {r.done && <span className="tag ok">Gehaald</span>}
                <button className="btn sm icon ghost" onClick={() => del(r.id)} aria-label="Verwijder doel"><Icon name="trash" size={14} /></button>
              </div>
            </div>
            <div className="row between small"><span className="muted">{r.type === 'skill' ? (r.left != null ? `${nl(r.left)} XP te gaan` : 'stel je RSN in') : 'requirements'}</span><span className="mono acc">{Math.round(r.prog * 100)}%</span></div>
            <Bar value={r.prog} />
            {r.reqs?.length > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                {r.reqs.map((q) => <span key={q.skill} className={`tag ${q.ok ? 'ok' : 'no'}`}><SkillIcon skill={q.skill} size={13} /> {q.mine ?? '?'}/{q.level}</span>)}
              </div>
            )}
          </div>
        ))}
      </section>

      {plan.length > 0 && (
        <section className="card rise" style={{ animationDelay: '.2s' }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div className="col" style={{ gap: 2 }}><h2 className="h">Stappenplan</h2><span className="small muted">Vul je eigen XP/uur in per skill voor een tijdsschatting</span></div>
          </div>
          <div className="route">
            {plan.map((s, i) => {
              const r = Number(rate[s.skill]) || 0;
              return (
                <div key={s.key} className={`route-step ${i === 0 ? 'now' : ''} rise`} style={delay(i, 0.25, 0.05)}>
                  <div className="rail"><span className="node">{i + 1}</span><span className="line" /></div>
                  <div className="body row wrap between" style={{ gap: 12 }}>
                    <div className="col" style={{ gap: 2 }}>
                      <a className="t" href={href('skills', s.skill)} style={{ fontWeight: 600, color: 'var(--tx)' }}>{s.label}</a>
                      <span className="small muted mono">{nl(s.xp)} XP{r ? ` · ~${(s.xp / r).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur` : ''}</span>
                    </div>
                    <label className="row small muted" style={{ gap: 8 }}>XP/u<input className="input mono" style={{ width: 120, height: 34 }} type="number" placeholder="bv. 60000" value={rate[s.skill] || ''} onChange={(e) => setRate({ ...rate, [s.skill]: e.target.value })} /></label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
