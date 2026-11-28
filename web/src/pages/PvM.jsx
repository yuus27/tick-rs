import { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { getJSON, useAsync } from '../lib/api.js';
import { href, navigate } from '../lib/router.js';
import { nl, short } from '../lib/format.js';
import { wikiFile } from '../lib/theme.js';
import { kcGains, sessionKph } from '../lib/xptrack.js';
import { usePriceBook, priceOf } from '../lib/pricebook.js';
import { Icon, PageHead, Empty, Gp, Drawer, CountUp, Skel, delay } from '../components/ui.jsx';

// Hiscore-tellers die geen boss zijn
const NOT_BOSS = /League|Deadman|Bounty Hunter|Clue Scrolls|LMS|PvP Arena|Soul Wars|Rifts closed|Colosseum Glory|Collections Logged/i;
const CLUE_ORDER = ['beginner', 'easy', 'medium', 'hard', 'elite', 'master'];
// Een paar hiscore-namen heten op de wiki anders
const WIKI_NAME = { 'Barrows Chests': 'Barrows', 'Lunar Chests': 'Lunar Chest', 'Dagannoth Prime': 'Dagannoth Prime', 'Kree\'Arra': 'Kree\'arra', 'Thermonuclear Smoke Devil': 'Thermonuclear smoke devil', 'Crazy Archaeologist': 'Crazy archaeologist', 'Chaos Fanatic': 'Chaos Fanatic' };
const pageOf = (boss) => WIKI_NAME[boss] || boss.replace(/: .*$/, '');
const pct = (x) => `${(x * 100).toLocaleString('nl-NL', { maximumFractionDigits: x < 0.1 ? 1 : 0 })}%`;
const frac = (r) => (r >= 1 ? 'Altijd' : `1/${Math.round(1 / r).toLocaleString('nl-NL')}`);

function BossImg({ game, boss, size = 56 }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <span className="icon-tile" style={{ width: size, height: size }}><Icon name="sword" size={Math.round(size * 0.42)} /></span>;
  return <img src={wikiFile(game, `${pageOf(boss)}.png`)} alt="" referrerPolicy="no-referrer" onError={() => setOk(false)} style={{ width: size, height: size, objectFit: 'contain' }} />;
}

// Wat een boss oplevert: verwachte GP per kill en de zeldzame drops met hoe dry je bent
function BossDetail({ boss, kc, kills7, kph, onClose }) {
  const { game, player } = useApp();
  const drops = useAsync(() => getJSON(`/api/osrs/drops/${encodeURIComponent(pageOf(boss))}`, 12 * 3600e3), [boss]);
  const book = usePriceBook(game);
  const log = useMemo(() => new Set((player.data?.collectionLog || []).map((x) => Number(typeof x === 'object' ? x.id : x))), [player.data]);

  const info = useMemo(() => {
    const list = drops.data?.drops || [];
    if (!list.length) return null;
    let ev = 0;
    const rares = [];
    for (const d of list) {
      if (d.rate == null) continue;
      const p = priceOf(book.data, d.item);
      const qty = (d.qLow + d.qHigh) / 2;
      ev += d.rate * d.rolls * qty * (p?.price || 0);
      if (d.rate <= 1 / 100) rares.push({ ...d, p, per: d.rate * d.rolls });
    }
    // Zelfde item kan meerdere keren voorkomen (varianten): samenvoegen
    const by = new Map();
    for (const r of rares) {
      const cur = by.get(r.item);
      if (cur) cur.per += r.per; else by.set(r.item, { ...r });
    }
    const uniq = [...by.values()].sort((a, b) => b.per - a.per).map((r) => {
      const expected = kc * r.per;
      const chance = 1 - Math.pow(1 - r.per, kc);
      const owned = r.p && log.has(r.p.id);
      return { ...r, expected, chance, owned };
    });
    return { ev, uniq };
  }, [drops.data, book.data, kc, log]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <BossImg game={game} boss={boss} size={72} />
        <div className="col" style={{ gap: 2 }}>
          <span className="eyebrow">Boss</span>
          <h2 className="title" style={{ fontSize: 30, margin: 0 }}>{boss}</h2>
          <a className="small" href={href('wiki', pageOf(boss))}>Wikipagina <Icon name="ext" size={12} /></a>
        </div>
        <button type="button" className="btn sm icon ghost" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Sluiten"><Icon name="x" size={16} /></button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div className="card col" style={{ padding: 14, gap: 2, background: 'var(--bg2)' }}><span className="small muted">Kill count</span><span className="num acc" style={{ fontSize: 26 }}>{nl(kc)}</span></div>
        <div className="card col" style={{ padding: 14, gap: 2, background: 'var(--bg2)' }}><span className="small muted">Laatste 7 dagen</span><span className="num" style={{ fontSize: 26 }}>{kills7 != null ? `+${nl(kills7)}` : '–'}</span></div>
        <div className="card col" style={{ padding: 14, gap: 2, background: 'var(--bg2)' }}><span className="small muted">Kills per uur</span><span className="num" style={{ fontSize: 26 }}>{kph ? kph.perHour.toFixed(1) : '–'}</span><span className="small dim">{kph ? 'uit je sessies' : 'speel met een sessie erbij'}</span></div>
        <div className="card col" style={{ padding: 14, gap: 2, background: 'var(--bg2)' }}><span className="small muted">GP per kill</span><span className="num" style={{ fontSize: 26 }}>{info ? <Gp value={info.ev} size={20} /> : '–'}</span>{info && kph && <span className="small dim"><Gp value={info.ev * kph.perHour} size={12} /> per uur</span>}</div>
      </div>

      {drops.loading && <Skel h={160} />}
      {!drops.loading && !info && <Empty icon="info" title="Geen droptabel gevonden">De wiki heeft voor {boss} geen losse droptabel (bij raids en minigames staan de beloningen op een aparte pagina).</Empty>}
      {info && (
        <div className="col" style={{ gap: 8 }}>
          <div className="row between"><h3 className="h">Zeldzame drops</h3><span className="small dim">{log.size ? 'Met je collection log uit WikiSync' : 'Zet "collection log" aan in de WikiSync-plugin om te zien wat je al hebt'}</span></div>
          <div className="col" style={{ gap: 6 }}>
            {info.uniq.slice(0, 18).map((u) => (
              <div key={u.item} className="list-row" style={{ gap: 10, alignItems: 'center' }}>
                <span className="icon-tile" style={{ width: 34, height: 34 }}><img src={wikiFile('osrs', u.p?.icon || `${u.item}.png`)} alt="" referrerPolicy="no-referrer" style={{ width: 24, height: 22 }} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /></span>
                <div className="col grow" style={{ gap: 1, minWidth: 0 }}>
                  <span className="row" style={{ gap: 6 }}><span className="trunc" style={{ fontWeight: 600 }}>{u.item}</span>{u.owned && <span className="tag ok">In je log</span>}</span>
                  <span className="small dim">{frac(u.per)} per kill · {u.p?.price ? <Gp value={u.p.price} size={12} /> : 'niet te koop'}</span>
                </div>
                <div className="col" style={{ gap: 1, alignItems: 'flex-end', textAlign: 'right' }}>
                  <span className={!u.owned && u.chance > 0.75 ? 'down' : ''} style={{ fontWeight: 700 }}>{pct(u.chance)}</span>
                  <span className="small dim">{u.expected.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}× verwacht{!u.owned && u.expected >= 1.5 ? ' · dry' : ''}</span>
                </div>
              </div>
            ))}
          </div>
          <span className="small dim">Rechts: de kans dat je er bij jouw kill count al minstens één had, en hoe vaak je hem gemiddeld al gekregen zou hebben.</span>
          <span className="small dim">Kansen en hoeveelheden komen van de wiki, prijzen live van de GE. "Dry" betekent: verwacht 1,5× of vaker, maar niet in je collection log.</span>
        </div>
      )}
    </div>
  );
}

function Rs3Log() {
  const { player, rsn } = useApp();
  const acts = (player.data?.activities || []).filter((a) => a.text);
  const drops = acts.filter((a) => /I found|I killed|defeated|drop/i.test(`${a.text} ${a.details || ''}`));
  return (
    <section className="card col" style={{ gap: 10 }}>
      <h2 className="h">Adventurer's log</h2>
      <span className="small muted">RS3 heeft geen boss-tellers in de hiscores. tick. laat daarom je drops en kills uit RuneMetrics zien.</span>
      {!acts.length ? <Empty icon="info" title="Geen activiteit">Staat je RuneMetrics-profiel op openbaar? {rsn ? '' : 'Stel eerst je RSN in.'}</Empty> : (
        <div className="col" style={{ gap: 6 }}>
          {(drops.length ? drops : acts).slice(0, 20).map((a, i) => (
            <div key={i} className="list-row rise" style={{ ...delay(i, 0, 0.03), flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span style={{ fontWeight: 600 }}>{a.text}</span>
              <span className="small dim">{a.date}{a.details ? ` · ${a.details.slice(0, 120)}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function PvM({ boss }) {
  const { game, cfg, player, rsn, xphist, sessions } = useApp();
  const acts = player.data?.activities || [];
  const bosses = acts.filter((a) => a.score > 0 && a.name && !NOT_BOSS.test(a.name)).sort((a, b) => b.score - a.score);
  const clues = acts.filter((a) => /^Clue Scrolls \((.+)\)$/.test(a.name || '')).map((a) => ({ tier: a.name.match(/\((.+)\)/)[1], n: a.score }));
  // Pas tellen als tick. minstens een paar uur geschiedenis heeft, anders staat er overal +0
  const enough = (g) => (g && g.span >= 6 * 3600e3 ? g : null);
  const g7 = enough(kcGains(xphist, game, rsn, acts, 7 * 864e5));
  const g30 = enough(kcGains(xphist, game, rsn, acts, 30 * 864e5));
  const totalKc = bosses.reduce((a, b) => a + b.score, 0);
  const week = g7 ? Object.entries(g7.per).filter(([n]) => !NOT_BOSS.test(n)).reduce((a, [, v]) => a + v, 0) : null;
  const open = boss ? bosses.find((b) => b.name === boss) : null;

  if (game === 'rs3') {
    return (
      <div className="page col" style={{ gap: 18 }}>
        <PageHead eyebrow="RuneMetrics" title="PvM" sub="Je laatste drops en kills" />
        <Rs3Log />
      </div>
    );
  }

  return (
    <div className="page col" style={{ gap: 18 }}>
      <PageHead eyebrow={`${cfg.short} · hiscores`} title="PvM-tracker" sub="Je kill counts, hoe snel je ze haalt, wat een kill oplevert en hoe dry je bent" />
      {!rsn ? <Empty icon="info" title="Stel je RSN in">Dan haalt tick. je kill counts uit de hiscores.</Empty> : player.loading && !player.data ? <Skel h={220} /> : (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="card stat rise"><span className="label">Boss-kills totaal</span><span className="val num"><CountUp value={totalKc} /></span><span className="small dim">{bosses.length} bosses</span></div>
            <div className="card stat rise" style={{ animationDelay: '.04s' }}><span className="label">Kills, 7 dagen</span><span className="val num">{week != null ? `+${nl(week)}` : '–'}</span><span className="small dim">{g7 ? 'uit je geschiedenis in tick.' : 'tick. houdt dit vanaf nu bij'}</span></div>
            <div className="card stat rise" style={{ animationDelay: '.08s' }}><span className="label">Clues</span><span className="val num">{clues.find((c) => c.tier === 'all')?.n ?? '–'}</span><span className="small dim">{clues.filter((c) => c.tier !== 'all').sort((a, b) => CLUE_ORDER.indexOf(a.tier) - CLUE_ORDER.indexOf(b.tier)).map((c) => `${c.tier} ${c.n}`).join(' · ')}</span></div>
          </div>
          {!bosses.length ? <Empty icon="sword" title="Nog geen boss-kills">De hiscores tonen een boss pas vanaf een paar kills (meestal 5 of meer).</Empty> : (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {bosses.map((b, i) => {
                const d7 = g7?.per[b.name] || 0;
                const d30 = g30?.per[b.name] || 0;
                return (
                  <a key={b.name} href={href('pvm', b.name)} className="card hover rise row" style={{ ...delay(i, 0.05, 0.02), gap: 12, padding: 14, color: 'var(--tx)' }}>
                    <BossImg game={game} boss={b.name} size={52} />
                    <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                      <span className="trunc" style={{ fontWeight: 600 }}>{b.name}</span>
                      <span className="num acc" style={{ fontSize: 22 }}>{nl(b.score)}</span>
                      <span className="small dim">{d7 ? `+${d7} deze week` : d30 ? `+${d30} deze maand` : `rank ${b.rank > 0 ? nl(b.rank) : '–'}`}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
      <Drawer open={!!open} onClose={() => navigate(href('pvm'))}>
        {open && <BossDetail boss={open.name} kc={open.score} kills7={g7 ? g7.per[open.name] ?? 0 : null} kph={sessionKph(sessions, game, open.name)} onClose={() => navigate(href('pvm'))} />}
      </Drawer>
    </div>
  );
}
