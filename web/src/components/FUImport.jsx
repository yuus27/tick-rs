import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { prices } from '../lib/api.js';
import { offersFromJson, offersFromCsv, flipsFromOffers } from '../lib/fu.js';
import { Icon, Drawer, Empty } from './ui.jsx';
import { nl, short } from '../lib/format.js';
import { GAMES } from '../lib/games.js';

export default function FUImport({ open, onClose }) {
  const { journal, update, toast, settings } = useApp();
  const [state, setState] = useState(null); // {source, accounts:[{name, flips, offers, unmatched}], selected}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const analyse = async (sources) => {
    const mapping = await prices('osrs', 'mapping', {}, 6 * 3600_000).then((r) => r?.data ?? r).catch(() => []);
    const existing = new Set((journal || []).map((j) => j.id));
    const accounts = sources.map((s) => {
      const offers = s.kind === 'csv' ? offersFromCsv(s.data) : offersFromJson(s.data);
      const r = flipsFromOffers(offers, Array.isArray(mapping) ? mapping : []);
      const fresh = r.flips.filter((f) => !existing.has(f.id));
      return { name: s.name, total: r.flips.length, flips: fresh, offers: r.offers, unmatched: r.unmatchedSells, raw: offers.length };
    });
    setState({ accounts, selected: Object.fromEntries(accounts.map((a) => [a.name, a.flips.length > 0])) });
  };

  const fromRuneLite = async () => {
    setBusy(true); setErr(null); setState(null);
    try {
      const r = await fetch('/api/import/flipping').then((x) => x.json());
      const files = (r.files || []).filter((f) => f.data);
      if (!files.length) { setErr(`Geen Flipping Utilities-bestanden gevonden in ${r.dir}. Heb je de plugin gebruikt op deze pc? Je kunt ook een bestand kiezen.`); return; }
      await analyse(files.map((f) => ({ name: f.file.replace(/\.json$/i, ''), kind: 'json', data: f.data })));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const fromFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr(null); setState(null);
    try {
      const txt = await f.text();
      const isJson = /^\s*[[{]/.test(txt);
      await analyse([{ name: f.name, kind: isJson ? 'json' : 'csv', data: isJson ? JSON.parse(txt) : txt }]);
    } catch (e2) { setErr('Kon het bestand niet lezen: ' + e2.message); } finally { setBusy(false); e.target.value = ''; }
  };

  const doImport = () => {
    const flips = state.accounts.filter((a) => state.selected[a.name]).flatMap((a) => a.flips.map((f) => ({ ...f, account: a.name })));
    if (!flips.length) return;
    update('journal', (j) => [...flips, ...(j || [])].sort((a, b) => b.at - a.at));
    toast(`${nl(flips.length)} flips geïmporteerd uit Flipping Utilities`, 'ok');
    setState(null);
    onClose();
  };

  const tax = GAMES.osrs.tax;
  const sel = state ? state.accounts.filter((a) => state.selected[a.name]).flatMap((a) => a.flips) : [];
  const profit = sel.reduce((a, f) => a + (f.sell - tax(f.sell, settings) - f.buy) * f.qty, 0);
  const range = sel.length ? [Math.min(...sel.map((f) => f.at)), Math.max(...sel.map((f) => f.at))] : null;

  return (
    <Drawer open={open} onClose={onClose}>
      <div className="row between">
        <div className="col" style={{ gap: 2 }}>
          <h2 className="h" style={{ fontSize: 22 }}>Importeer uit Flipping Utilities</h2>
          <span className="small muted">RuneLite-plugin · alleen OSRS</span>
        </div>
        <button className="btn sm icon ghost" onClick={onClose} aria-label="Sluiten"><Icon name="x" size={16} /></button>
      </div>

      <div className="col" style={{ gap: 10 }}>
        <button className="btn primary" onClick={fromRuneLite} disabled={busy}><Icon name="refresh" size={16} style={busy ? { animation: 'spin 1s linear infinite' } : undefined} /> Lees uit RuneLite (automatisch)</button>
        <label className="btn" style={{ cursor: 'pointer' }}><Icon name="book" size={16} /> Kies een bestand (.json of .csv)<input type="file" accept=".json,.csv,application/json,text/csv" onChange={fromFile} style={{ display: 'none' }} /></label>
        <span className="small dim">tick. leest alleen <span className="mono">%USERPROFILE%\.runelite\flipping\</span>. Flips die al in je journaal staan worden overgeslagen.</span>
      </div>

      {err && <div className="card" style={{ borderColor: 'rgba(255,138,101,.4)' }}><span className="small">{err}</span></div>}

      {state && (
        <>
          {!state.accounts.length && <Empty icon="book" title="Niets gevonden" />}
          <div className="col" style={{ gap: 8 }}>
            {state.accounts.map((a) => (
              <label key={a.name} className="card row between" style={{ padding: 14, cursor: 'pointer' }}>
                <div className="col" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{a.name}</span>
                  <span className="small muted">{nl(a.raw)} offer-events · {nl(a.offers)} offers · {nl(a.total)} flips gekoppeld{a.unmatched ? ` · ${nl(a.unmatched)} verkopen zonder aankoop` : ''}</span>
                  <span className="small acc">{nl(a.flips.length)} nieuw</span>
                </div>
                <input type="checkbox" checked={!!state.selected[a.name]} onChange={(e) => setState((s) => ({ ...s, selected: { ...s.selected, [a.name]: e.target.checked } }))} aria-label={`Importeer ${a.name}`} />
              </label>
            ))}
          </div>
          {sel.length > 0 ? (
            <div className="card accent col" style={{ gap: 8 }}>
              <div className="row between"><span className="muted">Flips</span><span className="num" style={{ fontSize: 22 }}>{nl(sel.length)}</span></div>
              <div className="row between"><span className="muted">Netto winst (na 2% tax)</span><span className={`num ${profit >= 0 ? 'up' : 'down'}`} style={{ fontSize: 22 }}>{(profit >= 0 ? '+' : '') + short(profit)}</span></div>
              {range && <div className="row between small"><span className="muted">Periode</span><span className="mono">{new Date(range[0]).toLocaleDateString('nl-NL')} – {new Date(range[1]).toLocaleDateString('nl-NL')}</span></div>}
              <div className="col" style={{ gap: 2, marginTop: 6 }}>
                {sel.slice(0, 5).map((f) => <div key={f.id} className="row between small"><span className="trunc">{f.name} ×{nl(f.qty)}</span><span className="mono">{nl(f.buy)} → {nl(f.sell)}</span></div>)}
                {sel.length > 5 && <span className="small dim">+{nl(sel.length - 5)} meer</span>}
              </div>
              <button className="btn primary" onClick={doImport} style={{ marginTop: 8 }}><Icon name="check" size={16} /> Importeer {nl(sel.length)} flips</button>
            </div>
          ) : <span className="small muted">Geen nieuwe flips om te importeren.</span>}
        </>
      )}
    </Drawer>
  );
}
