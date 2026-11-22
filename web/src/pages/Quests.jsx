import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { questList, optimalRoute, questStatus } from '../lib/wiki.js';
import { Icon, PageHead, SkelRows, Empty, ErrorBox, Ring, delay, CountUp } from '../components/ui.jsx';
import { href } from '../lib/router.js';
import { normTitle } from '../lib/format.js';

function BulkPaste({ list, onDone }) {
  const { setQuestsBulk, toast } = useApp();
  const [txt, setTxt] = useState('');
  const run = () => {
    const byNorm = Object.fromEntries((list || []).map((q) => [normTitle(q.title), q.title]));
    const lines = txt.split(/[\n,;]+/).map((l) => l.replace(/^[\s\-*•\d.)]+/, '').trim()).filter(Boolean);
    const hits = [];
    const miss = [];
    for (const l of lines) { const t = byNorm[normTitle(l)]; if (t) hits.push(t); else miss.push(l); }
    if (hits.length) setQuestsBulk(hits, 'done');
    toast(`${hits.length} quests op voltooid gezet${miss.length ? ` · ${miss.length} niet herkend` : ''}`, hits.length ? 'ok' : 'warn');
    if (hits.length) { setTxt(''); onDone?.(); }
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      <textarea className="input" style={{ height: 120, padding: 12, resize: 'vertical', fontFamily: 'var(--f-body)' }} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'Plak quest-namen, één per regel. Bijvoorbeeld:\nCook\'s Assistant\nDragon Slayer I\nThe Restless Ghost'} aria-label="Quest-namen plakken" />
      <div className="row wrap"><button className="btn primary sm" onClick={run} disabled={!txt.trim()}><Icon name="check" size={14} /> Markeer als voltooid</button><span className="small dim">Tip: in de game staat je questlijst in de Quest Journal; namen moeten overeenkomen met de wiki.</span></div>
    </div>
  );
}

