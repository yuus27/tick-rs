// Minimale, veilige brug tussen de app en het Electron-venster.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tick', {
  desktop: true,
  toggleOnTop: () => ipcRenderer.invoke('tick:ontop'),
  isOnTop: () => ipcRenderer.invoke('tick:ontop:get'),
  update: {
    get: () => ipcRenderer.invoke('tick:update:get'),
    check: () => ipcRenderer.invoke('tick:update:check'),
    install: () => ipcRenderer.invoke('tick:update:install'),
    on: (cb) => {
      const h = (_e, v) => cb(v);
      ipcRenderer.on('update', h);
      return () => ipcRenderer.removeListener('update', h);
    },
  },
  onOnTop: (cb) => {
    const h = (_e, v) => cb(!!v);
    ipcRenderer.on('ontop', h);
    return () => ipcRenderer.removeListener('ontop', h);
  },
});
