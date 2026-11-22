import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { initials } from '../lib/format.js';
import { useApp } from '../lib/store.jsx';

// ---------- iconen (lijnstijl) ----------
const P = {
  home: 'M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z',
  chart: 'M3 20h18 M6 16l4-5 3 3 6-7 M15 7h4v4',
  quest: 'M6 3h9l3 3v15H6z M9 9h6 M9 13h6 M9 17h4',
  skills: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  coins: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7 M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10 M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2',
  calc: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8.5 7.5h7 M8.5 12h.01 M12 12h.01 M15.5 12h.01 M8.5 16h.01 M12 16h.01 M15.5 16h.01',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6 M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M20 20l-3.5-3.5',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0',
  refresh: 'M21 12a9 9 0 0 1-15.5 6.2 M3 12A9 9 0 0 1 18.5 5.8 M18 2v4h-4 M6 22v-4h4',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  ext: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  clock: 'M12 7v5l3 2 M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
  flame: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4 3 7 7 7z',
  route: 'M6 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M18 9a2 2 0 1 0 0-4a2 2 0 1 0 0 4 M8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8 M4 21a8 8 0 0 1 16 0',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 3v6h6 M12 7v5l3 2',
  spark: 'M12 2v4 M12 18v4 M4.9 4.9l2.8 2.8 M16.3 16.3l2.8 2.8 M2 12h4 M18 12h4 M4.9 19.1l2.8-2.8 M16.3 7.7l2.8-2.8',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 11v6 M12 7.5v.5',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14 M15 6v14',
};
export function Icon({ name, size = 18, stroke = 1.9, fill = 'none', className, style }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d={P[name] || P.info} />
    </svg>
  );
}

// ---------- animatie-helpers ----------
export function useCountUp(target, ms = 1200) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null || !Number.isFinite(target)) return;
    const start = performance.now();
    const a = from.current;
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * e;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function CountUp({ value, format = (x) => Math.round(x).toLocaleString('nl-NL'), ms }) {
  const v = useCountUp(value, ms);
  return <>{value == null ? '–' : format(v)}</>;
}

export const delay = (i, base = 0, step = 0.05) => ({ animationDelay: `${base + i * step}s` });

// ---------- grafieken ----------
function pathOf(vals, w, h, pad = 4, lo, hi) {
  const v = vals.filter((x) => x != null && Number.isFinite(x));
  if (v.length < 2) return '';
  const mn = lo ?? Math.min(...v), mx = hi ?? Math.max(...v), span = mx - mn || 1;
  let d = '';
  let started = false;
  vals.forEach((y, i) => {
    if (y == null || !Number.isFinite(y)) return;
    const x = (i / (vals.length - 1)) * w;
    const yy = h - ((y - mn) / span) * (h - pad * 2) - pad;
    d += (started ? 'L' : 'M') + x.toFixed(1) + ',' + yy.toFixed(1) + ' ';
    started = true;
  });
  return d.trim();
}

export function Spark({ values, w = 96, h = 30, color }) {
  const d = useMemo(() => pathOf(values || [], w, h), [values, w, h]);
  if (!d) return <svg width={w} height={h} aria-hidden="true" />;
  const up = values[values.length - 1] >= values.find((x) => x != null);
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block', flex: 'none' }}>
      <path d={d} fill="none" stroke={color || (up ? 'var(--up)' : 'var(--down)')} strokeWidth="1.8" pathLength="1000" strokeDasharray="1000" style={{ animation: 'draw 1.4s var(--ease) both' }} />
    </svg>
  );
}

