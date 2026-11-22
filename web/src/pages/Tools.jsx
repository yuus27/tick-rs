import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { Icon, PageHead, CountUp, delay, SkillIcon } from '../components/ui.jsx';
import { nl, short } from '../lib/format.js';
import { xpFor, levelFor, osrsCombat } from '../lib/xp.js';
import BuyVsGrind from '../components/BuyVsGrind.jsx';

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

function XpCalc() {
  const { cfg, player } = useApp();
  const [skill, setSkill] = useState(cfg.skills.includes('Prayer') ? 'Prayer' : cfg.skills[0]);
  const s = (player.data?.skills || []).find((x) => x.name === skill);
  const [cur, setCur] = useState(null);
  const [tgt, setTgt] = useState(99);
  const [per, setPer] = useState('');
  const [cost, setCost] = useState('');
  const [rate, setRate] = useState('');
  const fromLvl = cur ?? s?.level ?? 1;
  const fromXp = cur == null && s?.xp != null ? s.xp : xpFor(fromLvl);
  const t = Math.max(fromLvl + 1, tgt);
  const need = Math.max(0, xpFor(t) - fromXp);
  const actions = Number(per) > 0 ? Math.ceil(need / Number(per)) : null;
  const total = actions && Number(cost) ? actions * Number(cost) : null;
  const hours = Number(rate) > 0 ? need / Number(rate) : null;

  return (
    <section className="card rise col" style={{ gap: 16 }}>
      <div className="row wrap between">
        <h2 className="h">XP-calculator</h2>
        <div className="row" style={{ gap: 8 }}>
          <SkillIcon skill={skill} size={22} />
          <select className="input" style={{ width: 200, height: 38 }} value={skill} onChange={(e) => { setSkill(e.target.value); setCur(null); }} aria-label="Skill">{cfg.skills.map((x) => <option key={x}>{x}</option>)}</select>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Stepper label={s && cur == null ? 'Huidig (hiscores)' : 'Huidig level'} value={fromLvl} set={setCur} max={98} />
        <Stepper label="Doel-level" value={t} set={setTgt} min={2} />
        <div className="card accent col" style={{ padding: 14, gap: 4 }}>
          <span className="small muted">XP nodig</span>
          <span className="num acc" style={{ fontSize: 28 }}><CountUp value={need} ms={600} /></span>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label className="field">XP per actie (bv. 252 per dragon bone)<input className="input mono" type="number" value={per} onChange={(e) => setPer(e.target.value)} placeholder="252" /></label>
        <label className="field">Kosten per actie (gp, optioneel)<input className="input mono" type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="2400" /></label>
        <label className="field">Jouw XP per uur (optioneel)<input className="input mono" type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="250000" /></label>
      </div>
      <div className="grid g3">
        {[['Acties', actions != null ? nl(actions) : '–'], ['Totale kosten', total != null ? short(total) : '–'], ['Tijd', hours != null ? `${hours.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur` : '–'], ['gp / XP', total != null && need ? (total / need).toLocaleString('nl-NL', { maximumFractionDigits: 2 }) : '–']].map(([l, v], i) => (
          <div key={l} className="rise" style={{ ...delay(i, 0, 0.04), padding: 14, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--line)' }}>
            <div className="small muted">{l}</div><div className="num" style={{ fontSize: 22 }}>{v}</div>
          </div>
        ))}
      </div>
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
      <PageHead eyebrow={<span>Officiële XP-tabel · {cfg.short}</span>} title="Calculators" sub="Kopen of grinden, wat een level kost, hoe dry je bent en wat je overhoudt na tax" />
      <BuyVsGrind />
      <XpCalc />
      <div className="grid g2">
        <DryCalc />
        <TaxCalc />
      </div>
      <CombatCalc />
    </div>
  );
}
