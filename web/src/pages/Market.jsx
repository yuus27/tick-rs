import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { prices, useAsync } from '../lib/api.js';
import { buildItems } from '../lib/market.js';
import { recentUpdates } from '../lib/wiki.js';
import { Icon, PageHead, SkelRows, Empty, ErrorBox, ItemIcon, Spark, CountUp, delay } from '../components/ui.jsx';
import { ItemDrawer } from './GE.jsx';
import { short, pct, nl } from '../lib/format.js';
import { wikiHref } from '../lib/router.js';

const HOURS = 24;
const unwrap = (r) => (r && typeof r === 'object' && 'data' in r ? r.data : r) || {};
const mid = (d) => {
  if (!d) return null;
  const h = d.avgHighPrice ?? d.avgHigh ?? null;
  const l = d.avgLowPrice ?? d.avgLow ?? null;
  if (h && l) return (h + l) / 2;
  return h || l || d.price || null;
};
const volOf = (d) => (d ? (Number(d.highPriceVolume ?? d.highVolume ?? 0) || 0) + (Number(d.lowPriceVolume ?? d.lowVolume ?? 0) || 0) || Number(d.volume || 0) : 0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

export const RULES = {
  'GE-101': { name: 'Volumepiek', desc: 'Handelsvolume ver boven het 24u-gemiddelde' },
  'GE-201': { name: 'Prijssprong', desc: 'Prijs stijgt sterk t.o.v. de 24u-mediaan' },
  'GE-202': { name: 'Prijscrash', desc: 'Prijs daalt sterk t.o.v. de 24u-mediaan' },
  'GE-301': { name: 'Mogelijke pump', desc: 'Prijs omhoog + volumepiek in een dunne markt (merch clan?)' },
  'GE-302': { name: 'Dump', desc: 'Prijs omlaag + volumepiek: iemand dumpt voorraad' },
  'GE-401': { name: 'Spread-afwijking', desc: 'Verschil koop/verkoop uitzonderlijk groot: flipkans of manipulatie' },
};
const SEV = { hoog: { c: 'var(--down)', bg: 'rgba(255,138,101,.12)', o: 0 }, middel: { c: 'var(--acc)', bg: 'var(--acc-soft)', o: 1 }, laag: { c: 'var(--blue)', bg: 'rgba(108,180,255,.12)', o: 2 } };

async function loadHistory(game) {
  const nowH = Math.floor(Date.now() / 3600_000) * 3600;
  const stamps = Array.from({ length: HOURS }, (_, i) => nowH - (i + 1) * 3600);
  const [mapping, latest, ...hours] = await Promise.all([
    prices(game, 'mapping', {}, 6 * 3600_000),
    prices(game, 'latest', {}, 55_000),
    ...stamps.map((ts) => prices(game, '1h', { timestamp: ts }, 24 * 3600_000).catch(() => null)),
  ]);
  return { mapping: unwrap(mapping), latest: unwrap(latest), hours: hours.map(unwrap), stamps };
}

function detect(game, data, minGp, settings) {
  const items = buildItems(game, data.mapping, data.latest, data.hours[0], settings);
  const alerts = [];
  for (const it of items) {
    const series = data.hours.map((h) => mid(h?.[it.id])).reverse(); // oud -> nieuw
    const vols = data.hours.map((h) => volOf(h?.[it.id])).reverse();
    const cur = series[series.length - 1];
    const curV = vols[vols.length - 1];
    const base = series.slice(0, -1).filter((x) => x != null);
    const baseV = vols.slice(0, -1);
    if (cur == null || base.length < 12) continue;
    const med = median(base);
    const mV = mean(baseV);
    if (med * Math.max(mV, curV) < minGp) continue; // te weinig handel om iets te zeggen
    const sP = Math.max(std(base), med * 0.004);
    const sV = Math.max(std(baseV), 1);
    const dP = (cur - med) / med;
    const zP = (cur - med) / sP;
    const vR = mV > 0 ? curV / mV : curV > 0 ? 99 : 0;
    const zV = (curV - mV) / sV;
    const thin = med * mV < minGp * 4;
    const sevP = Math.abs(dP) >= 0.15 ? 'hoog' : Math.abs(dP) >= 0.08 ? 'middel' : 'laag';
    const hits = [];
    if (dP >= 0.1 && vR >= 3 && thin) hits.push(['GE-301', 'hoog']);
    else if (dP <= -0.08 && vR >= 3) hits.push(['GE-302', 'hoog']);
    else {
      if (Math.abs(dP) >= 0.05 && Math.abs(zP) >= 3) hits.push([dP > 0 ? 'GE-201' : 'GE-202', sevP]);
      if (vR >= 3 && zV >= 3 && curV >= 20) hits.push(['GE-101', vR >= 6 ? 'hoog' : 'middel']);
    }
    if (it.high != null && it.low != null && it.low > 0) {
      const spread = (it.high - it.low) / it.low;
      const baseSpread = Math.abs(dP) < 0.05 ? spread : null;
      if (baseSpread != null && spread >= 0.08 && it.vol >= 10 && it.margin > 0) hits.push(['GE-401', spread >= 0.2 ? 'middel' : 'laag']);
    }
    if (hits.length) {
      // één melding per item: zwaarste regel voorop, de rest als extra regels
      hits.sort((a, b) => SEV[a[1]].o - SEV[b[1]].o);
      const [rule, sev] = hits[0];
      alerts.push({ key: `${it.id}:${rule}:${data.stamps[0]}`, item: it, rule, rules: hits.map((h) => h[0]), sev, dP, vR, curV, mV, med, cur, series, vols });
    }
  }
  return alerts.sort((a, b) => SEV[a.sev].o - SEV[b.sev].o || Math.abs(b.dP) * Math.log10(b.med * b.curV + 10) - Math.abs(a.dP) * Math.log10(a.med * a.curV + 10));
}

function VolBars({ vols }) {
  const mx = Math.max(...vols, 1);
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 26, width: 96 }}>
      {vols.map((v, i) => <span key={i} style={{ flex: 1, height: `${Math.max(4, (v / mx) * 100)}%`, borderRadius: 1.5, background: i === vols.length - 1 ? 'var(--acc)' : '#2A3242', transformOrigin: 'bottom', animation: `grow .6s ${i * 0.015}s both` }} />)}
    </div>
  );
}

