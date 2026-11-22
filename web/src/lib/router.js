import { useEffect, useState } from 'react';

function parse() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  const parts = p.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
  return { path: p, parts, query: Object.fromEntries(new URLSearchParams(q)) };
}

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const href = (...parts) => '#/' + parts.map((p) => encodeURIComponent(p)).join('/');
export const wikiHref = (title, anchor) => href('wiki', title) + (anchor ? `?a=${encodeURIComponent(anchor)}` : '');
export function navigate(to) { window.location.hash = to.replace(/^#/, ''); }
