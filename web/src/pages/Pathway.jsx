import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { GUIDES, loadGuide, judgeSteps } from '../lib/pathway.js';
import { Icon, PageHead, ErrorBox, Skel, Ring, Bar, SkillIcon, Toggle, Empty } from '../components/ui.jsx';
import { nl } from '../lib/format.js';

const DONE = new Set(['done', 'likely']);
const STATUS = {
  done: { label: 'Gedaan', cls: 'ok', why: 'Automatisch afgevinkt: je account voldoet aan deze stap.' },
  likely: { label: 'Waarschijnlijk gedaan', cls: 'ok soft', why: 'Ligt vóór je huidige plek in de route; tick. kan deze stap niet controleren.' },
  todo: { label: 'Nog te doen', cls: 'no', why: 'Er ontbreekt nog een quest of level.' },
  open: { label: 'Nog niet', cls: '', why: 'Ligt na je huidige plek in de route.' },
};

function Chips({ s, compact }) {
  const { cfg } = useApp();
  const qs = s.qs || [];
  if (!qs.length && !s.levels.length) return null;
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {qs.map((q) => {
        const miss = s.qMiss.includes(q);
        return <a key={q} className={`tag ${miss ? 'no' : 'ok'}`} href={`#/quests/${encodeURIComponent(q)}`} title={miss ? 'Nog niet voltooid' : 'Voltooid'}><Icon name="quest" size={12} />{q}</a>;
      })}
      {s.levels.map((l) => {
        const miss = s.lMiss.find((x) => x.skill === l.skill);
        return (
          <span key={l.skill} className={`tag ${miss ? 'no' : 'ok'}`} title={miss ? `Jij: ${miss.cur}` : 'Gehaald'}>
            <SkillIcon skill={l.skill} size={13} />{compact ? l.level : `${l.skill} ${l.level}`}{miss && !compact ? <span className="dim">· jij {miss.cur}</span> : null}
          </span>
        );
      })}
      {s.gather && <span className="tag acc" title={`Als je geen ironman bent, koop je dit meestal op de GE (${cfg.short})`}><Icon name="coins" size={12} />GE</span>}
    </div>
  );
}

