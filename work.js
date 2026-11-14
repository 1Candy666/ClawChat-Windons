// "Work mode": let a Codex / Claude Code contact actually do things inside a chosen folder.
const { app, ipcMain, dialog, shell, BrowserWindow } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isWin = process.platform === 'win32';
const jobs = new Map(); // jobId -> { child, aborted }

function q(a) {
  a = String(a);
  if (!isWin) return a;
  return /[\s"&|<>^()]/.test(a) ? '"' + a.replace(/"/g, '""') + '"' : a;
}
function cliEnv() {
  const env = { ...process.env };
  const extra = [];
  if (isWin) {
    if (env.APPDATA) extra.push(path.join(env.APPDATA, 'npm'));
    extra.push(path.join(os.homedir(), '.local', 'bin'));
  } else extra.push('/usr/local/bin', path.join(os.homedir(), '.local', 'bin'));
  const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[key] = [env[key], ...extra].filter(Boolean).join(path.delimiter);
  return env;
}
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (isWin) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  else child.kill('SIGTERM');
}

// Folders COMSOL writes temp/config files to; sandboxed runs fail without them.
function comsolDirs() {
  const home = os.homedir();
  return ['.comsol', 'comsol_tmp'].map((d) => path.join(home, d)).filter((d) => fs.existsSync(d));
}

const IMG = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const SKIP = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'ClawChat附件', '.clawchat']);
function scanChanged(dir, since, max = 40) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 4 || out.length >= max) return;
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (out.length >= max) return;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, depth + 1); continue; }
      try { const st = fs.statSync(p); if (st.mtimeMs >= since - 1000) out.push({ path: p, size: st.size, mtime: st.mtimeMs }); } catch {}
    }
  };
  walk(dir, 0);
  return out.sort((a, b) => b.mtime - a.mtime);
}
function thumb(p) {
  try {
    const st = fs.statSync(p);
    if (st.size > 4 * 1024 * 1024) return null;
    const ext = path.extname(p).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
    return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
  } catch { return null; }
}

function describeItem(it, phase) {
  const t = it.type;
  if (t === 'command_execution') {
    if (phase === 'started') return { kind: 'cmd', text: `▶ ${it.command}` };
    const out = (it.aggregated_output || '').trim().split('\n').slice(-4).join('\n');
    return { kind: it.exit_code === 0 ? 'ok' : 'warn', text: `${it.exit_code === 0 ? '✓' : '✗'} ${it.command}${it.exit_code != null && it.exit_code !== 0 ? `（退出码 ${it.exit_code}）` : ''}`, detail: out };
  }
  if (t === 'file_change' && phase === 'completed') {
    return { kind: 'file', text: '✎ ' + (it.changes || []).map((c) => `${c.kind === 'add' ? '新建' : c.kind === 'delete' ? '删除' : '修改'} ${c.path}`).join('；') };
  }
  if (t === 'reasoning' && phase === 'completed' && it.text) return { kind: 'think', text: '💭 ' + it.text.replace(/\*\*/g, '').trim().split('\n')[0].slice(0, 160) };
  if (t === 'todo_list' && it.items) return { kind: 'todo', text: '☐ ' + it.items.map((x) => (x.completed ? '✓' : '·') + x.text).join('  ') };
  if (t === 'web_search' && phase === 'started') return { kind: 'cmd', text: '🔎 搜索：' + (it.query || '') };
  if (t === 'mcp_tool_call' && phase === 'started') return { kind: 'cmd', text: `🔧 ${it.server || ''} ${it.tool || ''}` };
  if (t === 'error') return { kind: 'warn', text: '⚠ ' + (it.message || '') };
  return null;
}

