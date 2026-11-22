import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { recentUpdates } from '../lib/wiki.js';
import { useMarket, buildItems } from '../lib/market.js';
import { Icon, CountUp, Ring, Bar, SkillIcon, ItemIcon, Skel, Empty, delay } from '../components/ui.jsx';
import { href, wikiHref } from '../lib/router.js';
import { nl, short, ago, greeting } from '../lib/format.js';
import { progressToNext, osrsCombat, rs3Combat, xpFor } from '../lib/xp.js';
import { SKILL_COLORS } from '../lib/games.js';

function Onboarding() {
  const { cfg, game, update, toast } = useApp();
  const [name, setName] = useState('');
  const save = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    update('settings', (s) => ({ ...s, [game === 'osrs' ? 'osrsName' : 'rs3Name']: name.trim() }));
    toast(`RSN opgeslagen voor ${cfg.short}`, 'ok');
  };
  return (
    <section className="card accent glow rise row wrap between" style={{ gap: 20, padding: 26 }}>
      <div className="col" style={{ gap: 6, flex: '1 1 340px' }}>
        <span className="eyebrow acc">Eerste keer · {cfg.label}</span>
        <h2 className="h" style={{ fontSize: 24 }}>Koppel je account</h2>
        <span className="muted">Je RSN is genoeg: tick. haalt je levels uit de hiscores en je quests uit {cfg.questSourceName}. Niets verlaat je pc behalve de opvraag zelf.</span>
      </div>
      <form onSubmit={save} className="row" style={{ flex: '1 1 320px' }}>
        <input className="input" placeholder={`Jouw ${cfg.short}-RSN`} value={name} onChange={(e) => setName(e.target.value)} maxLength={12} aria-label="RSN" />
        <button className="btn primary" type="submit">Koppelen</button>
      </form>
    </section>
  );
}

