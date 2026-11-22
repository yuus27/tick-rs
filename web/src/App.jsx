import { Component, useEffect } from 'react';
import { useApp } from './lib/store.jsx';
import { useRoute } from './lib/router.js';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import { Icon, ErrorBox } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import GE from './pages/GE.jsx';
import Quests from './pages/Quests.jsx';
import QuestDetail from './pages/QuestDetail.jsx';
import Skills from './pages/Skills.jsx';
import SkillGuide from './pages/SkillGuide.jsx';
import Wiki from './pages/Wiki.jsx';
import WikiPage from './pages/WikiPage.jsx';
import Money from './pages/Money.jsx';
import Goals from './pages/Goals.jsx';
import Tools from './pages/Tools.jsx';
import Settings from './pages/Settings.jsx';
import Play from './pages/Play.jsx';
import Radar from './pages/Radar.jsx';
import Market from './pages/Market.jsx';
import Diag from './pages/Diag.jsx';
import Sessions from './pages/Sessions.jsx';
import Diaries from './pages/Diaries.jsx';
import MapView from './pages/MapView.jsx';
import Watcher from './components/Watcher.jsx';

class Boundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }); }
  render() { return this.state.err ? <div className="page"><div className="card"><ErrorBox error={this.state.err} /></div></div> : this.props.children; }
}

function View({ route }) {
  const [a, b] = route.parts;
  switch (a) {
    case undefined: return <Dashboard />;
    case 'play': return <Play />;
    case 'radar': return <Radar />;
    case 'market': return <Market />;
    case 'ge': return <GE query={route.query} />;
    case 'quests': return b ? <QuestDetail title={b} /> : <Quests />;
    case 'skills': return b ? <SkillGuide skill={b} query={route.query} /> : <Skills />;
    case 'wiki': return b ? <WikiPage title={b} anchor={route.query.a} /> : <Wiki query={route.query} />;
    case 'money': return <Money />;
    case 'goals': return <Goals />;
    case 'tools': return <Tools />;
    case 'settings': return <Settings />;
    case 'diag': return <Diag />;
    case 'sessions': return <Sessions />;
    case 'diaries': return <Diaries />;
    case 'map': return <MapView query={route.query} />;
    default: return <div className="page"><div className="card"><ErrorBox error={new Error('Pagina bestaat niet')} /></div></div>;
  }
}

export default function App() {
  const { ready, cfg, game, toasts } = useApp();
  const route = useRoute();

  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty('--acc', cfg.accent);
    r.setProperty('--acc-soft', cfg.accentSoft);
    r.setProperty('--acc-ink', cfg.accentInk);
    document.title = `tick. · ${cfg.short}`;
  }, [cfg]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [route.path]);

  if (!ready) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div className="col" style={{ alignItems: 'center', gap: 14 }}>
          <span className="brand-mark" style={{ width: 54, height: 54, borderRadius: 16 }}><i /></span>
          <span className="dim small">tick. laden…</span>
        </div>
      </div>
    );
  }

  const section = route.parts[0] || '';
  return (
    <>
      <Watcher />
      <div className="ambient" aria-hidden="true"><div className="orb a" /><div className="orb b" /><div className="grain" /></div>
      <div className="shell">
        <Sidebar section={section} />
        <div className="content">
          <Topbar />
          <Boundary k={route.path + game}>
            <div key={route.path + '|' + game} className="page-enter">
              <View route={route} />
            </div>
          </Boundary>
        </div>
      </div>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'warn' ? 'bell' : 'info'} size={17} style={{ color: t.kind === 'ok' ? 'var(--up)' : t.kind === 'warn' ? 'var(--down)' : 'var(--acc)', marginTop: 2 }} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </>
  );
}
