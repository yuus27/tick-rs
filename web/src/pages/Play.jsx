import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useIntel } from '../lib/intel.js';
import { useAdvisor, makePlan } from '../lib/advisor.js';
import { useMarket, buildItems } from '../lib/market.js';
import { Icon, PageHead, Skel, SkillIcon, delay, CountUp, Empty, Bar } from '../components/ui.jsx';
import { nl, short } from '../lib/format.js';

const TIMES = [[30, '30 min'], [60, '1 uur'], [90, '1,5 uur'], [120, '2 uur'], [180, '3 uur'], [240, '4 uur+']];
const MOODS = [
  ['mix', 'Maakt niet uit', 'spark'],
  ['quest', 'Questen', 'quest'],
  ['afk', 'AFK / chill', 'clock'],
  ['actief', 'Actief / bossen', 'flame'],
  ['geld', 'Geld verdienen', 'coins'],
];
const KIND = { quest: 'Quest', skill: 'Training', money: 'Geld', run: 'Run', ge: 'GE', combo: 'Combo' };
const fmtT = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, '0')}`;

function Reasons({ items, max = 4 }) {
  if (!items?.length) return null;
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {items.slice(0, max).map((r, i) => <span key={i} className={`tag ${i === 0 ? 'acc' : ''}`} style={{ fontSize: 11.5 }}>{i === 0 && <Icon name="spark" size={11} />} {r}</span>)}
    </div>
  );
}

function IdeaCard({ title, icon, items, onAdd, inPlan, empty, render }) {
  const list = items.filter((x) => !inPlan.has(x.id));
  return (
    <div className="card col" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 10, marginBottom: 4 }}><span className="icon-tile" style={{ width: 32, height: 32 }}><Icon name={icon} size={15} style={{ color: 'var(--acc)' }} /></span><h3 className="h">{title}</h3><span className="small dim" style={{ marginLeft: 'auto' }}>{list.length}</span></div>
      {!list.length && <span className="small muted">{empty}</span>}
      {list.slice(0, 7).map((it) => (
        <div key={it.id} className="list-row" style={{ padding: '9px 8px', alignItems: 'flex-start', gap: 10 }}>
          {it.skill ? <SkillIcon skill={it.skill} size={18} /> : <Icon name={it.icon || 'spark'} size={16} style={{ color: 'var(--mut)', marginTop: 2 }} />}
          <a href={it.to} className="grow col" style={{ gap: 3, minWidth: 0, color: 'var(--tx)' }}>
            <span className="small" style={{ fontWeight: 600 }}>{it.title}</span>
            {render ? render(it) : <span className="small dim">{(it.reasons || []).slice(0, 3).join(' · ')}</span>}
          </a>
          {onAdd && <button className="btn sm icon ghost" onClick={() => onAdd(it)} aria-label={`${it.title} toevoegen aan sessie`} title="Toevoegen aan sessie"><Icon name="plus" size={14} /></button>}
        </div>
      ))}
    </div>
  );
}

export default function Play() {
  const { game, cfg, goals, player, settings, update, rsn, toast, levels, questMap } = useApp();
  const intel = useIntel();
  const m = useMarket(game);
  const acct = useMemo(() => {
    const a = settings.acct?.[game] || {};
    return { members: a.members ?? true, iron: a.iron ?? (player.data?.ironman ?? false) };
  }, [settings.acct, game, player.data]);
  const setAcct = (patch) => update('settings', (s) => ({ ...s, acct: { ...(s.acct || {}), [game]: { ...acct, ...patch } } }));

  const [time, setTime] = useState(90);
  const [mood, setMood] = useState('mix');
  const [seed, setSeed] = useState(0);
  const [alt, setAlt] = useState({});
  const [removed, setRemoved] = useState([]);
  const [extras, setExtras] = useState([]);
  const [done, setDone] = useState({});
  const [tab, setTab] = useState('quests');
  const reset = () => { setAlt({}); setRemoved([]); setExtras([]); setDone({}); };

  const flips = useMemo(() => buildItems(game, m.mapping, m.latest, m.hour, settings).filter((i) => i.margin > 0 && i.vol >= 50 && i.age < 1800 * (game === 'osrs' ? 1 : 6) && i.roi < 40).sort((a, b) => b.profit - a.profit).slice(0, 8), [game, m.mapping, m.latest, m.hour, settings]);
  const adv = useAdvisor({ game, intel, levels, player, questMap, goals, flips, acct });
  const base = useMemo(() => makePlan(adv, { time, mood, seed, alt, removed }), [adv, time, mood, seed, alt, removed]);
  const blocks = useMemo(() => {
    const all = [...base, ...extras.filter((e) => !removed.includes(e.id)).map((e) => ({ ...e, extra: true }))];
    let t = 0;
    return all.map((b) => { const r = { ...b, start: t, gp: b.profit ? (b.profit * b.mins) / 60 : 0 }; t += b.mins; return r; });
  }, [base, extras, removed]);
  const total = blocks.reduce((a, b) => a + b.mins, 0);
  const sessQuests = blocks.filter((b) => b.kind === 'quest' && !b.part);
  const qp = sessQuests.reduce((a, b) => a + (b.qp || 0), 0);
  const gp = blocks.reduce((a, b) => a + (b.gp || 0), 0);
  const levelGain = useMemo(() => {
    const g = {};
    for (const b of blocks) {
      if (b.kind === 'skill' && b.title.includes('→')) { const to = +b.title.split('→')[1]; if (b.est == null || b.est <= b.mins + 5) g[b.skill] = Math.max(g[b.skill] || 0, to); }
      if (b.kind === 'quest' && !b.part) for (const u of b.ups || []) g[u.skill] = Math.max(g[u.skill] || 0, u.to);
    }
    return Object.entries(g).map(([s, to]) => ({ skill: s, from: levels[s] ?? 1, to })).filter((x) => x.to > x.from);
  }, [blocks, levels]);
  const inPlan = new Set(blocks.map((b) => b.id));

  const addIdea = (it) => {
    if (it.kind === 'combo') {
      const add = it.steps.filter((s) => !inPlan.has(s.id)).map((s) => ({ ...s, mins: s.kind === 'quest' ? s.mins : Math.max(10, Math.min(60, s.est ?? 30)), comboOf: it.title }));
      setExtras((x) => [...x, ...add]);
      toast(`Combo toegevoegd (${add.length} blokken)`, 'ok');
      return;
    }
    if (inPlan.has(it.id)) { toast('Staat al in je sessie', 'warn'); return; }
    const mins = it.kind === 'quest' ? it.mins : it.kind === 'run' ? 10 : it.kind === 'ge' ? 5 : it.kind === 'skill' ? Math.max(10, Math.min(60, it.est ?? 30)) : 30;
    setExtras((x) => [...x, { ...it, mins }]);
    setRemoved((r) => r.filter((id) => id !== it.id));
    toast(`${it.title} toegevoegd (${mins} min)`, 'ok');
  };
  const swap = (b) => setAlt((a) => ({ ...a, [b.slot]: (a[b.slot] || 0) + 1 }));
  const remove = (b) => { if (b.extra) setExtras((x) => x.filter((e) => e.id !== b.id)); else setRemoved((r) => [...r, b.id]); };
  const setMins = (b, d) => { if (b.extra) setExtras((x) => x.map((e) => (e.id === b.id ? { ...e, mins: Math.max(5, e.mins + d) } : e))); };

  const snap = adv.snapshot;
  const TABS = [
    ['quests', 'Quests voor jou', adv.quests?.length],
    ['train', 'Trainen & unlocks', adv.train?.length],
    ['combos', "Combo's", adv.combos?.length],
    ['near', 'Bijna te doen', adv.nearQuests?.length],
    ['money', 'Geld & runs', (adv.money?.length || 0) + (adv.runs?.length || 0)],
  ];

  return (
    <div className="page">
      <PageHead eyebrow={<><span className="dot live" /><span>Persoonlijk · {cfg.label}</span>{adv.loadingDeep && <span className="dim">quest-voorwaarden, quest-XP en training per level ophalen…</span>}</>} title="Wat zal ik nu doen?" sub="Een plan op basis van je levels, XP, quests, voorwaarden, quest-beloningen en wat je net wel of niet kunt." />

      <section className="card rise col" style={{ gap: 18, animationDelay: '.05s' }}>
        <div className="row wrap" style={{ gap: 28, alignItems: 'flex-end' }}>
          <div className="col" style={{ gap: 8 }}>
            <span className="small muted">Hoeveel tijd heb je?</span>
            <div className="seg" style={{ flexWrap: 'wrap' }}>{TIMES.map(([v, l]) => <button key={v} className={time === v ? 'on' : ''} onClick={() => { setTime(v); reset(); }}>{l}</button>)}</div>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <span className="small muted">Waar heb je zin in?</span>
            <div className="row wrap" style={{ gap: 8 }}>
              {MOODS.map(([k, l, ic]) => <button key={k} className={`chip ${mood === k ? 'on' : ''}`} style={{ height: 40, padding: '0 16px' }} onClick={() => { setMood(k); reset(); }}><Icon name={ic} size={15} /> {l}</button>)}
            </div>
          </div>
          <div className="col" style={{ gap: 8 }}>
            <span className="small muted">Account</span>
            <div className="row" style={{ gap: 8 }}>
              <div className="seg"><button className={acct.members ? 'on' : ''} onClick={() => { setAcct({ members: true }); reset(); }}>Members</button><button className={!acct.members ? 'on' : ''} onClick={() => { setAcct({ members: false }); reset(); }}>F2P</button></div>
              <button className={`chip ${acct.iron ? 'on' : ''}`} style={{ height: 38 }} onClick={() => { setAcct({ iron: !acct.iron }); reset(); }} title="Geen GE-flips of koop/verwerk-methodes">Ironman</button>
            </div>
          </div>
        </div>
      </section>

      {!rsn && <div className="card accent row wrap between"><span>Zonder RSN weet tick. je levels en quests niet; het plan wordt dan algemeen.</span><a className="btn primary sm" href="#/settings">RSN instellen</a></div>}

      <section className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div className="card rise col" style={{ flex: '999 1 560px', minWidth: 0, gap: 4, animationDelay: '.1s' }}>
          <div className="row wrap between" style={{ marginBottom: 12, gap: 10 }}>
            <div className="col" style={{ gap: 2 }}>
              <h2 className="h">Jouw sessie</h2>
              <span className="small muted">{blocks.length} blokken · {fmtT(total)} van {fmtT(time)}{total > time + 10 ? ' (iets over je tijd)' : ''}</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm ghost" onClick={reset}>Herstel</button>
              <button className="btn sm" onClick={() => { setSeed((s) => s + 1); reset(); }}><Icon name="refresh" size={14} /> Ander plan</button>
            </div>
          </div>
          {!adv.ready && <div className="col" style={{ gap: 10 }}><span className="small muted">Je account doorrekenen: quests, voorwaarden, skill guides en money-methodes… (eerste keer even geduld)</span><Skel h={84} /><Skel h={84} /><Skel h={84} /></div>}
          {adv.ready && !blocks.length && <Empty icon="spark" title="Nog geen blokken">Voeg iets toe uit de ideeën hieronder, of kies een andere stemming.</Empty>}
          <div className="route">
            {blocks.map((b, i) => {
              const isDone = !!done[b.id];
              const nextIdx = blocks.findIndex((x) => !done[x.id]);
              const comboStart = b.comboOf && blocks[i - 1]?.comboOf !== b.comboOf;
              return (
                <div key={b.id + i} className={`route-step ${isDone ? 'done' : i === nextIdx ? 'now' : ''} rise`} style={delay(Math.min(i, 12), 0.05, 0.05)}>
                  <div className="rail">
                    <button className="node" style={{ cursor: 'pointer', width: 36, height: 36 }} onClick={() => setDone((d) => ({ ...d, [b.id]: !d[b.id] }))} aria-label={isDone ? 'Markeer als niet gedaan' : 'Markeer als gedaan'}>
                      {isDone ? <Icon name="check" size={15} stroke={3} /> : b.skill ? <SkillIcon skill={b.skill} size={19} /> : <Icon name={b.icon || 'spark'} size={15} />}
                    </button>
                    <span className="line" />
                  </div>
                  <div className="body col" style={{ gap: 8, opacity: isDone ? 0.55 : 1, transition: 'opacity .3s' }}>
                    {comboStart && <span className="eyebrow acc" style={{ fontSize: 10.5 }}><Icon name="route" size={11} /> Combo · eerst trainen, dan de quest</span>}
                    <div className="row wrap between" style={{ gap: 10 }}>
                      <div className="col" style={{ gap: 3, minWidth: 0, flex: '1 1 260px' }}>
                        <span className="mono small dim">{fmtT(b.start)} – {fmtT(b.start + b.mins)} · {b.mins} min · {KIND[b.kind]}{b.gp ? ` · ≈ +${short(b.gp)}` : ''}</span>
                        <span className="num" style={{ fontSize: 18, textDecoration: isDone ? 'line-through' : 'none' }}>{b.title}</span>
                        <span className="small muted">{b.sub}</span>
                        {b.detail && <span className="small dim">{b.detail}</span>}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <a className="btn sm" href={b.to}>{b.cta} <Icon name="arrow" size={13} /></a>
                        {!b.extra && b.alts > 0 && !b.comboOf && <button className="btn sm icon ghost" onClick={() => swap(b)} title="Wissel voor een alternatief" aria-label="Wissel"><Icon name="refresh" size={14} /></button>}
                        {b.extra && b.kind !== 'quest' && <><button className="btn sm icon ghost" onClick={() => setMins(b, -10)} aria-label="10 min korter"><Icon name="minus" size={13} /></button><button className="btn sm icon ghost" onClick={() => setMins(b, 10)} aria-label="10 min langer"><Icon name="plus" size={13} /></button></>}
                        <button className="btn sm icon ghost" onClick={() => remove(b)} title="Verwijder" aria-label="Verwijder"><Icon name="x" size={14} /></button>
                      </div>
                    </div>
                    <Reasons items={b.reasons} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="col" style={{ flex: '1 1 300px', gap: 16 }}>
          <div className="card accent rise col" style={{ gap: 12, animationDelay: '.15s' }}>
            <h3 className="h">Wat deze sessie oplevert</h3>
            <div className="row between"><span className="muted">Quests</span><span className="num" style={{ fontSize: 22 }}><CountUp value={sessQuests.length} />{qp ? <span className="muted" style={{ fontSize: 14 }}> · {qp} QP</span> : null}</span></div>
            <div className="row between"><span className="muted">Verwachte GP</span><span className="num up" style={{ fontSize: 22 }}>{gp ? '+' + short(gp) : '–'}</span></div>
            {levelGain.length > 0 && (
              <div className="col" style={{ gap: 6 }}>
                <span className="muted small">Verwachte level-ups</span>
                <div className="row wrap" style={{ gap: 6 }}>{levelGain.map((g) => <span key={g.skill} className="tag ok"><SkillIcon skill={g.skill} size={13} /> {g.from} → {g.to}</span>)}</div>
              </div>
            )}
            <div className="row between"><span className="muted">Klaar</span><span className="num acc" style={{ fontSize: 22 }}>{blocks.filter((b) => done[b.id]).length}/{blocks.length}</span></div>
          </div>

          <div className="card rise col" style={{ gap: 12, animationDelay: '.2s' }}>
            <h3 className="h">Jouw account nu</h3>
            {!snap && <Skel h={120} />}
            {snap && <>
              <div className="col" style={{ gap: 6 }}>
                <div className="row between small"><span className="muted">Quests</span><span className="mono">{snap.questsDone} / {snap.questsTotal}</span></div>
                <Bar value={snap.questsTotal ? snap.questsDone / snap.questsTotal : 0} />
              </div>
              {snap.nextRoute && (
                <a href={`#/quests/${encodeURIComponent(snap.nextRoute.title)}`} className="col" style={{ gap: 3, color: 'var(--tx)' }}>
                  <span className="small muted">Volgende in de optimale route</span>
                  <span style={{ fontWeight: 600 }}>{snap.nextRoute.title}</span>
                  <span className={`small ${snap.nextRoute.ok ? 'up' : ''}`} style={{ color: snap.nextRoute.ok ? undefined : 'var(--acc)' }}>{snap.nextRoute.ok ? 'Je kunt hem nu doen' : snap.nextRoute.miss?.length ? `Mist nog: ${snap.nextRoute.miss.slice(0, 3).join(', ')}` : 'Requirements nog niet bekend'}</span>
                </a>
              )}
              {snap.levelUps.length > 0 && (
                <div className="col" style={{ gap: 6 }}>
                  <span className="small muted">Bijna een level-up</span>
                  {snap.levelUps.map((u) => (
                    <div key={u.skill} className="row" style={{ gap: 8 }}>
                      <SkillIcon skill={u.skill} size={16} />
                      <span className="small grow">{u.skill} → {u.level}</span>
                      <span className="mono small dim">{nl(u.need)} XP</span>
                    </div>
                  ))}
                </div>
              )}
              {snap.bigUnlock && (
                <div className="col" style={{ gap: 3 }}>
                  <span className="small muted">Grootste unlock in zicht</span>
                  <span className="row small" style={{ gap: 8 }}><SkillIcon skill={snap.bigUnlock.skill} size={16} /><b>{snap.bigUnlock.skill} {snap.bigUnlock.cur} → {snap.bigUnlock.to}</b></span>
                  <span className="small dim">opent {snap.bigUnlock.unlocks.slice(0, 3).map((u) => u.name || u.title).join(', ')}{snap.bigUnlock.unlocks.length > 3 ? ` +${snap.bigUnlock.unlocks.length - 3}` : ''}</span>
                </div>
              )}
              {snap.lowest.length > 0 && <span className="small dim">Laagste skills: {snap.lowest.map((s) => `${s.skill} ${s.level}`).join(', ')}</span>}
            </>}
          </div>
        </div>
      </section>

      <section className="col rise" style={{ gap: 12, animationDelay: '.25s' }}>
        <div className="row wrap between" style={{ gap: 10 }}>
          <h2 className="h">Meer ideeën voor jou</h2>
          <div className="row wrap" style={{ gap: 6 }}>{TABS.map(([k, l, n]) => <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}{n != null ? <span className="dim" style={{ marginLeft: 6 }}>{n}</span> : null}</button>)}</div>
        </div>
        {!adv.ready && <div className="card"><Skel h={160} /></div>}
        {adv.ready && (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {tab === 'quests' && <>
              <IdeaCard title="Beste quests nu" icon="quest" items={adv.quests} onAdd={addIdea} inPlan={inPlan} empty="Geen quests waarvoor je alle eisen hebt." render={(it) => <Reasons items={it.reasons} max={3} />} />
              <IdeaCard title="Snelle quests (≤ 20 min)" icon="clock" items={adv.quests.filter((q) => q.mins <= 20)} onAdd={addIdea} inPlan={inPlan} empty="Geen korte quests open." render={(it) => <Reasons items={it.reasons} max={3} />} />
              <IdeaCard title="Quests met level-ups" icon="skills" items={adv.quests.filter((q) => q.ups?.length).sort((a, b) => b.ups.length - a.ups.length)} onAdd={addIdea} inPlan={inPlan} empty="Geen quest-XP die je nu een level geeft." render={(it) => <span className="small dim">{it.ups.map((u) => `${u.skill} ${u.from}→${u.to}`).join(', ')}</span>} />
            </>}
            {tab === 'train' && <>
              <IdeaCard title="Trainen dat iets opent" icon="route" items={adv.train.filter((t) => !t.quick)} onAdd={addIdea} inPlan={inPlan} empty="Geen unlocks in zicht." render={(it) => <Reasons items={it.reasons} max={3} />} />
              <IdeaCard title="Snelle level-ups" icon="star" items={adv.train.filter((t) => t.quick)} onAdd={addIdea} inPlan={inPlan} empty="Geen skill zit vlak voor een level." render={(it) => <Reasons items={it.reasons} max={3} />} />
            </>}
            {tab === 'combos' && <IdeaCard title="Trainen → quest" icon="route" items={adv.combos} onAdd={addIdea} inPlan={inPlan} empty="Geen quests waar je net een paar levels voor mist." render={(it) => <Reasons items={it.reasons} max={3} />} />}
            {tab === 'near' && <IdeaCard title="Wat je nog mist" icon="lock" items={adv.nearQuests} inPlan={inPlan} empty="Niets in de buurt." render={(it) => <span className="small dim">Mist: {[...it.missSk.map((m) => `${m.skill} ${m.cur}/${m.level}`), ...it.missQ].slice(0, 4).join(', ')}</span>} />}
            {tab === 'money' && <>
              <IdeaCard title="Geld" icon="coins" items={adv.money} onAdd={addIdea} inPlan={inPlan} empty="Geen methodes die je nu kunt doen." render={(it) => <Reasons items={it.reasons} max={3} />} />
              <IdeaCard title="Korte runs" icon="clock" items={[...adv.runs, ...adv.ge]} onAdd={addIdea} inPlan={inPlan} empty="Geen runs gevonden." render={(it) => <Reasons items={it.reasons} max={2} />} />
            </>}
          </div>
        )}
      </section>
    </div>
  );
}
