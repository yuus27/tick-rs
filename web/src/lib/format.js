export const nl = (n, d = 0) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('nl-NL', { maximumFractionDigits: d, minimumFractionDigits: d }));

export function short(n, digits) {
  if (n == null || Number.isNaN(n)) return '–';
  const a = Math.abs(n);
  const f = (v, d) => v.toLocaleString('nl-NL', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  if (a >= 1e9) return f(n / 1e9, digits ?? 2) + 'B';
  if (a >= 1e6) return f(n / 1e6, digits ?? 2) + 'M';
  if (a >= 1e4) return f(n / 1e3, digits ?? 1) + 'K';
  return nl(n);
}

export const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('nl-NL', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%');

export function ago(ts) {
  if (!ts) return '–';
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s} sec`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} u`;
  return `${Math.round(s / 86400)} d`;
}

export const initials = (name = '') => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export const normTitle = (t = '') => t.toLowerCase().replace(/[’`]/g, "'").replace(/_/g, ' ').replace(/[^a-z0-9' ]/g, '').replace(/\s+/g, ' ').trim();

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Nog wakker';
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}
