import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { useMarket, buildItems } from '../lib/market.js';
import { loadMethods } from '../lib/intel.js';
import { useJudgedMethods } from '../lib/mmg.js';
import { Icon, SkillIcon, CountUp } from './ui.jsx';
import { nl, short } from '../lib/format.js';
import { xpFor } from '../lib/xp.js';

// XP per actie, items per actie en acties per uur zijn schattingen; alles is aanpasbaar in de UI.
const PRESETS = {
  osrs: {
    Prayer: [
      { name: 'Dragon bones · gilded altar', xp: 252, items: [['Dragon bones', 1]], perHour: 1300 },
      { name: 'Superior dragon bones · gilded altar', xp: 525, items: [['Superior dragon bones', 1]], perHour: 1300, req: 70 },
      { name: 'Big bones · gilded altar', xp: 52.5, items: [['Big bones', 1]], perHour: 1300 },
      { name: 'Dragon bones · Chaos altar (wildy)', xp: 252, items: [['Dragon bones', 0.5]], perHour: 1300 },
    ],
    Construction: [
      { name: 'Oak larders', xp: 480, items: [['Oak plank', 8]], perHour: 580 },
      { name: 'Mahogany tables', xp: 840, items: [['Mahogany plank', 6]], perHour: 520, req: 52 },
      { name: 'Teak garden benches', xp: 540, items: [['Teak plank', 6]], perHour: 600, req: 66 },
    ],
    Firemaking: [
      { name: 'Yew logs', xp: 202.5, items: [['Yew logs', 1]], perHour: 1050, req: 60 },
      { name: 'Magic logs', xp: 303.8, items: [['Magic logs', 1]], perHour: 950, req: 75 },
    ],
    Magic: [{ name: 'High Level Alchemy (alleen runes)', xp: 65, items: [['Nature rune', 1]], perHour: 1200, req: 55 }],
    Crafting: [{ name: "Green d'hide bodies", xp: 186, items: [['Green dragon leather', 3]], perHour: 1400, req: 63 }],
    Fletching: [{ name: 'Magic longbows (u)', xp: 91.5, items: [['Magic logs', 1]], perHour: 2600, req: 85 }],
    Cooking: [{ name: 'Sharks (zonder doorverkoop)', xp: 210, items: [['Raw shark', 1]], perHour: 1300, req: 80 }],
  },
  rs3: {
    Prayer: [
      { name: 'Dragon bones · gilded altar', xp: 252, items: [['Dragon bones', 1]], perHour: 1300 },
      { name: 'Frost dragon bones · gilded altar', xp: 630, items: [['Frost dragon bones', 1]], perHour: 1300 },
    ],
    Construction: [{ name: 'Mahogany tables', xp: 840, items: [['Mahogany plank', 6]], perHour: 520, req: 52 }],
    Firemaking: [{ name: 'Magic logs', xp: 303.8, items: [['Magic logs', 1]], perHour: 950, req: 75 }],
    Magic: [{ name: 'High Level Alchemy (alleen runes)', xp: 65, items: [['Nature rune', 1]], perHour: 1200, req: 55 }],
  },
};

