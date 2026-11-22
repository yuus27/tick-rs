import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { loadMethods } from '../lib/intel.js';
import { useJudgedMethods, lvOf, meets } from '../lib/mmg.js';
import { Icon, PageHead, SkelRows, ErrorBox, Empty, Bar, SkillIcon, delay } from '../components/ui.jsx';
import { wikiHref, href } from '../lib/router.js';
import { short } from '../lib/format.js';

const MODES = [
  ['comfort', 'Comfortabel', 'Vereiste én aanbevolen levels gehaald'],
  ['kan', 'Kan ik', 'Vereisten gehaald; hooguit een paar levels onder aanbevolen'],
  ['alle', 'Alles', 'Alle methodes, ook locked en ver onder aanbevolen'],
];
// Eén eis, ook "Attack / Ranged / Magic / Necromancy 90" (één van de vier is genoeg)
function ReqTag({ s, levels, hasLv, missCls }) {
  const ok = meets(levels, s);
  const cur = lvOf(levels, s);
  const icons = s.alts ? s.alts.map((a) => a.skill) : [s.skill];
  return (
    <span className={`tag ${hasLv ? (ok ? 'ok' : missCls) : ''}`} title={`${s.alts ? 'Eén van: ' : ''}${s.skill} ${s.level}${hasLv ? ` (jij: ${cur})` : ''}`}>
      {icons.map((n, i) => <span key={n} className="row" style={{ gap: 2 }}>{i > 0 && <span className="dim" style={{ fontSize: 10 }}>/</span>}<SkillIcon skill={n} size={13} /></span>)}
      {' '}{hasLv && !ok ? `${cur}/` : ''}{s.level}
    </span>
  );
}

const STATUS = {
  ok: { label: 'Comfortabel', cls: 'ok' },
  stretch: { label: 'Onder aanbevolen', cls: 'acc' },
  far: { label: 'Ver onder aanbevolen', cls: 'no' },
  locked: { label: 'Locked', cls: 'no' },
  unverified: { label: 'Niet gecontroleerd', cls: '' },
};

