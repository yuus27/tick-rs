// tick. op je telefoon: een tweede ingang op je thuisnetwerk, alleen met koppelcode.
// Standaard uit. Aan = luistert op 0.0.0.0:<poort>; elk verzoek moet de geheime code hebben
// (eenmalig via de QR-link, daarna als cookie). De AI-koppeling en de LAN-instellingen zelf zijn
// vanaf de telefoon niet bereikbaar.
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const COOKIE = 'tick_lan';
const DEFAULT_PORT = 5178;

export function setupLan(app, { dataDir }) {
  const file = path.join(dataDir, 'lan.json');
  let cfg = { enabled: false, token: null, port: DEFAULT_PORT };
  let server = null;
  let lastError = null;
  const ready = fs.readFile(file, 'utf8').then((t) => { cfg = { ...cfg, ...JSON.parse(t) }; }).catch(() => {});
  const save = () => fs.mkdir(dataDir, { recursive: true }).then(() => fs.writeFile(file, JSON.stringify(cfg, null, 2))).catch(() => {});
  const newToken = () => crypto.randomBytes(24).toString('base64url');

  const same = (a, b) => {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  const cookieOf = (req) => (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1];

  // De ingang voor de telefoon: eerst de code controleren, daarna gewoon de app
  const lanApp = express();
  lanApp.disable('x-powered-by');
  lanApp.use((req, res, next) => {
    const k = req.query.k;
    if (k && same(k, cfg.token)) {
      res.setHeader('Set-Cookie', `${COOKIE}=${cfg.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${3600 * 24 * 365}`);
      return res.redirect(302, '/');
    }
    if (!cfg.enabled || !cfg.token || !same(cookieOf(req), cfg.token)) {
      res.status(401).type('html').send('<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;background:#0b0906;color:#eee;padding:32px"><h2>tick.</h2><p>Scan de QR-code in tick. op je PC (Instellingen → Op je telefoon) om te koppelen.</p></body>');
      return;
    }
    // Geen AI-koppeling en geen LAN-instellingen vanaf het netwerk
    if (/^\/api\/(mcp|lan)(\/|$)/.test(req.path)) return res.status(403).json({ error: 'Niet vanaf je telefoon' });
    req.tickLan = true;
    next();
  });
  lanApp.use((req, res) => app(req, res));

  function lanUrls() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      for (const a of list || []) {
        if (a.family !== 'IPv4' || a.internal) continue;
        if (/^(vEthernet|VirtualBox|VMware|docker|br-|vboxnet|Hyper-V)/i.test(name)) continue;
        if (!/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address)) continue;
        out.push(`http://${a.address}:${cfg.port}/?k=${cfg.token}`);
      }
    }
    if (!out.length) {
      for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${cfg.port}/?k=${cfg.token}`);
    }
    return out.sort((a, b) => (a.includes('192.168') ? -1 : 0) - (b.includes('192.168') ? -1 : 0));
  }

  async function start() {
    await stop();
    lastError = null;
    await new Promise((resolve) => {
      const srv = lanApp.listen(cfg.port, '0.0.0.0');
      srv.once('listening', () => { server = srv; resolve(); });
      srv.once('error', (e) => { lastError = e.code === 'EADDRINUSE' ? `Poort ${cfg.port} is al in gebruik` : e.message; resolve(); });
    });
  }
  async function stop() {
    if (!server) return;
    await new Promise((r) => server.close(() => r()));
    server = null;
  }

  // Alleen tick. op deze PC mag dit regelen
  const local = (req) => !req.tickLan && req.headers['x-tick'] === '1' && (!req.headers.origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin));

  app.get('/api/lan/info', async (req, res) => {
    if (!local(req)) return res.status(403).json({ error: 'forbidden' });
    await ready;
    const urls = cfg.enabled && server ? lanUrls() : [];
    let qr = null;
    if (urls[0]) {
      try {
        const QR = (await import('qrcode')).default;
        qr = await QR.toString(urls[0], { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } });
      } catch { /* qrcode niet geïnstalleerd: alleen de link */ }
    }
    res.json({ enabled: cfg.enabled, running: !!server, port: cfg.port, urls, qr, error: lastError });
  });
  app.post('/api/lan/config', async (req, res) => {
    if (!local(req)) return res.status(403).json({ error: 'forbidden' });
    await ready;
    const on = !!req.body?.enabled;
    if (on && !cfg.token) cfg.token = newToken();
    cfg.enabled = on;
    await save();
    if (on) await start(); else await stop();
    res.json({ ok: true, running: !!server, error: lastError });
  });
  app.post('/api/lan/reset', async (req, res) => {
    if (!local(req)) return res.status(403).json({ error: 'forbidden' });
    await ready;
    cfg.token = newToken(); // oude koppelingen werken direct niet meer
    await save();
    res.json({ ok: true });
  });

  return {
    async boot() { await ready; if (cfg.enabled && cfg.token) await start(); },
  };
}
