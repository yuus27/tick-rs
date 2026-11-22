import { useEffect, useRef } from 'react';

export function scrollToAnchor(container, anchor) {
  if (!anchor || !container) return;
  let el = null;
  try {
    el = container.querySelector('#' + CSS.escape(anchor)) || container.querySelector(`[id="${anchor.replace(/"/g, '')}"]`);
  } catch { /* ongeldige selector */ }
  if (!el) {
    const want = anchor.replace(/_/g, ' ').toLowerCase();
    el = [...container.querySelectorAll('h2,h3,h4')].find((h) => h.textContent.trim().toLowerCase() === want);
  }
  if (el) {
    const y = el.getBoundingClientRect().top + window.scrollY - 86;
    window.scrollTo({ top: y, behavior: 'smooth' });
    el.animate?.([{ color: 'var(--acc)' }, { color: '' }], { duration: 1600 });
  }
}

// De wiki levert alle versiewaarden van een infobox in een verborgen blok en wisselt ze met eigen JS; dat doen we hier zelf.
export function wireInfoboxSwitches(el) {
  if (!el) return undefined;
  const tables = [...el.querySelectorAll('table.infobox-switch')];
  const pools = [...el.querySelectorAll('.infobox-switch-resources')];
  const offs = [];
  tables.forEach((t, i) => {
    const pool = pools[i];
    const bar = t.querySelector('.infobox-buttons');
    if (!pool || !bar) return;
    const btns = [...bar.querySelectorAll('[data-switch-index]')];
    const valueFor = (src, n) => [...src.children].find((c) => (c.getAttribute('data-attr-index') || '').split(',').map((x) => x.trim()).includes(String(n)))
      || [...src.children].find((c) => c.getAttribute('data-attr-index') === '0');
    const pick = (n) => {
      t.querySelectorAll('[data-attr-param]').forEach((cell) => {
        const src = pool.querySelector(`:scope > [data-attr-param="${CSS.escape(cell.getAttribute('data-attr-param'))}"]`);
        const v = src && valueFor(src, n);
        if (v) cell.innerHTML = v.innerHTML;
      });
      btns.forEach((b) => b.classList.toggle('on', b.getAttribute('data-switch-index') === String(n)));
    };
    const onClick = (e) => {
      const b = e.target.closest('[data-switch-index]');
      if (b) pick(b.getAttribute('data-switch-index'));
    };
    bar.addEventListener('click', onClick);
    offs.push(() => bar.removeEventListener('click', onClick));
    if (btns.length) pick(btns[0].getAttribute('data-switch-index'));
  });
  return () => offs.forEach((f) => f());
}

export default function WikiContent({ html, anchor, className = 'wiki' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e) => {
      const a = e.target.closest('a[data-anchor]');
      if (a) { e.preventDefault(); scrollToAnchor(el, a.getAttribute('data-anchor')); }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, []);
  // Infobox-versies (bv. Beginner/Medium/Hard/Elite)
  useEffect(() => wireInfoboxSwitches(ref.current), [html]);
  useEffect(() => {
    if (anchor) setTimeout(() => scrollToAnchor(ref.current, anchor), 120);
  }, [html, anchor]);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
