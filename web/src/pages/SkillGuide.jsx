import { useMemo, useRef, useState, useEffect } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { resolveTitle, parsePage, toDoc, stripTags, readTables, questStatus } from '../lib/wiki.js';
import { guideCandidates } from '../lib/games.js';
import WikiContent, { scrollToAnchor } from '../components/WikiContent.jsx';
import { Icon, Skel, ErrorBox, SkillIcon, Ring, Empty, delay, CountUp } from '../components/ui.jsx';
import { href, wikiHref } from '../lib/router.js';
import { nl, short } from '../lib/format.js';
import { xpFor, levelFor } from '../lib/xp.js';

const MODES = [
  ['p2p', 'Pay-to-play', 'Snelste route met members-content'],
  ['f2p', 'Free-to-play', 'Alleen F2P-methodes'],
  ['iron', 'Ironman', 'Zonder GE: alles zelf verzamelen'],
  ['quest', 'Questing', 'Quests met XP-beloning voor deze skill'],
  ['main', 'Overzicht', 'Skillpagina: unlocks en mechanics'],
];

export function parseRange(line) {
  const t = stripTags(line);
  const m = t.match(/(\d{1,3})\s*(?:[-–—]|to|tot)\s*(\d{1,3})/i);
  if (m) { const a = +m[1], b = +m[2]; if (a >= 1 && b <= 126 && b >= a) return [a, b]; }
  const s = t.match(/^\s*(?:level\s*)?(\d{1,3})\s*\+?\s*$/i) || t.match(/^\s*levels?\s*(\d{1,3})\+?/i);
  if (s) return [+s[1], +s[1]];
  return null;
}

