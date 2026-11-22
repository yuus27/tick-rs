import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { snapshot, diff } from '../lib/session.js';
import { Icon, PageHead, SkillIcon, CountUp, Empty, delay } from '../components/ui.jsx';
import { nl, short } from '../lib/format.js';

const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}u ${String(m % 60).padStart(2, '0')}m` : `${m} min`; };
const perHour = (v, ms) => (ms > 5 * 60000 ? (v * 3600000) / ms : null);

// Start/stop vanuit de topbar én vanaf deze pagina
export function useSession() {
  const { game, rsn, player, questMap, journal, sessions, update, settings, toast, loadPlayer } = useApp();
  const active = sessions?.active && sessions.active.game === game ? sessions.active : null;
  const start = () => {
    if (!player.data) { toast('Stel eerst je RSN in, dan kan tick. je voortgang meten', 'warn'); return; }
    update('sessions', (s) => ({ ...(s || {}), active: { game, rsn, startedAt: Date.now(), snap: snapshot(game, player.data, questMap, journal) } }));
    toast('Sessie gestart: veel plezier!', 'ok');
  };
  const stop = () => {
    if (!active) return;
    const now = snapshot(game, player.data, questMap, journal);
    const d = diff(game, active.snap, now, questMap, journal, settings);
    const entry = { id: Date.now().toString(36), game, rsn: active.rsn, start: active.startedAt, end: Date.now(), ...d };
    update('sessions', (s) => ({ active: null, history: [entry, ...((s?.history) || [])].slice(0, 200) }));
    toast(`Sessie opgeslagen: ${d.levels} level${d.levels === 1 ? '' : 's'}, ${d.quests.length} quest${d.quests.length === 1 ? '' : 's'}${d.xp ? `, +${short(d.xp)} XP` : ''}`, 'ok');
  };
  return { active, start, stop, refresh: loadPlayer, rsn };
}

function Stat({ label, value, sub, cls }) {
  return (
    <div className="card col" style={{ gap: 4 }}>
      <span className="small muted">{label}</span>
      <span className={`num ${cls || ''}`} style={{ fontSize: 28 }}>{value}</span>
      {sub && <span className="small dim">{sub}</span>}
    </div>
  );
}

function Gains({ d, ms }) {
  if (!d) return null;
  const xph = perHour(d.xp, ms);
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Stat label="XP" value={d.xp ? <>+<CountUp value={d.xp} format={short} /></> : '–'} sub={xph ? `${short(xph)} XP/u` : null} cls={d.xp ? 'up' : ''} />
        <Stat label="Levels" value={d.levels ? `+${d.levels}` : '0'} sub={d.skills.filter((s) => s.to > s.from).map((s) => s.skill).slice(0, 3).join(', ') || null} cls={d.levels ? 'acc' : ''} />
        <Stat label="Quests" value={d.quests.length} sub={d.quests.slice(0, 2).join(', ') || null} />
        <Stat label="GE-winst" value={d.flips ? (d.gp >= 0 ? '+' : '') + short(d.gp) : '–'} sub={d.flips ? `${d.flips} flip${d.flips === 1 ? '' : 's'} uit je journaal` : 'geen flips gelogd'} cls={d.gp > 0 ? 'up' : d.gp < 0 ? 'down' : ''} />
      </div>
      {d.skills.length > 0 && (
        <div className="card col" style={{ gap: 8 }}>
          <h3 className="h">Per skill</h3>
          {d.skills.map((s, i) => {
            const max = Math.max(...d.skills.map((x) => x.xp || 0), 1);
            return (
              <div key={s.skill} className="row rise" style={{ gap: 10, ...delay(i, 0, 0.03) }}>
                <SkillIcon skill={s.skill} size={18} />
                <span style={{ width: 110 }}>{s.skill}</span>
                <div className="grow" style={{ height: 8, background: 'var(--line)', borderRadius: 6, overflow: 'hidden' }}><div className="growx" style={{ width: `${((s.xp || 0) / max) * 100}%`, height: '100%', background: 'var(--acc)' }} /></div>
                <span className="mono small" style={{ width: 90, textAlign: 'right' }}>{s.xp != null ? '+' + nl(s.xp) : '–'}</span>
                <span className="small" style={{ width: 70, textAlign: 'right' }}>{s.to > s.from ? <span className="up">{s.from} → {s.to}</span> : <span className="dim">{s.to}</span>}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Sessions() {
  const { game, cfg, player, questMap, journal, sessions, settings, update, toast } = useApp();
  const { active, start, stop, refresh, rsn } = useSession();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const live = useMemo(() => (active && player.data ? diff(game, active.snap, snapshot(game, player.data, questMap, journal), questMap, journal, settings) : null), [active, player.data, questMap, journal, settings, game]);
  const hist = (sessions?.history || []).filter((h) => h.game === game);
  const totals = useMemo(() => {
    const ms = hist.reduce((a, h) => a + (h.end - h.start), 0);
    const best = [...hist].sort((a, b) => (b.xp || 0) - (a.xp || 0))[0];
    return { ms, xp: hist.reduce((a, h) => a + (h.xp || 0), 0), levels: hist.reduce((a, h) => a + (h.levels || 0), 0), quests: hist.reduce((a, h) => a + (h.quests?.length || 0), 0), gp: hist.reduce((a, h) => a + (h.gp || 0), 0), best };
  }, [hist]);
  const remove = (id) => { update('sessions', (s) => ({ ...s, history: (s.history || []).filter((h) => h.id !== id) })); toast('Sessie verwijderd', 'ok'); };
  const maxXp = Math.max(1, ...hist.slice(0, 20).map((h) => h.xp || 0));

  return (
    <div className="page">
      <PageHead eyebrow={<><span className={`dot ${active ? 'live' : ''}`} /><span>{cfg.label}</span></>} title="Sessies" sub="Start een sessie als je gaat spelen. tick. meet wat je eraan overhoudt: XP, levels, quests en GE-winst." />

      {!rsn && <div className="card accent row wrap between"><span>Zonder RSN kan tick. je voortgang niet meten.</span><a className="btn primary sm" href="#/settings">RSN instellen</a></div>}

      <section className={`card ${active ? 'accent' : ''} rise col`} style={{ gap: 16 }}>
        <div className="row wrap between" style={{ gap: 12 }}>
          <div className="col" style={{ gap: 4 }}>
            <span className="eyebrow">{active ? 'Sessie loopt' : 'Geen actieve sessie'}</span>
            <span className="num" style={{ fontSize: 34 }}>{active ? fmtDur(now - active.startedAt) : '0 min'}</span>
            {active && <span className="small muted">Gestart om {new Date(active.startedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · {player.data?.syncedAt ? `WikiSync ${new Date(player.data.syncedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : 'hiscores'}</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {active && <button className="btn" onClick={refresh} title="Haal je nieuwste levels op"><Icon name="refresh" size={15} /> Ververs</button>}
            {active ? <button className="btn primary" onClick={stop}><Icon name="check" size={15} /> Stop en bewaar</button> : <button className="btn primary" onClick={start} disabled={!rsn}><Icon name="spark" size={15} /> Start sessie</button>}
          </div>
        </div>
        {active && <Gains d={live} ms={now - active.startedAt} />}
        {active && <span className="small dim">Tip: de hiscores werken je XP pas bij als je uitlogt of van wereld wisselt. WikiSync (RuneLite / Plugin Hub) gaat sneller.</span>}
      </section>

      <section className="grid rise" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, animationDelay: '.1s' }}>
        <Stat label="Sessies" value={hist.length} sub={fmtDur(totals.ms) + ' gespeeld'} />
        <Stat label="XP totaal" value={totals.xp ? '+' + short(totals.xp) : '–'} sub={totals.ms ? `${short(perHour(totals.xp, totals.ms) || 0)} XP/u gemiddeld` : null} />
        <Stat label="Levels" value={totals.levels} sub={`${totals.quests} quests`} />
        <Stat label="GE-winst" value={totals.gp ? short(totals.gp) : '–'} cls={totals.gp > 0 ? 'up' : ''} />
      </section>

      <section className="card rise col" style={{ gap: 10, animationDelay: '.15s' }}>
        <h2 className="h">Geschiedenis</h2>
        {!hist.length && <Empty icon="clock" title="Nog geen sessies">Start je eerste sessie hierboven of via de knop rechtsboven.</Empty>}
        {hist.slice(0, 50).map((h, i) => {
          const ms = h.end - h.start;
          return (
            <div key={h.id} className="list-row rise" style={{ gap: 14, alignItems: 'center', ...delay(Math.min(i, 10), 0, 0.03) }}>
              <div className="col" style={{ width: 150 }}>
                <span style={{ fontWeight: 600 }}>{new Date(h.start).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="small dim">{new Date(h.start).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · {fmtDur(ms)}</span>
              </div>
              <div className="grow col" style={{ gap: 4 }}>
                <div style={{ height: 8, background: 'var(--line)', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: `${((h.xp || 0) / maxXp) * 100}%`, height: '100%', background: totals.best?.id === h.id ? 'var(--up)' : 'var(--acc)' }} /></div>
                <span className="small muted">{[h.xp ? `+${short(h.xp)} XP` : null, h.levels ? `+${h.levels} level${h.levels === 1 ? '' : 's'}` : null, h.quests?.length ? `${h.quests.length} quest${h.quests.length === 1 ? '' : 's'}` : null, h.flips ? `${h.gp >= 0 ? '+' : ''}${short(h.gp)} GE` : null].filter(Boolean).join(' · ') || 'geen gemeten voortgang'}{totals.best?.id === h.id && hist.length > 1 ? ' · beste sessie' : ''}</span>
              </div>
              <button className="btn sm icon ghost" onClick={() => remove(h.id)} aria-label="Sessie verwijderen"><Icon name="x" size={14} /></button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
