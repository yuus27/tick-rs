import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { prices, playerApi } from '../lib/api.js';
import { timeseries } from '../lib/market.js';
import { parsePage, resolveTitle, toDoc, extractQuestDetails, questList, optimalRoute, readTables, recentUpdates, stripTags } from '../lib/wiki.js';
import { questReqIndex, loadMethods } from '../lib/intel.js';
import { methodDetails } from '../lib/mmg.js';
import { guideCandidates } from '../lib/games.js';
import { parseRange } from './SkillGuide.jsx';
import { Icon, PageHead, delay } from '../components/ui.jsx';

const VERSION = '0.4.12';
const unwrap = (r) => (r && typeof r === 'object' && 'data' in r ? r.data : r);
const keysOf = (o) => (o && typeof o === 'object' ? Object.keys(o).slice(0, 8) : []);

function buildTests(game, cfg, rsn) {
  const ctx = {};
  return [
    ['Prijzen: mapping', async () => {
      const m = unwrap(await prices(game, 'mapping', {}, 1));
      const n = Array.isArray(m) ? m.length : 0;
      ctx.mapping = m;
      return { ok: n > 1000, msg: `${n} items`, sample: Array.isArray(m) ? m[0] : m };
    }],
    ['Prijzen: latest + 1h', async () => {
      const l = unwrap(await prices(game, 'latest', {}, 1));
      const h = unwrap(await prices(game, '1h', {}, 1));
      const nl = Object.keys(l || {}).length;
      const first = Object.values(h || {})[0];
      return { ok: nl > 500, warn: !first, msg: `${nl} items met prijs · 1h-velden: ${keysOf(first).join(', ') || 'geen'}`, sample: { latest: Object.values(l || {})[0], hour: first } };
    }],
    ['Prijzen: timeseries', async () => {
      const id = 4151;
      const r = await timeseries(game, id, game === 'osrs' ? '1h' : '7d');
      const ok = r.length > 5 && r.some((p) => p.hi != null || p.lo != null);
      return { ok, warn: r.length > 0 && !ok, msg: `${r.length} punten · hi/lo gevonden: ${r.some((p) => p.hi != null)}/${r.some((p) => p.lo != null)}`, sample: r[r.length - 1] };
    }],
    ['Speler (hiscores + quests)', async () => {
      if (!rsn) return { warn: true, msg: 'geen RSN ingesteld' };
      const p = await playerApi(game, rsn);
      return { ok: p.skills.length > 20, warn: !p.quests || !String(p.sources?.hiscores || '').startsWith('ok'), msg: `${p.skills.length} skills · total ${p.total?.level} · quests: ${p.quests ? Object.keys(p.quests).length + ' via ' + p.questSource : 'geen'} · bronnen: ${JSON.stringify(p.sources)}` };
    }],
    ['Questlijst', async () => {
      const l = await questList(game);
      ctx.quests = l;
      const f2p = l.filter((q) => q.members === false).length;
      const mem = l.filter((q) => q.members === true).length;
      const withLen = l.filter((q) => q.length).length;
      const withQp = l.filter((q) => q.qp > 0).length;
      return { ok: l.length > 100 && withQp > 50, warn: (l.length > 0 && l.length <= 100) || withQp <= 50, msg: `${l.length} quests · ${f2p} F2P · ${mem} members · ${withLen} met lengte · ${withQp} met QP`, sample: l.slice(0, 3) };
    }],
    ['Optimale route', async () => {
      const r = await optimalRoute(game, (ctx.quests || []).map((q) => q.title));
      ctx.route = r;
      return { ok: r.length > 50, warn: r.length > 0 && r.length <= 50, msg: `${r.length} stappen · eerste: ${r.slice(0, 4).join(' → ')}` };
    }],
    ['Quest skill-requirements', async () => {
      const t0 = performance.now();
      const r = await questReqIndex(game, (ctx.quests || []).map((q) => q.title), ctx.route || []);
      const entries = [...r.idx.values()];
      const withSkills = entries.filter((e) => Object.keys(e.skills).length).length;
      return { ok: withSkills > 50, warn: withSkills > 0 && withSkills <= 50, msg: `bron: ${r.source || 'geen overzichtspagina (alleen losse questpagina’s)'} · ${entries.length} quests · ${withSkills} met skill-reqs · ${Math.round(performance.now() - t0)} ms`, sample: entries.filter((e) => Object.keys(e.skills).length).slice(0, 3) };
    }],
    ['Questpagina uitlezen', async () => {
      const tests = game === 'rs3' ? ["Plague's End", 'Dragon Slayer', 'Waterfall Quest'] : ['Dragon Slayer II', 'Dragon Slayer I', 'Waterfall Quest'];
      const hit = await resolveTitle(game, [...tests, 'The Restless Ghost', ...(ctx.route || []).slice(0, 10)]);
      if (!hit) return { fail: true, msg: 'geen testquest gevonden' };
      const p = await parsePage(game, hit.title);
      const d = extractQuestDetails(toDoc(game, p.text), cfg.skills);
      const quick = await resolveTitle(game, [`${hit.title}/Quick guide`]);
      if (!d) return { fail: true, msg: `${hit.title}: geen details-tabel gevonden` };
      const fields = ['start', 'difficulty', 'length', 'requirements', 'items', 'recommended', 'enemies'].filter((k) => d[k]);
      return { ok: d.skills.length > 0 && fields.length >= 4, warn: d.skills.length === 0, msg: `${hit.title} · velden: ${fields.join(', ')} · skills: ${d.skills.map((s) => `${s.skill} ${s.level}`).join(', ') || 'geen'} · QP ${d.questPoints ?? '–'} · quick guide: ${quick ? 'ja' : 'nee'}` };
    }],
    ['Skill guides (Mining, Attack)', async () => {
      const out = [];
      let bad = 0;
      for (const sk of ['Mining', 'Attack']) {
        for (const mode of ['p2p', 'f2p', 'iron']) {
          const hit = await resolveTitle(game, guideCandidates(game, sk, mode));
          let steps = 0;
          if (hit && mode === 'p2p') {
            const p = await parsePage(game, hit.title);
            steps = (p.sections || []).filter((s) => parseRange(s.line)).length;
          }
          if (!hit) bad++;
          out.push(`${sk}/${mode}: ${hit ? hit.title + (mode === 'p2p' ? ` (${steps} level-stappen)` : '') : '✗'}`);
        }
      }
      return { ok: bad <= 2, warn: bad > 2, msg: out.join(' · ') };
    }],
    ['Quest-XP per skill', async () => {
      const hit = await resolveTitle(game, cfg.pages.questXp);
      if (!hit) return { fail: true, msg: 'pagina niet gevonden' };
      const p = await parsePage(game, hit.title);
      const t = readTables(toDoc(game, p.text));
      const rows = t.reduce((a, x) => a + x.rows.length, 0);
      const mining = t.reduce((a, x) => a + x.rows.filter((r) => /\bMining\b/.test(r.map((c) => c.textContent).join(' ')) || r.some((c) => c.querySelector('img[alt*="Mining"]'))).length, 0);
      return { ok: mining > 0, warn: mining === 0, msg: `${hit.title} · ${t.length} tabellen · ${rows} rijen · ${mining} met Mining`, sample: t[0]?.head };
    }],
    ['Money making: hoofdtabel', async () => {
      const r = await loadMethods(game, cfg);
      ctx.methods = r.methods;
      const withReq = r.methods.filter((m) => m.skills.length).length;
      const withRec = r.methods.filter((m) => (m.recSkills || []).length).length;
      return { ok: r.methods.length > 50 && withReq + withRec > 20, warn: r.methods.length > 0, msg: `${r.methods.length} methodes · ${withReq} met vereiste skills · ${withRec} met aanbevolen skills`, sample: r.methods.slice(0, 3).map((m) => ({ name: m.name, profit: m.profit, req: m.skills.map((s) => `${s.skill} ${s.level}`), rec: (m.recSkills || []).map((s) => `${s.skill} ${s.level}`), cat: m.category, int: m.intensity })) };
    }],
    ['Money making: subpagina’s (top 6)', async () => {
      const top = (ctx.methods || []).filter((m) => m.title && m.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 6);
      const res = [];
      let found = 0;
      for (const m of top) {
        try {
          const d = await methodDetails(game, m.title);
          if (d.found) found++;
          res.push({ m: m.name, found: d.found, variant: d.variant || null, req: d.reqSkills.map((s) => `${s.skill} ${s.level}`), rec: d.recSkills.map((s) => `${s.skill} ${s.level}`), quests: d.reqQuests });
        } catch (e) { res.push({ m: m.name, error: e.message }); }
      }
      return { ok: found >= 4, warn: found > 0 && found < 4, msg: `${found}/${top.length} subpagina’s uitgelezen`, sample: res };
    }],
    ['Game-updates', async () => {
      const u = await recentUpdates(game, 3);
      return { ok: u.length > 0, warn: !u.length, msg: u.length ? u.map((x) => `${x.title.replace(/^Update:/, '')} (${(x.date || '').slice(0, 10)})`).join(' · ') : 'geen updates gevonden' };
    }],
  ];
}

