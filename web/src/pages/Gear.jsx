import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { getJSON, useAsync } from '../lib/api.js';
import { href } from '../lib/router.js';
import { nl } from '../lib/format.js';
import { wikiFile } from '../lib/theme.js';
import { usePriceBook } from '../lib/pricebook.js';
import { SLOTS, SLOT_NL, STYLES, calcDps, gearOf, swap, fitsStyle } from '../lib/dps.js';
import { Icon, PageHead, Empty, Gp, Skel, SkelRows, Toggle, ErrorBox, delay } from '../components/ui.jsx';

const DAY = 24 * 3600e3;
const imgOf = (it) => wikiFile('osrs', it.i || `${it.n}.png`);
const norm = (s) => String(s || '').toLowerCase().replace(/[’`]/g, "'").trim();
const styleOfSetup = (s) => (/^melee/i.test(s) ? 'melee' : /^rang/i.test(s) ? 'ranged' : /^mag/i.test(s) ? 'magic' : null);

function ItemThumb({ it, size = 30 }) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [it?.n]);
  return (
    <span className="icon-tile" style={{ width: size + 8, height: size + 8 }}>
      {it && ok ? <img src={imgOf(it)} alt="" referrerPolicy="no-referrer" onError={() => setOk(false)} style={{ width: size, height: size }} /> : <Icon name="shield" size={14} />}
    </span>
  );
}

// Zoekveld voor één slot: typ een naam, kies uit de suggesties
function SlotPicker({ slot, item, items, onPick, style }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  const hits = useMemo(() => {
    const n = norm(q);
    const pool = items.filter((x) => x.s === slot);
    const list = n ? pool.filter((x) => norm(x.n).includes(n)) : pool.filter((x) => fitsStyle(style, x));
    return list.sort((a, b) => (norm(a.n).startsWith(n) ? 0 : 1) - (norm(b.n).startsWith(n) ? 0 : 1) || a.n.length - b.n.length).slice(0, 14);
  }, [q, items, slot, style]);
  return (
    <div ref={ref} className="gear-slot" style={{ position: 'relative' }}>
      <ItemThumb it={item} size={26} />
      <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
        <span className="small dim">{SLOT_NL[slot]}</span>
        <input
          className="input"
          style={{ height: 34, fontSize: 13 }}
          placeholder={item ? item.n : 'Leeg'}
          value={open ? q : item?.n || ''}
          onFocus={() => { setQ(''); setOpen(true); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { onPick(hits[0]); setOpen(false); e.currentTarget.blur(); } if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); } }}
          aria-label={`${SLOT_NL[slot]} kiezen`}
        />
      </div>
      {item && <button type="button" className="btn sm icon ghost" title="Leegmaken" onClick={() => onPick(null)}><Icon name="x" size={14} /></button>}
      {open && (
        <div className="gear-pop">
          {hits.length ? hits.map((x) => (
            <button key={x.id} type="button" className="gear-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(x); setOpen(false); }}>
              <ItemThumb it={x} size={20} /><span className="trunc">{x.n}</span>
            </button>
          )) : <span className="small dim" style={{ padding: 10 }}>Niets gevonden</span>}
        </div>
      )}
    </div>
  );
}

function ReqTag({ req, levels }) {
  if (req === undefined) return <span className="small dim">…</span>;
  if (!req || !Object.keys(req).length) return <span className="small dim">geen eisen bekend</span>;
  const miss = Object.entries(req).filter(([s, n]) => (levels[s] ?? 1) < n);
  if (!miss.length) return <span className="tag ok">Kun je dragen</span>;
  return <span className="tag no" title={Object.entries(req).map(([s, n]) => `${n} ${s}`).join(', ')}>{miss.map(([s, n]) => `${n} ${s}`).join(' · ')}</span>;
}

function OsrsGear() {
  const { gear, update, levels, player } = useApp();
  const st = gear?.osrs || {};
  const style = st.style || 'melee';
  const boosts = { pot: true, pray: true, task: false, spellbook: 'standard', ...(st.boosts || {}) };
  const set = (fn) => update('gear', (g) => ({ ...(g || {}), osrs: fn({ ...((g || {}).osrs || {}) }) }));

  const eq = useAsync(() => getJSON('/api/osrs/dps/equipment', DAY), []);
  const mons = useAsync(() => getJSON('/api/osrs/dps/monsters', DAY), []);
  const pages = useAsync(() => getJSON('/api/osrs/recommended', DAY), []);
  const book = usePriceBook('osrs');
  const [mq, setMq] = useState('');
  const [mOpen, setMOpen] = useState(false);
  const [budget, setBudget] = useState(st.budget ?? '');
  const [onlyWearable, setOnlyWearable] = useState(false);
  const [reqs, setReqs] = useState({});

  const items = eq.data || [];
  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);
  const byName = useMemo(() => new Map(items.map((x) => [norm(x.n), x])), [items]);
  const monsters = mons.data || [];
  const target = useMemo(() => monsters.find((m) => m.n === st.target?.n && m.v === (st.target?.v || '')) || monsters.find((m) => m.n === st.target?.n) || null, [monsters, st.target]);
  const myBosses = useMemo(() => {
    const names = new Set(monsters.map((m) => m.n));
    return (player.data?.activities || []).filter((a) => a.score > 0 && names.has(a.name)).sort((a, b) => b.score - a.score).slice(0, 8).map((a) => a.name);
  }, [player.data, monsters]);
  const monHits = useMemo(() => {
    const n = norm(mq);
    if (!n) return [];
    return monsters.filter((m) => norm(m.n).includes(n)).sort((a, b) => (norm(a.n).startsWith(n) ? 0 : 1) - (norm(b.n).startsWith(n) ? 0 : 1) || b.lvl - a.lvl).slice(0, 12);
  }, [mq, monsters]);

  // Aanbevolen uitrusting van de wiki voor deze boss (Strategies-pagina)
  const page = useMemo(() => {
    if (!target || !pages.data) return null;
    const want = norm(`${target.n}/Strategies`);
    return pages.data.pages.find((p) => norm(p) === want) || null;
  }, [target, pages.data]);
  const rec = useAsync(() => (page ? getJSON(`/api/osrs/recommended/${encodeURIComponent(page)}`, DAY) : Promise.resolve(null)), [page]);
  const recSlots = useMemo(() => {
    const s = (rec.data?.setups || []).find((x) => styleOfSetup(x.style) === style);
    return s?.slots || null;
  }, [rec.data, style]);
  const recRank = (slot, name) => {
    const tiers = recSlots?.[slot === 'cape' ? 'cape' : slot];
    if (!tiers) return null;
    const i = tiers.findIndex((t) => t.some((n) => norm(n) === norm(name)));
    return i < 0 ? null : i + 1;
  };

  const setup = st.setups?.[style] || {};
  const g = useMemo(() => gearOf(setup, byId), [setup, byId]);
  const lv = { Attack: levels.Attack || 1, Strength: levels.Strength || 1, Defence: levels.Defence || 1, Ranged: levels.Ranged || 1, Magic: levels.Magic || 1 };
  const cur = useMemo(() => (target ? calcDps(style, g, lv, target, boosts) : null), [style, g, target, JSON.stringify(boosts), JSON.stringify(lv)]);

  const priceOfItem = (it) => book.data?.byId?.[it.id]?.price ?? null;
  const maxBudget = Number(String(budget).replace(/[^\d.]/g, '')) * (/m/i.test(String(budget)) ? 1e6 : /k/i.test(String(budget)) ? 1e3 : /b/i.test(String(budget)) ? 1e9 : 1) || null;

  // Alle kandidaten: wisselen per slot, DPS-winst per miljoen GP
  const ups = useMemo(() => {
    if (!cur || !items.length) return null;
    const out = [];
    for (const slot of SLOTS) {
      const recNames = new Set((recSlots?.[slot] || []).flat().map(norm));
      for (const it of items) {
        if (it.s !== slot || it.id === g[slot]?.id) continue;
        const inRec = recNames.has(norm(it.n));
        if (!inRec && !fitsStyle(style, it)) continue;
        const price = priceOfItem(it);
        if (price == null && !inRec) continue;
        if (slot === 'shield' && g.weapon?.h) continue;
        const r = calcDps(style, swap(g, slot, it), lv, target, boosts);
        const gain = r.dps - cur.dps;
        if (gain <= 0.005) continue;
        out.push({ it, slot, gain, dps: r.dps, price, per: price ? gain / (price / 1e6) : null, rank: recRank(slot, it.n) });
      }
    }
    return out;
  }, [cur, items, g, style, target, recSlots, book.data, JSON.stringify(boosts)]);

  const buyable = useMemo(() => {
    if (!ups) return [];
    const list = ups.filter((u) => u.price != null && (!maxBudget || u.price <= maxBudget)).sort((a, b) => b.per - a.per);
    // Per slot hooguit 3, en een upgrade moet minstens 1% schelen
    const seen = {};
    return list.filter((u) => u.gain / cur.dps >= 0.01 && (seen[u.slot] = (seen[u.slot] || 0) + 1) <= 3).filter((u) => !onlyWearable || reqOk(reqs[u.it.n], levels)).slice(0, 15);
  }, [ups, maxBudget, onlyWearable, reqs, levels]);
  const bestPerSlot = useMemo(() => {
    if (!ups) return [];
    const m = {};
    for (const u of ups) if (!m[u.slot] || u.gain > m[u.slot].gain) m[u.slot] = u;
    return SLOTS.map((s) => m[s]).filter(Boolean).sort((a, b) => b.gain - a.gain);
  }, [ups]);

  // Vereisten lui ophalen voor wat in beeld staat
  useEffect(() => {
    const names = [...new Set([...buyable, ...bestPerSlot].map((u) => u.it.n))].filter((n) => reqs[n] === undefined).slice(0, 24);
    if (!names.length) return;
    let alive = true;
    (async () => {
      for (let i = 0; i < names.length && alive; i += 4) {
        const part = await Promise.all(names.slice(i, i + 4).map((n) => getJSON(`/api/osrs/itemreq/${encodeURIComponent(n)}`, 7 * DAY).then((r) => [n, r.req]).catch(() => [n, null])));
        if (alive) setReqs((r) => ({ ...r, ...Object.fromEntries(part) }));
      }
    })();
    return () => { alive = false; };
  }, [buyable, bestPerSlot]);

  if (eq.error || mons.error) return <ErrorBox error={eq.error || mons.error} onRetry={() => { eq.reload?.(); mons.reload?.(); }} />;
  if (eq.loading || mons.loading) return <SkelRows n={6} h={56} />;

  return (
    <div className="col" style={{ gap: 16 }}>
      <section className="card col" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
          <div className="col grow" style={{ gap: 6, minWidth: 240, position: 'relative' }}>
            <span className="small muted">Tegen wie vecht je?</span>
            <input className="input" placeholder={target ? `${target.n}${target.v ? ` (${target.v})` : ''}` : 'Zoek een boss of monster…'} value={mOpen ? mq : target ? `${target.n}${target.v ? ` (${target.v})` : ''}` : ''} onFocus={() => { setMq(''); setMOpen(true); }} onBlur={() => setTimeout(() => setMOpen(false), 150)} onChange={(e) => setMq(e.target.value)} aria-label="Doelwit" />
            {mOpen && monHits.length > 0 && (
              <div className="gear-pop" style={{ top: '100%' }}>
                {monHits.map((m) => (
                  <button key={`${m.id}-${m.v}`} type="button" className="gear-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => { set((o) => ({ ...o, target: { n: m.n, v: m.v } })); setMOpen(false); }}>
                    <span className="trunc">{m.n}{m.v ? <span className="dim"> · {m.v}</span> : null}</span><span className="small dim" style={{ marginLeft: 'auto' }}>lvl {m.lvl}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="seg" role="group" aria-label="Aanvalsstijl">
            {Object.entries(STYLES).map(([k, v]) => <button key={k} type="button" className={style === k ? 'on' : ''} onClick={() => set((o) => ({ ...o, style: k }))}>{v}</button>)}
          </div>
        </div>
        {myBosses.length > 0 && (
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="small dim">Jouw bosses:</span>
            {myBosses.map((n) => <button key={n} type="button" className={`chip ${target?.n === n ? 'on' : ''}`} onClick={() => set((o) => ({ ...o, target: { n, v: '' } }))}>{n}</button>)}
          </div>
        )}
        <div className="row wrap" style={{ gap: 18 }}>
          <label className="row" style={{ gap: 8 }}><Toggle on={boosts.pot} onChange={(v) => set((o) => ({ ...o, boosts: { ...boosts, pot: v } }))} label="Potions" /><span className="small">{style === 'melee' ? 'Super combat' : style === 'ranged' ? 'Ranging potion' : 'Imbued heart'}</span></label>
          <label className="row" style={{ gap: 8 }}><Toggle on={boosts.pray} onChange={(v) => set((o) => ({ ...o, boosts: { ...boosts, pray: v } }))} label="Prayer" /><span className="small">{style === 'melee' ? 'Piety' : style === 'ranged' ? 'Rigour' : 'Augury'}</span></label>
          <label className="row" style={{ gap: 8 }}><Toggle on={boosts.task} onChange={(v) => set((o) => ({ ...o, boosts: { ...boosts, task: v } }))} label="Slayer-taak" /><span className="small">Op slayer-taak</span></label>
          {style === 'magic' && <label className="row" style={{ gap: 8 }}><Toggle on={boosts.spellbook === 'ancient'} onChange={(v) => set((o) => ({ ...o, boosts: { ...boosts, spellbook: v ? 'ancient' : 'standard' } }))} label="Ancients" /><span className="small">Ancient spellbook</span></label>}
        </div>
      </section>

      {!target ? <Empty icon="sword" title="Kies een doelwit">Zoek een boss of kies er een uit je kill counts. tick. rekent dan uit welke upgrade de meeste DPS per GP oplevert.</Empty> : (
        <div className="gear-grid">
          <section className="card col" style={{ gap: 8 }}>
            <div className="row between"><h2 className="h">Je {STYLES[style].toLowerCase()}-uitrusting</h2>{Object.keys(setup).length > 0 && <button type="button" className="btn sm ghost" onClick={() => set((o) => ({ ...o, setups: { ...(o.setups || {}), [style]: {} } }))}>Leegmaken</button>}</div>
            <span className="small dim">Per stijl apart bewaard. Klik op een slot en typ.</span>
            <div className="col" style={{ gap: 6 }}>
              {SLOTS.map((s) => (
                <SlotPicker key={s} slot={s} item={g[s]} items={items} style={style} onPick={(it) => set((o) => {
                  const cur0 = { ...((o.setups || {})[style] || {}) };
                  if (it) cur0[s] = it.id; else delete cur0[s];
                  if (it && s === 'weapon' && it.h) delete cur0.shield;
                  return { ...o, setups: { ...(o.setups || {}), [style]: cur0 } };
                })} />
              ))}
            </div>
          </section>

          <div className="col" style={{ gap: 16, minWidth: 0 }}>
            <section className="card col" style={{ gap: 10 }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div className="col" style={{ gap: 2 }}>
                  <span className="eyebrow">Tegen {target.n}</span>
                  <span className="small dim">{nl(target.hp)} hitpoints · def {target.def} · {cur?.typeName}</span>
                </div>
                <a className="small" href={href('wiki', page || target.n)}>{page ? 'Strategiepagina' : 'Wikipagina'} <Icon name="ext" size={12} /></a>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                <div className="col"><span className="small muted">DPS</span><span className="num acc" style={{ fontSize: 30 }}>{cur ? cur.dps.toFixed(2) : '–'}</span></div>
                <div className="col"><span className="small muted">Max hit</span><span className="num" style={{ fontSize: 30 }}>{cur?.maxHit ?? '–'}</span></div>
                <div className="col"><span className="small muted">Raakkans</span><span className="num" style={{ fontSize: 30 }}>{cur ? `${(cur.acc * 100).toFixed(1)}%` : '–'}</span></div>
                <div className="col"><span className="small muted">Tijd per kill</span><span className="num" style={{ fontSize: 30 }}>{cur && Number.isFinite(cur.ttk) ? `${Math.round(cur.ttk)}s` : '–'}</span></div>
              </div>
              <span className="small dim">Pure DPS zonder special attacks en de meeste set-effecten{cur?.notes?.length ? `. Meegeteld: ${cur.notes.join(', ')}` : ''}. Beste aanvalstype automatisch gekozen; ranged rekent met rapid.</span>
            </section>

            <section className="card col" style={{ gap: 10 }}>
              <div className="row between wrap" style={{ gap: 10 }}>
                <h2 className="h">Beste upgrade per GP</h2>
                <div className="row wrap" style={{ gap: 10 }}>
                  <input className="input mono" style={{ width: 150, height: 36 }} placeholder="Budget, bv. 50m" value={budget} onChange={(e) => { setBudget(e.target.value); set((o) => ({ ...o, budget: e.target.value })); }} aria-label="Budget" />
                  <label className="row" style={{ gap: 8 }}><Toggle on={onlyWearable} onChange={setOnlyWearable} label="Alleen wat ik kan dragen" /><span className="small">Alleen wat ik kan dragen</span></label>
                </div>
              </div>
              {book.loading ? <SkelRows n={4} /> : !buyable.length ? <Empty icon="check" title="Geen GE-upgrade gevonden">{maxBudget ? 'Binnen dit budget levert niets minstens 1% meer DPS op.' : 'Je uitrusting is voor deze stijl al het beste wat de GE te bieden heeft (of je hebt nog niets ingevuld).'}</Empty> : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="dt">
                    <thead><tr><th>Upgrade</th><th className="r">DPS erbij</th><th className="r">Prijs</th><th className="r" title="Wat elke 0,1 DPS extra je kost">Per +0,1 DPS</th></tr></thead>
                    <tbody>
                      {buyable.map((u, i) => (
                        <tr key={`${u.slot}-${u.it.id}`} className="rise" style={delay(i, 0, 0.02)}>
                          <td><span className="row" style={{ gap: 8 }}><ItemThumb it={u.it} size={22} /><span className="col" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{u.it.n}</span><span className="small dim">{SLOT_NL[u.slot]}{g[u.slot] ? ` · i.p.v. ${g[u.slot].n}` : ''}{u.rank ? ` · wiki-tier ${u.rank}` : ''}</span><span style={{ marginTop: 3 }}><ReqTag req={reqs[u.it.n]} levels={levels} /></span></span></span></td>
                          <td className="r"><span className="up" style={{ fontWeight: 700 }}>+{u.gain.toFixed(2)}</span> <span className="small dim">({((u.gain / cur.dps) * 100).toFixed(1)}%)</span></td>
                          <td className="r"><Gp value={u.price} size={14} /></td>
                          <td className="r"><Gp value={u.price / (u.gain * 10)} size={14} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {bestPerSlot.length > 0 && (
              <section className="card col" style={{ gap: 10 }}>
                <h2 className="h">Grootste sprong per slot</h2>
                <span className="small dim">Ongeacht de prijs, ook items die je niet kunt kopen (drops, minigames). {recSlots ? 'Met de tier van de wiki-strategiepagina erbij.' : page ? 'De strategiepagina heeft geen lijst voor deze stijl.' : 'Geen strategiepagina voor dit monster.'}</span>
                <div className="col" style={{ gap: 6 }}>
                  {bestPerSlot.map((u) => (
                    <div key={u.slot} className="list-row" style={{ gap: 10, flexWrap: 'wrap' }}>
                      <ItemThumb it={u.it} size={22} />
                      <div className="col grow" style={{ gap: 0, minWidth: 0, flex: '1 1 150px' }}>
                        <span className="trunc" style={{ fontWeight: 600 }}>{u.it.n}</span>
                        <span className="small dim">{SLOT_NL[u.slot]}{u.rank ? ` · wiki-tier ${u.rank}` : ''}</span>
                      </div>
                      <ReqTag req={reqs[u.it.n]} levels={levels} />
                      <span className="up" style={{ fontWeight: 700, minWidth: 64, textAlign: 'right' }}>+{u.gain.toFixed(2)}</span>
                      <span style={{ minWidth: 80, textAlign: 'right' }}>{u.price != null ? <Gp value={u.price} size={13} /> : <span className="small dim">niet te koop</span>}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function reqOk(req, levels) {
  if (!req) return true;
  return Object.entries(req).every(([s, n]) => (levels[s] ?? 1) >= n);
}

// ---------- RS3: tiers in plaats van DPS ----------
const RS3_SLOT = { head: 'head', torso: 'body', legs: 'legs', hands: 'hands', feet: 'feet', back: 'cape', neck: 'neck', ring: 'ring', 'main hand weapon': 'mh', 'off-hand weapon': 'oh', '2h weapon': '2h', 'off-hand': 'shield', ammo: 'ammo' };
const RS3_ORDER = [['2h', 'Tweehandig wapen'], ['mh', 'Main-hand'], ['oh', 'Off-hand'], ['head', 'Hoofd'], ['body', 'Body'], ['legs', 'Legs'], ['hands', 'Handen'], ['feet', 'Voeten']];
const RS3_SKILL = { melee: 'Attack', ranged: 'Ranged', magic: 'Magic' };

function Rs3Gear() {
  const { gear, update, levels } = useApp();
  const style = gear?.rs3?.style || 'melee';
  const setStyle = (s) => update('gear', (g) => ({ ...(g || {}), rs3: { ...((g || {}).rs3 || {}), style: s } }));
  const rows = useAsync(() => getJSON('/api/rs3/bucket/gear', DAY), []);
  const book = usePriceBook('rs3');

  const plan = useMemo(() => {
    if (!rows.data || !book.data) return null;
    const out = {};
    for (const r of rows.data.rows) {
      const slot = RS3_SLOT[r.equipment_slot];
      const tier = Number(r.equipment_tier);
      if (!slot || !tier || r.combat_class !== style) continue;
      const weapon = ['mh', 'oh', '2h'].includes(slot);
      if (!weapon && !/^Power armour$/i.test(r.equipment_type || '')) continue;
      const p = book.data.byName[norm(r.page_name)];
      if (!p?.price) continue;
      const need = weapon ? RS3_SKILL[style] : 'Defence';
      (out[slot] ||= []).push({ name: r.page_name, tier, need, price: p.price, dmg: Number(r.weapon_damage) || 0, icon: p.icon });
    }
    const res = {};
    for (const [slot, list] of Object.entries(out)) {
      const lvl = levels[list[0].need] || 1;
      // Per tier het goedkoopste item
      const byTier = new Map();
      for (const x of list) if (!byTier.has(x.tier) || byTier.get(x.tier).price > x.price) byTier.set(x.tier, x);
      const tiers = [...byTier.values()].sort((a, b) => a.tier - b.tier);
      const now = [...tiers].reverse().find((x) => x.tier <= lvl) || null;
      const next = tiers.find((x) => x.tier > (now?.tier || 0)) || null;
      res[slot] = { now, next, lvl, need: list[0].need };
    }
    return res;
  }, [rows.data, book.data, style, levels]);

  const dual = plan?.mh?.now && plan?.oh?.now ? plan.mh.now.dmg + plan.oh.now.dmg : null;
  const two = plan?.['2h']?.now?.dmg ?? null;

  return (
    <div className="col" style={{ gap: 16 }}>
      <section className="card row between wrap" style={{ gap: 12 }}>
        <span className="small muted" style={{ maxWidth: 560 }}>In RS3 telt vooral de tier: hogere tier = meer schade en accuracy. tick. laat per slot zien wat het beste is binnen je levels (goedkoopste op de GE) en wat de volgende stap kost.</span>
        <div className="seg" role="group" aria-label="Stijl">
          {Object.entries(STYLES).map(([k, v]) => <button key={k} type="button" className={style === k ? 'on' : ''} onClick={() => setStyle(k)}>{v}</button>)}
        </div>
      </section>
      {rows.error ? <ErrorBox error={rows.error} onRetry={rows.reload} /> : !plan ? <SkelRows n={6} h={56} /> : (
        <section className="card col" style={{ gap: 8 }}>
          {dual != null && two != null && <span className="small">Dual-wield ({nl(dual)} schade) {dual > two ? 'doet meer' : 'doet minder'} dan je beste tweehandige wapen ({nl(two)}).</span>}
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Slot</th><th>Beste binnen je levels</th><th className="r">Prijs</th><th>Volgende stap</th><th className="r">Prijs</th></tr></thead>
              <tbody>
                {RS3_ORDER.filter(([k]) => plan[k]).map(([k, label]) => {
                  const p = plan[k];
                  return (
                    <tr key={k}>
                      <td className="small muted">{label}</td>
                      <td>{p.now ? <span className="col" style={{ gap: 0 }}><a href={href('wiki', p.now.name)} style={{ fontWeight: 600 }}>{p.now.name}</a><span className="small dim">tier {p.now.tier}</span></span> : <span className="dim small">niets op de GE</span>}</td>
                      <td className="r">{p.now ? <Gp value={p.now.price} size={14} /> : '–'}</td>
                      <td>{p.next ? <span className="col" style={{ gap: 0 }}><a href={href('wiki', p.next.name)} style={{ fontWeight: 600 }}>{p.next.name}</a><span className={`small ${p.lvl < p.next.tier ? 'down' : 'dim'}`}>tier {p.next.tier} · {p.next.tier} {p.need}{p.lvl < p.next.tier ? ` nodig (jij ${p.lvl})` : ''}</span></span> : <span className="tag ok">Top-tier</span>}</td>
                      <td className="r">{p.next ? <Gp value={p.next.price} size={14} /> : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="small dim">Tiers en klassen van de wiki, prijzen live van de GE. Tank-armour, augmented en niet-verhandelbare items (zoals Masterwork) tellen niet mee.</span>
        </section>
      )}
    </div>
  );
}

export default function Gear() {
  const { game, cfg } = useApp();
  return (
    <div className="page col" style={{ gap: 18 }}>
      <PageHead eyebrow={`${cfg.short} · uitrusting`} title="Gear-advisor" sub={game === 'osrs' ? 'Welke upgrade levert de meeste DPS per GP op' : 'De beste tier binnen je levels en de volgende stap'} />
      {game === 'osrs' ? <OsrsGear /> : <Rs3Gear />}
    </div>
  );
}
