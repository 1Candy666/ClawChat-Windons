const { app, BrowserWindow, ipcMain, net, shell, Menu, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isSmoke = process.argv.includes('--smoke');
let win;
const controllers = new Map();

function dataFile() {
  return path.join(app.getPath('userData'), 'clawchat-data.json');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    title: 'ClawChat',
    backgroundColor: '#f3f1ec',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.on('closed', () => app.quit());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (isSmoke) {
    win.webContents.on('did-finish-load', async () => {
      if (process.env.SMOKE_JS) {
        setTimeout(() => win.webContents.executeJavaScript(process.env.SMOKE_JS).catch((e) => console.error(e)), 800);
      }
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.SMOKE_SHOT || 'smoke.png', img.toPNG());
        app.quit();
      }, Number(process.env.SMOKE_WAIT || 2500));
    });
  }
}

// ---------- storage ----------
// API keys are encrypted at rest with the OS keychain (DPAPI on Windows) when available.
const fakeCrypto = process.env.CLAWCHAT_TEST_CRYPTO === '1'; // test hook only: exercises the code path where the OS keychain is missing
const canEncrypt = () => { if (fakeCrypto) return true; try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
const encKey = (t) => (fakeCrypto ? Buffer.from('T:' + t) : safeStorage.encryptString(t)).toString('base64');
const decKey = (b64) => { const b = Buffer.from(b64, 'base64'); return fakeCrypto ? b.toString().slice(2) : safeStorage.decryptString(b); };
ipcMain.handle('store:load', () => {
  let data;
  try { data = JSON.parse(fs.readFileSync(dataFile(), 'utf8')); } catch { return null; }
  for (const p of data.providers || []) {
    if (p.apiKeyEnc) {
      try { p.apiKey = decKey(p.apiKeyEnc); }
      catch { p.apiKey = ''; p.keyLost = true; }
      delete p.apiKeyEnc;
    }
  }
  for (const a of data.agents || []) {
    if (a.pachat?.tokenEnc) {
      try { a.pachat.token = decKey(a.pachat.tokenEnc); } catch { a.pachat.token = ''; a.pachat.lost = true; }
      delete a.pachat.tokenEnc;
    }
  }
  return data;
});
ipcMain.handle('store:encrypted', () => canEncrypt());

ipcMain.handle('store:save', (_e, data) => {
  const file = dataFile();
  const tmp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (canEncrypt()) {
    data = { ...data, providers: (data.providers || []).map((p) => {
      if (!p.apiKey) return p;
      const { apiKey, keyLost, ...rest } = p;
      try {
        const enc = encKey(apiKey);
        if (decKey(enc) !== apiKey) return p; // never store a key we could not read back
        return { ...rest, apiKeyEnc: enc };
      } catch { return p; }
    }), agents: (data.agents || []).map((a) => {
      if (!a.pachat?.token) return a;
      try {
        const { token, ...rest } = a.pachat;
        const enc = encKey(token);
        if (decKey(enc) !== token) return a;
        return { ...a, pachat: { ...rest, tokenEnc: enc } };
      } catch { return a; }
    }) };
  }
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(tmp, file);
  return true;
});

ipcMain.handle('store:path', () => dataFile());
ipcMain.handle('file:saveText', async (e, { name, text }) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: name, filters: [{ name: 'Markdown', extensions: ['md'] }, { name: '文本', extensions: ['txt'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, text, 'utf8');
  return r.filePath;
});
ipcMain.handle('open:data-folder', () => shell.openPath(path.dirname(dataFile())));

// ---------- LLM (OpenAI-compatible) ----------
function endpoint(baseUrl, p) {
  return baseUrl.replace(/\/+$/, '') + p;
}

function headers(apiKey) {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey) h['Authorization'] = 'Bearer ' + apiKey;
  return h;
}

async function readError(res) {
  let t = '';
  try { t = await res.text(); } catch {}
  try {
    const j = JSON.parse(t);
    t = (j.error && (j.error.message || j.error)) || j.message || t;
  } catch {}
  return `HTTP ${res.status}: ${String(t).slice(0, 400)}`;
}

ipcMain.handle('llm:models', async (_e, { baseUrl, apiKey }) => {
  const res = await net.fetch(endpoint(baseUrl, '/models'), { headers: headers(apiKey) });
  if (!res.ok) throw new Error(await readError(res));
  const j = await res.json();
  return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
});

ipcMain.on('llm:abort', (_e, reqId) => {
  const c = controllers.get(reqId);
  if (c) c.abort();
});

// ---------- local CLI agents (Codex / Claude Code) — use the user's own subscription ----------
const { spawn, execFile } = require('child_process');
const os = require('os');
const isWin = process.platform === 'win32';
const attach = require('./attach');

function cliEnv() {
  const env = { ...process.env };
  const extra = [];
  if (isWin) {
    if (env.APPDATA) extra.push(path.join(env.APPDATA, 'npm'));
    if (env.LOCALAPPDATA) extra.push(path.join(env.LOCALAPPDATA, 'Programs', 'codex'));
    extra.push(path.join(os.homedir(), '.local', 'bin'));
  } else {
    extra.push('/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin'));
  }
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[key] = [env[key], ...extra].filter(Boolean).join(path.delimiter);
  return env;
}

