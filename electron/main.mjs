// tick. desktop-app (Electron): start de lokale server in-process en toont hem in een eigen venster.
import { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain, dialog } from 'electron';
import updaterPkg from 'electron-updater';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { autoUpdater } = updaterPkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELEASES = 'https://github.com/yuus27/tick-rs/releases/latest';
// Auto-update werkt alleen in de geïnstalleerde versie (NSIS), niet in de portable .exe of bij desktop-testen
const CAN_UPDATE = () => app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
const ROOT = path.resolve(__dirname, '..');
const ICON = path.join(ROOT, 'build', 'icon.png');
const TRAY = path.join(ROOT, 'build', 'tray.png');

// Zelfde naam als de geïnstalleerde app, zodat test- en installatieversie dezelfde datamap delen (%APPDATA%\\tick)
app.setName('tick');
if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('nl.sensei.tick');

const USER = app.getPath('userData');
process.env.TICK_DATA_DIR = path.join(USER, 'data');
process.env.TICK_DESKTOP = '1';
// Gestart door de AI-koppeling (MCP-brug): alleen op de achtergrond in de tray, zonder venster
const START_HIDDEN = process.argv.includes('--hidden');

let win = null;
let tray = null;
let port = null;
let upd = { status: 'idle', version: null, progress: 0, error: null };

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

// Eerste start: neem je data mee uit de browserversie (RSBuddy/data) als die naast de app staat.
async function migrate() {
  const target = process.env.TICK_DATA_DIR;
  try { await fs.access(target); return; } catch { /* nog niet aanwezig */ }
  await fs.mkdir(target, { recursive: true });
  // Bronnen: oudere testversie (%APPDATA%\\rsbuddy-tick) en de browserversie (RSBuddy/data)
  for (const src of [path.join(app.getPath('appData'), 'rsbuddy-tick', 'data'), path.join(ROOT, 'data')]) {
    try {
      const files = (await fs.readdir(src)).filter((f) => f.endsWith('.json'));
      if (!files.length) continue;
      for (const f of files) await fs.copyFile(path.join(src, f), path.join(target, f));
      break;
    } catch { /* bron bestaat niet */ }
  }
}

