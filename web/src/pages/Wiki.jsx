import { useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { fullSearch } from '../lib/wiki.js';
import { Icon, PageHead, SkelRows, Empty, ErrorBox, delay } from '../components/ui.jsx';
import { href, navigate, wikiHref } from '../lib/router.js';
import { ago } from '../lib/format.js';

const QUICK = {
  osrs: [
    ['Optimal quest guide', 'route'], ['Money making guide', 'coins'], ['Achievement Diary', 'star'], ['Combat Achievements', 'target'],
    ['Slayer task', 'skills'], ['Treasure Trails', 'map'], ['Boss', 'flame'], ['Minigames', 'spark'],
  ],
  rs3: [
    ['Optimal quest guide', 'route'], ['Money making guide', 'coins'], ['Achievements', 'star'], ['Slayer', 'skills'],
    ['Treasure Trails', 'map'], ['Bosses', 'flame'], ['Invention', 'spark'], ['Archaeology', 'target'],
  ],
};

export default function Wiki({ query }) {
  const { game, cfg, history } = useApp();
  const [q, setQ] = useState(query.q || '');
  const term = query.q || '';
  const { data, error, loading, reload } = useAsync(() => fullSearch(game, term, 25), [game, term], { enabled: !!term });
  const recent = (history || []).filter((h) => h.game === game).slice(0, 12);

  const submit = (e) => { e.preventDefault(); if (q.trim()) navigate(href('wiki') + `?q=${encodeURIComponent(q.trim())}`); };

  return (
    <div className="page">
      <PageHead eyebrow={<><span className="dot live" /> {cfg.pages.main} · live</>} title="Wiki" sub="De complete wiki, in jouw cockpit. Elke link opent hier, niet in je browser." />

      <form onSubmit={submit} className="card rise accent" style={{ animationDelay: '.05s', padding: 16 }}>
        <label className="search-box" style={{ height: 54, borderRadius: 15 }}>
          <Icon name="search" size={19} style={{ color: 'var(--acc)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek alles: items, monsters, quests, locaties, minigames…" style={{ fontSize: 16 }} aria-label="Zoek in de wiki" />
          <button className="btn primary sm" type="submit">Zoeken</button>
        </label>
      </form>

      {term ? (
        <section className="card rise">
          <div className="row between" style={{ marginBottom: 10 }}>
            <h2 className="h">Resultaten voor “{term}”</h2>
            <span className="small muted">{data ? `${data.length} pagina’s` : ''}</span>
          </div>
          {loading && <SkelRows n={6} h={54} />}
          {error && <ErrorBox error={error} onRetry={reload} />}
          {data && !data.length && <Empty icon="search" title="Niets gevonden">Probeer een andere spelling of een kortere zoekterm.</Empty>}
          <div className="col" style={{ gap: 2 }}>
            {data?.map((r, i) => (
              <a key={r.title} className="list-row rise" style={delay(i, 0, 0.025)} href={wikiHref(r.title)}>
                <span className="icon-tile"><Icon name="book" size={17} style={{ color: 'var(--acc)' }} /></span>
                <span className="grow col" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{r.title}</span>
                  <span className="small muted trunc">{r.snippet}</span>
                </span>
                <Icon name="arrow" size={16} style={{ color: 'var(--dim)' }} />
              </a>
            ))}
          </div>
        </section>
      ) : (
        <div className="grid g2">
          <section className="card rise" style={{ animationDelay: '.1s' }}>
            <h2 className="h" style={{ marginBottom: 12 }}>Snel naar</h2>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
              {QUICK[game].map(([t, ic], i) => (
                <a key={t} href={wikiHref(t)} className="skill-tile rise" style={{ ...delay(i, 0.15, 0.04), flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <span className="icon-tile" style={{ width: 34, height: 34 }}><Icon name={ic} size={16} style={{ color: 'var(--acc)' }} /></span>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t}</span>
                </a>
              ))}
            </div>
          </section>
          <section className="card rise" style={{ animationDelay: '.16s' }}>
            <h2 className="h" style={{ marginBottom: 12 }}>Recent bekeken</h2>
            {!recent.length && <Empty icon="history" title="Nog niets bekeken">Pagina’s die je opent verschijnen hier.</Empty>}
            <div className="col" style={{ gap: 2 }}>
              {recent.map((h, i) => (
                <a key={h.title} className="list-row rise" style={delay(i, 0.2, 0.03)} href={h.kind === 'quest' ? href('quests', h.title) : wikiHref(h.title)}>
                  <Icon name={h.kind === 'quest' ? 'quest' : 'book'} size={16} style={{ color: 'var(--mut)' }} />
                  <span className="grow trunc">{h.title}</span>
                  <span className="small dim">{ago(h.at)}</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
