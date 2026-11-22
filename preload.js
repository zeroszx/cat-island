/* =========================================================
   Cat Island – jembatan aman renderer ↔ proses utama
   Hanya fungsi di bawah ini yang bisa dipanggil halaman (window.island).
   ========================================================= */
const { contextBridge, ipcRenderer } = require('electron');
const on = (channel) => (fn) => ipcRenderer.on(channel, (_e, v) => fn(v));

contextBridge.exposeInMainWorld('island', {
  // dari proses utama
  onMedia: on('media'),
  onBlur: on('blur'),
  onToggle: on('toggle-open'),
  onSettings: on('settings'),
  onWinHidden: on('win-hidden'),
  onDemo: on('demo'),

  // jendela
  setMode: (m) => ipcRenderer.send('set-mode', m),
  setIgnore: (v) => ipcRenderer.send('set-ignore', v),
  focus: () => ipcRenderer.send('focus'),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  dragEnd: (dx, dy) => ipcRenderer.send('drag-end', dx, dy),

  // data
  loadTasks: () => ipcRenderer.invoke('tasks-load'),
  saveTasks: (tasks) => ipcRenderer.send('tasks-save', tasks),
  getSettings: () => ipcRenderer.invoke('settings-get'),
  setSettings: (patch) => ipcRenderer.send('settings-set', patch),

  // media & YouTube
  mediaCmd: (cmd) => ipcRenderer.send('media-cmd', cmd),
  ytLookup: (q) => ipcRenderer.invoke('yt-lookup', q),
  ytRecs: (id) => ipcRenderer.invoke('yt-recs', id),
  ytThumb: (id) => ipcRenderer.invoke('yt-thumb', id),

  notify: (title, body) => ipcRenderer.send('notify', title, body),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  eqApply: (gains) => ipcRenderer.invoke('eq-apply', gains),
  apoStatus: () => ipcRenderer.invoke('apo-status'),
  apoSetup: () => ipcRenderer.invoke('apo-setup'),
  apoApply: (gains) => ipcRenderer.invoke('apo-apply', gains),
});