export default function Dashboard() {
  const { game, cfg, rsn, player, levels, prevVisit, goals, history, settings, questMap, manualQuests } = useApp();
  const p = player.data;
  const updates = useAsync(() => recentUpdates(game, 6), [game]);
  const m = useMarket(game);
  const items = useMemo(() => buildItems(game, m.mapping, m.latest, m.hour, settings), [game, m.mapping, m.latest, m.hour, settings]);
  const flips = useMemo(() => items.filter((i) => i.margin > 0 && i.vol >= 50 && i.age < 1800 * (game === 'osrs' ? 1 : 6) && i.roi < 40).sort((a, b) => b.profit - a.profit).slice(0, 5), [items, game]);

  const awayDays = prevVisit ? Math.floor((Date.now() - prevVisit) / 864e5) : null;
  const combat = !p ? null : game === 'osrs' ? osrsCombat(levels) : (p.combat || rs3Combat(levels));
  const qDone = p?.quests || (manualQuests && Object.keys(questMap).length) ? Object.values(questMap).filter((v) => v === 'done').length : null;
  const qTotal = p?.quests ? Object.keys(p.quests).length : null;
  const myGoals = (goals || []).filter((g) => g.game === game).slice(0, 4);
  const skills = p?.skills || [];
  const closest = [...skills].filter((s) => s.level < 99 && s.xp != null).sort((a, b) => progressToNext(b.xp, b.level) - progressToNext(a.xp, a.level)).slice(0, 3);
  const recent = (history || []).filter((h) => h.game === game).slice(0, 5);

  const kpis = [
    ['Total level', p?.total?.level, (v) => nl(v), p?.total?.rank ? `rank ${nl(p.total.rank)}` : cfg.short],
    ['Total XP', p?.total?.xp, (v) => short(v), p ? `${skills.filter((s) => s.level >= 99).length} skills op 99` : cfg.short],
    ['Combat level', combat, (v) => nl(v), 'berekend uit je stats'],
    ['Quests voltooid', qDone, (v) => nl(v), qTotal ? `van ${qTotal} · ${p.questSource}` : qDone != null ? 'handmatig bijgehouden' : 'vink ze af op Quests'],
  ];

  return (
    <div className="page">
      <header className="row wrap between rise" style={{ alignItems: 'flex-end' }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="eyebrow"><span className="dot live" /><span>Live · {cfg.label}</span>{p && <span className="dim">stats {ago(p.fetchedAt)} geleden</span>}</div>
          <h1 className="title">{greeting()}{rsn ? `, ${rsn}` : ''}</h1>
          <p className="sub">{new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} · je account in één oogopslag</p>
        </div>
        <div className="row wrap">
          <a className="btn" href={href('radar')}><Icon name="route" size={16} /> Unlock-radar</a>
          <a className="btn primary" href={href('play')}><Icon name="spark" size={16} /> Wat zal ik nu doen?</a>
        </div>
      </header>

      {!rsn && <Onboarding />}
      {rsn && player.error && <section className="card rise row wrap between"><span><b>{rsn}</b> niet gevonden in de {cfg.short}-hiscores.</span><a className="btn sm" href="#/settings">RSN aanpassen</a></section>}

      {awayDays != null && awayDays >= 2 && (
        <section className="card accent glow rise row wrap between" style={{ gap: 20, padding: 24, overflow: 'hidden' }}>
          <div className="row" style={{ gap: 18, flex: '1 1 420px', minWidth: 0 }}>
            <span className="icon-tile" style={{ width: 52, height: 52, borderRadius: 15, animation: 'float 4s ease-in-out infinite' }}><Icon name="history" size={22} style={{ color: 'var(--acc)' }} /></span>
            <div className="col" style={{ gap: 6, minWidth: 0 }}>
              <span className="eyebrow acc">Comeback-modus</span>
              <span className="num" style={{ fontSize: 22 }}>Je was {awayDays} dagen weg. Dit is er veranderd.</span>
              <div className="row wrap" style={{ gap: 8 }}>
                {(updates.data || []).filter((u) => !prevVisit || new Date(u.date).getTime() > prevVisit).slice(0, 4).map((u) => (
                  <a key={u.title} className="tag acc" href={wikiHref(u.title)}>{u.title.replace(/^Update:/, '')}</a>
                ))}
                {updates.data && !updates.data.some((u) => new Date(u.date).getTime() > prevVisit) && <span className="tag">Geen nieuwe updates gevonden</span>}
              </div>
            </div>
          </div>
          <a className="btn primary" href={href('goals')}>Hervat je doelen <Icon name="arrow" size={15} /></a>
        </section>
      )}

      <section className="grid g4">
        {kpis.map(([l, v, f, s], i) => (
          <div key={l} className="card hover rise stat" style={delay(i, 0.05, 0.06)}>
            <div className="lbl">{l}</div>
            <div className="val num">{p ? <CountUp value={v} format={f} /> : player.loading ? <Skel h={34} w="60%" /> : '–'}</div>
            <div className="small dim" style={{ marginTop: 4 }}>{s}</div>
          </div>
        ))}
      </section>

      <section className="grid g2">
        <div className="card rise col" style={{ animationDelay: '.25s' }}>
          <div className="row between">
            <h2 className="h">Beste flips nu</h2>
            <a href={href('ge')} className="small" style={{ fontWeight: 600 }}>GE-terminal →</a>
          </div>
          {!m.mapping && !m.error && <div className="col" style={{ gap: 8 }}>{[0, 1, 2, 3].map((i) => <Skel key={i} h={50} />)}</div>}
          {m.error && <span className="muted small">Prijzen niet bereikbaar.</span>}
          <div className="col" style={{ gap: 2 }}>
            {flips.map((f, i) => (
              <a key={f.id} href={href('ge') + `?item=${f.id}`} className="list-row rise" style={delay(i, 0.3, 0.06)}>
                <ItemIcon item={f} />
                <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="trunc" style={{ fontWeight: 600 }}>{f.name}</span>
                  <span className="small muted">marge na tax <span className="mono" style={{ color: 'var(--tx)' }}>{short(f.margin)}</span> · limit {f.limit ? nl(f.limit) : '?'}</span>
                </div>
                <div className="col" style={{ alignItems: 'flex-end', gap: 1 }}>
                  <span className="mono up" style={{ fontWeight: 600 }}>+{short(f.profit)}</span>
                  <span className="small dim">per 4 uur</span>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="card rise col" style={{ animationDelay: '.3s' }}>
          <div className="row between">
            <h2 className="h">Jouw doelen</h2>
            <a href={href('goals')} className="small" style={{ fontWeight: 600 }}>Alle doelen →</a>
          </div>
          {!myGoals.length && <Empty icon="target" title="Nog geen doelen" action={<a className="btn sm primary" href={href('goals')}>Doel toevoegen</a>}>Maak van een quest of skill-level een doel; tick. knipt het op in stappen.</Empty>}
          <div className="col" style={{ gap: 12 }}>
            {myGoals.map((g, i) => {
              let prog = 0, label = '';
              if (g.type === 'skill') {
                const s = skills.find((x) => x.name === g.skill);
                const start = g.startXp ?? 0;
                prog = s?.xp != null ? Math.max(0, Math.min(1, (s.xp - start) / Math.max(1, xpFor(g.level) - start))) : 0;
                label = `${g.skill} → ${g.level}`;
              } else {
                const reqs = g.skills || [];
                const ok = reqs.filter((r) => (levels[r.skill] ?? 1) >= r.level).length;
                prog = reqs.length ? ok / reqs.length : 0;
                if (Object.entries(questMap).some(([k, v]) => k.toLowerCase() === g.title.toLowerCase() && v === 'done')) prog = 1;
                label = g.title;
              }
              return (
                <a key={g.id} href={g.type === 'skill' ? href('skills', g.skill) : href('quests', g.title)} className="list-row rise" style={{ ...delay(i, 0.35, 0.06), flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <div className="row between"><span className="row" style={{ gap: 10, fontWeight: 600 }}>{g.type === 'skill' ? <SkillIcon skill={g.skill} size={18} /> : <Icon name="quest" size={16} style={{ color: 'var(--acc)' }} />}{label}</span><span className="mono small acc">{Math.round(prog * 100)}%</span></div>
                  <Bar value={prog} />
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {p && (
        <section className="card rise" style={{ animationDelay: '.35s' }}>
          <div className="row wrap between" style={{ marginBottom: 14 }}>
            <div className="col" style={{ gap: 2 }}>
              <h2 className="h">Skills</h2>
              <span className="small muted">Balk = voortgang naar volgend level · klik voor de 1–99 guide</span>
            </div>
            {closest.length > 0 && <span className="small muted">Bijna level-up: {closest.map((c) => <b key={c.name} style={{ color: 'var(--tx)' }}> {c.name}</b>)}</span>}
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {skills.map((s, i) => (
              <a key={s.name} href={href('skills', s.name)} className="skill-tile rise" style={delay(i, 0.4, 0.02)}>
                <div className="row between">
                  <span className="row" style={{ gap: 8, fontSize: 13, color: 'var(--tx2)' }}><SkillIcon skill={s.name} size={18} />{s.name}</span>
                  <span className="num" style={{ fontSize: 19, color: s.level >= 99 ? 'var(--acc)' : undefined }}>{s.level}</span>
                </div>
                <Bar value={s.level >= 99 ? 1 : progressToNext(s.xp, s.level)} color={SKILL_COLORS[s.name]} />
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="grid g2">
        <div className="card rise col" style={{ animationDelay: '.4s' }}>
          <h2 className="h">Game-updates</h2>
          {updates.loading && <div className="col" style={{ gap: 8 }}>{[0, 1, 2].map((i) => <Skel key={i} h={36} />)}</div>}
          {updates.data && !updates.data.length && <span className="muted small">Geen updates gevonden.</span>}
          <div className="col" style={{ gap: 2 }}>
            {(updates.data || []).map((u, i) => (
              <a key={u.title} className="list-row rise" style={delay(i, 0.45, 0.05)} href={wikiHref(u.title)}>
                <span className="dot" style={{ background: prevVisit && new Date(u.date).getTime() > prevVisit ? 'var(--acc)' : 'var(--dim)' }} />
                <span className="grow trunc">{u.title.replace(/^Update:/, '')}</span>
                <span className="small dim">{new Date(u.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
              </a>
            ))}
          </div>
        </div>
        <div className="card rise col" style={{ animationDelay: '.45s' }}>
          <h2 className="h">{game === 'rs3' && p?.activities?.length ? 'Recente activiteit' : p?.activities?.length ? 'Boss- & activiteit-scores' : 'Recent bekeken'}</h2>
          <div className="col" style={{ gap: 2 }}>
            {game === 'rs3' && p?.activities?.length ? p.activities.slice(0, 6).map((a, i) => (
              <div key={i} className="list-row rise" style={delay(i, 0.5, 0.05)}>
                <span className="dot" style={{ background: 'var(--acc)' }} />
                <span className="grow col" style={{ gap: 1, minWidth: 0 }}><span className="trunc">{a.text}</span><span className="small dim trunc">{a.date}</span></span>
              </div>
            )) : p?.activities?.length ? [...p.activities].sort((a, b) => b.score - a.score).slice(0, 6).map((a, i) => (
              <a key={a.name} className="list-row rise" style={delay(i, 0.5, 0.05)} href={wikiHref(a.name)}>
                <Icon name="flame" size={16} style={{ color: 'var(--acc)' }} />
                <span className="grow trunc">{a.name}</span>
                <span className="mono">{nl(a.score)}</span>
              </a>
            )) : recent.length ? recent.map((h, i) => (
              <a key={h.title} className="list-row rise" style={delay(i, 0.5, 0.05)} href={h.kind === 'quest' ? href('quests', h.title) : wikiHref(h.title)}>
                <Icon name={h.kind === 'quest' ? 'quest' : 'book'} size={16} style={{ color: 'var(--mut)' }} />
                <span className="grow trunc">{h.title}</span>
                <span className="small dim">{ago(h.at)}</span>
              </a>
            )) : <span className="muted small">Nog niets. Zoek iets via de balk bovenaan (Ctrl K).</span>}
          </div>
        </div>
      </section>
    </div>
  );
}