export default function Quests() {
  const { game, cfg, player, rsn, questMap, questSource, manualQuests, setQuest, setQuestsBulk, toast } = useApp();
  const list = useAsync(() => questList(game), [game]);
  const pq = questMap;
  const known = useMemo(() => [...(list.data || []).map((q) => q.title), ...(manualQuests ? [] : Object.keys(pq || {}))], [list.data, pq, manualQuests]);
  const route = useAsync(() => optimalRoute(game, known), [game, known.length], { enabled: known.length > 0 });
  const [view, setView] = useState('route');
  const [status, setStatus] = useState('all');
  const [mem, setMem] = useState('all');
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [bulk, setBulk] = useState(false);

  const byTitle = useMemo(() => Object.fromEntries((list.data || []).map((x) => [normTitle(x.title), x])), [list.data]);
  const st = (t) => questStatus(pq, t);
  const toggle = (t) => { const done = st(t) === 'done'; setQuest(t, done ? null : 'done'); };

  const total = list.data?.length || Object.keys(pq || {}).length;
  const done = list.data ? list.data.filter((x) => st(x.title) === 'done').length : Object.values(pq || {}).filter((v) => v === 'done').length;
  const qp = player.data?.questPoints != null ? player.data.questPoints : (list.data || []).filter((x) => st(x.title) === 'done').reduce((a, x) => a + (x.qp || 0), 0);
  const hasProgress = !manualQuests || Object.keys(pq).length > 0;

  const routeItems = useMemo(() => (route.data || []).map((t, i) => ({ t, i: i + 1, s: st(t), meta: byTitle[normTitle(t)] })), [route.data, pq, byTitle]);
  const nextIdx = routeItems.findIndex((r) => r.s !== 'done');
  const visibleRoute = showDone || !hasProgress ? routeItems : routeItems.filter((r, idx) => r.s !== 'done' || idx === nextIdx - 1);
  const markUpTo = (idx) => {
    const titles = routeItems.slice(0, idx + 1).map((r) => r.t);
    setQuestsBulk(titles, 'done');
    toast(`${titles.length} quests t/m “${routeItems[idx].t}” op voltooid gezet`, 'ok');
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data || []).filter((x) => {
      if (term && !x.name.toLowerCase().includes(term)) return false;
      if (mem === 'f2p' && x.members !== false) return false;
      if (mem === 'p2p' && x.members !== true) return false;
      const s = st(x.title);
      if (status === 'open' && s === 'done') return false;
      if (status === 'done' && s !== 'done') return false;
      return true;
    });
  }, [list.data, q, mem, status, pq]);

  const diffColor = (d = '') => /novice|beginner/i.test(d) ? 'var(--up)' : /intermediate/i.test(d) ? 'var(--blue)' : /experienced/i.test(d) ? 'var(--acc)' : /master|grandmaster|special/i.test(d) ? 'var(--down)' : 'var(--mut)';
  const StatusBtn = ({ t }) => {
    const s = st(t);
    if (!manualQuests) {
      return s === 'done' ? <span className="tag ok" style={{ padding: '3px 6px' }}><Icon name="check" size={12} stroke={3} /></span> : s === 'started' ? <span className="tag acc" style={{ padding: '3px 6px' }}>…</span> : <span className="tag" style={{ padding: '3px 6px', opacity: .5 }}>·</span>;
    }
    return (
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(t); }} aria-pressed={s === 'done'} aria-label={s === 'done' ? `${t} op open zetten` : `${t} op voltooid zetten`} title={s === 'done' ? 'Klik: terug naar open' : 'Klik: voltooid'}
        style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${s === 'done' ? 'rgba(74,222,154,.4)' : 'var(--line2)'}`, background: s === 'done' ? 'rgba(74,222,154,.12)' : 'var(--bg2)', color: 'var(--up)', display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all .2s' }}>
        {s === 'done' && <Icon name="check" size={14} stroke={3} />}
      </button>
    );
  };

  return (
    <div className="page">
      <PageHead
        eyebrow={<><span>{cfg.pages.main}</span>{!manualQuests ? <span className="tag ok">voortgang via {questSource}</span> : <span className="tag acc">handmatige questlijst · vink af wat je gedaan hebt</span>}</>}
        title="Quests"
        sub="Requirements, quick guides en de meest efficiënte volgorde, afgezet tegen jouw account"
        right={manualQuests && <button className={`btn ${bulk ? '' : 'primary'}`} onClick={() => setBulk((b) => !b)}><Icon name={bulk ? 'x' : 'plus'} size={15} /> {bulk ? 'Sluiten' : 'Snel invullen'}</button>}
      />

      {manualQuests && bulk && (
        <section className="card accent rise col" style={{ gap: 12 }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 className="h">Questvoortgang invullen</h2>
            <span className="small muted">{game === 'rs3' ? 'Geen WikiSync-data (zet de plugin aan via de Plugin Hub), dus tick. houdt je RS3-quests lokaal bij.' : 'Geen WikiSync-data, dus tick. houdt je quests lokaal bij.'} Drie manieren: plak een lijst hieronder, klik “✓ t/m hier” in de optimale route, of vink losse quests af in “Alle quests”.</span>
          </div>
          <BulkPaste list={list.data} onDone={() => setBulk(false)} />
        </section>
      )}

      <section className="grid g4">
        <div className="card accent rise row" style={{ gap: 18 }}>
          <Ring value={total ? done / total : 0} size={96} stroke={9}><span className="num" style={{ fontSize: 22 }}>{total ? Math.round(done / total * 100) : 0}%</span></Ring>
          <div className="col" style={{ gap: 2 }}>
            <span className="small muted">Voltooid</span>
            <span className="num" style={{ fontSize: 28 }}><CountUp value={hasProgress || manualQuests ? done : null} /> <span className="muted" style={{ fontSize: 16 }}>/ {total || '–'}</span></span>
          </div>
        </div>
        <div className="card rise stat" style={delay(1, 0, 0.06)}>
          <div className="lbl">Quest points</div>
          <div className="val num"><CountUp value={qp} /></div>
          <div className="small dim">{player.data?.questPoints != null ? 'via RuneMetrics' : 'berekend uit de questlijst'}</div>
        </div>
        <a className="card hover rise col" style={{ ...delay(2, 0, 0.06), gap: 6, color: 'var(--tx)' }} href={nextIdx >= 0 && routeItems[nextIdx] ? href('quests', routeItems[nextIdx].t) : href('quests')}>
          <span className="small muted">Volgende in de optimale route</span>
          <span className="num trunc" style={{ fontSize: 21 }}>{nextIdx >= 0 && routeItems[nextIdx] ? routeItems[nextIdx].t : route.loading ? 'Route laden…' : '–'}</span>
          <span className="small acc row" style={{ gap: 6 }}>Open guide <Icon name="arrow" size={14} /></span>
        </a>
        <div className="card rise col" style={{ ...delay(3, 0, 0.06), gap: 6 }}>
          <span className="small muted">Quests in de lijst</span>
          <span className="num" style={{ fontSize: 28 }}><CountUp value={list.data?.length ?? null} /></span>
          <span className="small dim">{(list.data || []).filter((x) => x.members === false).length} F2P · {(list.data || []).filter((x) => x.members === true).length} members</span>
        </div>
      </section>

      <div className="row wrap between rise" style={{ animationDelay: '.12s' }}>
        <div className="seg" role="tablist">
          <button className={view === 'route' ? 'on' : ''} onClick={() => setView('route')}>Optimale route</button>
          <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>Alle quests</button>
        </div>
        {view === 'all' ? (
          <div className="row wrap">
            <input className="input" style={{ width: 220, height: 38 }} placeholder="Filter op naam…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter quests" />
            {[['all', 'Alles'], ['open', 'Open'], ['done', 'Klaar']].map(([k, l]) => <button key={k} className={`chip ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}
            {[['all', 'F2P + P2P'], ['f2p', 'F2P'], ['p2p', 'Members']].map(([k, l]) => <button key={k} className={`chip ${mem === k ? 'on' : ''}`} onClick={() => setMem(k)}>{l}</button>)}
          </div>
        ) : (
          hasProgress && <label className="row small muted" style={{ gap: 10 }}>Toon voltooide <span><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /></span></label>
        )}
      </div>

      {list.error && <div className="card"><ErrorBox error={list.error} onRetry={list.reload} /></div>}

      {view === 'route' ? (
        <section className="card rise" style={{ animationDelay: '.16s' }}>
          <div className="row between" style={{ marginBottom: 14 }}>
            <div className="col" style={{ gap: 2 }}>
              <h2 className="h">Optimale questvolgorde</h2>
              <span className="small muted">Volgens de “Optimal quest guide” van de wiki: unlocks en XP-beloningen op het juiste moment{manualQuests ? '. Klik een vakje om af te vinken.' : ''}</span>
            </div>
            <a className="btn sm ghost" href={href('wiki', 'Optimal quest guide')}><Icon name="book" size={14} /> Bron</a>
          </div>
          {(route.loading || list.loading) && <SkelRows n={8} h={46} />}
          {route.error && <ErrorBox error={route.error} onRetry={route.reload} />}
          {route.data && !route.data.length && <Empty icon="route" title="Geen route gevonden">De pagina kon niet worden uitgelezen.</Empty>}
          <div className="route">
            {visibleRoute.slice(0, 400).map((r, k) => {
              const cls = r.s === 'done' ? 'done' : routeItems[nextIdx]?.t === r.t ? 'now' : '';
              const idx = r.i - 1;
              return (
                <div key={r.t} className={`route-step ${cls} rise`} style={delay(Math.min(k, 30), 0.1, 0.025)}>
                  <div className="rail">
                    {manualQuests
                      ? <button className="node" onClick={() => toggle(r.t)} style={{ cursor: 'pointer' }} aria-label={r.s === 'done' ? `${r.t} op open zetten` : `${r.t} op voltooid zetten`} title={r.s === 'done' ? 'Klik: terug naar open' : 'Klik: voltooid'}>{r.s === 'done' ? <Icon name="check" size={14} stroke={3} /> : r.i}</button>
                      : <span className="node">{r.s === 'done' ? <Icon name="check" size={14} stroke={3} /> : r.i}</span>}
                    <span className="line" />
                  </div>
                  <div className="body row between" style={{ gap: 10 }}>
                    <a href={href('quests', r.t)} className="col" style={{ gap: 2, minWidth: 0, color: 'var(--tx)' }}>
                      <span className="t trunc" style={{ fontWeight: 600, transition: 'color .2s' }}>{r.t.replace('/', ' · ')}</span>
                      {r.meta && <span className="small muted">{[r.meta.difficulty, r.meta.length, r.meta.qp ? `${r.meta.qp} QP` : null].filter(Boolean).join(' · ')}</span>}
                    </a>
                    <div className="row" style={{ gap: 8 }}>
                      {cls === 'now' && <span className="tag acc">Nu</span>}
                      {r.s === 'started' && <span className="tag">Bezig</span>}
                      {manualQuests && r.s !== 'done' && <button className="btn sm ghost" onClick={() => markUpTo(idx)} title="Zet deze en alle quests ervoor op voltooid">✓ t/m hier</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="card rise" style={{ padding: 0, animationDelay: '.16s' }}>
          {list.loading && <div style={{ padding: 20 }}><SkelRows n={10} h={40} /></div>}
          {list.data && !filtered.length && <Empty icon="quest" title="Geen quests">Pas je filters aan.</Empty>}
          {!!filtered.length && (
            <div className="scroll-x">
              <table className="dt">
                <thead><tr><th style={{ width: 52 }}>{manualQuests ? 'Klaar' : ''}</th><th>Quest</th><th>Moeilijkheid</th><th>Lengte</th><th className="r">QP</th><th>Type</th></tr></thead>
                <tbody>
                  {filtered.map((x) => (
                    <tr key={x.title} onClick={() => { window.location.hash = href('quests', x.title); }} style={{ cursor: 'pointer' }}>
                      <td><StatusBtn t={x.title} /></td>
                      <td><a href={href('quests', x.title)} style={{ color: 'var(--tx)', fontWeight: 600 }}>{x.name}</a>{x.series && <div className="small dim">{x.series}</div>}</td>
                      <td><span style={{ color: diffColor(x.difficulty), fontWeight: 600, fontSize: 13 }}>{x.difficulty || '–'}</span></td>
                      <td className="muted small">{x.length || '–'}</td>
                      <td className="r">{x.qp ?? '–'}</td>
                      <td>{x.members === false ? <span className="tag">F2P</span> : x.members ? <span className="tag acc">Members</span> : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