function q(a) {
  a = String(a);
  if (!isWin) return a;
  return /[\s"&|<>^()]/.test(a) ? '"' + a.replace(/"/g, '""') + '"' : a;
}

function spawnCli(command, args, cwd) {
  return spawn(isWin ? q(command) : command, isWin ? args.map(q) : args, {
    cwd, env: cliEnv(), shell: isWin, windowsHide: true,
  });
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWin) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  else child.kill('SIGTERM');
}

let cliDir;
function cliWorkDir() {
  if (!cliDir) {
    cliDir = path.join(app.getPath('userData'), 'cli-workspace');
    fs.mkdirSync(cliDir, { recursive: true });
  }
  return cliDir;
}

function flattenPrompt(messages) {
  messages = messages.map((m) => (Array.isArray(m.content) ? { ...m, content: m.content.map((x) => x.text || '').join('\n') } : m));
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const convo = messages.filter((m) => m.role !== 'system').map((m) => {
    if (m.role === 'assistant') return `【你自己之前说的】: ${m.content}`;
    return /^【/.test(m.content) || /^（/.test(m.content) ? m.content : `【用户】: ${m.content}`;
  }).join('\n\n');
  return `以下是你要扮演的角色设定和聊天记录。这是一个纯聊天任务：不要调用任何工具，不要执行命令，不要读写文件，直接输出你要发的下一条聊天消息正文即可。\n\n===== 角色设定 =====\n${sys}\n\n===== 聊天记录 =====\n${convo}\n\n===== 现在轮到你回复 =====`;
}

// models a command-line agent offers to this account (qodercli prints "MODEL" then one name per line)
ipcMain.handle('cli:models', (_e, { kind, command }) => new Promise((resolve) => {
  const cmd = command || ({ claude: 'claude', qoder: 'qodercli' }[kind] || 'codex');
  let out = '', err = '', child;
  try { child = spawnCli(cmd, ['--list-models'], os.homedir()); } catch (e) { return resolve({ ok: false, msg: String(e.message) }); }
  const timer = setTimeout(() => { killTree(child); resolve({ ok: false, msg: '超时：30 秒没有返回' }); }, 30000);
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
  child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, msg: String(e.message) }); });
  child.on('close', () => {
    clearTimeout(timer);
    const names = out.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && x !== 'MODEL').map((x) => x.replace(/\s+\(.*\)$/, ''));
    resolve(names.length ? { ok: true, models: names } : { ok: false, msg: (err.trim() || '没有返回任何模型').slice(0, 300) });
  });
}));

ipcMain.handle('cli:check', (_e, { kind, command }) => new Promise((resolve) => {
  const cmd = command || ({ claude: 'claude', qoder: 'qodercli' }[kind] || 'codex');
  let out = '';
  let child;
  try { child = spawnCli(cmd, ['--version'], os.homedir()); } catch (err) { return resolve({ ok: false, msg: String(err.message) }); }
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  child.on('error', (err) => resolve({ ok: false, msg: String(err.message) }));
  child.on('close', (code) => resolve(code === 0 ? { ok: true, msg: out.trim().split('\n')[0] } : { ok: false, msg: out.trim().slice(0, 300) || `找不到命令「${cmd}」` }));
}));