export default function BuyVsGrind() {
  const { game, cfg, player, settings, levels, questMap } = useApp();
  const presets = PRESETS[game];
  const skills = Object.keys(presets);
  const [skill, setSkill] = useState(skills[0]);
  const [mi, setMi] = useState(0);
  const [tgt, setTgt] = useState(70);
  const [gpSrc, setGpSrc] = useState('best');
  const [manualGp, setManualGp] = useState(1_500_000);
  const [freeRate, setFreeRate] = useState('');
  const [perHour, setPerHour] = useState(null);
  useEffect(() => { setSkill(Object.keys(PRESETS[game])[0]); setMi(0); }, [game]);
  useEffect(() => { setMi(0); setPerHour(null); }, [skill]);

  const m = useMarket(game, { poll: 5 * 60_000 });
  const items = useMemo(() => buildItems(game, m.mapping, m.latest, m.hour, settings), [game, m.mapping, m.latest, m.hour, settings]);
  const byName = useMemo(() => Object.fromEntries(items.map((i) => [i.name.toLowerCase(), i])), [items]);
  const money = useAsync(() => loadMethods(game, cfg), [game]);
  const J = useJudgedMethods(game, money.data?.methods, levels, questMap, { limit: 30 });
  const best = useMemo(() => J.judged.filter((x) => x.profit > 0 && x.status === 'ok').sort((a, b) => b.profit - a.profit)[0] || J.judged.filter((x) => x.profit > 0 && x.status === 'stretch' && x.recGap <= 10).sort((a, b) => b.profit - a.profit)[0], [J.judged]);

  const plist = presets[skill] || presets[skills[0]];
  const method = plist[mi] || plist[0];
  const s = (player.data?.skills || []).find((x) => x.name === skill);
  const curXp = s?.xp ?? 0;
  const cur = s?.level ?? 1;
  const target = Math.max(cur + 1, tgt);
  const xp = Math.max(0, xpFor(target, skill) - curXp);
  const actions = Math.ceil(xp / method.xp);
  const unit = method.items.reduce((a, [n, q]) => { const it = byName[n.toLowerCase()]; const p = it?.high ?? it?.low; return a + (p != null ? p * q : NaN); }, 0);
  const cost = Number.isFinite(unit) ? actions * unit : null;
  const rate = perHour ?? method.perHour;
  const trainH = actions / rate;
  const gpph = gpSrc === 'best' ? best?.profit : Number(manualGp) || 0;
  const earnH = cost != null && gpph ? cost / gpph : null;
  const buyH = earnH != null ? earnH + trainH : null;
  const freeH = Number(freeRate) > 0 ? xp / Number(freeRate) : null;
  const winner = buyH != null && freeH != null ? (buyH < freeH ? 'buy' : 'grind') : null;
  const maxH = Math.max(buyH || 0, freeH || 0, 1);

  return (
    <section className="card rise col accent" style={{ gap: 18 }}>
      <div className="row wrap between">
        <div className="col" style={{ gap: 2 }}>
          <h2 className="h" style={{ fontSize: 22 }}>Kopen of grinden?</h2>
          <span className="small muted">Wat kost een level echt, uitgedrukt in jóuw speeltijd?</span>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <SkillIcon skill={skill} size={22} />
          <select className="input" style={{ width: 170, height: 38 }} value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill">{skills.map((x) => <option key={x}>{x}</option>)}</select>
          <select className="input" style={{ width: 300, height: 38 }} value={mi} onChange={(e) => { setMi(Number(e.target.value)); setPerHour(null); }} aria-label="Koopmethode">{plist.map((p, i) => <option key={p.name} value={i}>{p.name}{p.req ? ` (vanaf ${p.req})` : ''}</option>)}</select>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <div className="col" style={{ gap: 4, padding: 14, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--line)' }}>
          <span className="small muted">{skill} nu → doel</span>
          <div className="row between"><span className="num" style={{ fontSize: 24 }}>{cur} → {target}</span>
            <span className="row" style={{ gap: 4 }}><button className="btn sm icon" onClick={() => setTgt(Math.max(cur + 1, target - 1))} aria-label="Doel omlaag"><Icon name="minus" size={13} /></button><button className="btn sm icon" onClick={() => setTgt(Math.min(game === 'rs3' ? 120 : 99, target + 1))} aria-label="Doel omhoog"><Icon name="plus" size={13} /></button></span>
          </div>
          <span className="mono small acc">{nl(xp)} XP</span>
        </div>
        <label className="field" style={{ padding: 14, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--line)' }}>Acties per uur (koopmethode)
          <input className="input mono" type="number" value={rate} onChange={(e) => setPerHour(Number(e.target.value) || 1)} />
        </label>
        <div className="col" style={{ gap: 6, padding: 14, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--line)' }}>
          <span className="small muted">Jouw GP per uur</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }}><button style={{ padding: '0 9px', whiteSpace: 'nowrap' }} className={gpSrc === 'best' ? 'on' : ''} onClick={() => setGpSrc('best')}>Beste methode</button><button style={{ padding: '0 9px', whiteSpace: 'nowrap' }} className={gpSrc === 'manual' ? 'on' : ''} onClick={() => setGpSrc('manual')}>Zelf</button></div>
          {gpSrc === 'best' ? <span className="small" title={best?.name}>{best ? <><b className="acc">{short(best.profit)}</b> · {best.name}</> : money.loading ? 'laden…' : 'geen methode gevonden'}</span>
            : <input className="input mono" style={{ height: 36 }} type="number" value={manualGp} onChange={(e) => setManualGp(e.target.value)} aria-label="GP per uur" />}
        </div>
        <label className="field" style={{ padding: 14, borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--line)' }}>XP/u van je gratis methode
          <input className="input mono" type="number" placeholder="bv. 40000" value={freeRate} onChange={(e) => setFreeRate(e.target.value)} />
        </label>
      </div>

      <div className="grid g2">
        <div className="col" style={{ gap: 12, padding: 18, borderRadius: 16, background: 'var(--bg2)', border: `1px solid ${winner === 'buy' ? 'color-mix(in srgb, var(--up) 45%, transparent)' : 'var(--line)'}` }}>
          <div className="row between"><span style={{ fontWeight: 700 }}>Kopen</span>{winner === 'buy' && <span className="tag ok">Sneller</span>}</div>
          <div className="row between small"><span className="muted">{nl(actions)}× {method.items.map(([n, q]) => `${q !== 1 ? q + '× ' : ''}${n}`).join(' + ')}</span><span className="mono">{Number.isFinite(unit) ? `${nl(unit)} gp/actie` : 'prijs onbekend'}</span></div>
          <div className="row between"><span className="muted">Totale kosten</span><span className="num" style={{ fontSize: 22 }}>{cost != null ? <CountUp value={cost} format={(v) => short(v)} ms={700} /> : '–'}</span></div>
          <div className="row between small"><span className="muted">Geld verdienen</span><span className="mono">{earnH != null ? `${earnH.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} u` : '–'}</span></div>
          <div className="row between small"><span className="muted">Trainen</span><span className="mono">{trainH.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} u</span></div>
          <div className="bar" style={{ height: 10 }}><i style={{ width: `${((buyH || 0) / maxH) * 100}%`, background: winner === 'buy' ? 'var(--up)' : 'var(--acc)' }} /></div>
          <div className="row between"><span style={{ fontWeight: 600 }}>Totaal</span><span className="num" style={{ fontSize: 26 }}>{buyH != null ? `${buyH.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur` : '–'}</span></div>
        </div>
        <div className="col" style={{ gap: 12, padding: 18, borderRadius: 16, background: 'var(--bg2)', border: `1px solid ${winner === 'grind' ? 'color-mix(in srgb, var(--up) 45%, transparent)' : 'var(--line)'}` }}>
          <div className="row between"><span style={{ fontWeight: 700 }}>Grinden (gratis)</span>{winner === 'grind' && <span className="tag ok">Sneller</span>}</div>
          <span className="small muted">{freeH == null ? 'Vul hierboven de XP/u van je gratis methode in (bv. bones uit kills, Wintertodt, Mahogany Homes).' : `${nl(xp)} XP ÷ ${nl(Number(freeRate))} XP/u`}</span>
          <div className="grow" />
          <div className="bar" style={{ height: 10 }}><i style={{ width: `${((freeH || 0) / maxH) * 100}%`, background: winner === 'grind' ? 'var(--up)' : 'var(--blue)' }} /></div>
          <div className="row between"><span style={{ fontWeight: 600 }}>Totaal</span><span className="num" style={{ fontSize: 26 }}>{freeH != null ? `${freeH.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur` : '–'}</span></div>
        </div>
      </div>
      {winner && (
        <div className="row" style={{ gap: 12, padding: '14px 16px', borderRadius: 14, background: 'rgba(74,222,154,.07)', border: '1px solid rgba(74,222,154,.25)' }}>
          <Icon name="spark" size={18} style={{ color: 'var(--up)' }} />
          <span><b>{winner === 'buy' ? 'Kopen' : 'Grinden'}</b> scheelt je <b className="up">{Math.abs((buyH || 0) - (freeH || 0)).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur</b>{winner === 'buy' && cost ? `, als je de ${short(cost)} verdient met ${gpSrc === 'best' && best ? best.name : 'je eigen methode'}.` : '.'}</span>
        </div>
      )}
      <span className="small dim">Prijzen: live instant-buy van de GE. XP/actie en acties/uur zijn schattingen; pas acties/uur aan naar jouw tempo.</span>
    </section>
  );
}