function buildArgs(job, lastFile) {
  const { kind, model, effort, dir, level, extraDirs = [], network } = job;
  if (kind === 'gemini') {
    // the task goes in on stdin; ClawChat's own folder (the trust list) is set per run through the environment
    const args = ['-p', '上面是你的完整任务说明。请严格按里面的要求执行，完成后用中文简要汇报。', '-o', 'stream-json'];
    if (job.sessionId) args.push('--resume', job.sessionId);
    if (model) args.push('-m', model);
    if (extraDirs.length) args.push('--include-directories', extraDirs.join(','));
    // write/full: everything auto-approved (data stages must run Python); read: default mode, where any tool
    // that needs approval is refused in a headless run, so the reviewer can read but not change anything
    if (level !== 'read') args.push('--approval-mode', 'yolo');
    return args;
  }
  if (kind === 'qoder') {
    // the long prompt lives in a file (see startJob); the command line only points at it
    const args = ['-p', `你的完整任务说明在文件 ${job.promptFile} 里。先用 Read 工具完整读取它，然后严格按里面的要求执行。`, '-o', 'stream-json', '-w', dir];
    if (job.sessionId) args.push('-r', job.sessionId);
    if (model) args.push('-m', model);
    for (const d of extraDirs) args.push('--add-dir', d);
    if (level === 'full') args.push('--dangerously-skip-permissions');
    else if (level === 'read') args.push('--tools', 'Read', 'Glob', 'Grep', '--');
    else args.push('--permission-mode', 'accept_edits');
    return args;
  }
  if (kind === 'claude') {
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];
    if (level === 'full') args.push('--dangerously-skip-permissions');
    else args.push('--permission-mode', 'acceptEdits', '--allowedTools', 'Bash,Read,Edit,Write,Glob,Grep,TodoWrite');
    for (const d of extraDirs) args.push('--add-dir', d);
    if (model) args.push('--model', model);
    return args;
  }
  if (job.sessionId) {
    // resume an earlier session of this agent: it keeps its memory of the work. `resume` has no -s/-C flags.
    const args = ['exec', 'resume', job.sessionId, '--json', '--skip-git-repo-check', '-o', lastFile];
    if (level === 'full') args.push('--dangerously-bypass-approvals-and-sandbox');
    else {
      args.push('-c', `sandbox_mode=${level === 'read' ? 'read-only' : 'workspace-write'}`);
      if (network && level !== 'read') args.push('-c', 'sandbox_workspace_write.network_access=true');
    }
    if (effort) args.push('-c', `model_reasoning_effort=${effort}`);
    if (model) args.push('-m', model);
    args.push('-');
    return args;
  }
  const args = ['exec', '--json', '--skip-git-repo-check', '-C', dir, '-o', lastFile];
  if (level === 'full') args.push('-s', 'danger-full-access');
  else if (level === 'read') args.push('-s', 'read-only');
  else {
    args.push('-s', 'workspace-write');
    for (const d of extraDirs) args.push('--add-dir', d);
    if (network) args.push('-c', 'sandbox_workspace_write.network_access=true');
  }
  if (effort) args.push('-c', `model_reasoning_effort=${effort}`);
  if (model) args.push('-m', model);
  args.push('-');
  return args;
}