function GuideTab({ skill, mode, mine }) {
  const { game } = useApp();
  const ref = useRef(null);
  const g = useAsync(async () => {
    const hit = await resolveTitle(game, guideCandidates(game, skill, mode));
    if (!hit) return { none: true };
    const p = await parsePage(game, hit.title);
    return { hit, p };
  }, [game, skill, mode]);

  const view = useMemo(() => {
    if (!g.data?.p) return null;
    const root = toDoc(game, g.data.p.text);
    const secs = (g.data.p.sections || []).map((s) => ({ ...s, range: parseRange(s.line), text: stripTags(s.line) }));
    const steps = secs.filter((s) => s.range);
    return { html: root.innerHTML, steps, toc: secs.filter((s) => s.toclevel <= 2) };
  }, [g.data, game]);

  useEffect(() => {
    if (g.data?.hit?.fragment) setTimeout(() => scrollToAnchor(ref.current, g.data.hit.fragment), 300);
  }, [g.data]);

  if (g.loading) return <div className="col" style={{ gap: 12 }}><Skel h={18} w="30%" /><Skel h={14} /><Skel h={14} w="90%" /><Skel h={240} /></div>;
  if (g.error) return <ErrorBox error={g.error} onRetry={g.reload} />;
  if (g.data?.none) {
    return (
      <Empty icon="book" title="Geen aparte guide op de wiki" action={<a className="btn sm" href={href('wiki') + `?q=${encodeURIComponent(skill + ' training ' + (mode === 'iron' ? 'ironman' : mode === 'f2p' ? 'free-to-play' : ''))}`}><Icon name="search" size={14} /> Zoek in de wiki</a>}>
        Voor deze variant heeft de wiki geen eigen pagina. Probeer de P2P-route of zoek handmatig.
      </Empty>
    );
  }
  const cur = mine ?? 1;
  const nowIdx = view.steps.findIndex((s) => cur >= s.range[0] && cur < Math.max(s.range[1], s.range[0] + 1));
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 20 }} ref={ref}>
      <aside className="sticky col" style={{ width: 270, flex: 'none', gap: 12, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto' }}>
        <div className="small muted">Bron: <a href={wikiHref(g.data.hit.title)}>{g.data.hit.title}</a></div>
        {view.steps.length >= 2 ? (
          <div className="route">
            <div className="nav-title" style={{ padding: '4px 0 10px' }}>Jouw route</div>
            {view.steps.map((s, i) => {
              const done = cur >= Math.max(s.range[1], s.range[0] + 1) && s.range[1] !== s.range[0];
              const now = i === nowIdx;
              return (
                <a key={s.anchor + i} href="javascript:void(0)" className={`route-step ${done ? 'done' : ''} ${now ? 'now' : ''} rise`} style={delay(i, 0.05, 0.03)} onClick={() => scrollToAnchor(ref.current, s.anchor)}>
                  <div className="rail"><span className="node">{done ? <Icon name="check" size={13} stroke={3} /> : s.range[0]}</span><span className="line" /></div>
                  <div className="body col" style={{ gap: 2 }}>
                    <span className="t small" style={{ fontWeight: 600, transition: 'color .2s' }}>{s.text}</span>
                    {now && <span className="tag acc" style={{ alignSelf: 'flex-start' }}>Hier zit jij ({cur})</span>}
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <nav className="toc card" style={{ padding: 10 }}>
            <div className="nav-title" style={{ paddingTop: 4 }}>Inhoud</div>
            {view.toc.map((s) => <a key={s.anchor + s.index} href="javascript:void(0)" className={s.toclevel > 1 ? 'l2' : ''} onClick={() => scrollToAnchor(ref.current, s.anchor)}>{s.text}</a>)}
          </nav>
        )}
      </aside>
      <div className="grow" style={{ minWidth: 0 }}>
        <WikiContent html={view.html} />
        <div style={{ clear: 'both' }} />
      </div>
    </div>
  );
}

function QuestTab({ skill, xp }) {
  const { game, cfg, questMap } = useApp();
  const pq = questMap;
  const q = useAsync(async () => {
    const hit = await resolveTitle(game, cfg.pages.questXp);
    if (!hit) return { none: true };
    const p = await parsePage(game, hit.title);
    return { hit, p };
  }, [game]);
  const [hideDone, setHideDone] = useState(true);

  const rows = useMemo(() => {
    if (!q.data?.p) return [];
    const root = toDoc(game, q.data.p.text);
    const out = new Map();
    const re1 = new RegExp(`([\\d.,]+)\\s*(?:xp\\s*)?(?:in\\s*)?${skill}\\b`, 'i');
    const re2 = new RegExp(`${skill}\\b\\D{0,8}([\\d.,]+)`, 'i');
    for (const t of readTables(root)) {
      for (const cells of t.rows) {
        const rowText = cells.map((c) => c.textContent).join(' | ');
        if (!new RegExp(`\\b${skill}\\b`, 'i').test(rowText)) continue;
        const a = cells[0].querySelector('a[data-title]') || cells.map((c) => c.querySelector('a[data-title]')).find(Boolean);
        if (!a) continue;
        const title = a.getAttribute('data-title');
        let amount = null;
        for (const c of cells) {
          const tx = c.textContent;
          if (!new RegExp(`\\b${skill}\\b`, 'i').test(tx) && !c.querySelector(`img[alt*="${skill}"]`)) continue;
          const m = tx.match(re1) || tx.match(re2) || tx.match(/([\d][\d.,]{2,})/);
          if (m) { amount = Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')); break; }
        }
        const prev = out.get(title);
        if (!prev || (amount || 0) > (prev.amount || 0)) out.set(title, { title, amount, status: questStatus(pq, title) });
      }
    }
    return [...out.values()].sort((a, b) => (b.amount || 0) - (a.amount || 0));
  }, [q.data, game, skill, pq]);

  if (q.loading) return <div className="col"><Skel h={40} /><Skel h={40} /><Skel h={40} /></div>;
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (q.data?.none || !rows.length) return <Empty icon="quest" title="Geen quest-XP gevonden">De wiki-pagina met quest-beloningen gaf geen rijen voor {skill}.</Empty>;

  const open = rows.filter((r) => r.status !== 'done');
  const shown = hideDone && pq ? open : rows;
  const gain = open.reduce((a, r) => a + (r.amount || 0), 0);
  const after = xp != null ? levelFor(xp + gain) : null;

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid g3">
        <div className="card accent"><div className="small muted">Te verdienen via quests</div><div className="num" style={{ fontSize: 30 }}><CountUp value={gain} format={(v) => nl(v)} /> XP</div></div>
        <div className="card"><div className="small muted">Quests met {skill}-XP</div><div className="num" style={{ fontSize: 30 }}>{open.length}<span className="muted" style={{ fontSize: 16 }}> open / {rows.length}</span></div></div>
        <div className="card"><div className="small muted">Level na alle open quests</div><div className="num" style={{ fontSize: 30 }}>{after ?? '–'}{xp != null && <span className="muted" style={{ fontSize: 16 }}> (nu {levelFor(xp)})</span>}</div></div>
      </div>
      <div className="row between">
        <span className="small muted">Tip: lange early-game grinds sla je over door deze quests eerst te doen. Bron: <a href={wikiHref(q.data.hit.title)}>{q.data.hit.title}</a></span>
        {pq && <label className="row small muted" style={{ gap: 8 }}><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Verberg voltooide</label>}
      </div>
      <div className="scroll-x card" style={{ padding: 0 }}>
        <table className="dt">
          <thead><tr><th>Quest</th><th className="r">{skill}-XP</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.title} className="rise" style={delay(Math.min(i, 25), 0, 0.02)}>
                <td><a href={href('quests', r.title)} style={{ color: 'var(--tx)', fontWeight: 600 }}>{r.title}</a></td>
                <td className="r">{r.amount ? nl(r.amount) : '–'}</td>
                <td>{r.status === 'done' ? <span className="tag ok">Klaar</span> : r.status === 'started' ? <span className="tag acc">Bezig</span> : <span className="tag">Open</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SkillGuide({ skill, query }) {
  const { cfg, player, update, goals, game, toast } = useApp();
  const known = cfg.skills.find((s) => s.toLowerCase() === skill.toLowerCase()) || skill;
  const s = (player.data?.skills || []).find((x) => x.name === known);
  const isF2P = cfg.f2p.includes(known);
  const modes = MODES.filter(([k]) => k !== 'f2p' || isF2P);
  const [mode, setMode] = useState(query.mode && modes.some(([k]) => k === query.mode) ? query.mode : 'p2p');
  const [target, setTarget] = useState(99);

  const xp = s?.xp ?? null;
  const lvl = s?.level ?? null;
  const toTarget = xp != null ? Math.max(0, xpFor(target) - xp) : null;
  const inGoals = (goals || []).some((g) => g.type === 'skill' && g.game === game && g.skill === known && g.level === target);

  const addGoal = () => {
    update('goals', (g) => [...(g || []), { id: Date.now().toString(36), type: 'skill', game, skill: known, level: target, startXp: xp, createdAt: Date.now() }]);
    toast(`Doel: ${known} ${target}`, 'ok');
  };

  return (
    <div className="page">
      <header className="row wrap between rise" style={{ alignItems: 'center', gap: 20 }}>
        <div className="row" style={{ gap: 18, minWidth: 0 }}>
          <span className="icon-tile" style={{ width: 64, height: 64, borderRadius: 18 }}><SkillIcon skill={known} size={40} /></span>
          <div className="col" style={{ gap: 6, minWidth: 0 }}>
            <div className="eyebrow"><a href={href('skills')} className="row" style={{ gap: 6, color: 'var(--mut)' }}><Icon name="back" size={14} /> Skill guides</a><span>{cfg.short}</span>{isF2P && <span className="tag">F2P-skill</span>}</div>
            <h1 className="title">{known} 1–{cfg.maxLevel}</h1>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 16 }}>
          <Ring value={xp != null ? Math.min(1, xp / xpFor(target)) : 0} size={92} stroke={8}><span className="num" style={{ fontSize: 24 }}>{lvl ?? '–'}</span><span className="dim" style={{ fontSize: 10.5 }}>van {target}</span></Ring>
          <div className="col" style={{ gap: 6 }}>
            <span className="small muted">XP tot level</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm icon" aria-label="Doel omlaag" onClick={() => setTarget((t) => Math.max((lvl || 1) + 1, t - 1))}><Icon name="minus" size={14} /></button>
              <span className="num" style={{ fontSize: 22, minWidth: 34, textAlign: 'center' }}>{target}</span>
              <button className="btn sm icon" aria-label="Doel omhoog" onClick={() => setTarget((t) => Math.min(99, t + 1))}><Icon name="plus" size={14} /></button>
            </div>
            <span className="mono small acc">{toTarget != null ? `${nl(toTarget)} XP` : `${nl(xpFor(target))} XP totaal`}</span>
          </div>
          <button className={`btn ${inGoals ? '' : 'primary'}`} onClick={addGoal} disabled={inGoals}><Icon name={inGoals ? 'check' : 'target'} size={16} /> {inGoals ? 'Staat in doelen' : `Doel: ${target}`}</button>
        </div>
      </header>

      <section className="card rise" style={{ padding: 0, animationDelay: '.08s' }}>
        <div className="tabs" style={{ padding: '0 14px' }} role="tablist">
          {modes.map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
        </div>
        <div style={{ padding: '8px clamp(18px, 2.4vw, 30px) 6px' }} className="small muted">{modes.find(([k]) => k === mode)?.[2]}</div>
        <div key={mode + known} className="fade" style={{ padding: 'clamp(14px, 2vw, 26px) clamp(18px, 2.4vw, 30px) 30px' }}>
          {mode === 'quest' ? <QuestTab skill={known} xp={xp} /> : <GuideTab skill={known} mode={mode} mine={lvl} />}
        </div>
      </section>
    </div>
  );
}
