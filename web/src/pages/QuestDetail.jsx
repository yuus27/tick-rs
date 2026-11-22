import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { parsePage, toDoc, extractQuestDetails, resolveTitle, questStatus, stripTags, optimalRoute, questList } from '../lib/wiki.js';
import WikiContent from '../components/WikiContent.jsx';
import { Icon, Skel, ErrorBox, SkillIcon, Bar, Ring, delay } from '../components/ui.jsx';
import { href } from '../lib/router.js';
import { normTitle } from '../lib/format.js';

function annotate(el, pq, isQuest) {
  if (!el) return '';
  const c = el.cloneNode(true);
  if (pq) c.querySelectorAll('a[data-title]').forEach((a) => {
    const t = a.getAttribute('data-title');
    const s = questStatus(pq, t) || (isQuest?.(t) ? 'none' : null);
    if (s === 'done') a.classList.add('q-done');
    else if (s) a.classList.add('q-open');
  });
  return c.innerHTML;
}

export default function QuestDetail({ title }) {
  const { game, cfg, levels, player, update, goals, toast, pushHistory, questMap, manualQuests, setQuest } = useApp();
  const pq = questMap;

  const page = useAsync(async () => {
    const p = await parsePage(game, title);
    const quick = await resolveTitle(game, [`${p.title}/Quick guide`]).catch(() => null);
    return { p, quick };
  }, [game, title]);

  const [tab, setTab] = useState(null);
  const quickPage = useAsync(() => parsePage(game, page.data.quick.title), [game, page.data?.quick?.title], { enabled: !!page.data?.quick && tab !== 'full' });

  const list = useAsync(() => questList(game), [game]);
  const route = useAsync(() => optimalRoute(game, (list.data || []).map((q) => q.title)), [game, list.data?.length], { enabled: !!list.data?.length });

  const view = useMemo(() => {
    if (!page.data) return null;
    const root = toDoc(game, page.data.p.text);
    const d = extractQuestDetails(root, cfg.skills);
    return { d, html: root.innerHTML, title: page.data.p.title, display: stripTags(page.data.p.displaytitle || page.data.p.title) };
  }, [page.data, game, cfg]);

  const quickHtml = useMemo(() => {
    if (!quickPage.data) return null;
    const root = toDoc(game, quickPage.data.text);
    extractQuestDetails(root, cfg.skills);
    return root.innerHTML;
  }, [quickPage.data, game, cfg]);

  useEffect(() => { setTab(null); }, [title]);
  useEffect(() => { if (view?.title) pushHistory({ title: view.title, game, kind: 'quest' }); /* eslint-disable-next-line */ }, [view?.title, game]);

  const activeTab = tab || (page.data?.quick ? 'quick' : 'full');
  const hasLevels = Object.keys(levels).length > 0;
  const skills = (view?.d?.skills || []).map((s) => ({ ...s, mine: levels[s.skill], ok: hasLevels ? (levels[s.skill] ?? 1) >= s.level : null }));
  const missing = skills.filter((s) => s.ok === false);
  const questSet = useMemo(() => new Set((list.data || []).map((q) => normTitle(q.title))), [list.data]);
  const isQuest = (t) => questSet.has(normTitle(t)) || questSet.has(normTitle(t.split('/')[0]));
  const prereqs = [...new Set((view?.d?.questLinks || []).filter((t) => normTitle(t) !== normTitle(view?.title || '') && isQuest(t)))];
  const knownQuest = (t) => questStatus(pq, t) || (manualQuests ? 'none' : null);
  const prereqOpen = prereqs.filter((t) => { const s = knownQuest(t); return s && s !== 'done'; });
  const myStatus = questStatus(pq, view?.title || title);
  const total = skills.length + prereqs.filter((t) => knownQuest(t)).length;
  const met = skills.filter((s) => s.ok).length + prereqs.filter((t) => knownQuest(t) === 'done').length;
  const readiness = total ? met / total : hasLevels ? 1 : 0;

  const ridx = (route.data || []).findIndex((t) => normTitle(t) === normTitle(view?.title || title));
  const prev = ridx > 0 ? route.data[ridx - 1] : null;
  const next = ridx >= 0 && ridx < (route.data?.length || 0) - 1 ? route.data[ridx + 1] : null;

  const inGoals = (goals || []).some((g) => g.type === 'quest' && g.game === game && g.title === view?.title);
  const addGoal = () => {
    if (inGoals) return;
    update('goals', (g) => [...(g || []), { id: Date.now().toString(36), type: 'quest', game, title: view.title, skills: (view.d?.skills || []).map((s) => ({ skill: s.skill, level: s.level })), createdAt: Date.now() }]);
    toast(`${view.title} toegevoegd aan je doelen`, 'ok');
  };

  if (page.error) return <div className="page"><div className="card"><ErrorBox error={page.error} onRetry={page.reload} /></div></div>;

  return (
    <div className="page">
      <header className="row wrap between rise" style={{ alignItems: 'flex-end' }}>
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <div className="eyebrow"><a href={href('quests')} className="row" style={{ gap: 6, color: 'var(--mut)' }}><Icon name="back" size={14} /> Quests</a>
            {ridx >= 0 && <span className="tag acc">Stap {ridx + 1} in de optimale route</span>}
            {myStatus === 'done' && <span className="tag ok">Voltooid</span>}
            {myStatus === 'started' && <span className="tag">Bezig</span>}
          </div>
          <h1 className="title">{view?.display || title}</h1>
          {view?.d?.description && <p className="sub" style={{ maxWidth: 760 }}>{view.d.description.textContent.trim().slice(0, 260)}</p>}
        </div>
        <div className="row wrap">
          {manualQuests && view && (
            <button className={`btn ${myStatus === 'done' ? '' : 'ghost'}`} onClick={() => { setQuest(view.title, myStatus === 'done' ? null : 'done'); toast(myStatus === 'done' ? 'Weer op open gezet' : `${view.title} voltooid`, 'ok'); }}>
              <Icon name="check" size={16} style={{ color: myStatus === 'done' ? 'var(--up)' : undefined }} /> {myStatus === 'done' ? 'Voltooid' : 'Markeer als voltooid'}
            </button>
          )}
          <button className={`btn ${inGoals ? '' : 'primary'}`} onClick={addGoal} disabled={!view}><Icon name={inGoals ? 'check' : 'target'} size={16} /> {inGoals ? 'In je doelen' : 'Maak er een doel van'}</button>
          <a className="btn ghost" href={`${cfg.wikiBase}/w/${encodeURIComponent((view?.title || title).replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer"><Icon name="ext" size={15} /> Wiki</a>
        </div>
      </header>

      {!view && <div className="grid g2"><div className="card col"><Skel h={140} /></div><div className="card col"><Skel h={140} /></div></div>}

      {view && (
        <>
          <section className="row wrap" style={{ gap: 16, alignItems: 'stretch' }}>
            <div className="card accent rise col" style={{ flex: '1 1 300px', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
              <Ring value={readiness} size={150} stroke={12}>
                <span className="num" style={{ fontSize: 34 }}>{hasLevels || total ? `${Math.round(readiness * 100)}%` : '–'}</span>
                <span className="small muted">klaar om te starten</span>
              </Ring>
              <div style={{ textAlign: 'center', fontWeight: 600 }}>
                {!hasLevels ? 'Stel je RSN in om requirements te checken' : missing.length === 0 && prereqOpen.length === 0 ? <span className="up">Je voldoet aan alle bekende requirements</span> : <span>Nog <span className="acc">{missing.length + prereqOpen.length}</span> requirement{missing.length + prereqOpen.length === 1 ? '' : 's'} open</span>}
              </div>
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                {view.d?.difficulty && <span className="tag">{view.d.difficulty.textContent.trim().slice(0, 30)}</span>}
                {view.d?.length && <span className="tag">{view.d.length.textContent.trim().slice(0, 30)}</span>}
                {view.d?.questPoints && <span className="tag acc">{view.d.questPoints} QP vereist</span>}
                {view.d?.combat && <span className="tag">Combat {view.d.combat}</span>}
              </div>
            </div>

            <div className="card rise col" style={{ flex: '2 1 420px', animationDelay: '.06s', gap: 14 }}>
              <div className="row between">
                <h2 className="h">Skill-requirements</h2>
                {hasLevels && <span className="small muted">jouw levels via hiscores</span>}
              </div>
              {!skills.length && <span className="muted small">Geen skill-requirements gevonden voor deze quest.</span>}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                {skills.map((s, i) => (
                  <a key={s.skill} href={href('skills', s.skill)} className="skill-tile rise" style={{ ...delay(i, 0.1, 0.03), borderColor: s.ok === false ? 'rgba(255,138,101,.35)' : undefined }}>
                    <div className="row" style={{ gap: 8 }}>
                      <SkillIcon skill={s.skill} size={20} />
                      <span className="grow" style={{ fontWeight: 600, fontSize: 13.5 }}>{s.skill}</span>
                      <span className="mono small" style={{ color: s.ok === false ? 'var(--down)' : s.ok ? 'var(--up)' : 'var(--mut)' }}>{s.mine ?? '?'}/{s.level}</span>
                    </div>
                    <Bar value={s.mine ? s.mine / s.level : 0} color={s.ok === false ? 'var(--down)' : s.ok ? 'var(--up)' : 'var(--mut)'} />
                    {s.boostable && <span className="small dim">boostable</span>}
                  </a>
                ))}
              </div>
              {view.d?.requirements && (
                <details>
                  <summary className="small muted" style={{ cursor: 'pointer' }}>Alle requirements (quests & overig) · ✓ = voltooid</summary>
                  <div className="wiki-cell" style={{ marginTop: 10 }} dangerouslySetInnerHTML={{ __html: annotate(view.d.requirements, pq, isQuest) }} />
                </details>
              )}
            </div>
          </section>

          <section className="grid g3">
            {[['Benodigde items', view.d?.items, 'coins'], ['Aanbevolen', view.d?.recommended, 'star'], ['Vijanden', view.d?.enemies, 'flame']].map(([lbl, el, ic], i) => el && (
              <div key={lbl} className="card rise col" style={{ ...delay(i, 0.1, 0.05), gap: 10 }}>
                <div className="row"><span className="icon-tile" style={{ width: 32, height: 32 }}><Icon name={ic} size={15} style={{ color: 'var(--acc)' }} /></span><h3 className="h">{lbl}</h3></div>
                <div className="wiki-cell" dangerouslySetInnerHTML={{ __html: annotate(el, null) }} />
              </div>
            ))}
            {view.d?.start && (
              <div className="card rise col" style={{ ...delay(3, 0.1, 0.05), gap: 10 }}>
                <div className="row"><span className="icon-tile" style={{ width: 32, height: 32 }}><Icon name="map" size={15} style={{ color: 'var(--acc)' }} /></span><h3 className="h">Startpunt</h3></div>
                <div className="wiki-cell" dangerouslySetInnerHTML={{ __html: annotate(view.d.start, null) }} />
              </div>
            )}
          </section>

          {(prev || next) && (
            <div className="row wrap between rise">
              {prev ? <a className="btn ghost" href={href('quests', prev)}><Icon name="back" size={15} /> {prev}</a> : <span />}
              {next && <a className="btn" href={href('quests', next)}>Volgende in route: {next} <Icon name="arrow" size={15} /></a>}
            </div>
          )}

          <section className="card rise" style={{ padding: 0, animationDelay: '.15s' }}>
            <div className="tabs" style={{ padding: '0 14px' }}>
              {page.data.quick && <button className={activeTab === 'quick' ? 'on' : ''} onClick={() => setTab('quick')}>Quick guide · snelste route</button>}
              <button className={activeTab === 'full' ? 'on' : ''} onClick={() => setTab('full')}>Volledige guide</button>
            </div>
            <div style={{ padding: 'clamp(18px, 2.4vw, 30px)' }}>
              {activeTab === 'quick' && (quickHtml ? <WikiContent key="q" html={quickHtml} /> : quickPage.error ? <ErrorBox error={quickPage.error} onRetry={quickPage.reload} /> : <div className="col"><Skel h={14} /><Skel h={14} w="90%" /><Skel h={14} w="80%" /></div>)}
              {activeTab === 'full' && <WikiContent key="f" html={view.html} />}
              <div style={{ clear: 'both' }} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