function runCli(send, reqId, { kind, command, model, effort, messages }) {
  const resolved = attach.resolveMessages(messages, kind === 'codex' || !kind ? 'cli' : 'noimg');
  const prompt = flattenPrompt(resolved.messages);
  const cwd = cliWorkDir();
  let args, cmd;
  const lastFile = path.join(os.tmpdir(), `clawchat-${reqId}.txt`);
  if (kind === 'qoder') {
    cmd = command || 'qodercli';
    // chat only: no tools at all; the prompt goes in through a file so long chats and Chinese text survive the Windows command line
    // inside the CLI's own working folder: qodercli refuses to read outside its workspace without asking
    const pf = path.join(cwd, `prompt-${reqId}.md`);
    fs.writeFileSync(pf, prompt, 'utf8');
    args = ['-p', `你的完整输入在文件 ${pf} 里。先用 Read 工具完整读取它，然后只输出你的回复正文。`, '-o', 'stream-json', '--no-session-persistence', '--tools', 'Read', '--'];
    if (model) args.splice(1, 0, '-m', model);
  } else if (kind === 'claude') {
    cmd = command || 'claude';
    args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--max-turns', '1'];
    if (model) args.push('--model', model);
  } else {
    cmd = command || 'codex';
    args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-o', lastFile];
    if (effort) args.push('-c', `model_reasoning_effort=${effort}`);
    if (model) args.push('-m', model);
    for (const img of resolved.images.slice(-4)) args.push('-i', img);
    args.push('-');
  }

  let child;
  try { child = spawnCli(cmd, args, cwd); }
  catch (err) { send('llm:done', { reqId, error: String(err.message) }); return; }
  controllers.set(reqId, { abort: () => { child._aborted = true; killTree(child); } });
  send('llm:thinking', { reqId });

  let buf = '', errTail = '', lastErr = '', finalText = '', streamed = '', usage;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('{')) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (kind === 'qoder') {
        if (j.type === 'result') { if (j.is_error) lastErr = j.result || j.subtype || 'Qoder 出错'; else finalText = j.result || finalText; if (j.total_credits != null) usage = { in: 0, out: 0, credits: j.total_credits }; }
      } else if (kind === 'claude') {
        const ev = j.event;
        if (j.type === 'stream_event' && ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          streamed += ev.delta.text; send('llm:chunk', { reqId, delta: ev.delta.text });
        } else if (j.type === 'result') {
          if (j.usage) usage = { in: (j.usage.input_tokens || 0) + (j.usage.cache_read_input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0), out: j.usage.output_tokens || 0 };
          if (j.is_error) lastErr = j.result || j.subtype || 'Claude Code 出错';
          else finalText = j.result || finalText;
        }
      } else {
        if (j.type === 'item.completed' && j.item?.type === 'agent_message') {
          const t = j.item.text || '';
          finalText = t;
          if (t) { const delta = streamed ? '\n\n' + t : t; streamed += delta; send('llm:chunk', { reqId, delta }); }
        } else if (j.type === 'turn.completed' && j.usage) usage = { in: j.usage.input_tokens || 0, out: j.usage.output_tokens || 0 };
        else if (j.type === 'turn.failed') lastErr = j.error?.message || 'Codex 出错';
        else if (j.type === 'error' && !/Reconnecting/i.test(j.message || '')) lastErr = j.message;
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { errTail = (errTail + d).slice(-1500); });
  child.on('error', (err) => { lastErr = `无法启动「${cmd}」：${err.message}`; });
  child.on('close', (code) => {
    controllers.delete(reqId);
    try { const t = fs.readFileSync(lastFile, 'utf8').trim(); if (t) finalText = t; fs.unlinkSync(lastFile); } catch {}
    if (kind === 'qoder') try { fs.unlinkSync(path.join(cwd, `prompt-${reqId}.md`)); } catch {}
    if (child._aborted) return send('llm:done', { reqId, aborted: true });
    if (!streamed && finalText) send('llm:chunk', { reqId, delta: finalText });
    if (code !== 0 && !finalText) {
      let msg = lastErr || errTail.trim().split('\n').slice(-3).join('\n') || `进程退出码 ${code}`;
      if (/not recognized|not found|ENOENT|找不到/i.test(msg)) msg = `找不到命令「${cmd}」。请确认已安装，并在命令行里能直接运行它。\n${msg}`;
      if (/log ?in|auth|unauthorized|401/i.test(msg)) msg += '\n（可能还没登录：在命令行运行一次 ' + cmd + (kind === 'claude' ? '' : ' login') + ' ）';
      return send('llm:done', { reqId, error: msg.slice(0, 600) });
    }
    send('llm:done', { reqId, usage, replace: finalText && streamed !== finalText ? finalText : undefined });
  });
  child.stdin.on('error', () => {});
  child.stdin.end(kind === 'qoder' ? '' : prompt, 'utf8');
}

