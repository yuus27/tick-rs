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
  useEffect(() => {
    if (anchor) setTimeout(() => scrollToAnchor(ref.current, anchor), 120);
  }, [html, anchor]);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
