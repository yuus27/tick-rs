import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { loadAllDiaries, judgeDiaries, TIERS } from '../lib/diaries.js';
import { questList, myQuestPoints } from '../lib/wiki.js';
import { osrsCombat } from '../lib/xp.js';
import { Icon, PageHead, Skel, SkillIcon, Empty, ErrorBox, Bar, delay } from '../components/ui.jsx';

const TIER_CLS = { Easy: 'ok', Medium: 'acc', Hard: 'no', Elite: '' };

function TaskRow({ t, showRegion }) {
  const st = { done: ['check', 'var(--up)'], ready: ['spark', 'var(--acc)'], near: ['route', 'var(--blue)'], locked: ['lock', 'var(--dim)'] }[t.status];
  return (
    <div className="list-row" style={{ alignItems: 'flex-start', gap: 10, padding: '9px 8px', opacity: t.status === 'done' ? 0.55 : 1 }}>
      <Icon name={st[0]} size={15} style={{ color: st[1], marginTop: 3 }} />
      <div className="grow col" style={{ gap: 4, minWidth: 0 }}>
        <span className="small" style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{showRegion && <b>{t.region} · {t.tier}: </b>}{t.text}</span>
        <div className="row wrap" style={{ gap: 5 }}>
          {t.req.skills.map((s) => { const miss = t.missSk.find((m) => m.skill === s.skill); return <span key={s.skill} className={`tag ${t.status === 'done' ? '' : miss ? 'no' : 'ok'}`} title={s.boostable ? 'Boostable' : undefined}><SkillIcon skill={s.skill} size={12} /> {miss ? `${miss.cur}/` : ''}{s.level}{s.boostable ? '*' : ''}</span>; })}
          {t.req.quests.map((q) => <a key={q.title} href={`#/quests/${encodeURIComponent(q.title)}`} className={`tag ${t.status === 'done' ? '' : t.missQ.includes(q.title) ? 'no' : 'ok'}`}>{q.partial ? 'Gestart: ' : ''}{q.title}</a>)}
          {t.req.qp && <span className={`tag ${t.missQp ? 'no' : 'ok'}`}>{t.req.qp} QP</span>}
          {t.req.combat && <span className={`tag ${t.missCb ? 'no' : 'ok'}`}>Combat {t.req.combat}</span>}
        </div>
      </div>
    </div>
  );
}