// ---------- Muse web bridge (drives the user's own logged-in muse.ai page) ----------
const MUSE = 'https://muse.ai';
let museWin = null;
let museQueue = Promise.resolve();

function chromeUA() {
  return app.userAgentFallback.replace(/\s(Electron|clawchat|ClawChat)\/\S+/g, '');
}

function getMuseWin(show = false) {
  if (!museWin || museWin.isDestroyed()) {
    museWin = new BrowserWindow({
      width: 460, height: 820, show, title: 'Muse（ClawChat 连接窗口）', autoHideMenuBar: true,
      webPreferences: { partition: 'persist:muse', backgroundThrottling: false, contextIsolation: true },
    });
    museWin.webContents.setUserAgent(chromeUA());
    museWin.on('close', (ev) => { if (!app.isQuitting) { ev.preventDefault(); museWin.hide(); } });
  } else if (show) museWin.show();
  return museWin;
}
app.on('before-quit', () => { app.isQuitting = true; });

async function museLoad(url) {
  const w = getMuseWin();
  if (w.webContents.getURL() !== url) {
    await w.loadURL(url).catch(() => {});
  }
  // wait for SPA to render either the composer or the login form
  for (let i = 0; i < 40; i++) {
    const st = await w.webContents.executeJavaScript(`(()=>{
      if (document.querySelector('textarea')) return 'ok';
      if (/登录|log in|sign in/i.test(document.body?.innerText||'') && document.querySelector('input')) return 'login';
      return 'wait';})()`).catch(() => 'wait');
    if (st !== 'wait') return st;
    await new Promise((r) => setTimeout(r, 500));
  }
  return 'timeout';
}

ipcMain.handle('muse:status', async () => {
  const st = await museLoad(MUSE + '/');
  return st;
});
ipcMain.handle('muse:login', async () => {
  const w = getMuseWin(true);
  await w.loadURL(MUSE + '/').catch(() => {});
  return true;
});

const MUSE_SEND_JS = (text) => `(async()=>{
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  let ta; for(let i=0;i<40&&!(ta=document.querySelector('textarea'));i++) await sleep(250);
  if(!ta) return {error:'找不到 Muse 的输入框（可能没登录，或网页改版了）'};
  const before=new Set([...document.querySelectorAll('[data-message-item][data-message-role=assistant]')].map(e=>e.getAttribute('data-message-id')));
  ta.focus();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(ta, ${JSON.stringify(text)});
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  await sleep(300);
  const btn=[...document.querySelectorAll('button')].find(b=>/发送|send/i.test(b.getAttribute('aria-label')||'')&&!b.disabled);
  if(btn) btn.click(); else ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
  window.__clawBefore=before; window.__clawT0=Date.now(); window.__clawLast=''; window.__clawStable=0;
  return {ok:true};
})()`;

const MUSE_POLL_JS = `(()=>{
  const before=window.__clawBefore||new Set();
  const fresh=[...document.querySelectorAll('[data-message-item][data-message-role=assistant]')].filter(e=>!before.has(e.getAttribute('data-message-id')));
  const text=fresh.map(e=>e.innerText.trim()).filter(Boolean).join('\\n\\n');
  const busy=[...document.querySelectorAll('button')].some(b=>/停止|stop/i.test(b.getAttribute('aria-label')||''));
  if(text && text===window.__clawLast) window.__clawStable++; else window.__clawStable=0;
  window.__clawLast=text;
  return {text, busy, stable:window.__clawStable, url:location.href};
})()`;

