import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { searchWiki } from '../lib/wiki.js';
import { Icon, SkillIcon } from './ui.jsx';
import { href, navigate, wikiHref } from '../lib/router.js';

const PAGES = [
  ['Dashboard', ''], ['Nu spelen', 'play'], ['Unlock-radar', 'radar'], ['GE-terminal', 'ge'], ['Markt-radar', 'market'], ['Quests', 'quests'], ['Skill guides', 'skills'], ['Wiki', 'wiki'], ['Money-making', 'money'], ['Doelen', 'goals'], ['Calculators', 'tools'], ['Instellingen', 'settings'], ['Diagnose', 'diag'],
];

export default function Topbar() {
  const { game, cfg, player, loadPlayer } = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState([]);
  const [act, setAct] = useState(0);
  const inp = useRef(null);
  const box = useRef(null);
  const [onTop, setOnTop] = useState(false);
  const [upd, setUpd] = useState(null);
  useEffect(() => {
    if (!window.tick?.desktop) return;
    window.tick.isOnTop().then(setOnTop);
    const off1 = window.tick.onOnTop(setOnTop);
    window.tick.update?.get().then(setUpd);
    const off2 = window.tick.update?.on(setUpd);
    return () => { off1?.(); off2?.(); };
  }, []);

  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.current?.focus(); setOpen(true); }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') { e.preventDefault(); inp.current?.focus(); setOpen(true); }
    };
    const c = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('keydown', k);
    window.addEventListener('mousedown', c);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('mousedown', c); };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      searchWiki(game, term, 8).then((r) => alive && setRes(r)).catch(() => alive && setRes([]));
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q, game]);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = [];
    if (term) {
      cfg.skills.filter((s) => s.toLowerCase().startsWith(term)).slice(0, 3).forEach((s) => out.push({ grp: 'Skill guides', label: `${s} 1–99 guide`, to: href('skills', s), skill: s }));
      PAGES.filter(([l]) => l.toLowerCase().includes(term)).slice(0, 3).forEach(([l, k]) => out.push({ grp: 'Naar', label: l, to: '#/' + k, icon: 'arrow' }));
    }
    res.forEach((r) => out.push({ grp: `Wiki · ${cfg.short}`, label: r.title, to: wikiHref(r.title), icon: 'book' }));
    if (term) out.push({ grp: 'Zoeken', label: `Zoek “${q.trim()}” in de hele wiki`, to: href('wiki') + `?q=${encodeURIComponent(q.trim())}`, icon: 'search' });
    return out;
  }, [q, res, cfg]);

  useEffect(() => setAct(0), [items.length]);

  const go = (it) => { navigate(it.to); setOpen(false); setQ(''); inp.current?.blur(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(items.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && items[act]) { e.preventDefault(); go(items[act]); }
    if (e.key === 'Escape') { setOpen(false); inp.current?.blur(); }
  };

  let lastGrp = null;
  return (
    <div className="top">
      <div className="search" ref={box}>
        <label className="search-box">
          <Icon name="search" size={17} style={{ color: 'var(--mut)' }} />
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Zoeken</span>
          <input ref={inp} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
            placeholder={`Zoek in de ${cfg.short}-wiki: quest, item, boss, skill…`} aria-autocomplete="list" />
          <span className="kbd">Ctrl K</span>
        </label>
        {open && items.length > 0 && (
          <div className="suggest" role="listbox">
            {items.map((it, i) => {
              const head = it.grp !== lastGrp ? <div className="grp" key={'g' + i}>{it.grp}</div> : null;
              lastGrp = it.grp;
              return (
                <div key={i}>
                  {head}
                  <a href={it.to} className={i === act ? 'act' : ''} onMouseEnter={() => setAct(i)} onClick={(e) => { e.preventDefault(); go(it); }} role="option" aria-selected={i === act}>
                    {it.skill ? <SkillIcon skill={it.skill} size={18} /> : <Icon name={it.icon} size={16} style={{ color: 'var(--mut)' }} />}
                    <span className="trunc">{it.label}</span>
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="grow" />
      {upd?.status === 'ready' && <button className="btn sm primary" onClick={() => window.tick.update.install()} title="Herstart tick. om de update te installeren"><Icon name="spark" size={14} /> Update {upd.version}: herstart</button>}
      {upd?.status === 'downloading' && <span className="tag acc" title="Update wordt gedownload">Update {upd.version} · {upd.progress}%</span>}
      <span className="tag line">{cfg.label}</span>
      {window.tick?.desktop && (
        <button className={`btn sm icon ${onTop ? 'primary' : ''}`} onClick={() => window.tick.toggleOnTop().then(setOnTop)} aria-pressed={onTop} aria-label="Altijd bovenop" title="Altijd bovenop (Ctrl+Shift+T): handig op je tweede scherm naast de game">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5 M9 3h6l-1 6 3 3v2H7v-2l3-3z" /></svg>
        </button>
      )}
      <button className="btn sm icon" onClick={loadPlayer} aria-label="Speler verversen" title="Speler verversen">
        <Icon name="refresh" size={16} style={player.loading ? { animation: 'spin 1s linear infinite' } : undefined} />
      </button>
    </div>
  );
}
