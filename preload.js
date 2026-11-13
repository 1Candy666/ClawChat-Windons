const { contextBridge, ipcRenderer } = require('electron');

const listeners = { chunk: new Map(), done: new Map(), thinking: new Map(), reasoning: new Map() };
ipcRenderer.on('llm:reasoning', (_e, p) => listeners.reasoning.get(p.reqId)?.(p.delta));
ipcRenderer.on('llm:chunk', (_e, p) => listeners.chunk.get(p.reqId)?.(p.delta));
ipcRenderer.on('llm:thinking', (_e, p) => listeners.thinking.get(p.reqId)?.());
ipcRenderer.on('llm:done', (_e, p) => {
  const fn = listeners.done.get(p.reqId);
  listeners.chunk.delete(p.reqId);
  listeners.done.delete(p.reqId);
  listeners.thinking.delete(p.reqId);
  listeners.reasoning.delete(p.reqId);
  fn?.(p);
});

let seq = 0;
contextBridge.exposeInMainWorld('claw', {
  load: () => ipcRenderer.invoke('store:load'),
  save: (data) => ipcRenderer.invoke('store:save', data),
  encrypted: () => ipcRenderer.invoke('store:encrypted'),
  saveText: (name, text) => ipcRenderer.invoke('file:saveText', { name, text }),
  dataPath: () => ipcRenderer.invoke('store:path'),
  openDataFolder: () => ipcRenderer.invoke('open:data-folder'),
  listModels: (cfg) => ipcRenderer.invoke('llm:models', cfg),
  cliCheck: (cfg) => ipcRenderer.invoke('cli:check', cfg),
  work: {
    start: (job) => ipcRenderer.send('work:start', job),
    stop: (jobId) => ipcRenderer.send('work:stop', jobId),
    comsolDirs: () => ipcRenderer.invoke('work:comsolDirs'),
    pickFolder: () => ipcRenderer.invoke('work:pickFolder'),
    open: (p) => ipcRenderer.invoke('work:open', p),
    reveal: (p) => ipcRenderer.invoke('work:reveal', p),
    exists: (p) => ipcRenderer.invoke('work:exists', p),
    onEvent: (fn) => ipcRenderer.on('work:event', (_e, ev) => fn(ev)),
  },
  attSave: (name, data) => ipcRenderer.invoke('att:save', { name, data }),
  attOpen: (p) => ipcRenderer.invoke('att:open', p),
  proj: {
    scan: (paths) => ipcRenderer.invoke('proj:scan', paths),
    mkdirs: (dir, rels) => ipcRenderer.invoke('proj:mkdirs', { dir, rels }),
    write: (dir, rel, text) => ipcRenderer.invoke('proj:write', { dir, rel, text }),
    append: (dir, rel, text) => ipcRenderer.invoke('proj:append', { dir, rel, text }),
    read: (dir, rel, max) => ipcRenderer.invoke('proj:read', { dir, rel, max }),
    files: (dir, rel) => ipcRenderer.invoke('proj:files', { dir, rel }),
    exists: (p) => ipcRenderer.invoke('proj:exists', p),
    isEmpty: (p) => ipcRenderer.invoke('proj:isEmpty', p),
    compareCsv: (ref, out, rtol) => ipcRenderer.invoke('proj:compareCsv', { ref, out, rtol }),
    open: (p) => ipcRenderer.invoke('proj:open', p),
    pick: (title) => ipcRenderer.invoke('proj:pick', title),
  },
  pachat: (req) => ipcRenderer.invoke('pachat:api', req),
  museStatus: () => ipcRenderer.invoke('muse:status'),
  museLogin: () => ipcRenderer.invoke('muse:login'),
  // returns { reqId, promise }
  stream(cfg, { onChunk, onThinking, onReasoning }) {
    const reqId = 'r' + Date.now() + '_' + seq++;
    const promise = new Promise((resolve) => {
      listeners.chunk.set(reqId, onChunk || (() => {}));
      listeners.thinking.set(reqId, onThinking || (() => {}));
      if (onReasoning) listeners.reasoning.set(reqId, onReasoning);
      listeners.done.set(reqId, resolve);
    });
    ipcRenderer.send('llm:stream', { ...cfg, reqId });
    return { reqId, promise };
  },
  abort: (reqId) => ipcRenderer.send('llm:abort', reqId),
});