function runMuse(send, reqId, { threadUrl, messages }) {
  const job = async () => {
    let aborted = false;
    controllers.set(reqId, { abort: () => { aborted = true; } });
    send('llm:thinking', { reqId });
    try {
      const st = await museLoad(threadUrl || MUSE + '/thread/new');
      if (st === 'login') throw new Error('Muse 还没登录。请到「设置」里点「登录 Muse」，在弹出的窗口里登录。');
      if (st !== 'ok') throw new Error('打开 Muse 网页超时，请检查网络（以及是否能正常访问 muse.ai）。');
      const w = getMuseWin();
      const text = messages.map((m) => m.content).join('\n\n');
      const r = await w.webContents.executeJavaScript(MUSE_SEND_JS(text));
      if (r.error) throw new Error(r.error);
      const t0 = Date.now();
      let shown = '', last;
      while (Date.now() - t0 < 240000) {
        if (aborted) {
          await w.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>/停止|stop/i.test(b.getAttribute('aria-label')||''))?.click()`).catch(() => {});
          return send('llm:done', { reqId, aborted: true });
        }
        await new Promise((res) => setTimeout(res, 800));
        last = await w.webContents.executeJavaScript(MUSE_POLL_JS).catch(() => null);
        if (!last) continue;
        if (last.text && last.text.startsWith(shown) && last.text.length > shown.length) {
          send('llm:chunk', { reqId, delta: last.text.slice(shown.length) });
          shown = last.text;
        }
        if (last.text && !last.busy && last.stable >= 3) break;
      }
      if (!last?.text) throw new Error('等了 4 分钟 Muse 还没回复。');
      const tUrl = /\/thread\/[0-9a-f-]{20,}/.test(last.url) ? last.url : threadUrl;
      send('llm:done', { reqId, replace: last.text !== shown ? last.text : undefined, threadUrl: tUrl });
    } catch (err) {
      send('llm:done', { reqId, error: String(err.message || err) });
    } finally {
      controllers.delete(reqId);
    }
  };
  museQueue = museQueue.then(job, job);
}

ipcMain.on('llm:stream', async (e, { reqId, baseUrl, apiKey, model, messages, temperature, kind, command, effort, threadUrl }) => {
  const send = (ch, payload) => {
    if (!e.sender.isDestroyed()) e.sender.send(ch, payload);
  };
  if (kind === 'codex' || kind === 'claude' || kind === 'qoder') return runCli(send, reqId, { kind, command, model, effort, messages });
  if (kind === 'muse') return runMuse(send, reqId, { threadUrl, messages: attach.resolveMessages(messages, 'noimg').messages });
  const ctrl = new AbortController();
  controllers.set(reqId, ctrl);
  try {
    const wantVision = attach.hasImages(messages);
    let askUsage = true;
    const post = (msgs) => {
      const body = { model, messages: msgs, stream: true };
      if (askUsage) body.stream_options = { include_usage: true };
      if (typeof temperature === 'number') body.temperature = temperature;
      return net.fetch(endpoint(baseUrl, '/chat/completions'), {
        method: 'POST', headers: headers(apiKey), body: JSON.stringify(body), signal: ctrl.signal,
      });
    };
    const mode = wantVision ? 'vision' : 'noimg';
    let res = await post(attach.resolveMessages(messages, mode).messages);
    if (!res.ok && res.status === 400) {
      // some OpenAI-compatible servers reject stream_options: retry once without it
      askUsage = false;
      const retry = await post(attach.resolveMessages(messages, mode).messages);
      if (retry.ok || !wantVision) { if (!retry.ok) throw new Error(await readError(res)); res = retry; }
      else res = retry;
    }
    if (!res.ok && wantVision && res.status >= 400 && res.status < 500) {
      // model probably can't see images: retry with text placeholders
      const errText = await readError(res);
      res = await post(attach.resolveMessages(messages, 'noimg').messages);
      if (!res.ok) throw new Error(errText);
    }
    if (!res.ok) throw new Error(await readError(res));
    let usage;
    const takeUsage = (u) => { if (u && (u.prompt_tokens || u.completion_tokens)) usage = { in: u.prompt_tokens || 0, out: u.completion_tokens || 0 }; };

    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('event-stream')) {
      // server ignored stream:true
      const j = await res.json();
      const text = j.choices?.[0]?.message?.content || '';
      takeUsage(j.usage);
      send('llm:chunk', { reqId, delta: text });
      send('llm:done', { reqId, usage });
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let thinking = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
          takeUsage(j.usage);
          const d = j.choices?.[0]?.delta || {};
          const rc = d.reasoning_content || d.reasoning;
          if (rc && !thinking) {
            thinking = true;
            send('llm:thinking', { reqId });
          }
          if (typeof rc === 'string' && rc) send('llm:reasoning', { reqId, delta: rc });
          if (d.content) send('llm:chunk', { reqId, delta: d.content });
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    }
    send('llm:done', { reqId, usage });
  } catch (err) {
    if (err.name === 'AbortError') send('llm:done', { reqId, aborted: true });
    else send('llm:done', { reqId, error: String(err.message || err) });
  } finally {
    controllers.delete(reqId);
  }
});

require('./work').register();
require('./attach').register();
require('./pachat').register();
require('./project').register();
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
