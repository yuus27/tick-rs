#!/usr/bin/env node
// tick. MCP-brug: verbindt een AI-app (stdio, bv. Claude Desktop) met de AI-koppeling van tick.
// De AI-app start dit script; het stuurt elk bericht door naar tick.'s lokale server (127.0.0.1).
// Draait tick. nog niet, dan start de brug tick. op de achtergrond (alleen in de desktop-app).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

const argData = (() => { const i = process.argv.indexOf('--data'); return i > 0 ? process.argv[i + 1] : null; })();
const DATA_DIR = argData || process.env.TICK_DATA_DIR || (process.platform === 'win32'
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'tick', 'data')
  : process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'tick', 'data')
    : path.join(os.homedir(), '.config', 'tick', 'data'));
const INFO = path.join(DATA_DIR, 'mcp.json');
const log = (...a) => process.stderr.write('[tick-mcp] ' + a.join(' ') + '\n');
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function info() {
  try { return JSON.parse(fs.readFileSync(INFO, 'utf8')); } catch { return null; }
}
async function alive(i) {
  if (!i?.port) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${i.port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

let starting = null;
async function ensureTick() {
  let i = info();
  if (await alive(i)) return i;
  if (!starting) {
    starting = (async () => {
      if (!process.versions.electron) throw new Error('tick. draait niet. Start tick. (start-tick.bat) en probeer het opnieuw.');
      log('tick. draait niet; starten op de achtergrond...');
      const exe = process.execPath;
      const isDevElectron = /^electron(\.exe)?$/i.test(path.basename(exe));
      const args = isDevElectron ? [path.join(__dirname, '..'), '--hidden'] : ['--hidden'];
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      spawn(exe, args, { detached: true, stdio: 'ignore', env }).unref();
      for (let t = 0; t < 60; t++) {
        await sleep(500);
        i = info();
        if (await alive(i)) return i;
      }
      throw new Error('tick. kon niet op tijd gestart worden. Open tick. zelf en probeer het opnieuw.');
    })().finally(() => { starting = null; });
  }
  return starting;
}

async function forward(msg) {
  const isReq = msg && msg.id !== undefined && msg.id !== null;
  try {
    const i = await ensureTick();
    const r = await fetch(`http://127.0.0.1:${i.port}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${i.token}` },
      body: JSON.stringify(msg),
    });
    if (r.status === 202 || !isReq) return;
    const body = await r.json().catch(() => null);
    if (body && !Array.isArray(body) && body.id == null && body.error) body.id = msg.id; // fout zonder id (bv. sleutel/uitgeschakeld)
    send(body || { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `tick. gaf een ongeldig antwoord (${r.status})` } });
  } catch (e) {
    log(e.message);
    if (isReq) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: e.message } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
  if (Array.isArray(msg)) msg.forEach(forward); else forward(msg);
});
rl.on('close', () => setTimeout(() => process.exit(0), 200));
log(`klaar (data: ${DATA_DIR})`);