function StepHtml({ html, small }) {
  return <div className={`wiki path-html ${small ? 'small' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

function StepRow({ s, onMark, current }) {
  const [open, setOpen] = useState(false);
  const st = STATUS[s.status] || STATUS.open;
  return (
    <div className={`path-row ${DONE.has(s.status) ? 'is-done' : ''} ${current ? 'is-now' : ''}`}>
      <button className={`path-check ${s.status}`} onClick={() => onMark(s, s.manual != null ? null : DONE.has(s.status) ? false : true)}
        title={s.manual != null ? 'Handmatig gezet: klik om tick. weer zelf te laten bepalen' : `${st.why} Klik om ${DONE.has(s.status) ? 'als niet gedaan' : 'als gedaan'} te markeren.`}
        aria-label={`Stap ${s.n}: ${st.label}`}>
        {DONE.has(s.status) ? <Icon name="check" size={13} /> : <span>{s.n}</span>}
        {s.manual != null && <i className="path-hand" />}
      </button>
      <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
        <button className="path-text" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className={open ? '' : 'clamp2'}>{s.text}</span>
        </button>
        {open && <StepHtml html={s.html} small />}
        {open && s.notes && <div className="path-notes"><span className="eyebrow">Toelichting</span><StepHtml html={s.notes} small /></div>}
        <Chips s={s} compact={!open} />
      </div>
    </div>
  );
}

export default function Pathway() {
  const { game, cfg, rsn, levels, questMap, settings, update, pathway, player } = useApp();
  const guides = GUIDES[game] || [];
  const gid = settings.pathGuide?.[game] && guides.some((g) => g.id === settings.pathGuide[game]) ? settings.pathGuide[game] : guides[0]?.id;
  const guide = guides.find((g) => g.id === gid);
  const iron = settings.acct?.[game]?.iron ?? player.data?.ironman ?? false;
  const hideGE = settings.pathHideGE ?? !iron;
  const manual = pathway?.[gid] || {};

  const data = useAsync(() => (guide ? loadGuide(game, guide) : Promise.resolve([])), [game, gid]);
  const j = useMemo(() => data.data && judgeSteps(data.data, { levels, questMap, manual }), [data.data, levels, questMap, manual]);

  const [filter, setFilter] = useState('todo');
  const [openSec, setOpenSec] = useState(null);

  const visible = (s) => !(hideGE && s.gather && !DONE.has(s.status));
  const next = j ? j.steps.find((s, i) => i > j.front && !DONE.has(s.status) && visible(s)) : null;
  const after = j && next ? j.steps.slice(next.n).filter((s) => !DONE.has(s.status) && visible(s)).slice(0, 5) : [];
  const missed = j ? j.missed.filter(visible) : [];
  const pct = j?.total ? j.doneish / j.total : 0;

  const sections = useMemo(() => {
    if (!j) return [];
    const out = [];
    for (const s of j.steps) {
      const key = s.page + '|' + s.section;
      let sec = out[out.length - 1];
      if (!sec || sec.key !== key) { sec = { key, name: s.section || 'Begin', steps: [] }; out.push(sec); }
      sec.steps.push(s);
    }
    return out;
  }, [j]);
  useEffect(() => {
    if (next && openSec == null) setOpenSec(next.page + '|' + next.section);
  }, [next, openSec]);

  const mark = (s, val) => update('pathway', (p) => {
    const cur = { ...((p || {})[gid] || {}) };
    if (val == null) delete cur[s.id]; else cur[s.id] = val;
    return { ...(p || {}), [gid]: cur };
  });
  const setGuide = (id) => update('settings', (s) => ({ ...s, pathGuide: { ...(s.pathGuide || {}), [game]: id } }));
  const setHideGE = (v) => update('settings', (s) => ({ ...s, pathHideGE: v }));
  const manualCount = Object.keys(manual).length;

  if (!guide) return <div className="page"><Empty icon="route" title="Nog geen stappenplan voor dit spel" /></div>;

  return (
    <div className="page">
      <PageHead
        eyebrow={<><Icon name="steps" size={14} /><span>Stappenplan · {cfg.short}</span></>}
        title="Waar sta je in het spel?"
        sub="Een complete route door het spel, stap voor stap van de wiki. tick. vinkt automatisch af wat je account al heeft gedaan."
        right={guides.length > 1 && (
          <div className="seg" role="tablist" aria-label="Gids">
            {guides.map((g) => <button key={g.id} className={g.id === gid ? 'on' : ''} onClick={() => setGuide(g.id)}>{g.title}</button>)}
          </div>
        )}
      />
      {!rsn && <div className="card accent row wrap between"><span>Stel je RSN in, dan vinkt tick. automatisch af wat je al gedaan hebt.</span><a className="btn primary sm" href="#/settings">RSN instellen</a></div>}
      {data.error && <div className="card"><ErrorBox error={data.error} onRetry={data.reload} /></div>}
      {!j && !data.error && <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 14 }}><Skel h={240} r={18} /><Skel h={300} r={18} /></div>}

      {j && !j.total && (
        <div className="card"><Empty icon="steps" title="Kon de gids niet lezen" action={<a className="btn sm" href={`${cfg.wikiBase}/w/${encodeURIComponent(guide.pages[0].replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer">Open de gids op de wiki <Icon name="ext" size={13} /></a>}>De pagina op de wiki is misschien verplaatst of anders opgebouwd. Je kunt hem nog steeds op de wiki zelf bekijken.</Empty></div>
      )}
      {j && j.total > 0 && (
        <>
          <section className="card accent glow rise path-hero">
            <div className="col" style={{ alignItems: 'center', gap: 6 }}>
              <Ring value={pct} size={150} stroke={12}>
                <div className="col" style={{ alignItems: 'center', gap: 0 }}>
                  <b className="mono" style={{ fontSize: 30 }}>{Math.round(pct * 100)}%</b>
                  <span className="small dim">{nl(j.doneish)} / {nl(j.total)} stappen</span>
                </div>
              </Ring>
              <span className="small dim" style={{ textAlign: 'center' }}>{guide.title}</span>
            </div>
            <div className="col grow" style={{ gap: 12, minWidth: 0 }}>
              {next ? (
                <>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="eyebrow acc">Je volgende stap · {next.n} van {j.total}</span>
                    <span className="tag">{next.section}</span>
                  </div>
                  <h2 className="h path-now">{next.text.length > 180 ? next.text.slice(0, 180) + '…' : next.text}</h2>
                  {next.text.length > 180 && <StepHtml html={next.html} />}
                  <Chips s={next} />
                  {next.notes && (
                    <details className="path-notes">
                      <summary>Toelichting bij deze stap</summary>
                      <StepHtml html={next.notes} small />
                    </details>
                  )}
                  <div className="row wrap" style={{ gap: 8 }}>
                    <button className="btn primary" onClick={() => mark(next, true)}><Icon name="check" size={15} /> Gedaan</button>
                    <button className="btn ghost" onClick={() => mark(next, 'skip')} title="Bijvoorbeeld omdat je het op de GE koopt of al anders geregeld hebt">Niet nodig voor mij</button>
                  </div>
                </>
              ) : (
                <div className="col" style={{ gap: 6 }}>
                  <span className="eyebrow acc">Route afgerond</span>
                  <h2 className="h">Je bent door de hele route heen. Sterk!</h2>
                </div>
              )}
            </div>
          </section>

          <div className="grid path-grid">
            <section className="card col" style={{ gap: 4 }}>
              <div className="row between"><h3 className="h">Daarna</h3><span className="small dim">de volgende {after.length} stappen</span></div>
              {after.map((s) => <StepRow key={s.id} s={s} onMark={mark} />)}
              {!after.length && <span className="small dim">Niets meer na deze stap.</span>}
            </section>
            <section className="card col" style={{ gap: 10 }}>
              <h3 className="h">Instellingen</h3>
              <div className="row between small" style={{ gap: 10 }}>
                <span>Stappen overslaan die je op de GE kunt kopen<br /><span className="dim">{iron ? 'Je bent ironman: meestal uit laten.' : 'Handig als je geen ironman bent.'}</span></span>
                <Toggle on={hideGE} onChange={setHideGE} label="GE-stappen overslaan" />
              </div>
              <span className="small dim">{guide.about}</span>
              <span className="small dim">Klik op het bolletje van een stap om hem zelf af te vinken.{manualCount ? ` Je hebt ${manualCount} stap${manualCount === 1 ? '' : 'pen'} zelf gezet.` : ''}</span>
              {manualCount > 0 && <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => update('pathway', (p) => ({ ...(p || {}), [gid]: {} }))}><Icon name="refresh" size={13} /> Handmatige vinkjes wissen</button>}
            </section>
          </div>

          {missed.length > 0 && (
            <section className="card col" style={{ gap: 4 }}>
              <div className="row between"><h3 className="h">Gemist onderweg</h3><span className="small dim">{missed.length} stap{missed.length === 1 ? '' : 'pen'} vóór je huidige plek die nog openstaan</span></div>
              {missed.slice(0, 8).map((s) => <StepRow key={s.id} s={s} onMark={mark} />)}
            </section>
          )}

          <section className="col" style={{ gap: 10 }}>
            <div className="row between wrap">
              <h3 className="h">De hele route</h3>
              <div className="seg">
                <button className={filter === 'todo' ? 'on' : ''} onClick={() => setFilter('todo')}>Nog te doen</button>
                <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Alles</button>
              </div>
            </div>
            {sections.map((sec) => {
              const done = sec.steps.filter((s) => DONE.has(s.status)).length;
              const list = sec.steps.filter((s) => visible(s) && (filter === 'all' || !DONE.has(s.status)));
              const isOpen = openSec === sec.key;
              return (
                <div key={sec.key} className={`card path-sec ${isOpen ? 'open' : ''}`}>
                  <button className="path-sec-head" onClick={() => setOpenSec(isOpen ? '' : sec.key)} aria-expanded={isOpen}>
                    <span className="col grow" style={{ gap: 6, minWidth: 0, textAlign: 'left' }}>
                      <b className="ellipsis">{sec.name}</b>
                      <Bar value={sec.steps.length ? done / sec.steps.length : 0} color={done === sec.steps.length ? 'var(--up)' : undefined} />
                    </span>
                    <span className="mono small dim">{done}/{sec.steps.length}</span>
                    <Icon name={isOpen ? 'minus' : 'plus'} size={15} />
                  </button>
                  {isOpen && (
                    <div className="col" style={{ gap: 2, marginTop: 8 }}>
                      {list.map((s) => <StepRow key={s.id} s={s} onMark={mark} current={next?.id === s.id} />)}
                      {!list.length && <span className="small dim" style={{ padding: 8 }}>Alles in dit deel is gedaan.</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <span className="small dim">
            Gids: {guide.title} door {guide.by}, van de {cfg.label}-wiki (
            {guide.pages.map((p, i) => <span key={p}>{i > 0 && ', '}<a href={`${cfg.wikiBase}/w/${encodeURIComponent(p.replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer">{p.split('/').pop()}</a></span>)}
            ). Automatisch afvinken gebeurt op basis van je quests en levels; stappen zonder quest of level kan tick. niet controleren.
          </span>
        </>
      )}
    </div>
  );
}