function show() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function createWindow() {
  const boundsFile = path.join(USER, 'window.json');
  const saved = await readJson(boundsFile, {});
  win = new BrowserWindow({
    width: saved.width || 1440,
    height: saved.height || 920,
    x: saved.x,
    y: saved.y,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'tick.',
    icon: ICON,
    backgroundColor: '#08090C',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#08090C', symbolColor: '#C4C9D1', height: 44 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (saved.maximized) win.maximize();
  if (saved.onTop) win.setAlwaysOnTop(true, 'floating');
  win.once('ready-to-show', () => { if (!START_HIDDEN) win.show(); });

  const base = `http://localhost:${port}`;
  win.loadURL(base);
  // Externe links (wiki "↗", nieuwsposts) openen in je gewone browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(base)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(base)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.control && input.shift && input.key.toLowerCase() === 't') { toggleOnTop(); e.preventDefault(); }
    if (input.key === 'F5') { win.webContents.reload(); e.preventDefault(); }
    if (input.control && input.shift && input.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  const save = async () => {
    if (!win) return;
    const b = win.getNormalBounds();
    await fs.writeFile(boundsFile, JSON.stringify({ ...b, maximized: win.isMaximized(), onTop: win.isAlwaysOnTop() })).catch(() => {});
  };
  win.on('close', save);
  win.on('closed', () => { win = null; });
}

function toggleOnTop() {
  if (!win) return false;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'floating');
  win.webContents.send('ontop', next);
  refreshTray();
  return next;
}

// ---------- updates via GitHub Releases ----------
function setUpd(patch) {
  upd = { ...upd, ...patch };
  win?.webContents.send('update', { ...upd, current: app.getVersion(), can: CAN_UPDATE() });
  refreshTray();
}
// GitHub geeft af en toe een tijdelijke fout (502/503/504, time-out). Dat is geen echte fout:
// stil een paar keer opnieuw proberen en pas daarna een begrijpelijke melding tonen.
const TRANSIENT = /\b5\d\d\b|timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|net::ERR_|socket hang up/i;
let updRetrying = false;
const updError = (e) => {
  const msg = String(e?.message || e);
  if (TRANSIENT.test(msg)) return `GitHub reageert even niet (${(msg.match(/\b5\d\d\b/) || ['geen verbinding'])[0]}). Probeer het over een paar minuten opnieuw; tick. zoekt ook zelf elke 4 uur.`;
  return msg.split('\n')[0].slice(0, 200);
};
async function checkUpdates(manual = false) {
  if (!CAN_UPDATE()) { if (manual) shell.openExternal(RELEASES); return; }
  const waits = [4000, 12000, 30000];
  for (let i = 0; ; i++) {
    try {
      updRetrying = i < waits.length;
      await autoUpdater.checkForUpdates();
      updRetrying = false;
      return;
    } catch (e) {
      if (i < waits.length && TRANSIENT.test(String(e?.message || e))) {
        setUpd({ status: 'checking', error: null });
        await new Promise((r) => setTimeout(r, waits[i]));
        continue;
      }
      updRetrying = false;
      setUpd({ status: 'error', error: updError(e) });
      return;
    }
  }
}
function setupUpdater() {
  if (!CAN_UPDATE()) return;
  // Niet via de GitHub-releasespagina (/releases/latest gaf vaak 504), maar rechtstreeks via de
  // downloadlink van de nieuwste release: die is veel betrouwbaarder. Zelfde bestanden (latest.yml + setup).
  autoUpdater.setFeedURL({ provider: 'generic', url: 'https://github.com/yuus27/tick-rs/releases/latest/download', useMultipleRangeRequest: false });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => setUpd({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (i) => setUpd({ status: 'downloading', version: i.version, progress: 0 }));
  autoUpdater.on('update-not-available', () => setUpd({ status: 'none' }));
  autoUpdater.on('download-progress', (p) => setUpd({ status: 'downloading', progress: Math.round(p.percent || 0) }));
  autoUpdater.on('error', (e) => { if (updRetrying && TRANSIENT.test(String(e?.message || e))) return; setUpd({ status: 'error', error: updError(e) }); });
  autoUpdater.on('update-downloaded', async (i) => {
    setUpd({ status: 'ready', version: i.version, progress: 100 });
    const r = await dialog.showMessageBox(win ?? undefined, {
      type: 'info', buttons: ['Nu herstarten', 'Later'], defaultId: 0, cancelId: 1,
      title: 'tick. update', message: `tick. ${i.version} staat klaar`,
      detail: 'Herstart nu om bij te werken, of later: dan wordt de update geïnstalleerd zodra je tick. afsluit. Je data blijft bewaard.',
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
  setTimeout(() => checkUpdates(), 6000);
  setInterval(() => checkUpdates(), 4 * 3600e3);
}
const updLabel = () => ({
  idle: 'Zoek naar updates', none: 'Je hebt de nieuwste versie', checking: 'Updates zoeken…',
  downloading: `Update ${upd.version || ''} downloaden… ${upd.progress || 0}%`, ready: `Herstart voor ${upd.version}`, error: 'Update mislukt, opnieuw proberen',
}[upd.status] || 'Zoek naar updates');

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'tick. openen', click: show },
    { type: 'separator' },
    { label: 'Altijd bovenop (Ctrl+Shift+T)', type: 'checkbox', checked: !!win?.isAlwaysOnTop(), click: toggleOnTop },
    { label: 'Start met Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Open in browser', click: () => shell.openExternal(`http://localhost:${port}`) },
    { label: 'Datamap openen', click: () => shell.openPath(process.env.TICK_DATA_DIR) },
    { type: 'separator' },
    { label: `Versie ${app.getVersion()}`, enabled: false },
    CAN_UPDATE()
      ? { label: updLabel(), enabled: upd.status !== 'checking' && upd.status !== 'downloading', click: () => (upd.status === 'ready' ? autoUpdater.quitAndInstall() : checkUpdates(true)) }
      : { label: 'Nieuwste versie op GitHub', click: () => shell.openExternal(RELEASES) },
    { type: 'separator' },
    { label: 'Afsluiten', click: () => app.quit() },
  ]);
}
function refreshTray() { if (tray) tray.setContextMenu(trayMenu()); }

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY));
  tray.setToolTip('tick.');
  tray.on('click', show);
  refreshTray();
}

ipcMain.handle('tick:ontop', () => toggleOnTop());
ipcMain.handle('tick:ontop:get', () => !!win?.isAlwaysOnTop());
ipcMain.handle('tick:update:get', () => ({ ...upd, current: app.getVersion(), can: CAN_UPDATE() }));
ipcMain.handle('tick:update:check', () => checkUpdates(true));
ipcMain.handle('tick:update:install', () => { if (upd.status === 'ready') autoUpdater.quitAndInstall(); });

app.on('second-instance', show);
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  try {
    await migrate();
    const { startServer } = await import(pathToFileURL(path.join(ROOT, 'server', 'index.js')).href);
    const r = await startServer({ port: 5180 });
    port = r.port;
    await createWindow();
    createTray();
    setupUpdater();
  } catch (e) {
    dialog.showErrorBox('tick. kon niet starten', String(e?.message || e));
    app.quit();
  }
});
