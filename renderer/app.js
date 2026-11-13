/* ClawChat for Windows — renderer */
'use strict';

// ---------------- constants ----------------
const CLI_PRESETS = [
  { kind: 'codex', mark: 'Cx', markColor: '#111111', name: 'Codex（ChatGPT 订阅）', command: 'codex', model: '', effort: 'low', desc: '调用你电脑上的 Codex 命令行，走 ChatGPT 订阅额度，不用 API Key' },
  { kind: 'claude', mark: 'CC', markColor: '#D97757', name: 'Claude Code（实验性）', command: 'claude', model: '', effort: '', desc: '调用你电脑上的 Claude Code 命令行（claude -p），走 Claude 订阅额度' },
  { kind: 'qoder', mark: 'Qd', markColor: '#2F6BFF', name: 'Qoder（命令行）', command: 'qodercli', model: 'Efficient', effort: '', desc: '调用你电脑上的 qodercli，走 Qoder 账号的 credits；能看图。模型填 Efficient / Auto / Performance 等档位' },
];
const CLI_KINDS = ['codex', 'claude', 'qoder'];
const isCli = (p) => p && CLI_KINDS.includes(p.kind);
const isMuse = (p) => p && p.kind === 'muse';
const PRESETS = [
  { name: 'DeepSeek', mark: 'DS', markColor: '#4D6BFE', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { name: 'Claude', mark: 'Cl', markColor: '#D97757', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { name: 'OpenAI', mark: 'GPT', markColor: '#10A37F', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  { name: 'Gemini', mark: 'Ge', markColor: '#4285F4', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  { name: 'Grok', mark: 'Gk', markColor: '#1F1F1F', baseUrl: 'https://api.x.ai/v1', model: 'grok-4', keyUrl: 'https://console.x.ai/' },
  { name: 'Meta Muse', mark: 'Mu', markColor: '#0866FF', baseUrl: 'https://api.meta.ai/v1', model: 'muse-spark-1.1', keyUrl: 'https://dev.meta.ai/' },
  { name: 'Mistral', mark: 'Mi', markColor: '#FA520F', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', keyUrl: 'https://console.mistral.ai/api-keys' },
  { name: 'Kimi', mark: 'Ki', markColor: '#16191E', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { name: '通义千问', mark: '千问', markColor: '#615CED', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', keyUrl: 'https://bailian.console.aliyun.com/' },
  { name: '腾讯混元', mark: '混元', markColor: '#0052D9', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-turbos-latest', keyUrl: 'https://console.cloud.tencent.com/hunyuan/api-key' },
  { name: '豆包（火山方舟）', mark: '豆包', markColor: '#3C6CF5', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '', keyUrl: 'https://console.volcengine.com/ark' },
  { name: '文心（千帆）', mark: '文心', markColor: '#2932E1', baseUrl: 'https://qianfan.baidubce.com/v2', model: '', keyUrl: 'https://console.bce.baidu.com/qianfan/' },
  { name: '智谱 GLM', mark: 'GLM', markColor: '#3859FF', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', keyUrl: 'https://open.bigmodel.cn/' },
  { name: 'MiniMax', mark: 'MM', markColor: '#E73562', baseUrl: 'https://api.minimaxi.com/v1', model: '', keyUrl: 'https://platform.minimaxi.com/' },
  { name: '硅基流动', mark: 'SF', markColor: '#7C3AED', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { name: 'OpenRouter', mark: 'OR', markColor: '#6467F2', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat', keyUrl: 'https://openrouter.ai/keys' },
  { name: 'Ollama 本地', mark: 'Ol', markColor: '#3A3A3A', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5', keyUrl: '' },
];
const EMOJIS = '🐱🦊🐶🐼🐨🐯🦁🐸🐵🐧🦉🐙🦄🐲🤖👾🧠📚🔬🧪🎨🎸🍜☕️🌙⭐️🔥🌊🍀🗿'.match(/\p{Extended_Pictographic}️?/gu);
const COLORS = ['#fde2c4', '#ffd6d6', '#d9ecff', '#d8f3dc', '#efe0ff', '#fff3b0', '#e0e0e0', '#c9f2ee'];
const HISTORY_LIMIT = 40;
const DARK_COLORS = ['#4D6BFE', '#D97757', '#10A37F', '#4285F4', '#1F1F1F', '#0866FF', '#FA520F', '#615CED', '#0052D9', '#E73562', '#7C3AED', '#2a2622'];
function brandMarks() {
  const seen = new Set(); const out = [];
  for (const p of [...CLI_PRESETS, ...PRESETS, { mark: 'Mu', markColor: '#0866FF' }]) {
    if (!p.mark || seen.has(p.mark)) continue; seen.add(p.mark); out.push({ mark: p.mark, color: p.markColor });
  }
  return out;
}
function markFor(p) {
  if (p.mark) return { mark: p.mark, color: p.markColor };
  const pre = [...PRESETS, ...CLI_PRESETS].find((x) => (x.kind && x.kind === p.kind) || (x.baseUrl && x.baseUrl === p.baseUrl));
  if (p.kind === 'muse') return { mark: 'Mu', color: '#0866FF' };
  if (pre?.mark) return { mark: pre.mark, color: pre.markColor };
  return { mark: (p.name || 'AI').replace(/[（(].*$/, '').trim().slice(0, 2), color: '#2a2622' };
}
const isEmoji = (t) => /^\p{Extended_Pictographic}/u.test(t || '');
function avatarInner(a) {
  if (a.img) return `<img src="${esc(a.img)}" alt="">`;
  const t = a.avatar || '?';
  if (isEmoji(t)) return esc(t);
  const n = [...t].length;
  return `<span class="mark m${Math.min(n, 3)}" style="color:${esc(a.fg || '#fff')}">${esc(t)}</span>`;
}
function newAgentForProvider(p, model = '') {
  const m = markFor(p);
  const base = p.kind === 'muse' ? 'Muse' : (p.name || '模型').replace(/[（(].*$/, '').trim();
  const name = model ? `${base} · ${model.split('/').pop()}` : base;
  const a = { id: uid('a'), name: name.slice(0, 24), avatar: m.mark, color: m.color, fg: '#fff', img: '', providerId: p.id, model,
    temperature: 0.8, persona: `你是 ${base}${model ? '（' + model + '）' : ''}。以你自己的风格自然地聊天，回答准确、简洁。`, memory: '' };
  S.agents.push(a);
  return a;
}

// ---------------- state ----------------
let S = null;
let view = 'chats';
let activeChatId = null;
let activeAgentId = null;
let filter = '';
const running = new Map(); // chatId -> { stop: bool, reqId }

const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function defaultState() {
  const a1 = { id: uid('a'), name: '小爪', avatar: '🐱', color: COLORS[0], providerId: '', model: '', temperature: 0.8,
    persona: '你是一只聪明、热心、有点俏皮的猫猫助手。说话简洁口语化，偶尔带一点猫的语气，但给出的建议要靠谱、具体。', memory: '' };
  const a2 = { id: uid('a'), name: '学术搭子', avatar: '🔬', color: COLORS[2], providerId: '', model: '', temperature: 0.5,
    persona: '你是一位严谨的科研助理，擅长论文写作、实验设计、数值仿真和数据分析。回答有条理，指出关键假设和风险，不说空话。', memory: '' };
  const a3 = { id: uid('a'), name: '毒舌军师', avatar: '🦊', color: COLORS[1], providerId: '', model: '', temperature: 1.0,
    persona: '你是一个直言不讳的军师，喜欢挑别人方案里的漏洞，说话犀利但有建设性。在群里经常反驳其他人的观点。', memory: '' };
  const now = Date.now();
  return {
    version: 1,
    userName: '我',
    defaultProviderId: '',
    providers: [],
    agents: [a1, a2, a3],
    chats: [
      { id: uid('c'), type: 'group', name: '爪爪议事厅', members: [a1.id, a2.id, a3.id], replyMode: 'all', messages: [], updated: now },
      { id: uid('c'), type: 'dm', name: '', members: [a1.id], messages: [], updated: now - 1 },
    ],
  };
}

// ---------------- persistence ----------------
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.claw.save(S), 300);
}

// ---------------- helpers ----------------
const agentById = (id) => S.agents.find((a) => a.id === id);
const chatById = (id) => S.chats.find((c) => c.id === id);
const providerById = (id) => S.providers.find((p) => p.id === id);
function chatTitle(c) {
  if (c.type === 'dm') return agentById(c.members[0])?.name || '（已删除）';
  return c.name || '群聊';
}
function chatMembers(c) { return c.members.map(agentById).filter(Boolean); }
function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return d.toTimeString().slice(0, 5);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
function avatarHTML(a, cls = '') {
  if (!a) return `<div class="av ${cls}" style="background:#eee">❔</div>`;
  return `<div class="av ${cls}" style="background:${esc(a.img ? '#fff' : a.color)}">${avatarInner(a)}</div>`;
}
function chatAvatarHTML(c) {
  if (c.type === 'dm') return avatarHTML(agentById(c.members[0]));
  const ms = chatMembers(c).slice(0, 4);
  return `<div class="av group">${ms.map((a) => `<div style="background:${esc(a.img ? '#fff' : a.color)}">${avatarInner(a)}</div>`).join('')}</div>`;
}
function resolveLLM(agent) {
  const p = providerById(agent.providerId) || providerById(S.defaultProviderId) || S.providers[0];
  if (!p) return null;
  return llmCfg(p, agent.model);
}
function llmCfg(p, modelOverride = '') {
  if (isMuse(p)) return { kind: 'muse', model: 'Muse 网页', providerName: p.name };
  if (isCli(p)) return { kind: p.kind, command: p.command, effort: p.effort, model: modelOverride || p.model, providerName: p.name };
  return { baseUrl: p.baseUrl, apiKey: p.apiKey, model: modelOverride || p.model, providerName: p.name };
}

// mini markdown
function md(src, members = []) {
  let s = esc(src);
  const blocks = [];
  s = s.replace(/```[\w-]*\n?([\s\S]*?)(```|$)/g, (_, code) => { blocks.push(code); return `\u0000${blocks.length - 1}\u0000`; });
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  s = s.replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank">$2</a>');
  const names = members.map((m) => m.name).concat([S.userName]).filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length) {
    const re = new RegExp('@(' + names.map((n) => esc(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
    s = s.replace(re, '<span class="mention">@$1</span>');
  }
  s = s.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<pre><code>${blocks[i]}</code></pre>`);
  return s;
}

// ---------------- attachments ----------------
const pendingAtts = new Map(); // chatId -> [att]
const hasContent = (m) => !!(m.text || m.attachments?.length);
function attNote(m) { return m.attachments?.length ? `\n[附件：${m.attachments.map((a) => a.name).join('、')}]` : ''; }
async function makeThumb(file) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 360 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g2 = c.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, c.width, c.height); g2.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => res('');
    img.src = URL.createObjectURL(file);
  });
}
async function addFiles(chat, files) {
  const list = pendingAtts.get(chat.id) || [];
  for (const f of files) {
    try {
      const att = await window.claw.attSave(f.name || `截图_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.png`, await f.arrayBuffer());
      if (att.kind === 'image') att.thumb = await makeThumb(f);
      if (att.extractError) toast(`「${att.name}」${att.extractError}`, 5000);
      list.push(att);
    } catch (err) { toast(`「${f.name}」添加失败：${String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`, 4000); }
  }
  pendingAtts.set(chat.id, list);
  renderAttBar(chat);
}
function renderAttBar(chat) {
  const bar = $('#att-bar'); if (!bar) return;
  const list = pendingAtts.get(chat.id) || [];
  bar.innerHTML = list.map((a, i) => `<div class="att-chip">${a.thumb ? `<img src="${a.thumb}">` : '<span>📄</span>'}<span class="n">${esc(a.name)}</span>${a.kind === 'doc' ? (a.extractError ? `<span class="warn" title="${esc(a.extractError)}">⚠ 读不了</span>` : `<span class="ok">✓ 已读取 ${(a.chars || 0) >= 10000 ? Math.round(a.chars / 10000) + ' 万' : a.chars || 0} 字</span>`) : ''}<span class="x" data-attdel="${i}">✕</span></div>`).join('');
  bar.style.display = list.length ? 'flex' : 'none';
}
function attsHTML(m) {
  if (!m.attachments?.length) return '';
  const imgs = m.attachments.filter((a) => a.thumb);
  const files = m.attachments.filter((a) => !a.thumb);
  return `${imgs.length ? `<div class="msg-imgs">${imgs.map((a) => `<img src="${a.thumb}" title="${esc(a.name)}" data-attopen="${esc(a.path)}">`).join('')}</div>` : ''}
    ${files.map((a) => `<div class="msg-file" data-attopen="${esc(a.path)}">📄 ${esc(a.name)} <span>${fmtSize(a.size)}${a.kind === 'doc' ? (a.extractError ? ' · ⚠ 文字提取失败' : ` · 已读取 ${(a.chars || 0).toLocaleString()} 字`) : ''}</span></div>`).join('')}`;
}

// ---------------- prompt building ----------------
function buildMessages(chat, agent) {
  const members = chatMembers(chat);
  const others = members.filter((m) => m.id !== agent.id);
  let sys = `你的名字是「${agent.name}」。\n${agent.persona || ''}`;
  if (agent.memory?.trim()) sys += `\n\n【你对用户的长期记忆】\n${agent.memory.trim()}`;
  sys += `\n\n当前时间：${new Date().toLocaleString('zh-CN')}。用户的称呼是「${S.userName}」。` + archiveBlock(chat);
  if (chat.type === 'group') {
    sys += `\n\n你正在一个叫「${chatTitle(chat)}」的聊天群里。群成员有：用户「${S.userName}」` +
      (others.length ? '，以及其他 AI 成员：' + others.map((o) => `「${o.name}」（${(o.persona || '').slice(0, 40)}）`).join('、') : '') +
      `。` + (others.some(workReady) ? `\n其中可以实际动手执行任务（运行程序、改文件）的成员：${others.filter(workReady).map((o) => '「' + o.name + '」').join('、')}。如果讨论后需要真正执行，你可以单独起一行写：/干活 @成员名字 任务描述 —— 用户确认后才会执行。` : '') + `\n群聊规则：\n- 只以你自己的身份说话，绝不替别人发言，不要在回复开头写自己的名字。\n- 像在聊天软件里聊天一样简短自然，一般 1~4 句话，除非被要求详细展开。\n- 可以用 @名字 和其他成员互动、赞同或反驳他们，但不要重复别人已经说过的内容。\n- 聊天记录里别人的发言格式为【名字】: 内容。`;
  } else {
    sys += '\n\n这是你和用户的私聊。回复自然、有帮助。';
  }
  const hist = chat.messages.filter((m) => !m.error && !m.pending && hasContent(m) && m.type !== 'note' && m.type !== 'confirm').slice(-HISTORY_LIMIT);
  const liveImgMsgs = new Set(hist.filter((m) => m.attachments?.some((a) => a.kind === 'image')).slice(-3).map((m) => m.id));
  const liveDocMsgs = new Set(hist.filter((m) => m.attachments?.some((a) => a.kind === 'text' || a.kind === 'doc')).slice(-2).map((m) => m.id));
  const out = [];
  const toParts = (c) => (Array.isArray(c) ? c : [{ type: 'text', text: c }]);
  for (const m of hist) {
    let role, content;
    if (m.from === agent.id) { role = 'assistant'; content = m.text; }
    else if (m.from === 'user') { role = 'user'; content = chat.type === 'group' ? `【${S.userName}】: ${m.text || '（发送了附件）'}` : (m.text || '（发送了附件）'); }
    else { role = 'user'; content = `【${agentById(m.from)?.name || '某成员'}】: ${m.text}`; }
    if (m.attachments?.length && role === 'user') content = [{ type: 'text', text: content }, ...m.attachments.map((a) => ({ type: 'att', att: a, live: a.kind === 'image' ? liveImgMsgs.has(m.id) : liveDocMsgs.has(m.id) }))];
    const last = out[out.length - 1];
    if (last && last.role === role) {
      if (Array.isArray(last.content) || Array.isArray(content)) last.content = [...toParts(last.content), { type: 'text', text: '\n' }, ...toParts(content)];
      else last.content += '\n\n' + content;
    } else out.push({ role, content });
  }
  if (!out.length || out[out.length - 1].role !== 'user') {
    out.push({ role: 'user', content: chat.type === 'group' ? '（群里安静了一会儿。轮到你发言，可以接着前面的话题继续聊，或回应其他成员。）' : '（请继续。）' });
  }
  return [{ role: 'system', content: sys }, ...out];
}

function cleanReply(text, agent) {
  let t = text.replace(/^\s*(【[^】]{1,20}】|\[[^\]]{1,20}\]|[^\s:：]{1,12})\s*[:：]\s*/, (m0, name) => {
    const n = name.replace(/[【】\[\]]/g, '');
    return n === agent.name ? '' : m0;
  });
  return t.trim();
}

// ---------------- work mode ----------------
const isWorkerAgent = (a) => { const p = a && (providerById(a.providerId) || providerById(S.defaultProviderId) || S.providers[0]); return !!p && CLI_KINDS.includes(p.kind); };
const workReady = (a) => isWorkerAgent(a) && a.work?.enabled && a.work?.dir;
const WORK_RE = /^\s*\/(干活|work)\s+([\s\S]+)/i;
const workJobs = new Map(); // jobId -> {chatId, msgId}

function findWorker(chat, text) {
  const members = chatMembers(chat);
  const workers = members.filter(isWorkerAgent);
  const named = members.filter((m) => text.includes('@' + m.name)).sort((a, b) => text.indexOf('@' + a.name) - text.indexOf('@' + b.name));
  if (named.length) return named[0];
  if (workers.length === 1) return workers[0];
  return null;
}

function proposeWork(chat, rawText, proposer) {
  const m = rawText.match(WORK_RE);
  let body = m ? m[2] : rawText;
  const worker = findWorker(chat, body);
  if (!worker) {
    chat.messages.push({ id: uid('m'), type: 'note', from: 'system', text: '没找到能干活的联系人。需要一个用 Codex / Claude Code 的联系人，并在 @ 里点名（例如 /干活 @Codex 跑一下……）。', ts: Date.now() });
    return;
  }
  body = body.replace('@' + worker.name, '').trim();
  const recent = chat.messages.slice(-10).filter((m) => m.from === 'user' && m.attachments?.length).flatMap((m) => m.attachments);
  chat.messages.push({ id: uid('m'), type: 'confirm', from: 'system', agentId: worker.id, task: body, proposer, status: 'pending', attachments: recent.slice(-10), ts: Date.now() });
}

function workPrompt(chat, a, task) {
  const name = (m) => (m.from === 'user' ? S.userName : agentById(m.from)?.name || '某成员');
  const ctx = chat.messages.filter((m) => m.text && !m.error && m.type !== 'confirm' && m.type !== 'note' && !(m.from === 'user' && (WORK_RE.test(m.text) || /^(确认|确定|开始|执行|ok|yes|取消)$/i.test(m.text.trim())))).slice(-12)
    .map((m) => `【${name(m)}】: ${m.text.slice(0, 1500)}${attNote(m)}`).join('\n\n');
  return `你是「${a.name}」。${a.persona || ''}\n${a.memory?.trim() ? '\n【关于用户的记忆】\n' + a.memory.trim() + '\n' : ''}
${archiveBlock(chat)}
你在 ClawChat 里收到一个需要实际执行的任务。
工作文件夹：${a.work.dir}
任务：${task}

最近的聊天记录（供参考）：
${ctx || '（无）'}

要求：
- 在工作文件夹里完成任务，不要改动和任务无关的文件。
- 需要运行程序就直接运行（例如 COMSOL 可以用 comsolbatch 命令行，或 Python 的 mph 库；画图用 Python）。
- 完成后用简洁的中文汇报：做了什么、结果如何、产出文件在哪（写相对路径）。失败的话说明原因和下一步建议。`;
}

function startWork(chat, confirmMsg) {
  const a = agentById(confirmMsg.agentId);
  if (!workReady(a)) { toast('这个联系人还没开启工作模式或没选工作文件夹'); return; }
  const p = providerById(a.providerId) || providerById(S.defaultProviderId) || S.providers[0];
  confirmMsg.status = 'confirmed';
  const jobId = uid('j');
  const wm = { id: uid('m'), type: 'work', from: a.id, task: confirmMsg.task, status: 'running', log: [], text: '', files: [], jobId, ts: Date.now() };
  chat.messages.push(wm); chat.updated = Date.now();
  workJobs.set(jobId, { chatId: chat.id, msgId: wm.id });
  const extra = [...(a.work.extraDirs || [])];
  const go = (comsol) => {
    window.claw.work.start({
      jobId, kind: p.kind, command: p.command, effort: a.work.effort || 'medium', model: a.model || p.model,
      dir: a.work.dir, level: a.work.level || 'write', network: !!a.work.network, attachments: (confirmMsg.attachments || []).map(({ name, path, size, kind }) => ({ name, path, size, kind })),
      extraDirs: [...new Set([...extra, ...(a.work.comsol !== false ? comsol : [])])], prompt: workPrompt(chat, a, confirmMsg.task),
    });
  };
  window.claw.work.comsolDirs().then(go, () => go([]));
  save(); renderList(); renderMessagesIfActive(chat);
}

function onWorkEvent(ev) {
  const cj = collabJobs.get(ev.jobId); if (cj) return cj(ev);
  const ref = workJobs.get(ev.jobId); if (!ref) return;
  const chat = chatById(ref.chatId); const m = chat?.messages.find((x) => x.id === ref.msgId); if (!m) return;
  if (ev.type === 'log') { m.log.push(ev.entry); if (m.log.length > 400) m.log.splice(0, m.log.length - 400); }
  if (ev.type === 'done') {
    workJobs.delete(ev.jobId);
    m.status = ev.error ? 'error' : ev.stopped ? 'stopped' : 'done';
    m.secs = ev.secs; m.files = ev.files || [];
    m.text = ev.text || (ev.stopped ? '（任务被停止）' : '');
    if (ev.error) m.errorText = ev.error;
    chat.updated = Date.now(); save(); renderList();
  }
  if (view === 'chats' && activeChatId === chat.id) {
    const el = document.querySelector(`[data-mid="${m.id}"]`);
    if (el) {
      const openLog = el.querySelector('details')?.open;
      el.outerHTML = msgHTML(chat, m);
      if (openLog || m.status === 'running') document.querySelector(`[data-mid="${m.id}"] details`)?.setAttribute('open', '');
      const box = $('#messages'); if (box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
    } else renderMessagesIfActive(chat);
  }
}

function stopWorkIn(chat) {
  let n = 0;
  for (const [jobId, ref] of workJobs) if (ref.chatId === chat.id) { window.claw.work.stop(jobId); n++; }
  return n;
}

// Muse web keeps its own conversation, so only send what's new since this agent last spoke.
function museMessages(chat, agent, pendingMsg) {
  const name = (m) => (m.from === 'user' ? S.userName : agentById(m.from)?.name || '某成员');
  const hist = chat.messages.filter((m) => m !== pendingMsg && !m.error && !m.pending && hasContent(m) && m.type !== 'note' && m.type !== 'confirm');
  const thread = agent.museThreads?.[chat.id];
  let lastIdx = -1;
  hist.forEach((m, i) => { if (m.from === agent.id) lastIdx = i; });
  if (thread && lastIdx >= 0) {
    const fresh = hist.slice(lastIdx + 1).map((m) => `【${name(m)}】: ${m.text}${attNote(m)}`);
    const body = fresh.length ? fresh.join('\n\n') : '（群里安静了一会儿。）';
    return [{ role: 'user', content: `${body}\n\n（轮到你「${agent.name}」回复。只输出你要发的消息正文。）` }];
  }
  const sys = buildMessages(chat, agent)[0].content;
  const convo = hist.slice(-HISTORY_LIMIT).map((m) => `【${name(m)}】: ${m.text}${attNote(m)}`).join('\n\n');
  return [{ role: 'user', content: `（这条消息来自 ClawChat。接下来请一直扮演下面设定的角色在聊天里发言：不要执行任务、不要调用工具，只输出你要发的聊天消息正文。）\n\n===== 角色设定 =====\n${sys}\n\n===== 聊天记录 =====\n${convo || '（还没有消息）'}\n\n===== 轮到你「${agent.name}」回复 =====` }];
}

// ---------------- reply engine ----------------
async function agentReply(chat, agent) {
  const llm = resolveLLM(agent);
  const msg = { id: uid('m'), from: agent.id, text: '', ts: Date.now(), pending: true };
  chat.messages.push(msg);
  chat.updated = msg.ts;
  if (!llm) {
    msg.pending = false; msg.error = '还没有配置模型服务。请到「设置」里添加 API（比如 DeepSeek）。';
    renderAll(); save(); return false;
  }
  renderMessagesIfActive(chat);
  const run = running.get(chat.id);
  const reqMsgs = llm.kind === 'muse' ? museMessages(chat, agent, msg) : buildMessages(chat, agent);
  const { reqId, promise } = window.claw.stream(
    llm.kind === 'muse'
      ? { ...llm, threadUrl: agent.museThreads?.[chat.id], messages: reqMsgs }
      : { ...llm, temperature: agent.temperature, messages: reqMsgs },
    {
      onThinking: () => { msg.thinking = true; updateBubble(chat, msg); },
      onReasoning: (d) => { if ((msg.reasoning || '').length < 30000) msg.reasoning = (msg.reasoning || '') + d; },
      onChunk: (d) => { msg.thinking = false; msg.text += d; updateBubble(chat, msg); },
    }
  );
  if (run) run.reqId = reqId;
  const res = await promise;
  if (res.replace) msg.text = res.replace;
  if (res.threadUrl) { agent.museThreads = agent.museThreads || {}; agent.museThreads[chat.id] = res.threadUrl; }
  msg.pending = false; msg.thinking = false;
  msg.text = cleanReply(msg.text, agent);
  if (res.error) msg.error = res.error;
  else if (!msg.text) { if (res.aborted) chat.messages.splice(chat.messages.indexOf(msg), 1); else msg.error = '（空回复）'; }
  msg.model = llm.model;
  if (!res.error && msg.text) msg.usage = mkUsage(agent, res.usage, JSON.stringify(reqMsgs, (k, v) => (k === 'thumb' ? undefined : v)), msg.text + (msg.reasoning || ''));
  const prop = (msg.text || '').split('\n').find((l) => WORK_RE.test(l));
  if (prop && chat.messages.filter((x) => x.type === 'confirm' && x.status === 'pending').length < 3) proposeWork(chat, prop, agent.id);
  chat.updated = Date.now();
  save(); renderList(); renderMessagesIfActive(chat);
  return !res.error && !res.aborted;
}

async function runSequence(chat, agents) {
  if (running.has(chat.id)) { running.get(chat.id).queue.push(...agents); return; }
  const run = { stop: false, queue: [...agents] };
  running.set(chat.id, run);
  renderMainIfActive(chat);
  try {
    while (run.queue.length && !run.stop) {
      await agentReply(chat, run.queue.shift());
    }
  } finally {
    running.delete(chat.id);
    renderMainIfActive(chat);
  }
}

function pickResponders(chat, text) {
  const members = chatMembers(chat);
  if (chat.type === 'dm') return members;
  const mentioned = members
    .map((m) => ({ m, i: text.indexOf('@' + m.name) }))
    .filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.m);
  if (mentioned.length) return mentioned;
  if (text.includes('@所有人') || text.includes('@全体')) return members;
  const mode = chat.replyMode || 'all';
  if (mode === 'all') return members;
  if (mode === 'some') {
    const sh = [...members].sort(() => Math.random() - 0.5);
    return sh.slice(0, Math.min(sh.length, 1 + Math.floor(Math.random() * 2)));
  }
  return []; // mention-only
}

function sendUser(chat, text) {
  text = text.trim();
  const atts = pendingAtts.get(chat.id) || [];
  if (!text && !atts.length) return;
  const um = { id: uid('m'), from: 'user', text, ts: Date.now() };
  if (atts.length) { um.attachments = atts; pendingAtts.delete(chat.id); renderAttBar(chat); }
  chat.messages.push(um);
  chat.updated = Date.now();
  const pending = [...chat.messages].reverse().find((m) => m.type === 'confirm' && m.status === 'pending');
  if (/^(\/停止|\/stop)$/i.test(text)) {
    const n = stopWorkIn(chat) + stopCollabIn(chat); stopChat(chat);
    chat.messages.push({ id: uid('m'), type: 'note', from: 'system', text: n ? `已停止 ${n} 个正在执行的任务` : '没有正在执行的任务', ts: Date.now() });
    save(); renderList(); renderMessagesIfActive(chat); return;
  }
  if (pending && /^(确认|确定|开始|执行|ok|yes)$/i.test(text)) { startWork(chat, pending); return; }
  if (pending && /^(取消|算了|不要|no)$/i.test(text)) { pending.status = 'cancelled'; save(); renderMessagesIfActive(chat); return; }
  const pc = [...chat.messages].reverse().find((m) => m.type === 'collab' && (m.status === 'planned' || m.status === 'ask'));
  if (!pending && pc && /^(确认|确定|开始|执行|ok|yes)$/i.test(text)) { collabExecute(chat, pc); return; }
  if (!pending && pc && /^(取消|算了|不要|no)$/i.test(text)) { pc.status = 'cancelled'; save(); renderMessagesIfActive(chat); return; }
  if (VERIFY_RE.test(text)) { verifyStart(chat, text, um.attachments); save(); renderList(); renderMessagesIfActive(chat); return; }
  if (COLLAB_RE.test(text)) { collabStart(chat, text, um.attachments); save(); renderList(); renderMessagesIfActive(chat); return; }
  if (WORK_RE.test(text)) { proposeWork(chat, text, 'user'); save(); renderList(); renderMessagesIfActive(chat); return; }
  save();
  renderList(); renderMessagesIfActive(chat);
  const responders = pickResponders(chat, text);
  if (responders.length) runSequence(chat, responders);
}

function continueChat(chat, rounds = 1) {
  const members = chatMembers(chat);
  let seq = [];
  for (let r = 0; r < rounds; r++) {
    const sh = [...members].sort(() => Math.random() - 0.5);
    if (seq.length && sh[0] === seq[seq.length - 1]) sh.push(sh.shift());
    seq = seq.concat(sh);
  }
  runSequence(chat, seq);
}

function stopChat(chat) {
  const r = running.get(chat.id);
  if (!r) return;
  r.stop = true; r.queue = [];
  if (r.reqId) window.claw.abort(r.reqId);
}

async function summarizeMemory(chat) {
  const agents = chatMembers(chat);
  const transcript = chat.messages.filter((m) => m.text && !m.error).slice(-60)
    .map((m) => `${m.from === 'user' ? S.userName : agentById(m.from)?.name || '?'}: ${m.text}`).join('\n');
  if (!transcript) return toast('还没有聊天内容');
  toast('正在整理记忆…', 4000);
  let added = 0;
  for (const a of agents) {
    const llm = resolveLLM(a);
    if (!llm) return toast('请先在设置里配置模型');
    const messages = [
      { role: 'system', content: `你是「${a.name}」。你的任务是从聊天记录中提炼值得长期记住的、关于用户「${S.userName}」的事实、偏好、计划或约定。` },
      { role: 'user', content: `已有记忆：\n${a.memory || '（无）'}\n\n最近聊天记录：\n${transcript}\n\n请只输出【新的】、已有记忆里没有的要点，每条一行，以"- "开头，最多 5 条。没有新内容就只回复：无` },
    ];
    let text = '';
    const { promise } = window.claw.stream({ ...llm, temperature: 0.2, messages }, { onChunk: (d) => (text += d) });
    const res = await promise;
    if (res.replace) text = res.replace;
    if (res.error) { toast(`${a.name}：${res.error}`, 5000); continue; }
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
    if (lines.length) {
      a.memory = ((a.memory || '').trim() + '\n' + lines.join('\n')).trim();
      added += lines.length;
    }
  }
  save();
  if (view === 'agents') renderMain();
  toast(added ? `已记住 ${added} 条新内容（可在「联系人」里查看和修改）` : '没有发现需要记住的新内容');
}

// ---------------- rendering ----------------
function renderAll() { renderRail(); renderList(); renderMain(); }

function renderRail() {
  document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#list-add').style.visibility = view === 'tasks' ? 'hidden' : 'visible';
  $('#search').style.visibility = view === 'settings' || view === 'projects' ? 'hidden' : 'visible';
  $('#list-add').title = view === 'projects' ? '新建项目' : view === 'agents' ? '新建联系人' : view === 'settings' ? '添加模型服务' : '新建群聊 / 私聊';
  $('#search').style.visibility = view === 'settings' ? 'hidden' : 'visible';
}

function renderList() {
  const body = $('#list-body');
  if (view === 'tasks') return renderTaskFilters(body);
  if (view === 'projects') return renderProjectList(body);
  const f = filter.trim().toLowerCase();
  if (view === 'chats') {
    const chats = [...S.chats].sort((a, b) => (b.updated || 0) - (a.updated || 0))
      .filter((c) => !f || chatTitle(c).toLowerCase().includes(f));
    body.innerHTML = chats.map((c) => {
      const last = [...c.messages].reverse().find((m) => m.text || m.error || m.attachments?.length);
      let sub = '';
      if (last) {
        const who = last.from === 'user' ? '' : c.type === 'group' ? (agentById(last.from)?.name || '') + '：' : '';
        sub = who + (last.error ? '[出错]' : last.text || (last.attachments?.length ? `[附件] ${last.attachments[0].name}` : ''));
      } else sub = c.type === 'group' ? `${c.members.length} 个成员` : '开始聊天吧';
      return `<div class="item ${c.id === activeChatId ? 'active' : ''}" data-chat="${c.id}">
        ${chatAvatarHTML(c)}
        <div class="meta"><div class="title"><span>${esc(chatTitle(c))}${running.has(c.id) ? ' <span class="badge">输入中</span>' : ''}</span><span class="time">${fmtTime(last?.ts)}</span></div>
        <div class="sub">${esc(sub.slice(0, 60))}</div></div></div>`;
    }).join('') || `<div class="section-label">没有聊天</div>`;
  } else if (view === 'agents') {
    const agents = S.agents.filter((a) => !f || a.name.toLowerCase().includes(f));
    body.innerHTML = agents.map((a) => `<div class="item ${a.id === activeAgentId ? 'active' : ''}" data-agent="${a.id}">
      ${avatarHTML(a)}<div class="meta"><div class="title"><span>${esc(a.name)}</span></div>
      <div class="sub">${esc((a.persona || '').slice(0, 40))}</div></div></div>`).join('');
  } else {
    body.innerHTML = `<div class="section-label">模型服务</div>` + (S.providers.map((p) => `<div class="item" data-provider="${p.id}">
      <div class="av sm" style="background:#efe9df">🔌</div><div class="meta"><div class="title"><span>${esc(p.name)}</span>${p.id === S.defaultProviderId ? '<span class="badge">默认</span>' : ''}</div>
      <div class="sub">${esc(p.model || (isMuse(p) ? "网页会员额度" : isCli(p) ? "订阅额度 · 默认模型" : ""))}</div></div></div>`).join('') || '<div class="section-label">还没有添加</div>');
  }
}

function renderMain() {
  const main = $('#main');
  if (view === 'chats') {
    const chat = chatById(activeChatId);
    if (!chat) {
      main.innerHTML = `<div class="empty"><div><div class="big">🐾</div>选一个聊天开始，或点左上角 ＋ 新建群聊</div></div>`;
      return;
    }
    renderChat(chat);
  } else if (view === 'agents') renderAgentEditor();
  else if (view === 'tasks') renderTasksPage();
  else if (view === 'projects') renderProjectsPage();
  else renderSettings();
}

function renderMainIfActive(chat) { renderList(); if (view === 'chats' && activeChatId === chat.id) renderChat(chat); }
function renderMessagesIfActive(chat) {
  if (view === 'chats' && activeChatId === chat.id) {
    const box = $('#messages');
    if (!box) return renderChat(chat);
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    box.innerHTML = messagesHTML(chat);
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
}

function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B'; }
function confirmHTML(chat, m) {
  const a = agentById(m.agentId);
  const who = m.proposer === 'user' ? '你' : agentById(m.proposer)?.name || '某成员';
  const ready = workReady(a);
  const lvl = a?.work?.level === 'full' ? '⚠️ 完全访问（可动整台电脑）' : '只能改工作文件夹';
  let foot;
  if (m.status === 'pending') foot = ready
    ? `<div class="row-actions"><button class="btn primary" data-wact="go">✅ 确认执行</button><button class="btn" data-wact="cancel">取消</button><span class="desc" style="margin:0;font-size:12px">也可以直接回复「确认」或「取消」</span></div>`
    : `<div class="row-actions"><span class="desc" style="margin:0">「${esc(a?.name || '?')}」还没开启工作模式。</span><button class="btn" data-wact="setup">去设置</button><button class="btn" data-wact="cancel">取消</button></div>`;
  else foot = `<div class="desc" style="margin:0">${m.status === 'confirmed' ? '✅ 已确认' : '已取消'}</div>`;
  return `<div class="workcard confirm" data-mid="${m.id}">
    <div class="wc-head">🛠 ${esc(who)} 提议让 <b>${esc(a?.name || '?')}</b> 执行任务</div>
    <div class="wc-task">${md(m.task)}${m.attachments?.length ? `<div class="desc" style="margin:4px 0 0;font-size:12px">📎 附件会复制到工作文件夹的「ClawChat附件」里：${esc(m.attachments.map((a) => a.name).join('、'))}</div>` : ''}</div>
    ${ready ? `<div class="wc-meta">📁 ${esc(a.work.dir)} · ${lvl}</div>` : ''}
    ${foot}</div>`;
}
function workHTML(chat, m) {
  const a = agentById(m.from);
  const st = { running: '⏳ 执行中', done: '✅ 完成', error: '❌ 出错', stopped: '⏹ 已停止' }[m.status] || m.status;
  const imgs = (m.files || []).filter((f) => f.img);
  const files = (m.files || []).filter((f) => !f.img);
  return `<div class="msg" data-mid="${m.id}">${avatarHTML(a)}<div class="body" style="max-width:min(760px,80%)">
    ${chat.type === 'group' ? `<div class="who">${esc(a?.name || '')}</div>` : ''}
    <div class="workcard">
      <div class="wc-head"><span>🛠 ${esc(m.task.slice(0, 80))}${m.task.length > 80 ? '…' : ''}</span><span class="badge">${st}${m.secs ? ' · ' + m.secs + ' 秒' : ''}</span>
        ${m.status === 'running' ? '<button class="btn danger" data-wact="stop" style="margin-left:auto;padding:2px 10px">停止</button>' : ''}</div>
      ${m.text ? `<div class="bubble" style="box-shadow:none;padding:6px 0">${md(m.text)}</div>` : ''}
      ${m.errorText ? `<div class="bubble err">${esc(m.errorText)}</div>` : ''}
      ${imgs.length ? `<div class="wc-imgs">${imgs.map((f) => `<img src="${f.img}" title="${esc(f.rel)}" data-wopen="${esc(f.path)}">`).join('')}</div>` : ''}
      ${files.length || imgs.length ? `<div class="wc-files">${[...imgs, ...files].map((f) => `<div><span class="fname" data-wopen="${esc(f.path)}">📄 ${esc(f.rel || f.path)}</span><span class="desc">${fmtSize(f.size)}</span><span class="link" data-wreveal="${esc(f.path)}">在文件夹中显示</span></div>`).join('')}</div>` : ''}
      <details ${m.status === 'running' ? 'open' : ''}><summary>执行过程（${m.log.length} 条）</summary>
        <div class="wc-log">${m.log.map((e) => `<div class="l-${e.kind}">${esc(e.text)}${e.detail ? `<pre>${esc(e.detail)}</pre>` : ''}</div>`).join('') || '<div class="l-info">等待开始…</div>'}</div></details>
    </div></div></div>`;
}

function msgHTML(chat, m) {
  if (m.type === 'confirm') return confirmHTML(chat, m);
  if (m.type === 'work') return workHTML(chat, m);
  if (m.type === 'collab') return collabHTML(chat, m);
  if (m.type === 'note') return `<div class="sys" data-mid="${m.id}">${esc(m.text)}</div>`;
  const members = chatMembers(chat);
  if (m.from === 'user') {
    return `<div class="msg me" data-mid="${m.id}"><div class="av" style="background:#f6c58f">🙂</div><div class="body">
      ${attsHTML(m)}${m.text ? `<div class="bubble">${md(m.text, members)}</div>` : ''}
      <div class="tools"><span data-act="copy">复制</span><span data-act="del">删除</span></div></div></div>`;
  }
  const a = agentById(m.from);
  const body = m.error
    ? `<div class="bubble err">⚠️ ${esc(m.error)}</div>`
    : `<div class="bubble ${m.pending ? 'typing' : ''}" id="b-${m.id}">${m.thinking && !m.text ? '<span style="color:var(--muted)">思考中…</span>' : md(m.text, members)}</div>`;
  return `<div class="msg" data-mid="${m.id}">${avatarHTML(a)}<div class="body">
    ${chat.type === 'group' ? `<div class="who">${esc(a?.name || '已删除的联系人')}</div>` : ''}
    ${m.reasoning && !m.pending ? `<details class="think"><summary>💭 思考过程</summary><div class="think-body">${esc(m.reasoning)}</div></details>` : ''}
    ${body}
    ${m.pending ? '' : `<div class="tools"><span data-act="copy">复制</span><span data-act="regen">重新生成</span><span data-act="del">删除</span>${m.model ? `<span style="cursor:default">${esc(m.model)}</span>` : ''}${fmtUsage(m.usage) ? `<span style="cursor:default">${fmtUsage(m.usage)}</span>` : ''}</div>`}
  </div></div>`;
}

function messagesHTML(chat) {
  if (!chat.messages.length) {
    const hint = chat.type === 'group'
      ? '群聊已就绪。发一句话，大家会依次回复；用 @名字 只叫某一位；点「让它们接着聊」看它们自己讨论。'
      : `和 ${esc(chatTitle(chat))} 打个招呼吧`;
    return `<div class="sys">${hint}</div>`;
  }
  return chat.messages.map((m) => msgHTML(chat, m)).join('');
}

function updateBubble(chat, msg) {
  if (!(view === 'chats' && activeChatId === chat.id)) return;
  const el = document.getElementById('b-' + msg.id);
  if (!el) return renderMessagesIfActive(chat);
  el.innerHTML = msg.thinking && !msg.text ? '<span style="color:var(--muted)">思考中…</span>' : md(msg.text, chatMembers(chat));
  const box = $('#messages');
  if (box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
}

function renderChat(chat) {
  const main = $('#main');
  const members = chatMembers(chat);
  const isRunning = running.has(chat.id);
  const prevDraft = $('#composer-input')?.dataset.chat === chat.id ? $('#composer-input').value : (chat.draft || '');
  const group = chat.type === 'group';
  main.innerHTML = `
    <div class="chat-head">
      ${chatAvatarHTML(chat)}
      <div class="grow"><div class="name">${esc(chatTitle(chat))}</div>
        <div class="members">${group ? members.map((m) => esc((isEmoji(m.avatar) && !m.img ? m.avatar : '') + m.name)).join('、') : esc((members[0]?.persona || '').slice(0, 50))}</div></div>
      ${group ? `<select class="btn" id="reply-mode" title="没有 @ 人时谁来回复">
          <option value="all" ${chat.replyMode === 'all' ? 'selected' : ''}>全员回复</option>
          <option value="some" ${chat.replyMode === 'some' ? 'selected' : ''}>随机 1~2 位回复</option>
          <option value="mention" ${chat.replyMode === 'mention' ? 'selected' : ''}>只有 @ 才回复</option>
        </select>` : ''}
      <button class="btn" id="btn-archive" title="这个聊天长期共享的背景资料，每个成员都会看到">📁 档案${chat.archive?.trim() ? ' ✓' : ''}</button>
      <button class="btn" id="btn-memory" title="让智能体从这段对话里提炼要记住的内容">🧠 记住这段</button>
      ${group ? `<button class="btn" id="btn-edit-group">群设置</button>` : `<button class="btn" id="btn-edit-agent">编辑</button>`}
    </div>
    <div class="messages" id="messages">${messagesHTML(chat)}</div>
    <div class="composer">
      ${group ? `<div class="mention-bar"><span class="label">@</span>${members.map((m) => `<button class="chip" data-mention="${esc(m.name)}">${isEmoji(m.avatar) && !m.img ? esc(m.avatar) + ' ' : ''}${esc(m.name)}</button>`).join('')}
        <span style="flex:1"></span>
        ${members.length > 1 ? `<button class="btn" id="btn-collab" title="主管拆任务 → 按特长派活 → 验收汇总。当前主管：${esc(collabLead(chat)?.name || '')}（可在群设置里改）">🤝 协作</button>` : ''}
        ${isRunning ? '' : `<button class="btn" id="btn-continue" title="不用你说话，让群成员互相聊一轮">💬 让它们接着聊</button>`}</div>` : ''}
      <div id="att-bar" class="att-bar"></div>
      <textarea id="composer-input" data-chat="${chat.id}" placeholder="${group ? '说点什么…（@名字 指定谁回复）' : '输入消息…'}">${esc(prevDraft)}</textarea>
      <div class="row"><span class="hint">Enter 发送 · Shift+Enter 换行${members.some(isWorkerAgent) ? ' · <code>/干活 任务</code> 让它动手 · <code>/停止</code>' : ''}${group && members.length > 1 ? ' · <code>/协作 任务</code> 分工 · <code>/核对 问题</code> 互相核对' : ''}</span>
        <button class="btn" id="btn-attach" title="添加文件或图片（也可以直接拖进窗口、Ctrl+V 粘贴截图）">📎</button><input type="file" id="att-file" multiple style="display:none">
        ${isRunning ? `<button class="btn danger" id="btn-stop">■ 停止</button>` : ''}
        <button class="btn primary" id="btn-send">发送</button></div>
    </div>`;
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
  const ta = $('#composer-input');
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  renderAttBar(chat);
}

// ---------------- agents page ----------------
function renderAgentEditor() {
  const main = $('#main');
  const a = agentById(activeAgentId);
  if (!a) {
    main.innerHTML = `<div class="empty"><div><div class="big">🤖</div>选择一个联系人编辑，或点 ＋ 新建</div></div>`;
    return;
  }
  const provOpts = `<option value="">跟随默认（${esc(providerById(S.defaultProviderId)?.name || S.providers[0]?.name || '未配置')}）</option>` +
    S.providers.map((p) => `<option value="${p.id}" ${p.id === a.providerId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  main.innerHTML = `<div class="page">
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px">${avatarHTML(a, 'lg')}
      <div style="flex:1"><h2>${esc(a.name)}</h2><div class="desc" style="margin:0">修改会自动保存</div></div>
      <button class="btn primary" id="agent-chat">💬 私聊</button><button class="btn danger" id="agent-del">删除</button></div>
    <div class="card"><h3>基本信息</h3>
      <div class="field"><label>名字</label><input id="f-name" value="${esc(a.name)}" maxlength="20"></div>
      <div class="field"><label>头像 · 上传图片</label><div class="row-actions">
          <button class="btn" id="av-upload">🖼 上传图片…</button>${a.img ? '<button class="btn" id="av-clear">去掉图片</button>' : ''}
          <input type="file" id="av-file" accept="image/*" style="display:none"><span class="desc" style="margin:0;font-size:12px">支持 png / jpg / webp，会自动裁成正方形</span></div></div>
      <div class="field"><label>头像 · 模型文字标</label><div class="emoji-pick marks">${brandMarks().map((b) => `<span class="${!a.img && b.mark === a.avatar ? 'on' : ''}" data-mark="${esc(b.mark)}" data-markcolor="${b.color}"><div class="av sm" style="background:${b.color}">${avatarInner({ avatar: b.mark })}</div></span>`).join('')}</div></div>
      <div class="field"><label>头像 · 表情</label><div class="emoji-pick">${EMOJIS.map((e) => `<span class="${!a.img && e === a.avatar ? 'on' : ''}" data-emoji="${e}">${e}</span>`).join('')}</div></div>
      <div class="grid2"><div class="field"><label>头像 · 自定义文字（最多 3 个字）</label><input id="f-avtext" maxlength="3" value="${isEmoji(a.avatar) ? '' : esc(a.avatar)}" placeholder="例如：小D"></div>
        <div class="field"><label>背景色</label><div class="colors">${[...COLORS, ...DARK_COLORS].map((c) => `<span class="${c === a.color ? 'on' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}</div></div></div>
    </div>
    <div class="card"><h3>人设 <span class="badge">决定它是谁、怎么说话</span></h3>
      <div class="field"><textarea id="f-persona" rows="5">${esc(a.persona)}</textarea></div></div>
    <div class="card"><h3>长期记忆 <span class="badge">每次对话都会带上</span></h3>
      <div class="field"><textarea id="f-memory" rows="6" placeholder="例如：- 用户是研究生，在做 CFD 仿真&#10;也可以在聊天里点「🧠 记住这段」自动整理">${esc(a.memory)}</textarea></div></div>
    ${roleCardHTML(a)}
    ${pachatCardHTML(a)}
    ${isWorkerAgent(a) ? workCardHTML(a) : ''}
    <div class="card"><h3>模型</h3>
      <div class="grid2"><div class="field"><label>模型服务</label><select id="f-provider">${provOpts}</select></div>
      <div class="field"><label>模型名（留空 = 用服务的默认模型）</label><input id="f-model" value="${esc(a.model)}" placeholder="${esc(resolveLLM(a)?.model || '')}"></div></div>
      <div class="field"><label>创造力 temperature：<b id="t-val">${a.temperature}</b>（低 = 稳重，高 = 发散）</label>
        <input type="range" id="f-temp" min="0" max="1.5" step="0.1" value="${a.temperature}"></div>
    </div></div>`;
}

function workCardHTML(a) {
  const w = a.work || {};
  return `<div class="card" id="work-card"><h3>🛠 工作模式 <span class="badge">让它真正动手干活</span></h3>
    <div class="desc" style="margin:-4px 0 12px;font-size:12px;line-height:1.7">开启后，在聊天里发 <code>/干活 任务描述</code>（群里用 <code>/干活 @${esc(a.name)} 任务描述</code>），确认后它会在工作文件夹里运行程序、改文件，并把结果和产出的图片发回聊天。发 <code>/停止</code> 可以中断。</div>
    <div class="field"><label><input type="checkbox" id="w-enabled" ${w.enabled ? 'checked' : ''}> 开启工作模式</label></div>
    <div class="field"><label>工作文件夹（它只能在这里面改东西）</label>
      <div class="row-actions"><input id="w-dir" value="${esc(w.dir || '')}" placeholder="点右边按钮选择，例如 D:\\仿真项目" style="flex:1;min-width:260px;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><button class="btn" id="w-pick">📁 选择…</button></div></div>
    <div class="grid2">
      <div class="field"><label>权限</label><select id="w-level">
        <option value="write" ${w.level !== 'full' ? 'selected' : ''}>只能改工作文件夹（推荐）</option>
        <option value="full" ${w.level === 'full' ? 'selected' : ''}>⚠️ 完全访问（能动整台电脑）</option></select></div>
      <div class="field"><label>思考强度（干活建议 medium 或 high）</label><select id="w-effort">${['low', 'medium', 'high'].map((x) => `<option ${(w.effort || 'medium') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label><input type="checkbox" id="w-comsol" ${w.comsol !== false ? 'checked' : ''}> 允许写 COMSOL 的临时文件夹（.comsol、comsol_tmp，跑仿真需要）</label></div>
    <div class="field"><label><input type="checkbox" id="w-network" ${w.network ? 'checked' : ''}> 允许联网（装 Python 包等需要；只在「只能改工作文件夹」模式下有效）</label></div>
    <div class="field"><label>其他允许写入的文件夹（每行一个，可留空）</label><textarea id="w-extra" rows="2" style="min-height:50px">${esc((w.extraDirs || []).join('\n'))}</textarea></div>
  </div>`;
}

// ---------------- settings page ----------------
function renderSettings() {
  const main = $('#main');
  main.innerHTML = `<div class="page">
    <h2>设置</h2><p class="desc">ClawChat 直接调用各家大模型的 API。API Key 只保存在你自己电脑上。<br>
    注意：ChatGPT / Claude 的会员订阅不等于 API Key，需要到对应开放平台单独申请（按量计费）。</p>
    <div class="card"><h3>你的称呼</h3><div class="field"><input id="s-username" value="${esc(S.userName)}" maxlength="20"></div></div>
    <div class="card"><h3>模型服务</h3>
      <div class="desc" style="margin-bottom:8px">用你的订阅额度（调用本机命令行，不用 API Key）：</div>
      <div class="presets">${CLI_PRESETS.map((p, i) => `<button class="btn" data-clipreset="${i}" title="${esc(p.desc)}">＋ ${esc(p.name)}</button>`).join('')}<button class="btn" data-musepreset="1" title="用你 muse.ai 网页版的会员额度">＋ Muse 网页会员（实验性）</button></div>
      <div class="desc" style="margin-bottom:8px">用 API Key（按量计费）：</div>
      <div class="presets">${PRESETS.map((p, i) => `<button class="btn" data-preset="${i}">＋ ${esc(p.name)}</button>`).join('')}<button class="btn" data-preset="-1">＋ 自定义</button></div>
      <div id="prov-list">${S.providers.map(providerCardHTML).join('') || '<div class="desc">还没有添加任何服务。</div>'}</div>
    </div>
    <div class="card"><h3>数据</h3><div class="row-actions">
      <button class="btn" id="s-open">打开数据文件夹</button>
      <button class="btn" id="s-export">导出备份</button>
      <span class="desc" id="s-path" style="margin:0;font-size:12px"></span></div>
      <div class="desc" id="s-enc" style="margin:10px 0 0;font-size:12px"></div></div>
  </div>`;
  window.claw.dataPath().then((p) => { const el = $('#s-path'); if (el) el.textContent = p; });
  window.claw.encrypted().then((ok) => { const el = $('#s-enc'); if (el) el.textContent = ok ? '🔒 API Key 已用系统加密保存，只有这台电脑上的当前账号能解开。' : '⚠ 这台电脑上系统加密不可用，API Key 以明文保存在数据文件里。'; });
}

function providerCardHTML(p) {
  if (isMuse(p)) return museCardHTML(p);
  if (isCli(p)) return cliCardHTML(p);
  const preset = PRESETS.find((x) => x.baseUrl === p.baseUrl);
  return `<div class="card" data-pcard="${p.id}" style="background:#fdfcfa">
    <h3>🔌 <input data-pf="name" value="${esc(p.name)}" style="border:0;background:transparent;font-weight:600;font-size:15px;outline:none;width:180px">
      ${p.id === S.defaultProviderId ? '<span class="badge">默认</span>' : ''}</h3>
    <div class="grid2">
      <div class="field"><label>接口地址 Base URL</label><input data-pf="baseUrl" value="${esc(p.baseUrl)}"></div>
      <div class="field"><label>默认模型</label><input data-pf="model" value="${esc(p.model)}" list="ml-${p.id}" placeholder="先填 Key，再点「获取模型列表」选择"><datalist id="ml-${p.id}">${(p.models || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist></div>
    </div>
    <div class="field"><label>API Key ${preset?.keyUrl ? `· <a href="${preset.keyUrl}" target="_blank" style="color:#c4620a">去申请</a>` : ''}</label>
      <input data-pf="apiKey" type="password" value="${esc(p.apiKey)}" placeholder="sk-..."></div>
    <div class="grid2">
      <div class="field"><label>输入价格（元 / 百万 tokens，可不填）</label><input data-pf="priceIn" value="${esc(p.priceIn || '')}" placeholder="填了才会显示花费"></div>
      <div class="field"><label>输出价格（元 / 百万 tokens，可不填）</label><input data-pf="priceOut" value="${esc(p.priceOut || '')}"></div>
    </div>
    <div class="row-actions">
      <button class="btn" data-pact="test">测试连接</button>
      <button class="btn" data-pact="models">获取模型列表</button>
      ${p.id === S.defaultProviderId ? '' : '<button class="btn" data-pact="default">设为默认</button>'}
      <button class="btn" data-pact="addagent">＋ 用这个服务再建一个联系人</button>
      <button class="btn danger" data-pact="del">删除</button>
      <span class="desc" data-pstatus style="margin:0;font-size:12px"></span>
    </div></div>`;
}

// credit multipliers Qoder publishes for its tiers (docs.qoder.com/cli/model); other models: no published figure
const QODER_RATE = { auto: '约 1.0×', ultimate: '约 1.6×', performance: '约 1.1×', efficient: '约 0.3×', lite: '免费' };
function qoderModelMenu(p) {
  if (!p.models?.length) return '';
  const stat = (m) => { const s = p.creditStats?.[m]; return s && s.n ? `实测平均 ${(s.sum / s.n).toFixed(2)} credits/次（${s.n} 次）` : ''; };
  return `<div class="qmenu" data-qmenu style="display:none">${p.models.map((m) => {
    const rate = QODER_RATE[m.toLowerCase()];
    return `<button class="qm-item${m === p.model ? ' on' : ''}" data-qmodel="${esc(m)}"><b>${esc(m)}</b><span>${rate ? '倍率 ' + rate : '倍率未公布'}${stat(m) ? ' · ' + stat(m) : ''}</span></button>`;
  }).join('')}<div class="desc" style="margin:6px 8px 4px;font-size:11.5px">倍率以 Auto 为 1.0×，来自 Qoder 文档；"实测"是 ClawChat 记下的你实际用掉的 credits。</div></div>`;
}

function cliCardHTML(p) {
  const codex = p.kind === 'codex', qoder = p.kind === 'qoder';
  const desc = codex ? '调用本机 <code>codex exec</code>，用你在 Codex 里登录的 ChatGPT 账号。只读模式运行，不会改你的文件。回复是整段出现的（不是逐字），一条一般要几秒到十几秒。'
    : qoder ? '调用本机 <code>qodercli</code>，用你在 Qoder 里登录的账号，按 credits 计费。能看图。需要先安装（npm i -g @qoder-ai/qodercli）并运行 qodercli login。'
    : '调用本机 <code>claude -p</code>，用你在 Claude Code 里登录的账号。需要先安装 Claude Code 并登录。';
  const prog = codex ? 'Codex' : qoder ? 'Qoder' : 'Claude Code';
  return `<div class="card" data-pcard="${p.id}" style="background:#fdfcfa">
    <h3>${codex ? '🟢' : '🟠'} <input data-pf="name" value="${esc(p.name)}" style="border:0;background:transparent;font-weight:600;font-size:15px;outline:none;width:220px">
      <span class="badge">订阅额度</span>${p.id === S.defaultProviderId ? '<span class="badge">默认</span>' : ''}</h3>
    <div class="desc" style="margin:-4px 0 12px;font-size:12px">${desc}</div>
    <div class="grid2">
      <div class="field"><label>命令（一般不用改）</label><input data-pf="command" value="${esc(p.command)}" placeholder="${codex ? 'codex' : qoder ? 'qodercli' : 'claude'}"></div>
      <div class="field" style="position:relative"><label>模型（留空 = 用 ${prog} 自己的默认设置）</label>
        <div style="display:flex;gap:6px"><input data-pf="model" style="flex:1" value="${esc(p.model)}" placeholder="${codex ? '例如 gpt-5.4' : qoder ? '例如 Efficient / Auto' : '例如 sonnet / opus'}">${qoder ? '<button class="btn" data-pact="qmodels" title="读取你的账号能用哪些模型">▾ 选择</button>' : ''}</div>
        ${qoder ? qoderModelMenu(p) : ''}</div>
    </div>
    ${codex ? `<div class="field"><label>思考强度（越低回得越快、越省额度；聊天用 low 就够）</label>
      <select data-pf="effort">${['minimal', 'low', 'medium', 'high'].map((x) => `<option ${p.effort === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>` : ''}
    <div class="row-actions">
      <button class="btn" data-pact="check">检测是否已安装</button>
      <button class="btn" data-pact="test">测试对话</button>
      ${p.id === S.defaultProviderId ? '' : '<button class="btn" data-pact="default">设为默认</button>'}
      <button class="btn" data-pact="addagent">＋ 再建一个联系人</button>
      <button class="btn danger" data-pact="del">删除</button>
      <span class="desc" data-pstatus style="margin:0;font-size:12px;white-space:pre-wrap"></span>
    </div></div>`;
}

function museCardHTML(p) {
  return `<div class="card" data-pcard="${p.id}" style="background:#fdfcfa">
    <h3>🔵 <input data-pf="name" value="${esc(p.name)}" style="border:0;background:transparent;font-weight:600;font-size:15px;outline:none;width:220px">
      <span class="badge">会员额度 · 实验性</span>${p.id === S.defaultProviderId ? '<span class="badge">默认</span>' : ''}</h3>
    <div class="desc" style="margin:-4px 0 12px;font-size:12px;line-height:1.7">
      ClawChat 会在后台打开一个你已登录的 muse.ai 网页，替你在「旁聊」里发消息、读回复（每个联系人在每个群里各用一个旁聊，不碰你的主要聊天）。<br>
      ⚠️ 这属于自动操作网页，<b>有被 Meta 判定违规、限制或封号的风险</b>；网页改版后也可能失效。建议把用它的群设成「只有 @ 才回复」，少用「让它们接着聊」。</div>
    <div class="row-actions">
      <button class="btn primary" data-pact="muselogin">登录 Muse</button>
      <button class="btn" data-pact="musestatus">检测登录状态</button>
      <button class="btn" data-pact="test">测试对话</button>
      ${p.id === S.defaultProviderId ? '' : '<button class="btn" data-pact="default">设为默认</button>'}
      <button class="btn" data-pact="addagent">＋ 再建一个联系人</button>
      <button class="btn danger" data-pact="del">删除</button>
      <span class="desc" data-pstatus style="margin:0;font-size:12px;white-space:pre-wrap"></span>
    </div></div>`;
}

// ---------------- modals ----------------
function modal(html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  const close = () => (root.innerHTML = '');
  root.querySelector('.modal-bg').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-bg')) close(); });
  onMount?.(root.querySelector('.modal'), close);
}

function newChatModal(editChat = null) {
  const sel = new Set(editChat ? editChat.members : []);
  modal(`<h3>${editChat ? '群设置' : '新建聊天'}</h3>
    <div class="field"><label>群名称（只选 1 个联系人且不填名称 = 私聊）</label><input id="m-name" value="${esc(editChat?.name || '')}" placeholder="例如：论文讨论组"></div>
    <div class="field"><label>选择成员</label></div>
    <div class="pick-list">${S.agents.map((a) => `<label><input type="checkbox" value="${a.id}" ${sel.has(a.id) ? 'checked' : ''}>${avatarHTML(a, 'sm')}<span>${esc(a.name)}</span></label>`).join('')}</div>
    ${editChat && editChat.type === 'group' ? `<div class="grid2"><div class="field"><label>协作时的主管（选最聪明的那个）</label><select id="m-lead">${chatMembers(editChat).map((a) => `<option value="${a.id}" ${collabLead(editChat)?.id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
      <div class="field"><label>不合格时最多打回重做</label><select id="m-redo">${[0, 1, 2].map((n) => `<option value="${n}" ${(editChat.collabRedo ?? 1) === n ? 'selected' : ''}>${n} 轮</option>`).join('')}</select></div></div>
      <div class="field"><label>单次协作的用量上限（到了会自动暂停，可以选择继续）</label><select id="m-budget">${[[100000, '10 万 tokens'], [200000, '20 万 tokens'], [500000, '50 万 tokens'], [1000000, '100 万 tokens'], [3000000, '300 万 tokens'], [0, '不限']].map(([v, l]) => `<option value="${v}" ${(editChat.collabBudget ?? 500000) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    <div class="foot">${editChat ? '<button class="btn danger" id="m-del" style="margin-right:auto">删除群</button><button class="btn" id="m-clear">清空记录</button>' : ''}
      <button class="btn" id="m-cancel">取消</button><button class="btn primary" id="m-ok">${editChat ? '保存' : '创建'}</button></div>`,
  (m, close) => {
    $('#m-cancel', m).onclick = close;
    $('#m-ok', m).onclick = () => {
      const ids = [...m.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
      const name = $('#m-name', m).value.trim();
      if (!ids.length) return toast('至少选一个联系人');
      if (editChat) {
        editChat.members = ids; editChat.name = name || editChat.name;
        const ld = $('#m-lead', m); if (ld) { editChat.leadId = ld.value; editChat.collabRedo = +$('#m-redo', m).value; editChat.collabBudget = +$('#m-budget', m).value; }
      } else if (ids.length === 1 && !name) {
        const ex = S.chats.find((c) => c.type === 'dm' && c.members[0] === ids[0]);
        if (ex) activeChatId = ex.id;
        else { const c = { id: uid('c'), type: 'dm', name: '', members: ids, messages: [], updated: Date.now() }; S.chats.push(c); activeChatId = c.id; }
      } else {
        const c = { id: uid('c'), type: 'group', name: name || ids.map((i) => agentById(i).name).join('、').slice(0, 16), members: ids, replyMode: 'all', messages: [], updated: Date.now() };
        S.chats.push(c); activeChatId = c.id;
      }
      save(); close(); view = 'chats'; renderAll();
    };
    if (editChat) {
      $('#m-del', m).onclick = () => {
        if (!confirm('确定删除这个群聊和全部聊天记录？')) return;
        S.chats = S.chats.filter((c) => c !== editChat); activeChatId = null; save(); close(); renderAll();
      };
      $('#m-clear', m).onclick = () => {
        if (!confirm('清空这个群的聊天记录？')) return;
        editChat.messages = []; save(); close(); renderAll();
      };
    }
  });
}

function addAgentModal(p) {
  const models = p.models || [];
  modal(`<h3>用「${esc(p.name)}」新建联系人</h3>
    <div class="field"><label>模型（留空 = 用这个服务的默认模型${p.model ? '：' + esc(p.model) : ''}）</label>
      <input id="m-model" list="m-models" placeholder="${models.length ? '可从下拉里选' : '可先在服务里点「获取模型列表」'}"><datalist id="m-models">${models.map((m) => `<option value="${esc(m)}">`).join('')}</datalist></div>
    <div class="field"><label>联系人名字（留空自动起名）</label><input id="m-aname" maxlength="24"></div>
    <div class="foot"><button class="btn" id="m-cancel">取消</button><button class="btn primary" id="m-ok">创建</button></div>`,
  (m, close) => {
    $('#m-cancel', m).onclick = close;
    $('#m-ok', m).onclick = () => {
      const a = newAgentForProvider(p, $('#m-model', m).value.trim());
      const n = $('#m-aname', m).value.trim(); if (n) a.name = n;
      save(); close(); view = 'agents'; activeAgentId = a.id; renderAll();
      toast(`已新建联系人「${a.name}」，可以在这里改名字、头像和人设`);
    };
  });
}

// ---------------- events ----------------
document.addEventListener('click', async (e) => {
  const qm = e.target.closest('[data-qmodel]');
  if (qm) { const card = qm.closest('[data-pcard]'); const p = providerById(card.dataset.pcard); if (p) { p.model = qm.dataset.qmodel; save(); renderSettings(); toast(`模型已改为 ${p.model}`); } return; }
  const t = e.target.closest('[data-view],[data-chat],[data-agent],[data-provider],[data-mention],[data-act],[data-emoji],[data-mark],[data-color],[data-preset],[data-clipreset],[data-musepreset],[data-pact],[data-addmodel],[data-wact],[data-wopen],[data-wreveal],[data-attopen],[data-attdel],[data-cact],[data-tfilter],[data-tjump],[data-proj],[data-pjstage],[data-pjact],button');
  if (!t) return;

  if (t.dataset.wopen) { window.claw.work.open(t.dataset.wopen); return; }
  if (t.dataset.wreveal) { window.claw.work.reveal(t.dataset.wreveal); return; }
  if (t.dataset.proj) { projSel = { pid: t.dataset.proj, sid: null }; renderList(); renderProjectsPage(); return; }
  if (t.dataset.pjstage) { projSel.sid = t.dataset.pjstage; const pj = projById(projSel.pid); if (pj) renderProject(pj); return; }
  if (t.dataset.pjact) { projectAction(t.dataset.pjact, t); return; }
  if (t.dataset.tfilter) { taskFilter = t.dataset.tfilter; renderList(); renderTasksPage(); return; }
  if (t.dataset.tjump) { const [c, mid] = t.dataset.tjump.split('|'); jumpToTask(c, mid); return; }
  if (t.id === 'pa-pair' || t.id === 'pa-off') { const ag = agentById(activeAgentId); if (ag) pachatCardAction(t.id, ag); return; }
  if (t.dataset.view) { view = t.dataset.view; filter = ''; $('#search').value = ''; renderAll(); return; }
  if (t.dataset.chat) { const prev = chatById(activeChatId); const ta = $('#composer-input'); if (prev && ta) prev.draft = ta.value; activeChatId = t.dataset.chat; renderList(); renderMain(); return; }
  if (t.dataset.agent) { activeAgentId = t.dataset.agent; renderList(); renderMain(); return; }
  if (t.dataset.provider) { document.querySelector(`[data-pcard="${t.dataset.provider}"]`)?.scrollIntoView({ behavior: 'smooth' }); return; }

  const chat = chatById(activeChatId);
  if (t.dataset.mention) {
    const ta = $('#composer-input'); const ins = '@' + t.dataset.mention + ' ';
    const p = ta.selectionStart; ta.value = ta.value.slice(0, p) + ins + ta.value.slice(ta.selectionEnd);
    ta.focus(); ta.selectionStart = ta.selectionEnd = p + ins.length; return;
  }
  if (t.dataset.attopen) { window.claw.attOpen(t.dataset.attopen); return; }
  if (t.dataset.attdel !== undefined && chat) { const l = pendingAtts.get(chat.id) || []; l.splice(+t.dataset.attdel, 1); renderAttBar(chat); return; }
  if (t.dataset.cact && chat) { const cm = chat.messages.find((x) => x.id === t.closest('[data-mid]').dataset.mid); if (cm) collabAction(chat, cm, t.dataset.cact, t); return; }
  if ((t.dataset.wact || t.dataset.wopen || t.dataset.wreveal) && chat) {
    if (t.dataset.wopen) { window.claw.work.open(t.dataset.wopen); return; }
    if (t.dataset.wreveal) { window.claw.work.reveal(t.dataset.wreveal); return; }
    const m = chat.messages.find((x) => x.id === t.closest('[data-mid]').dataset.mid);
    if (t.dataset.wact === 'go') startWork(chat, m);
    if (t.dataset.wact === 'cancel') { m.status = 'cancelled'; save(); renderMessagesIfActive(chat); }
    if (t.dataset.wact === 'stop' && m.jobId) window.claw.work.stop(m.jobId);
    if (t.dataset.wact === 'setup') { activeAgentId = m.agentId; view = 'agents'; renderAll(); setTimeout(() => $('#work-card')?.scrollIntoView({ behavior: 'smooth' }), 50); }
    return;
  }
  if (t.dataset.act && chat) {
    const mid = t.closest('[data-mid]').dataset.mid;
    const idx = chat.messages.findIndex((m) => m.id === mid);
    const m = chat.messages[idx];
    if (t.dataset.act === 'copy') { navigator.clipboard.writeText(m.text || m.error || ''); toast('已复制'); }
    if (t.dataset.act === 'del') { chat.messages.splice(idx, 1); save(); renderMessagesIfActive(chat); renderList(); }
    if (t.dataset.act === 'regen' && !running.has(chat.id)) {
      const a = agentById(m.from); if (!a) return;
      chat.messages.splice(idx, 1);
      // regenerate in place: temporarily cut history after idx
      const tail = chat.messages.splice(idx);
      running.set(chat.id, { stop: false, queue: [] }); renderMainIfActive(chat);
      await agentReply(chat, a);
      chat.messages.push(...tail);
      running.delete(chat.id); save(); renderMainIfActive(chat);
    }
    return;
  }

  // agent editor
  const agent = agentById(activeAgentId);
  if (t.dataset.emoji && agent) { agent.avatar = t.dataset.emoji; agent.img = ''; if (DARK_COLORS.includes(agent.color)) agent.color = COLORS[0]; save(); renderAgentEditor(); renderList(); return; }
  if (t.dataset.mark && agent) { agent.avatar = t.dataset.mark; agent.color = t.dataset.markcolor; agent.fg = '#fff'; agent.img = ''; save(); renderAgentEditor(); renderList(); return; }
  if (t.dataset.color && agent) { agent.color = t.dataset.color; agent.fg = DARK_COLORS.includes(agent.color) ? '#fff' : '#1f1d1a'; save(); renderAgentEditor(); renderList(); return; }

  // providers
  if (t.dataset.preset !== undefined) {
    const p0 = PRESETS[+t.dataset.preset] || { name: '自定义服务', baseUrl: 'https://', model: '' };
    const p = { id: uid('p'), name: p0.name, baseUrl: p0.baseUrl, model: p0.model, apiKey: '', mark: p0.mark, markColor: p0.markColor };
    S.providers.push(p); const na = newAgentForProvider(p); toast(`已添加服务，并自动新建了联系人「${na.name}」`);
    if (!S.defaultProviderId) S.defaultProviderId = p.id;
    save(); renderSettings(); renderList();
    document.querySelector(`[data-pcard="${p.id}"] [data-pf="apiKey"]`)?.focus();
    return;
  }
  if (t.dataset.musepreset) {
    const p = { id: uid('p'), kind: 'muse', name: 'Muse 网页会员', mark: 'Mu', markColor: '#0866FF' };
    S.providers.push(p); newAgentForProvider(p); toast('已添加服务，并自动新建了联系人「Muse 网页会员」');
    if (!S.defaultProviderId) S.defaultProviderId = p.id;
    save(); renderSettings(); renderList();
    const card = document.querySelector(`[data-pcard="${p.id}"]`);
    card?.scrollIntoView({ behavior: 'smooth' });
    card?.querySelector('[data-pact="musestatus"]')?.click();
    return;
  }
  if (t.dataset.clipreset !== undefined) {
    const p0 = CLI_PRESETS[+t.dataset.clipreset];
    const p = { id: uid('p'), kind: p0.kind, name: p0.name, command: p0.command, model: p0.model, effort: p0.effort, mark: p0.mark, markColor: p0.markColor };
    S.providers.push(p); const na = newAgentForProvider(p); toast(`已添加服务，并自动新建了联系人「${na.name}」`);
    if (!S.defaultProviderId) S.defaultProviderId = p.id;
    save(); renderSettings(); renderList();
    const card = document.querySelector(`[data-pcard="${p.id}"]`);
    card?.scrollIntoView({ behavior: 'smooth' });
    card?.querySelector('[data-pact="check"]')?.click();
    return;
  }
  if (t.dataset.pact) {
    const card = t.closest('[data-pcard]'); const p = providerById(card.dataset.pcard);
    const status = card.querySelector('[data-pstatus]');
    if (t.dataset.pact === 'del') {
      if (!confirm(`删除「${p.name}」？`)) return;
      S.providers = S.providers.filter((x) => x !== p);
      if (S.defaultProviderId === p.id) S.defaultProviderId = S.providers[0]?.id || '';
      S.agents.forEach((a) => { if (a.providerId === p.id) a.providerId = ''; });
      save(); renderSettings(); renderList(); return;
    }
    if (t.dataset.pact === 'default') { S.defaultProviderId = p.id; save(); renderSettings(); renderList(); return; }
    if (t.dataset.pact === 'models') {
      status.textContent = '获取中…';
      try {
        p.models = await window.claw.listModels({ baseUrl: p.baseUrl, apiKey: p.apiKey });
        save(); renderSettings();
        const st = document.querySelector(`[data-pcard="${p.id}"] [data-pstatus]`);
        st.textContent = `✅ 共 ${p.models.length} 个模型，点「默认模型」输入框可下拉选择`;
      } catch (err) { status.textContent = '❌ ' + String(err.message || err).replace(/^Error invoking remote method '[^']+': /, ''); }
      return;
    }
    if (t.dataset.pact === 'addagent') { addAgentModal(p); return; }
    if (t.dataset.pact === 'muselogin') {
      await window.claw.museLogin();
      status.textContent = '已打开 Muse 窗口。登录完成后关掉那个窗口，再点「检测登录状态」。';
      return;
    }
    if (t.dataset.pact === 'musestatus') {
      status.textContent = '检测中…（要打开网页，稍等几秒）';
      const st = await window.claw.museStatus();
      status.textContent = st === 'ok' ? '✅ 已登录，可以用了' : st === 'login' ? '❌ 还没登录，点「登录 Muse」' : '❌ 打不开 muse.ai，请检查网络';
      return;
    }
    if (t.dataset.pact === 'qmodels') {
      const menu = document.querySelector(`[data-pcard="${p.id}"] [data-qmenu]`);
      if (menu && menu.style.display !== 'none') { menu.style.display = 'none'; return; }
      status.textContent = '正在读取你的账号能用的模型…';
      const r = await window.claw.cliModels({ kind: p.kind, command: p.command });
      if (!r.ok) { status.textContent = '❌ ' + r.msg; return; }
      p.models = r.models; save(); renderSettings();
      const m2 = document.querySelector(`[data-pcard="${p.id}"] [data-qmenu]`); if (m2) m2.style.display = 'block';
      return;
    }
    if (t.dataset.pact === 'check') {
      status.textContent = '检测中…';
      const r = await window.claw.cliCheck({ kind: p.kind, command: p.command });
      status.textContent = r.ok ? `✅ 已安装：${r.msg}　接着点「测试对话」确认已登录`
        : `❌ ${r.msg}\n${p.kind === 'codex' ? '安装：npm i -g @openai/codex，然后运行 codex login' : p.kind === 'qoder' ? '安装：npm i -g @qoder-ai/qodercli，然后运行 qodercli login' : '安装 Claude Code 后运行 claude 登录'}`;
      return;
    }
    if (t.dataset.pact === 'test') {
      status.textContent = isCli(p) || isMuse(p) ? '测试中…（比 API 慢，请等十几秒）' : '测试中…';
      let text = '';
      const { promise } = window.claw.stream({ ...llmCfg(p), messages: [{ role: 'user', content: '用一句话打个招呼' }] }, { onChunk: (d) => (text += d) });
      const res = await promise;
      if (res.replace) text = res.replace;
      status.textContent = res.error ? '❌ ' + res.error : '✅ 连接成功：' + text.slice(0, 40);
      return;
    }
  }

  switch (t.id) {
    case 'list-add':
      if (view === 'projects') newProjectModal();
      else if (view === 'chats') newChatModal();
      else if (view === 'agents') {
        const a = { id: uid('a'), name: '新联系人', avatar: EMOJIS[Math.floor(Math.random() * EMOJIS.length)], color: COLORS[Math.floor(Math.random() * COLORS.length)], providerId: '', model: '', temperature: 0.8, persona: '你是一个友好的助手。', memory: '' };
        S.agents.push(a); activeAgentId = a.id; save(); renderList(); renderMain(); $('#f-name')?.select();
      } else { view = 'settings'; renderSettings(); }
      break;
    case 'btn-send': if (chat) { const ta = $('#composer-input'); const v = ta.value; ta.value = ''; chat.draft = ''; sendUser(chat, v); } break;
    case 'btn-stop': if (chat) stopChat(chat); break;
    case 'btn-continue': if (chat) continueChat(chat, 1); break;
    case 'btn-archive': if (chat) archiveModal(chat); break;
    case 'btn-collab': if (chat) { collabModal(chat); break; }
    case 'btn-collab-old': { const ta = $('#composer-input'); if (!COLLAB_RE.test(ta.value)) ta.value = '/协作 ' + ta.value.replace(/^\s*\/\S*\s*/, ''); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); break; }
    case 'btn-memory': if (chat) summarizeMemory(chat); break;
    case 'btn-edit-group': if (chat) newChatModal(chat); break;
    case 'btn-edit-agent': if (chat) { activeAgentId = chat.members[0]; view = 'agents'; renderAll(); } break;
    case 'agent-chat': {
      let c = S.chats.find((x) => x.type === 'dm' && x.members[0] === agent.id);
      if (!c) { c = { id: uid('c'), type: 'dm', name: '', members: [agent.id], messages: [], updated: Date.now() }; S.chats.push(c); save(); }
      activeChatId = c.id; view = 'chats'; renderAll(); break;
    }
    case 'agent-del':
      if (!confirm(`删除联系人「${agent.name}」？它的私聊也会被删除。`)) return;
      S.agents = S.agents.filter((a) => a !== agent);
      S.chats = S.chats.filter((c) => !(c.type === 'dm' && c.members[0] === agent.id));
      S.chats.forEach((c) => (c.members = c.members.filter((id) => id !== agent.id)));
      activeAgentId = null; save(); renderAll(); break;
    case 'av-upload': $('#av-file').click(); break;
    case 'btn-attach': $('#att-file').click(); break;
    case 'w-pick': { const d = await window.claw.work.pickFolder(); if (d) { agent.work = { ...(agent.work || {}), dir: d }; save(); renderAgentEditor(); setTimeout(() => $('#work-card')?.scrollIntoView(), 0); } break; }
    case 'av-clear': agent.img = ''; save(); renderAgentEditor(); renderList(); break;
    case 's-open': window.claw.openDataFolder(); break;
    case 's-export': {
      const blob = new Blob([JSON.stringify({ ...S, providers: S.providers.map((p) => ({ ...p, apiKey: '' })) }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clawchat-backup.json'; a.click();
      toast('已导出（不含 API Key）'); break;
    }
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.pjf === 'task') { const pj = projById(projSel.pid), st = pj && stageOf(pj, projSel.sid); if (st) { st.task = t.value; save(); } return; }
  if (t.id === 'search') { filter = t.value; if (view === 'tasks') renderTasksPage(); else renderList(); return; }
  const agent = agentById(activeAgentId);
  if (view === 'agents' && agent) {
    if (t.id === 'f-name') { agent.name = t.value.trim() || '未命名'; renderList(); $('.page h2').textContent = agent.name; }
    if (t.id === 'f-persona') agent.persona = t.value;
    if (t.id === 'k-strengths') agent.card = { ...(agent.card || {}), strengths: t.value };
    if (t.id === 'w-dir') agent.work = { ...(agent.work || {}), dir: t.value.trim() };
    if (t.id === 'w-extra') agent.work = { ...(agent.work || {}), extraDirs: t.value.split('\n').map((x) => x.trim()).filter(Boolean) };
    if (t.id === 'f-avtext' && t.value.trim()) { agent.avatar = t.value.trim(); agent.img = ''; if (!DARK_COLORS.includes(agent.color)) agent.fg = '#1f1d1a'; renderList(); const big = $('.page .av.lg'); if (big) big.outerHTML = avatarHTML(agent, 'lg'); }
    if (t.id === 'f-memory') agent.memory = t.value;
    if (t.id === 'f-model') agent.model = t.value.trim();
    if (t.id === 'f-temp') { agent.temperature = +t.value; $('#t-val').textContent = t.value; }
    save();
  }
  if (t.id === 's-username') { S.userName = t.value.trim() || '我'; save(); }
  if (t.dataset.pf) {
    const p = providerById(t.closest('[data-pcard]').dataset.pcard);
    p[t.dataset.pf] = t.value.trim(); save();
    if (t.dataset.pf === 'name' || t.dataset.pf === 'model') renderList();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.pjf && t.dataset.pjf !== 'task') { const pj = projById(projSel.pid), st = pj && stageOf(pj, projSel.sid); if (st) { st[t.dataset.pjf] = t.type === 'checkbox' ? t.checked : t.value; save(); syncPlan(pj); renderProject(pj); } return; }
  if (t.id === 'att-file' && t.files.length) { const c = chatById(activeChatId); if (c) addFiles(c, [...t.files]); t.value = ''; return; }
  if (t.id === 'av-file' && t.files[0]) {
    const agent = agentById(activeAgentId); const f = t.files[0];
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const k = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, 160, 160);
      agent.img = c.toDataURL('image/png'); URL.revokeObjectURL(img.src);
      save(); renderAgentEditor(); renderList();
    };
    img.onerror = () => toast('这张图片读不了，换一张试试');
    img.src = URL.createObjectURL(f);
    return;
  }
  if (t.tagName === 'SELECT' && t.dataset.pf) { providerById(t.closest('[data-pcard]').dataset.pcard)[t.dataset.pf] = t.value; save(); return; }
  if (t.id === 'reply-mode') { const c = chatById(activeChatId); c.replyMode = t.value; save(); }
  if (['k-role', 'k-speed', 'k-cost'].includes(t.id)) { const ag = agentById(activeAgentId); ag.card = { ...(ag.card || {}), [t.id.slice(2)]: t.value }; save(); return; }
  if (['w-enabled', 'w-comsol', 'w-network', 'w-level', 'w-effort'].includes(t.id)) {
    const ag = agentById(activeAgentId); ag.work = ag.work || {};
    if (t.id === 'w-enabled') ag.work.enabled = t.checked;
    if (t.id === 'w-comsol') ag.work.comsol = t.checked;
    if (t.id === 'w-network') ag.work.network = t.checked;
    if (t.id === 'w-level') { if (t.value === 'full' && !confirm('完全访问意味着它可以修改、删除你电脑上的任何文件。确定吗？')) { t.value = 'write'; return; } ag.work.level = t.value; }
    if (t.id === 'w-effort') ag.work.effort = t.value;
    save(); return;
  }
  if (t.id === 'f-provider') { agentById(activeAgentId).providerId = t.value; save(); renderAgentEditor(); }
});

document.addEventListener('keydown', (e) => {
  if (e.target.id === 'composer-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault(); $('#btn-send').click();
  }
  if (e.key === 'Enter' && !e.isComposing && e.target.id === 'pj-chat-input') { e.preventDefault(); projectAction('chat', e.target); }
  if (e.key === 'Enter' && !e.isComposing && e.target.id === 'pj-feedback') { e.preventDefault(); projectAction('reject-send', e.target); }
  if (e.key === 'Escape') $('#modal-root').innerHTML = '';
});

// drag & drop / paste
document.addEventListener('dragover', (e) => { if (view === 'chats' && activeChatId) { e.preventDefault(); document.body.classList.add('dropping'); } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
document.addEventListener('drop', (e) => {
  e.preventDefault(); document.body.classList.remove('dropping');
  const c = chatById(activeChatId);
  if (view === 'chats' && c && e.dataTransfer.files.length) addFiles(c, [...e.dataTransfer.files]);
});
document.addEventListener('paste', (e) => {
  if (e.target.id !== 'composer-input') return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) { e.preventDefault(); addFiles(chatById(activeChatId), files); }
});

// ---------------- boot ----------------
(async function boot() {
  S = (await window.claw.load()) || defaultState();
  S.chats.forEach((c) => c.messages.forEach((m) => {
    if (m.pending) { m.pending = false; if (!m.text) m.error = '（被中断）'; }
    if (m.type === 'work' && m.status === 'running') { m.status = 'stopped'; m.errorText = '程序关闭时任务被中断'; }
    if (m.type === 'collab' && COLLAB_ACTIVE.includes(m.status)) { m.status = 'stopped'; (m.tasks || []).forEach((t) => { if (t.status === 'running' || t.status === 'asking') t.status = 'pending'; delete t.live; }); }
  }));
  window.claw.work.onEvent(onWorkEvent);
  setTimeout(pachatStartAll, 1500);
  const sorted = [...S.chats].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  activeChatId = sorted[0]?.id || null;
  S.templates = S.templates || [];
  S.projects = S.projects || [];
  S.projects.forEach((pj) => { if (pj.status === 'drafting') { pj.status = 'draft-error'; pj.error = '程序关闭时起草被中断'; } pj.stages.forEach((st) => { if (['running', 'review', 'revising'].includes(st.status)) { st.status = 'stopped'; delete st.live; } }); });
  if (S.providers.some((p) => p.keyLost)) setTimeout(() => toast('有 API Key 解密失败（可能换了电脑或系统账号），请到「设置」里重新填写', 7000), 600);
  if (!S.providers.length) { view = 'settings'; setTimeout(() => toast('先添加一个模型服务（推荐 DeepSeek），填好 API Key 就能聊了', 5000), 400); }
  save();
  renderAll();
})();
