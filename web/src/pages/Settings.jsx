import { useEffect, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { playerApi } from '../lib/api.js';
import { GAMES } from '../lib/games.js';
import { Icon, PageHead, Toggle } from '../components/ui.jsx';
import { nl } from '../lib/format.js';

function RsnField({ g }) {
  const { settings, update, toast, loadPlayer, game } = useApp();
  const key = g === 'osrs' ? 'osrsName' : 'rs3Name';
  const [val, setVal] = useState(settings[key] || '');
  const [test, setTest] = useState(null);
  const cfg = GAMES[g];
  const save = async (e) => {
    e.preventDefault();
    const name = val.trim();
    if (name && !/^[A-Za-z0-9 _-]{1,12}$/.test(name)) { toast('Een RSN is max. 12 tekens: letters, cijfers, spatie, - of _', 'warn'); return; }
    update('settings', (s) => ({ ...s, [key]: name }));
    if (!name) { setTest(null); return; }
    setTest({ loading: true });
    try {
      const d = await playerApi(g, name);
      setTest({ ok: true, d });
      toast(`${name} gevonden: total level ${nl(d.total?.level)}`, 'ok');
      if (g === game) setTimeout(loadPlayer, 50);
    } catch (err) {
      setTest({ ok: false, msg: err.message });
    }
  };
  return (
    <form onSubmit={save} className="card col" style={{ gap: 12, borderColor: `color-mix(in srgb, ${cfg.accent} 30%, var(--line))` }}>
      <div className="row between">
        <h3 className="h">{cfg.label}</h3>
        <span className="tag" style={{ color: cfg.accent, background: cfg.accentSoft }}>{cfg.short}</span>
      </div>
      <div className="row">
        <input className="input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="RSN" maxLength={12} aria-label={`${cfg.short} RSN`} />
        <button className="btn primary" type="submit">Opslaan & testen</button>
      </div>
      {test?.loading && <span className="small muted">Bezig met opzoeken…</span>}
      {test?.ok && (
        <div className="row wrap small" style={{ gap: 8 }}>
          <span className="tag ok">Hiscores: {test.d.sources.hiscores}</span>
          {test.d.sources.wikisync && <span className={`tag ${test.d.sources.wikisync === 'ok' ? 'ok' : ''}`}>WikiSync: {test.d.sources.wikisync}</span>}
          {test.d.sources.runemetrics && <span className={`tag ${test.d.sources.runemetrics === 'ok' ? 'ok' : ''}`}>RuneMetrics: {test.d.sources.runemetrics}</span>}
        </div>
      )}
      {test && test.ok === false && <span className="small down">{test.msg}</span>}
      <span className="small dim">Quests &amp; voortgang via {cfg.questSourceName}.{g === 'osrs' ? ' Installeer de WikiSync-plugin in RuneLite en log één keer in.' : ' Installeer WikiSync via de Plugin Hub in de RS3-client en log één keer in. Geen data? Dan houdt tick. je quests lokaal bij op de Quests-pagina.'}</span>
    </form>
  );
}

function UpdateCard() {
  const [u, setU] = useState(null);
  useEffect(() => {
    window.tick.update?.get().then(setU);
    return window.tick.update?.on(setU);
  }, []);
  if (!u) return null;
  const txt = !u.can ? 'Deze versie (portable of test) werkt niet automatisch bij. Download nieuwe versies van GitHub.'
    : { idle: 'tick. zoekt automatisch naar updates bij het opstarten en elke 4 uur.', checking: 'Bezig met zoeken…', none: 'Je hebt de nieuwste versie.', downloading: `Versie ${u.version} wordt gedownload (${u.progress}%).`, ready: `Versie ${u.version} staat klaar: herstart om te installeren.`, error: `Zoeken mislukt: ${u.error || 'onbekende fout'}` }[u.status];
  return (
    <section className="card col" style={{ gap: 10 }}>
      <div className="row wrap between">
        <div className="col" style={{ gap: 2 }}><h3 className="h">Updates · versie {u.current}</h3><span className="small muted">{txt}</span></div>
        {u.status === 'ready'
          ? <button className="btn primary" onClick={() => window.tick.update.install()}><Icon name="spark" size={15} /> Herstart en installeer</button>
          : <button className="btn" disabled={u.status === 'checking' || u.status === 'downloading'} onClick={() => window.tick.update.check()}><Icon name="refresh" size={15} /> {u.can ? 'Zoek naar updates' : 'Open GitHub'}</button>}
      </div>
    </section>
  );
}

// AI-koppeling (MCP): laat een AI-app zoals Claude Desktop je tick.-data lezen
const mcpApi = (url, body) => fetch(url, { method: body ? 'POST' : 'GET', headers: { 'X-Tick': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Fout ${r.status}`); return j; });

function McpCard() {
  const { toast } = useApp();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(null);
  const [file, setFile] = useState('');
  const load = () => mcpApi('/api/mcp/info').then(setInfo, (e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (err) return <section className="card"><span className="small down">AI-koppeling niet beschikbaar: {err}</span></section>;
  if (!info) return null;
  const set = async (body, msg) => {
    setBusy(true);
    try { await mcpApi('/api/mcp/config', body); await load(); if (msg) toast(msg, 'ok'); } catch (e) { toast(e.message, 'warn'); }
    setBusy(false);
  };
  const installClaude = async (customFile) => {
    setBusy(true);
    try {
      const r = await mcpApi('/api/mcp/install/claude', customFile ? { file: customFile } : {});
      await load();
      setDone(r.written);
      toast('Gekoppeld aan Claude Desktop. Sluit Claude helemaal af (ook in de tray) en open hem opnieuw.', 'ok');
    } catch (e) { toast(e.message, 'warn'); }
    setBusy(false);
  };
  const stdio = JSON.stringify({ mcpServers: { tick: info.stdio } }, null, 2);
  const http = JSON.stringify({ url: info.url, headers: { Authorization: `Bearer ${info.token}` } }, null, 2);
  const copy = (t, what) => navigator.clipboard?.writeText(t).then(() => toast(`${what} gekopieerd`, 'ok'));
  return (
    <section className="card col" style={{ gap: 12 }}>
      <div className="row wrap between" style={{ gap: 12 }}>
        <div className="col" style={{ gap: 2, maxWidth: 640 }}>
          <h3 className="h">AI-koppeling (MCP) <span className="tag acc" style={{ marginLeft: 6 }}>NIEUW</span></h3>
          <span className="small muted">Laat een AI-app zoals Claude Desktop je tick.-data lezen: je account, quests, de wiki, GE-prijzen, money-making, diaries en je stappenplan. De AI kan alleen lezen, niets aanpassen, en alleen op deze pc.</span>
        </div>
        <Toggle on={info.enabled} onChange={(v) => set({ enabled: v }, v ? 'AI-koppeling staat aan' : 'AI-koppeling staat uit')} label="AI-koppeling" />
      </div>
      {info.enabled && (
        <>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn primary" disabled={busy || !info.claudeFound} onClick={() => installClaude()} title={info.claudeFound ? `Schrijft naar ${info.claudeTargets.join(', ')}` : 'Claude Desktop is niet gevonden op deze pc'}>
              <Icon name="spark" size={15} /> Koppel aan Claude Desktop
            </button>
            <button className="btn ghost" onClick={() => setShow((v) => !v)}>{show ? 'Verberg' : 'Andere AI-app'} <Icon name={show ? 'minus' : 'plus'} size={14} /></button>
          </div>
          {done && (
            <div className="col small" style={{ gap: 2 }}>
              <span className="up">✓ tick. staat nu in:</span>
              {done.map((f) => <code key={f} className="mono dim" style={{ wordBreak: 'break-all' }}>{f}</code>)}
              <span className="dim">Sluit Claude Desktop helemaal af (rechtsklik op het icoon in de tray → Afsluiten) en open hem opnieuw.</span>
            </div>
          )}
          {!done && info.claudeFound && <span className="small dim">tick. koppelt aan: <code className="mono" style={{ wordBreak: 'break-all' }}>{info.claudeTargets.join(', ')}</code></span>}
          {!info.claudeFound && <span className="small dim">Claude Desktop is niet automatisch gevonden. Vul hieronder zelf het pad naar claude_desktop_config.json in, of kies “Andere AI-app”.</span>}
          {!info.bundle && <span className="small down">Een deel van de AI-functies ontbreekt in deze installatie (money-making, diaries, stappenplan, prijzen). Draai rebuild-tick.bat of installeer de nieuwste versie.</span>}
          {show && (
            <div className="col" style={{ gap: 10 }}>
              <div className="col" style={{ gap: 6 }}>
                <b className="small">Claude Desktop staat ergens anders?</b>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input grow" style={{ height: 36 }} placeholder="Pad naar claude_desktop_config.json" value={file} onChange={(e) => setFile(e.target.value)} />
                  <button className="btn sm" disabled={busy || !file.trim()} onClick={() => installClaude(file)}>Koppel</button>
                </div>
                <span className="small dim">Tip: zoek in Verkenner in AppData naar claude_desktop_config.json en kopieer het pad (Shift + rechtsklik → Kopiëren als pad).</span>
              </div>
              <div className="col" style={{ gap: 6 }}>
                <div className="row between"><b className="small">Voor apps met een MCP-configbestand (stdio), zoals Claude Desktop</b><button className="btn sm ghost" onClick={() => copy(stdio, 'Configuratie')}><Icon name="plus" size={12} /> Kopieer</button></div>
                <pre className="mcp-code">{stdio}</pre>
                <span className="small dim">{info.stdio.env ? 'tick. hoeft niet open te staan: de AI-app start tick. zelf op de achtergrond als dat nodig is.' : 'In de browserversie moet tick. (start-tick.bat) draaien terwijl je de AI gebruikt.'}</span>
              </div>
              <div className="col" style={{ gap: 6 }}>
                <div className="row between"><b className="small">Voor apps die een MCP-URL met header ondersteunen (Streamable HTTP)</b><button className="btn sm ghost" onClick={() => copy(http, 'URL en sleutel')}><Icon name="plus" size={12} /> Kopieer</button></div>
                <pre className="mcp-code">{http}</pre>
                <span className="small dim">Werkt alleen terwijl tick. draait. De poort kan veranderen als 5180 bezet is.</span>
              </div>
            </div>
          )}
          <div className="row wrap between small" style={{ gap: 8 }}>
            <span className="dim">{info.tools.length} functies: {info.tools.map((t) => t.title).join(' · ')}</span>
            <button className="btn sm ghost" disabled={busy} onClick={() => set({ newToken: true }, 'Nieuwe sleutel gemaakt. Koppel je AI-app opnieuw.')} title="Maakt de oude sleutel ongeldig"><Icon name="refresh" size={12} /> Nieuwe sleutel</button>
          </div>
        </>
      )}
    </section>
  );
}

export default function Settings() {
  const { settings, update, toast, journal, goals, watchlist, history } = useApp();
  const askNotify = async (on) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const r = await Notification.requestPermission();
      if (r !== 'granted') { toast('Meldingen zijn geweigerd in je browser', 'warn'); return; }
    }
    update('settings', (s) => ({ ...s, notify: on }));
  };
  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ settings, journal, goals, watchlist, history, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tick-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importAll = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      const d = JSON.parse(t);
      ['journal', 'goals', 'watchlist', 'history'].forEach((k) => d[k] && update(k, d[k]));
      if (d.settings) update('settings', (s) => ({ ...s, ...d.settings }));
      toast('Backup teruggezet', 'ok');
    }).catch(() => toast('Ongeldig bestand', 'warn'));
  };

  return (
    <div className="page">
      <PageHead eyebrow={<span>Lokaal opgeslagen in de map data/</span>} title="Instellingen" sub="Je accounts, meldingen en data" />
      <section className="grid g2">
        <RsnField g="osrs" />
        <RsnField g="rs3" />
      </section>
      <section className="grid g2">
        <div className="card col" style={{ gap: 14 }}>
          <h3 className="h">Meldingen</h3>
          <div className="row between"><span>Windows-meldingen bij prijsalerts</span><Toggle on={!!settings.notify} onChange={askNotify} label="Windows-meldingen" /></div>
          <span className="small dim">Alerts stel je in per item in de GE-terminal. Ze werken zolang tick. open staat.</span>
        </div>
        <div className="card col" style={{ gap: 14 }}>
          <h3 className="h">RS3 GE-tax</h3>
          <label className="field">Percentage dat bij verkoop wordt ingehouden (0 = geen tax)
            <input className="input mono" type="number" min="0" max="10" step="0.5" value={settings.rs3TaxPct ?? 0} onChange={(e) => update('settings', (s) => ({ ...s, rs3TaxPct: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }))} />
          </label>
          <span className="small dim">De OSRS-regels (2%, max 5M, niets onder 50 gp) staan vast ingesteld. Check de actuele RS3-regels in-game en zet het percentage hier.</span>
        </div>
      </section>
      <section className="card col" style={{ gap: 14 }}>
        <h3 className="h">Je data</h3>
        <span className="muted small">{(journal || []).length} flips · {(goals || []).length} doelen · {Object.values(watchlist || {}).flat().length} watchlist-items · alles staat lokaal in <span className="mono">RSBuddy/data/*.json</span></span>
        <div className="row wrap">
          <button className="btn" onClick={exportAll}><Icon name="ext" size={15} /> Exporteer backup</button>
          <label className="btn ghost" style={{ cursor: 'pointer' }}><Icon name="refresh" size={15} /> Importeer backup<input type="file" accept="application/json" onChange={importAll} style={{ display: 'none' }} /></label>
          <button className="btn ghost" onClick={() => { update('history', []); toast('Geschiedenis gewist', 'ok'); }}><Icon name="trash" size={15} /> Wis geschiedenis</button>
        </div>
      </section>
      {window.tick?.desktop && <UpdateCard />}
      <McpCard />
      <section className="card col" style={{ gap: 10 }}>
        <div className="row wrap between">
          <div className="col" style={{ gap: 2 }}><h3 className="h">Diagnose</h3><span className="small muted">Test of tick. de wiki, prijzen en je account goed uitleest.</span></div>
          <a className="btn" href="#/diag"><Icon name="spark" size={15} /> Diagnose openen</a>
        </div>
      </section>
      <section className="card col" style={{ gap: 8 }}>
        <h3 className="h">Over tick.</h3>
        <span className="small muted">Data: RuneScape Wiki &amp; Old School RuneScape Wiki (CC BY-NC-SA 3.0), wiki real-time prices, officiële hiscores en WikiSync. tick. leest alleen; het automatiseert niets in de game.</span>
        <span className="small muted">De lokale server draait op 127.0.0.1 en praat alleen met een vaste lijst bronnen.</span>
      </section>
    </div>
  );
}