export function AreaChart({ series, h = 220, colors = ['var(--acc)', 'var(--blue)'], labels, fmt = (v) => v }) {
  const W = 600;
  const [hover, setHover] = useState(null);
  const all = series.flatMap((s) => s.values).filter((x) => x != null);
  const ref = useRef(null);
  if (all.length < 2) return <div className="empty small" style={{ height: h }}>Nog niet genoeg prijsdata</div>;
  const mn = Math.min(...all), mx = Math.max(...all), span = mx - mn || 1;
  const n = series[0].values.length;
  const y = (v) => h - ((v - mn) / span) * (h - 24) - 12;
  const x = (i) => (i / (n - 1)) * W;
  const key = series.map((s) => s.values.length + ':' + s.values[0]).join('|');
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Prijsgrafiek">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`ag${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={colors[i]} stopOpacity=".26" />
              <stop offset="1" stopColor={colors[i]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={h * f} y2={h * f} stroke="#1B2029" vectorEffect="non-scaling-stroke" />)}
        {series.map((s, i) => {
          const d = pathOf(s.values, W, h, 12, mn, mx);
          if (!d) return null;
          const area = `${d} L${W},${h} L0,${h} Z`;
          return (
            <g key={key + i}>
              {i === 0 && <path d={area} fill={`url(#ag${i})`} style={{ animation: 'fade 1.2s .3s both' }} />}
              <path d={d} fill="none" stroke={colors[i]} strokeWidth="2.2" vectorEffect="non-scaling-stroke" pathLength="1000" strokeDasharray="1000" style={{ animation: 'draw 1.4s var(--ease) both' }} />
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={h} stroke="#3A4250" vectorEffect="non-scaling-stroke" />}
        {hover != null && series.map((s, i) => s.values[hover] != null && <circle key={i} cx={x(hover)} cy={y(s.values[hover])} r="4" fill={colors[i]} vectorEffect="non-scaling-stroke" />)}
      </svg>
      {hover != null && (
        <div style={{ position: 'absolute', top: 6, left: `min(max(${(hover / (n - 1)) * 100}%, 70px), calc(100% - 150px))`, transform: 'translateX(-50%)', pointerEvents: 'none', background: 'rgba(16,19,24,.95)', border: '1px solid var(--line2)', borderRadius: 10, padding: '7px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>
          {labels?.[hover] && <div className="dim">{labels[hover]}</div>}
          {series.map((s, i) => s.values[hover] != null && <div key={i} className="mono" style={{ color: colors[i] }}>{s.name}: {fmt(s.values[hover])}</div>)}
        </div>
      )}
    </div>
  );
}

export function Ring({ value = 0, size = 150, stroke = 12, children, color = 'var(--acc)' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = useCountUp(Math.max(0, Math.min(1, value)), 1300);
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--s3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ filter: 'drop-shadow(0 0 8px color-mix(in srgb, var(--acc) 45%, transparent))' }} />
      </svg>
      <div className="center">{children}</div>
    </div>
  );
}

export function Bar({ value, color }) {
  return <div className="bar"><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} /></div>;
}

// ---------- afbeeldingen met fallback ----------
export function Img({ src, alt = '', fallback, size = 26 }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!src || bad) return fallback ?? null;
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} style={{ objectFit: 'contain' }} />;
}

export function SkillIcon({ skill, size = 22 }) {
  const { cfg } = useApp();
  return <Img src={cfg.skillIcon(skill)} alt="" size={size} fallback={<span className="mono" style={{ fontSize: 10, color: 'var(--acc)', width: size, textAlign: 'center' }}>{skill.slice(0, 2)}</span>} />;
}

export function ItemIcon({ item, size = 26 }) {
  const { cfg } = useApp();
  const src = item?.icon ? `${cfg.wikiBase}/images/${encodeURIComponent(item.icon.replace(/ /g, '_'))}` : null;
  return (
    <span className="icon-tile">
      <Img src={src} size={size} fallback={<span className="ini">{initials(item?.name)}</span>} />
    </span>
  );
}

// ---------- states ----------
export function Skel({ h = 16, w = '100%', r = 10, style }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}
export function SkelRows({ n = 6, h = 44 }) {
  return <div className="col" style={{ gap: 8 }}>{Array.from({ length: n }, (_, i) => <Skel key={i} h={h} style={{ opacity: 1 - i * 0.1 }} />)}</div>;
}

export function Empty({ icon = 'info', title, children, action }) {
  return (
    <div className="empty">
      <div className="ico"><Icon name={icon} size={22} /></div>
      {title && <div style={{ color: 'var(--tx)', fontWeight: 600, fontSize: 15 }}>{title}</div>}
      {children && <div className="small" style={{ maxWidth: 420 }}>{children}</div>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <Empty icon="info" title="Dat lukte niet" action={onRetry && <button className="btn sm" onClick={onRetry}><Icon name="refresh" size={15} /> Opnieuw</button>}>
      {error?.message || String(error)}
    </Empty>
  );
}

export function Toggle({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><i /></button>;
}

export function Drawer({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">{children}</aside>
    </>,
    document.body,
  );
}

export function PageHead({ eyebrow, title, sub, right }) {
  return (
    <header className="row wrap between rise" style={{ alignItems: 'flex-end', gap: 18 }}>
      <div className="col" style={{ gap: 8, minWidth: 0 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="title">{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right && <div className="row wrap">{right}</div>}
    </header>
  );
}