function startJob(sender, job) {
  const send = (payload) => { if (!sender.isDestroyed()) sender.send('work:event', { jobId: job.jobId, ...payload }); };
  if (!job.dir || !fs.existsSync(job.dir)) return send({ type: 'done', error: `工作文件夹不存在：${job.dir || '（未设置）'}` });
  const copied = require('./attach').copyInto(job.attachments, job.dir);
  if (copied.length) job.prompt += `\n\n用户提供的附件已复制到工作文件夹：\n${copied.map((c) => '- ' + c).join('\n')}`;
  const lastFile = path.join(os.tmpdir(), `clawchat-work-${job.jobId}.txt`);
  const cmd = job.command || ({ claude: 'claude', qoder: 'qodercli', gemini: 'gemini' }[job.kind] || 'codex');
  if (job.kind === 'qoder') {
    // prompt file outside the project folder, so it never ends up among the outputs
    // inside the work folder (a hidden .clawchat subfolder): qodercli won't read outside its workspace in -p mode
    const pd = path.join(job.dir, '.clawchat', 'prompts');
    fs.mkdirSync(pd, { recursive: true });
    job.promptFile = path.join(pd, `${job.jobId}.md`);
    fs.writeFileSync(job.promptFile, job.prompt, 'utf8');
  }
  const args = buildArgs(job, lastFile);
  const started = Date.now();
  let child;
  try {
    child = spawn(isWin ? q(cmd) : cmd, isWin ? args.map(q) : args, { cwd: job.dir, env: { ...cliEnv(), GEMINI_CLI_TRUST_WORKSPACE: 'true' }, shell: isWin, windowsHide: true });
  } catch (err) { return send({ type: 'done', error: String(err.message) }); }
  const rec = { child, aborted: false };
  jobs.set(job.jobId, rec);
  send({ type: 'log', entry: { kind: 'info', text: `开始执行 · ${cmd}${job.sessionId ? '（接着上次的会话）' : ''} · ${job.level === 'full' ? '完全访问' : job.level === 'read' ? '只读' : '仅项目文件夹可写'} · ${job.dir}` } });

  let buf = '', errTail = '', lastErr = '', finalText = '', changed = new Set(), usage, sessionId = job.sessionId || null;
  const raw = (line) => { if (job.rawLog) try { fs.mkdirSync(path.dirname(job.rawLog), { recursive: true }); fs.appendFileSync(job.rawLog, line + '\n'); } catch {} };
  raw(`\n===== ${new Date().toISOString()} ${cmd} ${args.filter((x) => x !== '-').join(' ')}\n----- prompt -----\n${job.prompt}\n----- events -----`);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      raw(line);
      if (!line.startsWith('{')) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      if (j.type === 'thread.started' && j.thread_id) sessionId = j.thread_id;
      if (job.kind === 'gemini') {
        if (j.session_id) sessionId = j.session_id;
        if (j.type === 'tool_use') {
          const p = j.parameters || {}, n = j.tool_name || '';
          const target = p.file_path || p.absolute_path || p.path || p.command || p.pattern || JSON.stringify(p).slice(0, 120);
          send({ type: 'log', entry: { kind: /write|edit|replace/i.test(n) ? 'file' : 'cmd', text: `▶ ${n} ${target}` } });
          if ((p.file_path || p.absolute_path) && /write|edit|replace/i.test(n)) changed.add(path.resolve(job.dir, p.file_path || p.absolute_path));
        } else if (j.type === 'tool_result' && j.status && j.status !== 'success') send({ type: 'log', entry: { kind: 'warn', text: `⚠ ${String(j.output || j.error?.message || '工具调用失败').slice(0, 160)}` } });
        else if (j.type === 'message' && j.role === 'assistant' && j.content) { finalText = j.delta ? (finalText + j.content) : String(j.content); }
        else if (j.type === 'error') { send({ type: 'log', entry: { kind: 'warn', text: '⚠ ' + String(j.message || '').slice(0, 200) } }); if (j.severity !== 'warning') lastErr = j.message; }
        else if (j.type === 'result') { if (j.stats) usage = { in: j.stats.input_tokens || 0, out: j.stats.output_tokens || 0 }; if (j.status && j.status !== 'success') lastErr = lastErr || j.error?.message || 'Gemini 执行失败'; }
        continue;
      }
      if (job.kind === 'claude' || job.kind === 'qoder') {
        if (j.session_id) sessionId = j.session_id;
        if (j.type === 'system' && j.subtype === 'api_retry') send({ type: 'log', entry: { kind: 'warn', text: `⚠ 连接中断，第 ${j.attempt}/${j.max_retries} 次重试` } });
        if (j.type === 'assistant') for (const c of j.message?.content || []) {
          if (c.type === 'tool_use') {
            const inp = c.input || {};
            const txt = inp.command || inp.file_path || inp.pattern || JSON.stringify(inp).slice(0, 120);
            send({ type: 'log', entry: { kind: /Edit|Write/.test(c.name) ? 'file' : 'cmd', text: `▶ ${c.name} ${txt}` } });
            if (inp.file_path && /Edit|Write/.test(c.name)) changed.add(inp.file_path);
          } else if (c.type === 'text' && c.text.trim()) send({ type: 'log', entry: { kind: 'think', text: '💬 ' + c.text.trim().slice(0, 160) } });
        }
        if (j.type === 'result' && j.total_credits != null) usage = { in: 0, out: 0, credits: j.total_credits };
        else if (j.type === 'result' && j.usage) usage = { in: (j.usage.input_tokens || 0) + (j.usage.cache_read_input_tokens || 0) + (j.usage.cache_creation_input_tokens || 0), out: j.usage.output_tokens || 0 };
        if (j.type === 'result') { if (j.is_error) lastErr = j.result || j.subtype; else finalText = j.result || finalText; }
        continue;
      }
      if ((j.type === 'item.started' || j.type === 'item.completed' || j.type === 'item.updated') && j.item) {
        const it = j.item;
        if (it.type === 'agent_message' && j.type === 'item.completed') { finalText = it.text || finalText; continue; }
        if (it.type === 'file_change') for (const c of it.changes || []) changed.add(path.isAbsolute(c.path) ? c.path : path.join(job.dir, c.path));
        const e = describeItem(it, j.type.split('.')[1]);
        if (e) send({ type: 'log', entry: e });
      } else if (j.type === 'turn.completed' && j.usage) usage = { in: j.usage.input_tokens || 0, out: j.usage.output_tokens || 0 };
      else if (j.type === 'turn.failed') lastErr = j.error?.message || 'Codex 执行失败';
      else if (j.type === 'error' && !/Reconnecting/i.test(j.message || '')) lastErr = j.message;
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { errTail = (errTail + d).slice(-2000); raw('[stderr] ' + String(d).trimEnd()); });
  child.on('error', (err) => { lastErr = `无法启动「${cmd}」：${err.message}`; });
  child.on('close', (code) => {
    jobs.delete(job.jobId);
    try { const t = fs.readFileSync(lastFile, 'utf8').trim(); if (t) finalText = t; fs.unlinkSync(lastFile); } catch {}
    if (job.promptFile) try { fs.unlinkSync(job.promptFile); } catch {}
    const files = scanChanged(job.dir, started);
    for (const p of changed) if (!files.find((f) => f.path === p) && fs.existsSync(p)) files.unshift({ path: p, size: fs.statSync(p).size });
    let imgs = 0;
    const out = files.slice(0, 30).map((f) => ({ path: f.path, rel: path.relative(job.dir, f.path), size: f.size, img: IMG.test(f.path) && imgs++ < 6 ? thumb(f.path) : null }));
    const secs = Math.round((Date.now() - started) / 1000);
    if (rec.aborted) return send({ type: 'done', stopped: true, text: finalText, files: out, secs, usage, sessionId });
    if (code !== 0 && !finalText) {
      let msg = lastErr || errTail.trim().split('\n').slice(-4).join('\n') || `进程退出码 ${code}`;
      if (/not recognized|not found|ENOENT/i.test(msg)) msg = `找不到命令「${cmd}」。\n${msg}`;
      if (/sandbox/i.test(msg)) msg += '\n（可能是 Windows 沙箱不可用：可在联系人「工作模式」里改成「完全访问」，或检查 Codex 版本）';
      raw('----- failed: ' + msg); return send({ type: 'done', error: msg.slice(0, 1200), files: out, secs, usage, sessionId });
    }
    send({ type: 'done', text: finalText, files: out, secs, usage, sessionId });
  });
  child.stdin.on('error', () => {});
  child.stdin.end(job.kind === 'qoder' ? '' : job.prompt, 'utf8');
}

function register() {
  ipcMain.on('work:start', (e, job) => startJob(e.sender, job));
  ipcMain.on('work:stop', (_e, jobId) => { const r = jobs.get(jobId); if (r) { r.aborted = true; killTree(r.child); } });
  ipcMain.handle('work:comsolDirs', () => comsolDirs());
  ipcMain.handle('work:pickFolder', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'], title: '选择工作文件夹' });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('work:open', (_e, p) => shell.openPath(p));
  ipcMain.handle('work:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('work:exists', (_e, p) => !!p && fs.existsSync(p));
}

module.exports = { register, buildArgs, describeItem, scanChanged };