export default function Market() {
  const { game, cfg, settings } = useApp();
  const [tick, setTick] = useState(0);
  const hist = useAsync(() => loadHistory(game), [game, tick]);
  const upd = useAsync(() => recentUpdates(game, 3), [game]);
  const [minGp, setMinGp] = useState(5_000_000);
  const [sev, setSev] = useState('alle');
  const [rule, setRule] = useState('alle');
  const [acked, setAcked] = useState({});
  const [sel, setSel] = useState(null);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 5 * 60_000); return () => clearInterval(t); }, []);

  const alerts = useMemo(() => (hist.data ? detect(game, hist.data, minGp, settings) : []), [hist.data, game, minGp, settings]);
  const visible = alerts.filter((a) => !acked[a.key] && (sev === 'alle' || a.sev === sev) && (rule === 'alle' || a.rules.includes(rule)));
  const count = (s) => alerts.filter((a) => a.sev === s && !acked[a.key]).length;
  const updateDay = (upd.data || []).find((u) => Date.now() - new Date(u.date).getTime() < 48 * 3600_000);
  const lastHour = hist.data ? new Date(hist.data.stamps[0] * 1000) : null;
  const natureLow = hist.data?.latest?.[561]?.low;
  const selItem = sel ? alerts.find((a) => a.item.id === sel)?.item : null;

  return (
    <div className="page">
      <PageHead
        eyebrow={<><span className="dot live" /><span>Detectie · {cfg.short}</span><span className="dim">baseline: laatste {HOURS} uur · ververst elke 5 min</span></>}
        title="Markt-radar"
        sub="Anomaliedetectie op de Grand Exchange: pumps, dumps, crashes en volumepieken, zoals een SIEM voor de GE"
        right={<button className="btn" onClick={() => setTick((x) => x + 1)}><Icon name="refresh" size={15} /> Nu scannen</button>}
      />

      {updateDay && (
        <a href={wikiHref(updateDay.title)} className="card accent rise row wrap between" style={{ color: 'var(--tx)' }}>
          <span className="row" style={{ gap: 12 }}><Icon name="bell" size={18} style={{ color: 'var(--acc)' }} /><span><b>Update-dag:</b> {updateDay.title.replace(/^Update:/, '')}. Verwacht meer volatiliteit; dit is hét moment voor investeringen.</span></span>
          <Icon name="arrow" size={16} />
        </a>
      )}

      <section className="grid g4">
        {[
          ['Hoog', count('hoog'), SEV.hoog.c, 'pumps, dumps, grote crashes'],
          ['Middel', count('middel'), SEV.middel.c, 'duidelijke afwijkingen'],
          ['Laag', count('laag'), SEV.laag.c, 'opvallend, mogelijk flipkans'],
          ['Items gescand', hist.data ? Object.keys(hist.data.latest).length : null, 'var(--tx)', lastHour ? `uur van ${lastHour.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : '…'],
        ].map(([l, v, c, s], i) => (
          <div key={l} className="card rise stat" style={delay(i, 0.04, 0.05)}>
            <div className="lbl row" style={{ gap: 8 }}>{i < 3 && <span className="dot" style={{ background: c }} />}{l}</div>
            <div className="val num" style={{ color: c }}>{hist.data ? <CountUp value={v} /> : '–'}</div>
            <div className="small dim">{s}</div>
          </div>
        ))}
      </section>

      <section className="card rise" style={{ padding: 0, animationDelay: '.15s' }}>
        <div className="row wrap between" style={{ padding: 16, gap: 12 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {['alle', 'hoog', 'middel', 'laag'].map((s) => <button key={s} className={`chip ${sev === s ? 'on' : ''}`} onClick={() => setSev(s)} style={{ textTransform: 'capitalize' }}>{s}</button>)}
            <select className="input" style={{ width: 220, height: 34 }} value={rule} onChange={(e) => setRule(e.target.value)} aria-label="Detectieregel">
              <option value="alle">Alle regels</option>
              {Object.entries(RULES).map(([k, r]) => <option key={k} value={k}>{k} · {r.name}</option>)}
            </select>
          </div>
          <label className="row small muted" style={{ gap: 8 }}>Min. handel/uur
            <select className="input" style={{ width: 120, height: 34 }} value={minGp} onChange={(e) => setMinGp(Number(e.target.value))}>
              {[1e6, 5e6, 25e6, 100e6].map((v) => <option key={v} value={v}>{short(v)} gp</option>)}
            </select>
          </label>
        </div>
        {hist.loading && !hist.data && <div style={{ padding: 16 }}><span className="small muted">24 uur aan marktdata ophalen…</span><SkelRows n={8} h={52} /></div>}
        {hist.error && <ErrorBox error={hist.error} onRetry={hist.reload} />}
        {hist.data && !visible.length && <Empty icon="check" title="Geen detecties">Rustige markt binnen je filters. Verlaag de minimale handel om kleinere items mee te nemen.</Empty>}
        {!!visible.length && (
          <div className="scroll-x" style={{ maxHeight: 760, overflowY: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Ernst</th><th style={{ minWidth: 230 }}>Item</th><th>Detectie</th><th className="r">Δ prijs</th><th className="r">Volume</th><th>24u prijs</th><th>24u volume</th><th /></tr></thead>
              <tbody>
                {visible.slice(0, 150).map((a, i) => (
                  <tr key={a.key} className="rise" style={{ ...delay(Math.min(i, 20), 0, 0.02), cursor: 'pointer' }} onClick={() => setSel(a.item.id)}>
                    <td><span className="tag" style={{ background: SEV[a.sev].bg, color: SEV[a.sev].c, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 10.5 }}>{a.sev}</span></td>
                    <td><div className="row" style={{ gap: 12 }}><ItemIcon item={a.item} /><div className="col" style={{ gap: 1, minWidth: 0 }}><span className="trunc" style={{ fontWeight: 600 }}>{a.item.name}</span><span className="small dim mono">{short(a.med)} → {short(a.cur)}</span></div></div></td>
                    <td><div className="col" style={{ gap: 1 }}><span className="mono small" style={{ color: SEV[a.sev].c }}>{a.rule}</span><span className="small" style={{ whiteSpace: 'normal', maxWidth: 260 }}>{RULES[a.rule].name}{a.rules.length > 1 && <span className="dim"> + {a.rules.slice(1).map((r) => RULES[r].name.toLowerCase()).join(', ')}</span>}</span></div></td>
                    <td className={`r ${a.dP >= 0 ? 'up' : 'down'}`} style={{ fontWeight: 600 }}>{a.dP >= 0 ? '+' : ''}{pct(a.dP * 100, 1)}</td>
                    <td className="r">{a.vR >= 1 ? `${a.vR.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}×` : nl(a.curV)}</td>
                    <td><Spark values={a.series} w={96} h={28} color={a.dP >= 0 ? 'var(--up)' : 'var(--down)'} /></td>
                    <td><VolBars vols={a.vols} /></td>
                    <td><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setAcked((x) => ({ ...x, [a.key]: true })); }} title="Afhandelen (verbergen)">Afhandelen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card rise" style={{ animationDelay: '.2s' }}>
        <h2 className="h" style={{ marginBottom: 10 }}>Detectieregels</h2>
        <div className="grid g3">
          {Object.entries(RULES).map(([k, r]) => (
            <div key={k} className="col" style={{ gap: 3, padding: 12, borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--line)' }}>
              <span className="mono small acc">{k}</span>
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span className="small muted">{r.desc}</span>
            </div>
          ))}
        </div>
        <p className="small dim" style={{ margin: '12px 0 0' }}>Werking: per item de mediaanprijs en het gemiddelde uurvolume van de afgelopen 23 uur als baseline, vergeleken met het laatste volle uur (z-score + procentuele afwijking). Alleen items boven je minimale handel per uur tellen mee. Dit is een signaal, geen advies: check altijd zelf de grafiek.</p>
      </section>

      <ItemDrawer item={selItem} onClose={() => setSel(null)} natureLow={natureLow} />
    </div>
  );
}