export default function Diag() {
  const { game, cfg, rsn, toast } = useApp();
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const tests = buildTests(game, cfg, rsn);
    const res = tests.map(([name]) => ({ name, state: 'wacht' }));
    setRows([...res]);
    for (let i = 0; i < tests.length; i++) {
      res[i] = { ...res[i], state: 'bezig' };
      setRows([...res]);
      const t0 = performance.now();
      try {
        const r = await tests[i][1]();
        res[i] = { ...res[i], ...r, state: r.fail ? 'fout' : r.ok ? 'ok' : 'let op', ms: Math.round(performance.now() - t0) };
      } catch (e) {
        res[i] = { ...res[i], state: 'fout', msg: e.message, ms: Math.round(performance.now() - t0) };
      }
      setRows([...res]);
    }
    setRunning(false);
  };

  const report = () => {
    const lines = [`tick. diagnose v${VERSION} · ${cfg.short} · ${new Date().toISOString()} · RSN ${rsn ? 'ingesteld' : 'geen'}`];
    for (const r of rows) {
      lines.push(`${r.state === 'ok' ? '✓' : r.state === 'fout' ? '✗' : '!'} ${r.name} (${r.ms ?? '?'} ms): ${r.msg || ''}`);
      if (r.sample && r.state !== 'ok') lines.push('   ' + JSON.stringify(r.sample).slice(0, 700));
    }
    return lines.join('\n');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(report()); toast('Rapport gekopieerd: plak het in de chat', 'ok'); }
    catch { toast('Kopiëren lukte niet; gebruik Download', 'warn'); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([report()], { type: 'text/plain' }));
    a.download = `tick-diagnose-${game}.txt`;
    a.click();
  };

  const color = { ok: 'var(--up)', fout: 'var(--down)', 'let op': 'var(--acc)', bezig: 'var(--blue)', wacht: 'var(--dim)' };
  const counts = ['ok', 'let op', 'fout'].map((s) => rows.filter((r) => r.state === s).length);

  return (
    <div className="page">
      <PageHead
        eyebrow={<><span>Zelftest · {cfg.label}</span><span className="dim">v{VERSION}</span></>}
        title="Diagnose"
        sub="Test of tick. de echte wiki, prijzen en je account goed uitleest. Kopieer het rapport en plak het in de chat."
        right={<>
          <button className="btn primary" onClick={run} disabled={running}><Icon name={running ? 'refresh' : 'spark'} size={16} style={running ? { animation: 'spin 1s linear infinite' } : undefined} /> {running ? 'Bezig…' : rows.length ? 'Opnieuw testen' : 'Start test'}</button>
          {rows.length > 0 && !running && <><button className="btn" onClick={copy}><Icon name="book" size={15} /> Kopieer rapport</button><button className="btn ghost" onClick={download}>Download</button></>}
        </>}
      />
      {rows.length > 0 && (
        <section className="grid g3">
          {[['Werkt', counts[0], 'var(--up)'], ['Let op', counts[1], 'var(--acc)'], ['Fout', counts[2], 'var(--down)']].map(([l, n, c], i) => (
            <div key={l} className="card rise stat" style={delay(i, 0, 0.05)}><div className="lbl">{l}</div><div className="val num" style={{ color: c }}>{n}</div></div>
          ))}
        </section>
      )}
      <section className="card rise col" style={{ gap: 2, animationDelay: '.1s' }}>
        {!rows.length && <span className="muted">Test zowel OSRS als RS3: schakel de game in de sidebar en draai de test opnieuw. De eerste keer duurt het ±30 seconden.</span>}
        {rows.map((r, i) => (
          <div key={r.name} className="list-row rise" style={{ ...delay(i, 0, 0.02), alignItems: 'flex-start' }}>
            <span className="dot" style={{ background: color[r.state], marginTop: 7, ...(r.state === 'bezig' ? { animation: 'live 1.2s infinite' } : {}) }} />
            <div className="grow col" style={{ gap: 3, minWidth: 0 }}>
              <div className="row between"><span style={{ fontWeight: 600 }}>{r.name}</span><span className="mono small" style={{ color: color[r.state] }}>{r.state}{r.ms != null ? ` · ${r.ms} ms` : ''}</span></div>
              {r.msg && <span className="small muted" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{stripTags(String(r.msg))}</span>}
              {r.sample && r.state !== 'ok' && <details><summary className="small dim" style={{ cursor: 'pointer' }}>voorbeelddata</summary><pre className="mono small" style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', color: 'var(--tx2)' }}>{JSON.stringify(r.sample, null, 2).slice(0, 2000)}</pre></details>}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
