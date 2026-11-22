import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../lib/store.jsx';
import { useAsync } from '../lib/api.js';
import { parsePage, toDoc, stripTags } from '../lib/wiki.js';
import WikiContent, { scrollToAnchor } from '../components/WikiContent.jsx';
import { Icon, Skel, ErrorBox } from '../components/ui.jsx';
import { href } from '../lib/router.js';

export default function WikiPage({ title, anchor }) {
  const { game, cfg, pushHistory } = useApp();
  const { data, error, loading, reload } = useAsync(() => parsePage(game, title), [game, title]);
  const wrap = useRef(null);

  const view = useMemo(() => {
    if (!data) return null;
    const root = toDoc(game, data.text);
    const isQuest = !!root.querySelector('table.questdetails') || [...root.querySelectorAll('table tr > *:first-child')].some((c) => /^\s*Items required\s*$/i.test(c.textContent));
    const skill = cfg.skills.find((s) => s.toLowerCase() === data.title.toLowerCase());
    return { html: root.innerHTML, isQuest, skill, toc: (data.sections || []).filter((s) => s.toclevel <= 2).slice(0, 40) };
  }, [data, game, cfg]);

  useEffect(() => {
    if (data?.title) pushHistory({ title: data.title, game, kind: 'wiki' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.title, game]);

  const displayTitle = data ? stripTags(data.displaytitle || data.title) : title;

  return (
    <div className="page">
      <header className="row wrap between rise" style={{ alignItems: 'flex-end' }}>
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <div className="eyebrow"><a href={href('wiki')} className="row" style={{ gap: 6, color: 'var(--mut)' }}><Icon name="back" size={14} /> Wiki</a><span>·</span><span>{cfg.label}</span></div>
          <h1 className="title">{displayTitle}</h1>
        </div>
        <div className="row wrap">
          {view?.isQuest && <a className="btn primary" href={href('quests', data.title)}><Icon name="quest" size={16} /> Open als quest guide</a>}
          {view?.skill && <a className="btn primary" href={href('skills', view.skill)}><Icon name="skills" size={16} /> 1–99 guide</a>}
          <a className="btn ghost" href={`${cfg.wikiBase}/w/${encodeURIComponent((data?.title || title).replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer"><Icon name="ext" size={15} /> Op de wiki</a>
        </div>
      </header>

      {loading && !data && (
        <div className="card col" style={{ gap: 14 }}>
          <Skel h={22} w="40%" /><Skel h={14} /><Skel h={14} w="92%" /><Skel h={14} w="86%" /><Skel h={200} />
        </div>
      )}
      {error && <div className="card"><ErrorBox error={error} onRetry={reload} /></div>}

      {view && (
        <div className="row" style={{ alignItems: 'flex-start', gap: 20 }} ref={wrap}>
          <article className="card rise grow" style={{ padding: 'clamp(18px, 2.4vw, 32px)', minWidth: 0 }}>
            <WikiContent html={view.html} anchor={anchor} />
            <div style={{ clear: 'both' }} />
            <p className="small dim" style={{ marginTop: 30, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
              Inhoud van de {cfg.pages.main} (CC BY-NC-SA 3.0). Wijzigen doe je op de wiki zelf.
            </p>
          </article>
          {view.toc.length > 2 && (
            <nav className="card toc sticky rise" style={{ width: 250, flex: 'none', padding: 12, maxHeight: 'calc(100vh - 110px)', overflowY: 'auto', animationDelay: '.1s' }} aria-label="Inhoud">
              <div className="nav-title" style={{ paddingTop: 4 }}>Op deze pagina</div>
              {view.toc.map((s) => (
                <a key={s.anchor + s.index} href="javascript:void(0)" className={s.toclevel > 1 ? 'l2' : ''} onClick={() => scrollToAnchor(wrap.current, s.anchor)}>{stripTags(s.line)}</a>
              ))}
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
