import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { Icon, PageHead, CountUp, delay, SkillIcon, Bar, Gp } from '../components/ui.jsx';
import { getJSON, useAsync } from '../lib/api.js';
import { gains, dailyRate, sessionRate, parseXp } from '../lib/xptrack.js';
import { virtualMax, virtualOn } from '../lib/vlevels.js';
import { nl, short } from '../lib/format.js';
import { xpFor, levelFor, osrsCombat, MAX_XP } from '../lib/xp.js';
import BuyVsGrind from '../components/BuyVsGrind.jsx';
import { goalMax, skillMax } from '../lib/games.js';

function Stepper({ label, value, set, min = 1, max = 99 }) {
  return (
    <div className="card col" style={{ padding: 14, gap: 4, background: 'var(--bg2)' }}>
      <span className="small muted">{label}</span>
      <div className="row between">
        <span className="num" style={{ fontSize: 28 }}>{value}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm icon" onClick={() => set(Math.max(min, value - 1))} aria-label={`${label} omlaag`}><Icon name="minus" size={14} /></button>
          <button className="btn sm icon" onClick={() => set(Math.min(max, value + 1))} aria-label={`${label} omhoog`}><Icon name="plus" size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// XP-tracker en calculator: je huidige stand komt uit je stats, je tempo uit je eigen sessies, je XP-geschiedenis
// en (RS3) RuneMetrics. Doelen tot de virtuele max of tot 200M XP.
const dayFmt = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
const hrs = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toLocaleString('nl-NL', { maximumFractionDigits: h < 10 ? 1 : 0 })} uur`);

function XpCalc() {
  const { cfg, player, game, rsn, sessions, xphist, update, toast, settings } = useApp();
  const [skill, setSkill] = useState(cfg.skills.includes('Prayer') ? 'Prayer' : cfg.skills[0]);
  const s = (player.data?.skills || []).find((x) => x.name === skill);
  const [tgtTxt, setTgtTxt] = useState('');
  const [per, setPer] = useState('');
  const [cost, setCost] = useState('');
  const [rate, setRate] = useState('');
  const cap = skillMax(game, skill);
  const vmax = virtualMax(game, skill);
  const virtual = virtualOn(settings, game);
  const curXp = s?.xp ?? (s?.level ? xpFor(s.level, skill) : 0);
  const realLvl = s?.level ?? 1;
  const shownLvl = s?.xp != null ? Math.max(realLvl, levelFor(s.xp, skill, virtual ? vmax : cap)) : realLvl;

  // Doel: een level (tot de virtuele max) of een XP-bedrag tot 200M
  const presets = [
    shownLvl < vmax && { k: 'next', label: `Level ${shownLvl + 1}`, xp: xpFor(shownLvl + 1, skill) },
    realLvl < 99 && cap > 99 && { k: '99', label: 'Level 99', xp: xpFor(99, skill) },
    realLvl < cap && { k: 'cap', label: `Max ${cap}`, xp: xpFor(cap, skill) },
    vmax > cap && shownLvl < vmax && { k: 'vmax', label: `Virtueel ${vmax}`, xp: xpFor(vmax, skill) },
    curXp < MAX_XP && { k: '200m', label: '200M XP', xp: MAX_XP },
  ].filter(Boolean);
  const typed = parseXp(tgtTxt);
  // Tot 200 is het een level (max de virtuele max), daarboven een XP-bedrag
  const typedLvl = typed != null && typed <= 200 ? Math.max(2, Math.min(vmax, typed)) : null;
  const typedXp = typed == null ? null : typedLvl ? xpFor(typedLvl, skill) : Math.min(MAX_XP, typed);
  const [pick, setPick] = useState('cap');
  const chosen = typedXp != null ? { k: 'typed', label: typedLvl ? `Level ${typedLvl}` : `${short(typedXp)} XP`, xp: typedXp } : presets.find((p) => p.k === pick) || presets[0];
  const targetXp = chosen?.xp ?? MAX_XP;
  const need = Math.max(0, targetXp - curXp);
  const prog = targetXp ? Math.min(1, curXp / targetXp) : 1;

  // Tempo: automatisch uit je data, en anders wat je zelf invult
  const sess = sessionRate(sessions, game, skill);
  const day7 = dailyRate(xphist, game, rsn, skill, s?.xp, 7);
  const day30 = dailyRate(xphist, game, rsn, skill, s?.xp, 30);
  const monthly = useAsync(() => (game === 'rs3' && rsn ? getJSON(`/api/rs3/xpmonthly/${encodeURIComponent(rsn)}/${encodeURIComponent(skill)}`, 3600e3) : Promise.resolve(null)), [game, rsn, skill]);
  const months = (monthly.data?.months || []).slice(-12);
  const monthAvg = months.length ? months.reduce((a, m) => a + m.xp, 0) / months.length : null;
  const manual = Number(rate) > 0 ? Number(rate) : null;
  const paces = [
    sess && { k: 'sess', label: 'Jouw sessies', val: `${short(sess.perHour)} XP/u`, eta: need ? `≈ ${hrs(need / sess.perHour)} spelen` : 'gehaald', sub: `${sess.sessions} sessie${sess.sessions === 1 ? '' : 's'}, ${hrs(sess.hours)} gemeten` },
    day7 && day7.perDay > 0 && { k: 'd7', label: `Laatste ${Math.round(day7.days)} dag${Math.round(day7.days) === 1 ? '' : 'en'}`, val: `${short(day7.perDay)} XP/dag`, eta: need ? `klaar rond ${dayFmt(Date.now() + (need / day7.perDay) * 864e5)}` : 'gehaald', sub: 'uit je XP-geschiedenis in tick.' },
    day30 && day30.days > 10 && day30.perDay > 0 && { k: 'd30', label: `Laatste ${Math.round(day30.days)} dagen`, val: `${short(day30.perDay)} XP/dag`, eta: need ? `klaar rond ${dayFmt(Date.now() + (need / day30.perDay) * 864e5)}` : 'gehaald', sub: 'uit je XP-geschiedenis in tick.' },
    monthAvg > 0 && { k: 'rm', label: 'RuneMetrics, 12 maanden', val: `${short(monthAvg)} XP/maand`, eta: need ? `klaar rond ${dayFmt(Date.now() + (need / monthAvg) * 30.4 * 864e5)}` : 'gehaald', sub: 'gemiddelde per maand' },
    manual && { k: 'man', label: 'Jouw invoer', val: `${short(manual)} XP/u`, eta: need ? `≈ ${hrs(need / manual)} spelen` : 'gehaald', sub: 'XP per uur hieronder' },
  ].filter(Boolean);

  // Grafiekje: XP per maand (RS3) of per dag uit je eigen geschiedenis
  const hist = xphist?.[`${game}:${String(rsn || '').toLowerCase()}`]?.daily || [];
  const bars = months.length
    ? months.map((m) => ({ t: m.t, v: m.xp, l: new Date(m.t).toLocaleDateString('nl-NL', { month: 'short' }) }))
    : hist.slice(-31).map((d, i, a) => ({ t: d.t, v: i ? Math.max(0, (d.xp[skill] ?? 0) - (a[i - 1].xp[skill] ?? 0)) : 0, l: d.d.slice(8) })).slice(1);
  const barMax = Math.max(1, ...bars.map((b) => b.v));

  const actions = Number(per) > 0 ? Math.ceil(need / Number(per)) : null;
  const total = actions && Number(cost) ? actions * Number(cost) : null;
  const follow = () => {
    const lvlGoal = chosen.k !== '200m' && !(chosen.k === 'typed' && !typedLvl) ? levelFor(targetXp, skill, vmax) : null;
    update('goals', (g) => [...(g || []), { id: Date.now().toString(36), type: 'skill', game, skill, level: lvlGoal ?? Math.min(cap, levelFor(targetXp, skill, cap)), ...(lvlGoal ? {} : { targetXp }), startXp: curXp, createdAt: Date.now() }]);
    toast(`Doel toegevoegd: ${skill} → ${chosen.label}`, 'ok');
  };

  return (
    <section className="card rise col" style={{ gap: 16 }}>
      <div className="row wrap between">
        <div className="col" style={{ gap: 2 }}>
          <h2 className="h">XP-tracker</h2>
          <span className="small muted">Je stand komt uit je stats, je tempo uit je sessies en je XP-geschiedenis{game === 'rs3' ? ' en RuneMetrics' : ''}.</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <SkillIcon skill={skill} size={22} />
          <select className="input" style={{ width: 200, height: 38 }} value={skill} onChange={(e) => { setSkill(e.target.value); setTgtTxt(''); }} aria-label="Skill">{cfg.skills.map((x) => <option key={x}>{x}</option>)}</select>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <div className="card col" style={{ padding: 14, gap: 4, background: 'var(--bg2)' }}>
          <span className="small muted">Nu{s ? '' : ' (geen stats)'}</span>
          <span className="num" style={{ fontSize: 28 }}>{shownLvl}<span className="muted" style={{ fontSize: 14 }}>/{virtual ? vmax : cap}</span></span>
          <span className="small dim mono">{nl(curXp)} XP</span>
        </div>
        <div className="card col" style={{ padding: 14, gap: 4, background: 'var(--bg2)' }}>
          <span className="small muted">Doel</span>
          <span className="num" style={{ fontSize: 24 }}>{chosen?.label || '–'}</span>
          <span className="small dim mono">{nl(targetXp)} XP</span>
        </div>
        <div className="card accent col" style={{ padding: 14, gap: 4 }}>
          <span className="small muted">XP nodig</span>
          <span className="num acc" style={{ fontSize: 28 }}><CountUp value={need} ms={600} /></span>
          <span className="small dim">{Math.round(prog * 1000) / 10}% van het doel</span>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 8 }}>
        {presets.map((p) => <button key={p.k} type="button" className={`chip ${typedXp == null && chosen?.k === p.k ? 'on' : ''}`} onClick={() => { setPick(p.k); setTgtTxt(''); }}>{p.label}</button>)}
        <input className="input mono" style={{ width: 200, height: 36 }} value={tgtTxt} onChange={(e) => setTgtTxt(e.target.value)} placeholder="Eigen doel: 105 of 50m" aria-label="Eigen doel: level of XP" />
        <button type="button" className="btn sm" onClick={follow} disabled={!need}><Icon name="target" size={14} /> Volg als doel</button>
      </div>
      <Bar value={prog} label={`${short(curXp)} / ${short(targetXp)} XP`} />

      <div className="col" style={{ gap: 8 }}>
        <span className="eyebrow">Jouw tempo</span>
        {paces.length ? (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {paces.map((p, i) => (
              <div key={p.k} className="rise col" style={{ ...delay(i, 0, 0.04), gap: 3, padding: 14, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--line)' }}>
                <span className="small muted">{p.label}</span>
                <span className="num" style={{ fontSize: 20 }}>{p.val}</span>
                <span style={{ fontWeight: 600, color: 'var(--acc)' }}>{p.eta}</span>
                <span className="small dim">{p.sub}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="small muted">Nog geen tempo bekend voor {skill}. tick. houdt vanaf nu je XP bij; speel met een <a href="#/sessions">sessie</a> erbij of vul hieronder je XP per uur in.</span>
        )}
      </div>

      {bars.length > 1 && (
        <div className="col" style={{ gap: 6 }}>
          <span className="eyebrow">{months.length ? 'XP per maand (RuneMetrics)' : 'XP per dag'}</span>
          <div className="row" style={{ alignItems: 'flex-end', gap: 4, height: 90 }} role="img" aria-label={`${skill}: XP per ${months.length ? 'maand' : 'dag'}`}>
            {bars.map((b) => (
              <div key={b.t} className="col" style={{ flex: 1, alignItems: 'center', gap: 4, minWidth: 0 }} title={`${b.l}: ${nl(b.v)} XP`}>
                <div style={{ width: '100%', height: Math.max(2, (b.v / barMax) * 70), borderRadius: 4, background: b.v ? 'var(--acc)' : 'var(--line)', opacity: b.v ? 0.9 : 0.5 }} />
                <span className="small dim" style={{ fontSize: 10 }}>{b.l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="col" style={{ gap: 10 }}>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Zelf rekenen: XP per actie, kosten en XP per uur</summary>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 10 }}>
          <label className="field">XP per actie (bv. 252 per dragon bone)<input className="input mono" type="number" value={per} onChange={(e) => setPer(e.target.value)} placeholder="252" /></label>
          <label className="field">Kosten per actie (gp, optioneel)<input className="input mono" type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="2400" /></label>
          <label className="field">Jouw XP per uur (optioneel)<input className="input mono" type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="250000" /></label>
        </div>
        <div className="grid g3" style={{ marginTop: 10 }}>
          {[['Acties', actions != null ? nl(actions) : '–'], ['Totale kosten', total != null ? <Gp value={total} size={18} /> : '–'], ['gp / XP', total != null && need ? (total / need).toLocaleString('nl-NL', { maximumFractionDigits: 2 }) : '–']].map(([l, v]) => (
            <div key={l} style={{ padding: 14, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--line)' }}>
              <div className="small muted">{l}</div><div className="num" style={{ fontSize: 22 }}>{v}</div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

// Overzicht: wat heb je gedaan, per skill, vandaag / 7 dagen / 30 dagen
function XpOverview() {
  const { cfg, player, game, rsn, xphist } = useApp();
  const skills = player.data?.skills || [];
  const periods = [['24 uur', 864e5], ['7 dagen', 7 * 864e5], ['30 dagen', 30 * 864e5]];
  const g = periods.map(([, ms]) => gains(xphist, game, rsn, skills, ms));
  const first = g[2] && g[2].span > 2 * 3600e3 ? g[2] : null;
  const rows = cfg.skills.map((n) => ({ n, v: g.map((x) => x?.per[n] || 0) })).filter((r) => r.v.some(Boolean)).sort((a, b) => b.v[2] - a.v[2] || b.v[1] - a.v[1]);
  return (
    <section className="card rise col" style={{ gap: 12 }}>
      <div className="row wrap between">
        <div className="col" style={{ gap: 2 }}>
          <h2 className="h">Wat heb je gedaan?</h2>
          <span className="small muted">{first ? `XP per skill, gemeten sinds ${dayFmt(first.since)}. tick. houdt dit vanzelf bij als het open staat.` : 'tick. houdt vanaf nu je XP per skill bij. Kom morgen terug voor je eerste dag.'}</span>
        </div>
        {first && <div className="row" style={{ gap: 18 }}>{periods.map(([l], i) => <div key={l} className="col" style={{ alignItems: 'flex-end', gap: 0 }}><span className="small muted">{l}</span><span className="num acc" style={{ fontSize: 20 }}>{g[i] ? short(g[i].total) : '–'}</span></div>)}</div>}
      </div>
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Skill</th>{periods.map(([l]) => <th key={l} className="r">{l}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={r.n}>
                  <td><span className="row" style={{ gap: 8 }}><SkillIcon skill={r.n} size={18} />{r.n}</span></td>
                  {r.v.map((v, i) => <td key={i} className="r mono">{v ? `+${short(v)}` : '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DryCalc() {
  const [rate, setRate] = useState(512);
  const [kills, setKills] = useState(700);
  const [n, setN] = useState(1);
  const p1 = 1 / Math.max(1, rate);
  // kans op minstens n drops (binomiaal, cumulatief)
  const prob = useMemo(() => {
    let c = 0;
    let term = Math.pow(1 - p1, kills);
    for (let k = 0; k < n; k++) {
      c += term;
      term = term * (kills - k) / (k + 1) * p1 / (1 - p1);
    }
    return 1 - c;
  }, [p1, kills, n]);
  const color = prob < 0.5 ? 'var(--up)' : prob < 0.8 ? 'var(--acc)' : 'var(--down)';
  return (
    <section className="card rise col" style={{ gap: 14, animationDelay: '.06s' }}>
      <h2 className="h">Dry-calculator</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        <label className="field">Drop rate 1/<input className="input mono" type="number" min="1" value={rate} onChange={(e) => setRate(Math.max(1, Number(e.target.value) || 1))} /></label>
        <label className="field">Kills<input className="input mono" type="number" min="0" value={kills} onChange={(e) => setKills(Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className="field">Aantal drops<input className="input mono" type="number" min="1" value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} /></label>
      </div>
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <span className="muted">Kans dat je er nu {n === 1 ? 'eentje' : n} had</span>
        <span className="num" style={{ fontSize: 30, color }}>{(prob * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%</span>
      </div>
      <div style={{ position: 'relative', height: 14, borderRadius: 999, background: 'var(--s3)' }}>
        <div style={{ height: '100%', borderRadius: 999, width: `${prob * 100}%`, background: color, transition: 'width .7s var(--ease), background .4s' }} />
        <span style={{ position: 'absolute', top: -5, width: 4, height: 24, borderRadius: 2, background: 'var(--tx)', left: `calc(${prob * 100}% - 2px)`, transition: 'left .7s var(--ease)' }} />
      </div>
      <span className="small muted">{prob < 0.5 ? 'Onder de gemiddelde drop-tijd: nog niks aan de hand.' : prob < 0.8 ? 'Over de rate heen. Volhouden.' : `Officieel dry: ${(prob * 100).toFixed(1).replace('.', ',')}% van de spelers had hem al.`} Gemiddeld na {nl(rate * n)} kills.</span>
    </section>
  );
}

function TaxCalc() {
  const { cfg, settings } = useApp();
  const [buy, setBuy] = useState(2410);
  const [sell, setSell] = useState(2498);
  const [qty, setQty] = useState(7500);
  const tax = cfg.tax(sell, settings);
  const per = sell - tax - buy;
  const net = per * qty;
  const pctT = cfg.id === 'osrs' ? 0.02 : (settings.rs3TaxPct || 0) / 100;
  const be = Math.ceil(buy / (1 - pctT));
  return (
    <section className="card rise col" style={{ gap: 14, animationDelay: '.1s' }}>
      <h2 className="h">GE-tax calculator <span className="small muted" style={{ fontWeight: 500 }}>· {cfg.taxLabel}</span></h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
        <label className="field">Koopprijs<input className="input mono" type="number" value={buy} onChange={(e) => setBuy(Number(e.target.value) || 0)} /></label>
        <label className="field">Verkoopprijs<input className="input mono" type="number" value={sell} onChange={(e) => setSell(Number(e.target.value) || 0)} /></label>
        <label className="field">Aantal<input className="input mono" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} /></label>
      </div>
      {[['Tax per stuk', nl(tax) + (tax === 5_000_000 ? ' (cap)' : ''), 'var(--acc)'], ['Ontvangen per stuk', nl(sell - tax)], ['Marge per stuk', (per > 0 ? '+' : '') + nl(per), per > 0 ? 'var(--up)' : 'var(--down)'], ['Break-even verkoop', nl(be)], ['Totaal tax', nl(tax * qty), 'var(--mut)']].map(([l, v, c]) => (
        <div key={l} className="row between" style={{ padding: '8px 2px', borderBottom: '1px solid #161A21' }}><span className="muted">{l}</span><span className="mono" style={{ fontWeight: 600, color: c }}>{v}</span></div>
      ))}
      <div className="row between" style={{ padding: '14px 16px', borderRadius: 14, background: net >= 0 ? 'rgba(74,222,154,.07)' : 'rgba(255,138,101,.08)', border: `1px solid ${net >= 0 ? 'rgba(74,222,154,.25)' : 'rgba(255,138,101,.3)'}` }}>
        <span style={{ fontWeight: 600 }}>Netto winst</span>
        <span className="num" style={{ fontSize: 28, color: net >= 0 ? 'var(--up)' : 'var(--down)' }}>{(net >= 0 ? '+' : '') + short(net)}</span>
      </div>
    </section>
  );
}

function CombatCalc() {
  const { levels, game } = useApp();
  const keys = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Magic', 'Prayer'];
  const [lv, setLv] = useState(() => Object.fromEntries(keys.map((k) => [k, levels[k] ?? (k === 'Hitpoints' ? 10 : 1)])));
  if (game !== 'osrs') return null;
  const cb = osrsCombat(lv);
  return (
    <section className="card rise col" style={{ gap: 14, animationDelay: '.14s' }}>
      <div className="row between"><h2 className="h">Combat level</h2><span className="num acc" style={{ fontSize: 34 }}>{cb}</span></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
        {keys.map((k) => (
          <label key={k} className="field"><span className="row" style={{ gap: 6 }}><SkillIcon skill={k} size={14} />{k}</span><input className="input mono" type="number" min="1" max="99" value={lv[k]} onChange={(e) => setLv({ ...lv, [k]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} /></label>
        ))}
      </div>
      <span className="small muted">Speel met levels om te zien welke skill je het snelst een combat level oplevert.</span>
    </section>
  );
}

export default function Tools() {
  const { cfg } = useApp();
  return (
    <div className="page">
      <PageHead eyebrow={<span>Officiële XP-tabel · {cfg.short}</span>} title="Calculators" sub="Je XP-tempo en hoe lang je nog nodig hebt (tot 200M), kopen of grinden, hoe dry je bent en wat je overhoudt na tax" />
      <XpCalc />
      <XpOverview />
      <BuyVsGrind />
      <div className="grid g2">
        <DryCalc />
        <TaxCalc />
      </div>
      <CombatCalc />
    </div>
  );
}