export default function Diaries() {
  const { game, cfg, player, levels, questMap, rsn } = useApp();
  const data = useAsync(() => (game === 'osrs' ? loadAllDiaries(game) : Promise.resolve([])), [game]);
  const list = useAsync(() => questList(game), [game]);
  const [open, setOpen] = useState(null);
  const [tierF, setTierF] = useState('all');
  const progress = player.data?.diaries || null;
  const judged = useMemo(() => judgeDiaries(data.data, progress, levels, questMap, myQuestPoints(list.data, questMap), Object.keys(levels).length ? osrsCombat(levels) : null), [data.data, progress, levels, questMap, list.data]);
  const all = judged.flatMap((r) => TIERS.flatMap((t) => r.tiers[t]));
  const ready = all.filter((t) => t.status === 'ready' && (tierF === 'all' || t.tier === tierF));
  const near = all.filter((t) => t.status === 'near' && (tierF === 'all' || t.tier === tierF)).sort((a, b) => a.gap - b.gap);
  // Welke tier is het dichtst bij compleet (de beloning is per tier)
  const closest = judged.flatMap((r) => TIERS.map((t) => ({ region: r.region, tier: t, ...r.counts[t], left: r.tiers[t].filter((x) => x.status !== 'done'), readyLeft: r.tiers[t].filter((x) => x.status === 'ready').length })))
    .filter((x) => !x.complete && x.left.length && x.left.length === x.readyLeft).sort((a, b) => a.left.length - b.left.length).slice(0, 4);

  if (game !== 'osrs') return (
    <div className="page"><PageHead title="Achievement diaries" sub="Diaries bestaan alleen in Old School. Schakel linksboven naar OSRS." /><Empty icon="book" title="Alleen voor OSRS">RS3 heeft achievements in plaats van diaries; die volgen later.</Empty></div>
  );

  return (
    <div className="page">
      <PageHead eyebrow={<><span className="dot live" /><span>Old School · voortgang via WikiSync</span></>} title="Achievement diaries" sub="Welke diary-taken je nu al kunt doen, wat je net mist, en welke tier je als eerste afrondt." />
      {!rsn && <div className="card accent row wrap between"><span>Stel je RSN in om je eigen voortgang te zien.</span><a className="btn primary sm" href="#/settings">RSN instellen</a></div>}
      {rsn && player.data && !progress && <div className="card accent">Geen diary-voortgang ontvangen. Installeer de <b>WikiSync</b>-plugin in RuneLite en log één keer in; tot die tijd ziet tick. alle taken als open.</div>}
      {data.error && <div className="card"><ErrorBox error={data.error} onRetry={data.reload} /></div>}
      {data.loading && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>{Array.from({ length: 6 }).map((_, i) => <Skel key={i} h={120} />)}</div>}

      {!!judged.length && (
        <>
          <section className="row wrap" style={{ gap: 12 }}>
            <div className="card col rise" style={{ flex: '1 1 200px', gap: 4 }}><span className="small muted">Nu te doen</span><span className="num acc" style={{ fontSize: 30 }}>{all.filter((t) => t.status === 'ready').length}</span><span className="small dim">taken waarvoor je alles hebt</span></div>
            <div className="card col rise" style={{ flex: '1 1 200px', gap: 4, animationDelay: '.05s' }}><span className="small muted">Bijna</span><span className="num" style={{ fontSize: 30, color: 'var(--blue)' }}>{all.filter((t) => t.status === 'near').length}</span><span className="small dim">hooguit een paar levels weg</span></div>
            <div className="card col rise" style={{ flex: '1 1 200px', gap: 4, animationDelay: '.1s' }}><span className="small muted">Voltooid</span><span className="num up" style={{ fontSize: 30 }}>{all.filter((t) => t.status === 'done').length}<span className="muted" style={{ fontSize: 15 }}> / {all.length}</span></span><span className="small dim">{judged.reduce((a, r) => a + TIERS.filter((t) => r.counts[t].complete).length, 0)} tiers compleet</span></div>
          </section>

          {closest.length > 0 && (
            <section className="card accent col rise" style={{ gap: 10 }}>
              <h3 className="h">Tier binnen handbereik</h3>
              <span className="small muted">Voor deze tiers heb je alle eisen al; je moet alleen de taken nog doen. De beloning (bijvoorbeeld de diary-cape of -schoenen) krijg je per tier.</span>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
                {closest.map((c) => <button key={c.region + c.tier} className="card col" style={{ gap: 4, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen(c.region)}><span style={{ fontWeight: 600 }}>{c.region} · {c.tier}</span><span className="small muted">nog {c.left.length} taak{c.left.length === 1 ? '' : 'en'}</span><Bar value={c.done / c.total} /></button>)}
              </div>
            </section>
          )}

          <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14, alignItems: 'start' }}>
            <div className="card col rise" style={{ gap: 4 }}>
              <div className="row between wrap" style={{ marginBottom: 6, gap: 8 }}><h3 className="h">Nu te doen</h3><div className="seg">{['all', ...TIERS].map((t) => <button key={t} className={tierF === t ? 'on' : ''} onClick={() => setTierF(t)}>{t === 'all' ? 'Alle' : t}</button>)}</div></div>
              {!ready.length && <span className="small muted">Geen taken waarvoor je alles hebt in deze selectie.</span>}
              {ready.slice(0, 25).map((t) => <TaskRow key={t.region + t.tier + t.idx} t={t} showRegion />)}
            </div>
            <div className="card col rise" style={{ gap: 4, animationDelay: '.05s' }}>
              <h3 className="h" style={{ marginBottom: 6 }}>Bijna: een paar levels te gaan</h3>
              {!near.length && <span className="small muted">Niets in de buurt.</span>}
              {near.slice(0, 25).map((t) => <TaskRow key={t.region + t.tier + t.idx} t={t} showRegion />)}
            </div>
          </section>

          <section className="col" style={{ gap: 10 }}>
            <h2 className="h">Per regio</h2>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
              {judged.map((r, i) => (
                <button key={r.region} className={`card col rise ${open === r.region ? 'accent' : ''}`} style={{ gap: 8, textAlign: 'left', cursor: 'pointer', ...delay(i, 0, 0.03) }} onClick={() => setOpen(open === r.region ? null : r.region)}>
                  <span style={{ fontWeight: 600 }}>{r.region}</span>
                  {TIERS.map((t) => (
                    <div key={t} className="row" style={{ gap: 8 }}>
                      <span className={`tag ${r.counts[t].complete ? 'ok' : TIER_CLS[t]}`} style={{ width: 64, justifyContent: 'center' }}>{t}</span>
                      <div className="grow"><Bar value={r.counts[t].total ? r.counts[t].done / r.counts[t].total : 0} /></div>
                      <span className="mono small dim" style={{ width: 44, textAlign: 'right' }}>{r.counts[t].done}/{r.counts[t].total}</span>
                    </div>
                  ))}
                </button>
              ))}
            </div>
            {open && (() => { const r = judged.find((x) => x.region === open); return r && (
              <div className="card col rise" style={{ gap: 12 }}>
                <div className="row between"><h3 className="h">{r.region} Diary</h3><a className="btn sm" href={`#/wiki/${encodeURIComponent(r.title)}`}>Op de wiki <Icon name="arrow" size={13} /></a></div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 12, alignItems: 'start' }}>
                  {TIERS.map((t) => <div key={t} className="col" style={{ gap: 2 }}><span className={`tag ${TIER_CLS[t]}`} style={{ alignSelf: 'flex-start', marginBottom: 4 }}>{t} · {r.counts[t].done}/{r.counts[t].total}</span>{r.tiers[t].map((x) => <TaskRow key={x.idx} t={x} />)}</div>)}
                </div>
              </div>
            ); })()}
          </section>
          <span className="small dim">* boostable · Taken en eisen van de OSRS Wiki; voortgang van WikiSync.</span>
        </>
      )}
    </div>
  );
}