export default function Money() {
  const { game, cfg, levels, questMap, rsn } = useApp();
  const d = useAsync(() => loadMethods(game, cfg), [game]);
  const J = useJudgedMethods(game, d.data?.methods, levels, questMap, { limit: 60 });
  const [mode, setMode] = useState('comfort');
  const [cat, setCat] = useState('Alle');
  const [q, setQ] = useState('');
  const hasLv = Object.keys(levels).length > 0;

  const cats = useMemo(() => ['Alle', ...Array.from(new Set(J.judged.map((m) => m.category).filter(Boolean))).slice(0, 12)], [J.judged]);
  const pass = (m) => mode === 'alle' || (mode === 'comfort' ? m.status === 'ok' : m.status === 'ok' || m.status === 'stretch' || (m.status === 'unverified' && m.missReq.length === 0));
  const list = useMemo(() => J.judged
    .filter((m) => cat === 'Alle' || m.category === cat)
    .filter((m) => !hasLv || pass(m))
    .filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.profit - a.profit), [J.judged, cat, mode, q, hasLv]);
  const max = Math.max(1, ...list.map((m) => m.profit));
  const best = J.judged.filter((m) => m.status === 'ok').sort((a, b) => b.profit - a.profit)[0] || J.judged.filter((m) => m.status === 'stretch').sort((a, b) => a.recGap - b.recGap || b.profit - a.profit)[0];

  return (
    <div className="page">
      <PageHead
        eyebrow={<><span className="dot live" /><span>Money making guide · {cfg.short}</span><span className="dim">{J.loading ? `requirements per methode checken…` : `${J.checked} methodes gecontroleerd op vereist + aanbevolen + quests`}</span></>}
        title="Money-making"
        sub="Wat levert het meest op met jóuw stats en quests?"
        right={<div className="seg">{MODES.map(([k, l, t]) => <button key={k} title={t} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>}
      />

      {!rsn && <div className="card accent row wrap between"><span>Stel je RSN in, dan filtert tick. op jouw levels en quests.</span><a className="btn primary sm" href="#/settings">Instellingen</a></div>}

      {best && hasLv && (
        <a href={best.title ? wikiHref(best.title) : '#'} className="card accent glow rise row wrap between" style={{ color: 'var(--tx)', padding: 26, gap: 20 }}>
          <div className="row" style={{ gap: 18 }}>
            <span style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--acc)', color: 'var(--acc-ink)', display: 'grid', placeItems: 'center', fontFamily: 'var(--f-head)', fontWeight: 700, fontSize: 20, animation: 'coin 3.2s ease-in-out infinite' }}>gp</span>
            <div className="col" style={{ gap: 4 }}>
              <span className="eyebrow acc">Beste voor jou nu{best.status === 'stretch' ? ' · iets onder aanbevolen' : ''}</span>
              <span className="num" style={{ fontSize: 26 }}>{best.name}</span>
              <span className="small muted">{best.category}{best.intensity ? ` · ${best.intensity}` : ''}{best.status === 'stretch' ? ` · aanbevolen: ${best.missRec.map((s) => `${s.skill} ${s.level}`).join(', ')}${best.missRecQuests?.length ? ` · quest: ${best.missRecQuests.join(', ')}` : ''}` : ' · voldoet aan vereist én aanbevolen'}</span>
            </div>
          </div>
          <span className="num acc" style={{ fontSize: 40 }}>{short(best.profit)}<span className="muted" style={{ fontSize: 15 }}> /u</span></span>
        </a>
      )}

      <div className="row wrap between rise" style={{ animationDelay: '.1s' }}>
        <div className="row wrap" style={{ gap: 6 }}>{cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <input className="input" style={{ width: 240, height: 38 }} placeholder="Zoek methode…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Zoek methode" />
      </div>

      {d.loading && <div className="card"><SkelRows n={8} h={64} /></div>}
      {d.error && <div className="card"><ErrorBox error={d.error} onRetry={d.reload} /></div>}
      {d.data && !list.length && <div className="card"><Empty icon="coins" title="Geen methodes">{mode === 'comfort' ? 'Nog niets waarvoor je ook de aanbevolen levels hebt. Probeer “Kan ik”.' : 'Pas je filters aan.'}</Empty></div>}

      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
        {list.slice(0, 120).map((m, i) => {
          const st = STATUS[m.status];
          return (
            <a key={m.name} href={m.title ? wikiHref(m.title) : '#'} className="card hover rise col" style={{ ...delay(Math.min(i, 24), 0.1, 0.03), gap: 12, color: 'var(--tx)', opacity: m.status === 'locked' || m.status === 'far' ? 0.7 : 1 }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="col" style={{ gap: 3, minWidth: 0 }}>
                  <span className="small acc" style={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontSize: 11 }}>{m.category}</span>
                  <span className="num" style={{ fontSize: 17 }}>{m.name}</span>
                </div>
                {hasLv && <span className={`tag ${st.cls}`}>{m.status === 'locked' && <Icon name="lock" size={11} stroke={2.4} />} {st.label}</span>}
              </div>
              <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                <span className="num" style={{ fontSize: 30, color: m.profit < 0 ? 'var(--down)' : undefined }}>{short(m.profit)}</span>
                <span className="small muted">per uur</span>
                {m.intensity && <span className="tag" style={{ marginLeft: 'auto' }}>{m.intensity}</span>}
              </div>
              <Bar value={Math.max(0, m.profit) / max} color={m.status === 'locked' || m.status === 'far' ? '#3A4250' : m.status === 'stretch' ? 'var(--acc)' : m.status === 'ok' ? 'var(--up)' : undefined} />

              {m.req.length > 0 && (
                <div className="row wrap" style={{ gap: 5 }}>
                  <span className="small dim" style={{ width: 74 }}>Vereist</span>
                  {m.req.map((s) => <ReqTag key={s.skill} s={s} levels={levels} hasLv={hasLv} missCls="no" />)}
                </div>
              )}
              {m.reqQuests.length > 0 && (
                <div className="row wrap" style={{ gap: 5 }}>
                  <span className="small dim" style={{ width: 74 }}>Quests</span>
                  {m.reqQuests.slice(0, 4).map((t) => { const miss = m.missQuests.includes(t); return <span key={t} className={`tag ${miss ? 'no' : 'ok'}`} onClick={(e) => { e.preventDefault(); window.location.hash = href('quests', t); }}>{miss ? '✕' : '✓'} {t}</span>; })}
                </div>
              )}
              {m.rec.length > 0 && (
                <div className="row wrap" style={{ gap: 5 }}>
                  <span className="small dim" style={{ width: 74 }}>Aanbevolen</span>
                  {m.rec.map((s) => <ReqTag key={s.skill} s={s} levels={levels} hasLv={hasLv} missCls="acc" />)}
                </div>
              )}
              {m.recQuests?.length > 0 && (
                <div className="row wrap" style={{ gap: 5 }}>
                  <span className="small dim" style={{ width: 74 }}>Quests (adv.)</span>
                  {m.recQuests.slice(0, 4).map((t) => { const miss = m.missRecQuests.includes(t); return <span key={t} className={`tag ${miss ? 'acc' : 'ok'}`} onClick={(e) => { e.preventDefault(); window.location.hash = href('quests', t); }}>{miss ? '○' : '✓'} {t}</span>; })}
                </div>
              )}
              {!m.req.length && !m.rec.length && m.reqText && <span className="small dim trunc">{m.reqText}</span>}
              {m.variant && <span className="small dim">Requirements van variant: {m.variant.replace(/^Money making guide\//, '')}</span>}
              {hasLv && m.status === 'far' && <span className="small dim">Je zit {m.recGap} levels onder aanbevolen{m.missRec[0] ? ` (o.a. ${m.missRec[0].skill} ${m.missRec[0].cur}/${m.missRec[0].level})` : ''}. Zet hem als doel en kom later terug.</span>}
              {hasLv && m.status === 'stretch' && <span className="small" style={{ color: 'var(--acc)' }}>Je kunt het, maar {m.recGap > 0 ? `zit ${m.recGap} level${m.recGap === 1 ? '' : 's'} onder aanbevolen` : 'mist een aanbevolen quest'}: reken op minder GP/u of meer risico.</span>}
            </a>
          );
        })}
      </section>
      {d.data?.title && <p className="small dim">Bron: <a href={wikiHref(d.data.title)}>{d.data.title}</a> + de subpagina per methode. De top {J.total} methodes worden volledig gecontroleerd; de rest alleen op de hoofdtabel (“Niet gecontroleerd”).</p>}
    </div>
  );
}
