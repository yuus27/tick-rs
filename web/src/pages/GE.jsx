import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { useMarket, buildItems, timeseries, RANGES } from '../lib/market.js';
import { Icon, PageHead, SkelRows, ErrorBox, Empty, ItemIcon, Drawer, AreaChart, CountUp, delay } from '../components/ui.jsx';
import { nl, short, pct, ago } from '../lib/format.js';
import { wikiHref } from '../lib/router.js';
import FUImport from '../components/FUImport.jsx';

const ROI_MIN_MARGIN = 10; // gp per stuk
const ROI_MIN_PROFIT = 25_000; // gp per buy limit

const PRESETS = [
  ['flips', 'Beste flips'],
  ['volume', 'Hoog volume'],
  ['cheap', 'Lage inleg'],
  ['high', 'Hoge waarde'],
  ['alch', 'High alch'],
  ['watch', 'Watchlist'],
];

export function ItemDrawer({ item, onClose, natureLow }) {
  const { game, cfg, watchlist, update, toast, settings } = useApp();
  const ranges = RANGES[game];
  const [range, setRange] = useState(ranges[1][0]);
  useEffect(() => setRange(ranges[1][0]), [item?.id, game]);
  const ts = useAsync(() => timeseries(game, item.id, range), [game, item?.id, range], { enabled: !!item });
  const list = watchlist?.[game] || [];
  const watched = item && list.some((w) => w.id === item.id);
  const w = item && list.find((x) => x.id === item.id);

  const toggleWatch = () => {
    update('watchlist', (wl) => {
      const cur = wl?.[game] || [];
      const next = watched ? cur.filter((x) => x.id !== item.id) : [...cur, { id: item.id, name: item.name, below: null, above: null }];
      return { ...(wl || {}), [game]: next };
    });
    toast(watched ? `${item.name} van watchlist gehaald` : `${item.name} op je watchlist`, 'ok');
  };
  const setAlert = (k, v) => update('watchlist', (wl) => ({ ...(wl || {}), [game]: (wl?.[game] || []).map((x) => (x.id === item.id ? { ...x, [k]: v ? Number(v) : null } : x)) }));
  const logFlip = () => {
    update('journal', (j) => [{ id: Date.now().toString(36), game, itemId: item.id, name: item.name, qty: item.limit || 1, buy: item.low, sell: item.high, at: Date.now() }, ...(j || [])]);
    toast('Flip gelogd in je journaal', 'ok');
  };

  if (!item) return null;
  const pts = ts.data || [];
  const fmtT = (t) => { const d = new Date(t * 1000); return d.toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const alchProfit = game === 'osrs' && item.highalch && item.low != null ? item.highalch - item.low - (natureLow || 0) : null;
  const breakeven = item.low != null ? Math.ceil(item.low / (1 - (game === 'osrs' ? 0.02 : (settings.rs3TaxPct || 0) / 100))) : null;

  return (
    <Drawer open={!!item} onClose={onClose}>
      <div className="row between">
        <div className="row" style={{ gap: 14, minWidth: 0 }}>
          <ItemIcon item={item} size={32} />
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <h2 className="h trunc" style={{ fontSize: 22 }}>{item.name}</h2>
            <span className="small muted">{item.members ? 'Members' : 'F2P'} · id {item.id}</span>
          </div>
        </div>
        <button className="btn sm icon ghost" onClick={onClose} aria-label="Sluiten"><Icon name="x" size={16} /></button>
      </div>
      {item.examine && <p className="muted small" style={{ margin: 0, fontStyle: 'italic' }}>“{item.examine}”</p>}

      <div className="row wrap" style={{ gap: 26 }}>
        <div className="col" style={{ gap: 2 }}><span className="small muted">Instant buy (verkoop hier)</span><span className="num" style={{ fontSize: 26 }}>{nl(item.high)}</span><span className="small dim">{ago(item.highTime)} geleden</span></div>
        <div className="col" style={{ gap: 2 }}><span className="small muted">Instant sell (koop hier)</span><span className="num" style={{ fontSize: 26 }}>{nl(item.low)}</span><span className="small dim">{ago(item.lowTime)} geleden</span></div>
      </div>

      <div className="col" style={{ gap: 10 }}>
        <div className="seg" style={{ alignSelf: 'flex-start' }}>{ranges.map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}</div>
        {ts.loading ? <div className="skel" style={{ height: 220 }} /> : ts.error ? <ErrorBox error={ts.error} onRetry={ts.reload} /> : (
          <AreaChart h={220} series={[{ name: 'Hoog', values: pts.map((p) => p.hi) }, { name: 'Laag', values: pts.map((p) => p.lo) }]} labels={pts.map((p) => fmtT(p.t))} fmt={(v) => nl(v)} />
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        {[
          ['Marge na tax', item.margin != null ? (item.margin > 0 ? '+' : '') + nl(item.margin) : '–', item.margin > 0 ? 'var(--up)' : 'var(--down)'],
          ['Tax per stuk', nl(item.tax), 'var(--acc)'],
          ['ROI', pct(item.roi, 2)],
          ['Break-even verkoop', nl(breakeven)],
          ['Buy limit / 4u', item.limit ? nl(item.limit) : 'onbekend'],
          ['Volume (1u)', nl(item.vol)],
          ['Winst/4u (realistisch)', item.profit != null ? short(item.profit) : '–', 'var(--up)'],
          ...(game === 'osrs' ? [['High alch', item.highalch ? `${nl(item.highalch)} (${alchProfit != null ? (alchProfit > 0 ? '+' : '') + nl(alchProfit) : '–'})` : '–', alchProfit > 0 ? 'var(--up)' : undefined]] : []),
        ].map(([l, v, c]) => (
          <div key={l} style={{ padding: 12, borderRadius: 12, background: 'var(--bg2)', border: '1px solid var(--line)' }}>
            <div className="small muted">{l}</div>
            <div className="mono" style={{ fontWeight: 600, fontSize: 15, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="row wrap">
        <button className={`btn ${watched ? '' : 'primary'}`} onClick={toggleWatch}><Icon name="star" size={16} fill={watched ? 'currentColor' : 'none'} /> {watched ? 'Op watchlist' : 'Watch'}</button>
        <button className="btn" onClick={logFlip}><Icon name="book" size={16} /> Log flip</button>
        <a className="btn ghost" href={wikiHref(item.name)} onClick={onClose}><Icon name="book" size={16} /> Wiki</a>
      </div>

      {watched && (
        <div className="card col" style={{ gap: 10, padding: 16 }}>
          <div className="row"><Icon name="bell" size={16} style={{ color: 'var(--acc)' }} /><h3 className="h">Prijsalert</h3></div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="field">Melding als koopprijs onder<input className="input mono" type="number" placeholder="bv. 1200000" defaultValue={w?.below ?? ''} onBlur={(e) => setAlert('below', e.target.value)} /></label>
            <label className="field">Melding als verkoopprijs boven<input className="input mono" type="number" placeholder="bv. 1400000" defaultValue={w?.above ?? ''} onBlur={(e) => setAlert('above', e.target.value)} /></label>
          </div>
          <span className="small dim">Alerts werken zolang tick. open staat. Je krijgt een melding in de app en (als je dat toestaat) van Windows.</span>
        </div>
      )}
    </Drawer>
  );
}

export default function GE({ query }) {
  const { game, cfg, settings, watchlist, journal, update } = useApp();
  const m = useMarket(game);
  const [preset, setPreset] = useState('flips');
  const [sort, setSort] = useState('profit');
  const [q, setQ] = useState('');
  const [budget, setBudget] = useState('');
  const [sel, setSel] = useState(null);

  const items = useMemo(() => buildItems(game, m.mapping, m.latest, m.hour, settings), [game, m.mapping, m.latest, m.hour, settings]);
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const natureLow = byId[561]?.low;
  useEffect(() => { if (query.item && byId[query.item]) setSel(Number(query.item)); }, [query.item, byId]);

  const watchIds = new Set((watchlist?.[game] || []).map((w) => w.id));
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const maxIn = Number(budget) || 0;
    let r = items;
    if (term) r = r.filter((i) => i.name.toLowerCase().includes(term));
    else {
      const fresh = (i) => i.age < (game === 'osrs' ? 1800 : 3 * 3600);
      if (preset === 'flips') r = r.filter((i) => i.margin > 0 && i.vol >= 20 && fresh(i) && i.roi < 40);
      if (preset === 'volume') r = r.filter((i) => i.vol >= 2000 && i.margin != null && fresh(i));
      if (preset === 'cheap') r = r.filter((i) => i.low != null && i.low <= 50_000 && i.margin > 0 && i.vol >= 50 && fresh(i));
      if (preset === 'high') r = r.filter((i) => i.low >= 10_000_000 && i.margin != null);
      if (preset === 'alch') r = r.filter((i) => i.highalch && i.low && i.vol >= 10).map((i) => ({ ...i, alch: i.highalch - i.low - (natureLow || 0) })).filter((i) => i.alch > 0);
      if (preset === 'watch') r = r.filter((i) => watchIds.has(i.id));
    }
    if (maxIn) r = r.filter((i) => i.low != null && i.low <= maxIn);
    // ROI zegt niets bij items van een paar gp (1 gp marge op 1 gp = 100%): bij sorteren op ROI alleen items met echte winst
    if (sort === 'roi') r = r.filter((i) => i.margin >= ROI_MIN_MARGIN && i.profit >= ROI_MIN_PROFIT);
    const key = preset === 'alch' && !term && sort === 'profit' ? 'alch' : sort;
    return [...r].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity)).slice(0, 150);
  }, [items, q, preset, sort, budget, watchIds.size, natureLow, game]);

  const counts = useMemo(() => {
    const myJ = (journal || []).filter((j) => j.game === game);
    const tax = cfg.tax;
    const prof = myJ.reduce((a, j) => a + ((j.sell - tax(j.sell, settings)) - j.buy) * j.qty, 0);
    const weekAgo = Date.now() - 7 * 864e5;
    const prof7 = myJ.filter((j) => j.at > weekAgo).reduce((a, j) => a + ((j.sell - tax(j.sell, settings)) - j.buy) * j.qty, 0);
    const taxPaid = myJ.reduce((a, j) => a + tax(j.sell, settings) * j.qty, 0);
    return { flips: myJ.length, prof, prof7, taxPaid };
  }, [journal, game, cfg, settings]);

  const selItem = sel != null ? byId[sel] : null;
  const loading = !m.mapping && !m.error;
  const roiHidden = sort === 'roi';
  const head = (k, l) => <th className={`r sort ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{l}{sort === k ? ' ↓' : ''}</th>;

  return (
    <div className="page">
      <PageHead
        eyebrow={<><span className="dot live" /><span>Live · {cfg.short} · ververst elke minuut</span>{m.updatedAt && <span className="dim">bijgewerkt {ago(m.updatedAt)} geleden</span>}</>}
        title="GE-terminal"
        sub={`Marges ná tax (${cfg.taxLabel}), buy limits en realistische winst per 4 uur`}
      />

      <section className="grid g4">
        {[
          ['Items met data', items.filter((i) => i.high != null).length, (v) => nl(v), 'via wiki real-time prijzen'],
          ['Watchlist', (watchlist?.[game] || []).length, (v) => nl(v), 'met prijsalerts'],
          ['Journaal-winst (7d)', counts.prof7, (v) => (v >= 0 ? '+' : '') + short(v), `${counts.flips} flips gelogd`],
          ['Tax betaald', counts.taxPaid, (v) => short(v), 'gold sink, al verrekend'],
        ].map(([l, v, f, s], i) => (
          <div key={l} className="card rise stat" style={delay(i, 0.04, 0.05)}>
            <div className="lbl">{l}</div>
            <div className="val num" style={{ color: i === 2 ? (v >= 0 ? 'var(--up)' : 'var(--down)') : undefined }}><CountUp value={m.mapping ? v : null} format={f} /></div>
            <div className="small dim">{s}</div>
          </div>
        ))}
      </section>

      <section className="card rise" style={{ padding: 0, animationDelay: '.15s' }}>
        <div className="row wrap between" style={{ padding: 16, gap: 12 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {PRESETS.map(([k, l]) => <button key={k} className={`chip ${preset === k && !q ? 'on' : ''}`} onClick={() => { setPreset(k); setQ(''); }}>{l}</button>)}
          </div>
          <div className="row wrap">
            <input className="input" style={{ width: 230, height: 38 }} placeholder="Zoek elk item…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Zoek item" />
            <input className="input mono" style={{ width: 150, height: 38 }} placeholder="Max prijs" type="number" value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="Maximale prijs per item" />
          </div>
        </div>
        {m.error && <ErrorBox error={m.error} />}
        {roiHidden && !loading && <div className="small dim" style={{ padding: '10px 16px 0' }}>Bij sorteren op ROI verbergt tick. items met minder dan {ROI_MIN_MARGIN} gp marge of {short(ROI_MIN_PROFIT)} winst per limiet: daar is een hoge ROI misleidend.</div>}
        {loading && <div style={{ padding: 16 }}><SkelRows n={10} h={42} /></div>}
        {!loading && !rows.length && <Empty icon="chart" title="Geen items">{preset === 'watch' ? 'Open een item en klik op Watch.' : 'Pas je filter aan.'}</Empty>}
        {!!rows.length && (
          <div className="scroll-x" style={{ maxHeight: 720, overflowY: 'auto' }}>
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ minWidth: 250 }}>Item</th>
                  <th className="r">Koop</th><th className="r">Verkoop</th><th className="r">Tax</th>
                  {head('margin', 'Marge')}{head('roi', 'ROI')}<th className="r">Limit</th>{head('vol', 'Vol/u')}
                  {preset === 'alch' && !q ? <th className="r">Alch-winst</th> : head('profit', 'Winst/4u')}
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} className={sel === i.id ? 'sel' : ''} onClick={() => setSel(i.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="row" style={{ gap: 12 }}>
                        <ItemIcon item={i} />
                        <div className="col" style={{ gap: 1, minWidth: 0 }}>
                          <button onClick={(e) => { e.stopPropagation(); setSel(i.id); }} style={{ background: 'none', border: 0, padding: 0, color: 'var(--tx)', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }} className="trunc">{i.name}{watchIds.has(i.id) && <span className="acc"> ★</span>}</button>
                          <span className="small dim">{i.members ? 'Members' : 'F2P'} · {ago(Math.max(i.highTime || 0, i.lowTime || 0))}</span>
                        </div>
                      </div>
                    </td>
                    <td className={`r ${m.flash[i.id] === 'up' ? 'flash-up' : m.flash[i.id] === 'down' ? 'flash-down' : ''}`}>{short(i.low)}</td>
                    <td className={`r ${m.flash[i.id] === 'up' ? 'flash-up' : m.flash[i.id] === 'down' ? 'flash-down' : ''}`}>{short(i.high)}</td>
                    <td className="r dim">{short(i.tax)}</td>
                    <td className="r" style={{ color: i.margin > 0 ? 'var(--tx)' : 'var(--down)', fontWeight: 600 }}>{i.margin != null ? (i.margin > 0 ? '+' : '') + short(i.margin) : '–'}</td>
                    <td className="r">{pct(i.roi, 2)}</td>
                    <td className="r dim">{i.limit ? nl(i.limit) : '–'}</td>
                    <td className="r">{short(i.vol)}</td>
                    <td className="r up" style={{ fontWeight: 600 }}>{preset === 'alch' && !q ? '+' + nl(i.alch) : i.profit > 0 ? '+' + short(i.profit) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row wrap between small dim" style={{ padding: '12px 16px', borderTop: '1px solid var(--line)' }}>
          <span>Winst/4u = marge × min(buy limit, uurvolume). Koop = instant-sell-prijs, verkoop = instant-buy-prijs.</span>
          <span>Bron: RuneScape Wiki real-time prices</span>
        </div>
      </section>

      <Journal byId={byId} />

      <ItemDrawer item={selItem} onClose={() => setSel(null)} natureLow={natureLow} />
    </div>
  );
}

function Journal({ byId }) {
  const { game, cfg, journal, update, settings } = useApp();
  const [form, setForm] = useState({ name: '', qty: '', buy: '', sell: '' });
  const [imp, setImp] = useState(false);
  const mine = (journal || []).filter((j) => j.game === game);
  const tax = (p) => cfg.tax(p, settings);
  const add = (e) => {
    e.preventDefault();
    const qty = Number(form.qty), buy = Number(form.buy), sell = Number(form.sell);
    if (!form.name || !qty || !buy || !sell) return;
    update('journal', (j) => [{ id: Date.now().toString(36), game, name: form.name, qty, buy, sell, at: Date.now() }, ...(j || [])]);
    setForm({ name: '', qty: '', buy: '', sell: '' });
  };
  const del = (id) => update('journal', (j) => (j || []).filter((x) => x.id !== id));
  const total = mine.reduce((a, j) => a + (j.sell - tax(j.sell) - j.buy) * j.qty, 0);

  return (
    <section className="card rise" style={{ animationDelay: '.2s' }}>
      <div className="row wrap between" style={{ marginBottom: 14 }}>
        <div className="col" style={{ gap: 2 }}>
          <h2 className="h">Flip-journaal</h2>
          <span className="small muted">Totaal {mine.length} flips · netto <span className={total >= 0 ? 'up' : 'down'}>{(total >= 0 ? '+' : '') + short(total)}</span></span>
        </div>
        {game === 'osrs' && <button className="btn sm" onClick={() => setImp(true)}><Icon name="refresh" size={14} /> Importeer uit Flipping Utilities</button>}
      </div>
      <FUImport open={imp} onClose={() => setImp(false)} />
      <form onSubmit={add} className="grid" style={{ gridTemplateColumns: 'minmax(180px,2fr) repeat(3, minmax(100px,1fr)) auto', gap: 10, marginBottom: 14 }}>
        <input className="input" list="ge-items" placeholder="Item" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Item" />
        <datalist id="ge-items">{Object.values(byId).slice(0, 4000).map((i) => <option key={i.id} value={i.name} />)}</datalist>
        <input className="input mono" type="number" placeholder="Aantal" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} aria-label="Aantal" />
        <input className="input mono" type="number" placeholder="Koopprijs" value={form.buy} onChange={(e) => setForm({ ...form, buy: e.target.value })} aria-label="Koopprijs" />
        <input className="input mono" type="number" placeholder="Verkoopprijs" value={form.sell} onChange={(e) => setForm({ ...form, sell: e.target.value })} aria-label="Verkoopprijs" />
        <button className="btn primary" type="submit"><Icon name="plus" size={16} /> Log</button>
      </form>
      {!mine.length ? <Empty icon="book" title="Nog geen flips">Log je trades om te zien welke items en strategieën echt geld opleveren.</Empty> : (
        <div className="scroll-x">
          <table className="dt">
            <thead><tr><th>Item</th><th className="r">Aantal</th><th className="r">Koop</th><th className="r">Verkoop</th><th className="r">Tax</th><th className="r">Winst</th><th>Wanneer</th><th /></tr></thead>
            <tbody>
              {mine.slice(0, 80).map((j) => {
                const p = (j.sell - tax(j.sell) - j.buy) * j.qty;
                return (
                  <tr key={j.id}>
                    <td style={{ fontWeight: 600 }}>{j.name}{j.source && <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>FU</span>}</td>
                    <td className="r">{nl(j.qty)}</td><td className="r">{nl(j.buy)}</td><td className="r">{nl(j.sell)}</td>
                    <td className="r dim">{short(tax(j.sell) * j.qty)}</td>
                    <td className={`r ${p >= 0 ? 'up' : 'down'}`} style={{ fontWeight: 600 }}>{(p >= 0 ? '+' : '') + short(p)}</td>
                    <td className="small muted">{ago(j.at)} geleden</td>
                    <td><button className="btn sm icon ghost" onClick={() => del(j.id)} aria-label="Verwijder flip"><Icon name="trash" size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
