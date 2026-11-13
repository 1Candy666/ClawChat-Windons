/* ClawChat — 协作模式：主管拆解任务 → 任务单派活 → 成员执行（可反问）→ 主管对照原话验收 → 汇总 */
'use strict';

const COLLAB_RE = /^\s*\/(协作|collab)\s+([\s\S]+)/i;
const ROLES = {
  '': { name: '通用', hint: '没有特别的定位' },
  lead: { name: '主管', hint: '最聪明，负责理解意图、拆任务、验收、汇总' },
  worker: { name: '工具人', hint: '便宜，适合量大、重复、繁琐的活' },
  writer: { name: '写手', hint: '文笔好，适合成稿和润色' },
  fast: { name: '快答', hint: '响应快，适合简单查询和格式转换' },
  doer: { name: '动手', hint: '能在电脑上运行程序、读写文件' },
  cloud: { name: '云电脑', hint: '有自己的云端环境，适合上网查资料' },
};
const SPEEDS = { fast: '快', medium: '中', slow: '慢' };
const COSTS = { low: '低', medium: '中', high: '高' };
const COLLAB_ACTIVE = ['planning', 'running', 'reviewing', 'writing'];
const COLLAB_MAX_TASKS = 8;

const collabRuns = new Map(); // msgId -> { stop, reqIds:Set, jobIds:Set }
const collabJobs = new Map(); // jobId -> handler(ev)
const collabTimers = new Map();

class CollabStop extends Error {}
class CollabBudget extends Error {}

// ---------------- usage ----------------
function estTokens(str) {
  const t = String(str || '');
  const cjk = (t.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
  return Math.round(cjk * 0.7 + (t.length - cjk) / 3.5);
}
function mkUsage(agent, reported, inText, outText) {
  const p = providerById(agent.providerId) || providerById(S.defaultProviderId) || S.providers[0];
  if (reported && reported.credits != null) return { in: 0, out: 0, credits: reported.credits };
  const u = reported && (reported.in || reported.out) ? { in: reported.in || 0, out: reported.out || 0 } : { in: estTokens(inText), out: estTokens(outText), est: true };
  if (p && (+p.priceIn || +p.priceOut)) u.cost = (u.in * (+p.priceIn || 0) + u.out * (+p.priceOut || 0)) / 1e6;
  return u;
}
function addUsage(total, u) {
  if (!total || !u) return;
  total.in = (total.in || 0) + (u.in || 0); total.out = (total.out || 0) + (u.out || 0);
  if (u.cost != null) total.cost = (total.cost || 0) + u.cost;
  if (u.credits != null) total.credits = (total.credits || 0) + u.credits;
  if (u.est) total.est = true;
}
function fmtUsage(u) {
  if (!u || !(u.in || u.out || u.credits)) return '';
  const k = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
  const parts = [];
  if (u.in || u.out) parts.push(`${u.est ? '约 ' : ''}输入 ${k(u.in)} / 输出 ${k(u.out)} tokens${u.cost != null ? ` · ¥${u.cost < 0.01 ? u.cost.toFixed(4) : u.cost.toFixed(2)}` : ''}`);
  if (u.credits) parts.push(`Qoder ${u.credits < 1 ? u.credits.toFixed(2) : u.credits.toFixed(1)} credits`);
  return parts.join(' · ');
}
const usageTotal = (u) => (u?.in || 0) + (u?.out || 0);

// ---------------- helpers ----------------
function collabLead(chat) {
  const members = chatMembers(chat);
  return members.find((a) => a.id === chat.leadId) || members.find((a) => a.card?.role === 'lead') || members[0];
}
function rosterLine(a) {
  const c = a.card || {};
  const llm = resolveLLM(a);
  const bits = [`「${a.name}」`, `定位：${ROLES[c.role || '']?.name || '通用'}`];
  bits.push(`特长：${(c.strengths || a.persona || '未填写').replace(/\s+/g, ' ').slice(0, 120)}`);
  if (c.speed) bits.push(`速度：${SPEEDS[c.speed]}`);
  if (c.cost) bits.push(`价格：${COSTS[c.cost]}`);
  if (llm?.model) bits.push(`底层模型：${llm.model}`);
  if (workReady(a)) bits.push('【可执行：能在用户电脑的工作文件夹里运行程序、读写文件】');
  return '- ' + bits.join('｜');
}
function parseJSON(text) {
  let t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('输出里没有 JSON');
  t = t.slice(i, j + 1);
  try { return JSON.parse(t); } catch {}
  return JSON.parse(t.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"'));
}
const asText = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('；') : v == null ? '' : String(v)).trim();

function newCollabRun(m) {
  const run = { stop: false, reqIds: new Set(), jobIds: new Set(), m };
  collabRuns.set(m.id, run);
  return run;
}
function checkStop(run) { if (run.stop) throw new CollabStop(); }
function stopCollabIn(chat) {
  let n = 0;
  for (const m of chat.messages) {
    const run = collabRuns.get(m.id);
    if (!run) continue;
    run.stop = true; n++;
    for (const id of run.reqIds) window.claw.abort(id);
    for (const id of run.jobIds) window.claw.work.stop(id);
  }
  return n;
}

function callAgent(agent, sys, user, { run, attachments, temperature, onText, onReasoning, acct } = {}) {
  const bm = run?.m;
  if (bm?.budget && usageTotal(bm.usage) >= bm.budget) return Promise.reject(new CollabBudget());
  const llm = resolveLLM(agent);
  if (!llm) return Promise.resolve({ text: '', error: `「${agent.name}」没有可用的模型服务` });
  let text = '', reasoning = '';
  const atts = (attachments || []).map((a) => ({ type: 'att', att: a, live: true }));
  const withAtts = (t) => (atts.length ? [{ type: 'text', text: t }, ...atts] : t);
  const messages = llm.kind === 'muse'
    ? [{ role: 'user', content: withAtts(sys + '\n\n' + user) }]
    : [{ role: 'system', content: sys }, { role: 'user', content: withAtts(user) }];
  const { reqId, promise } = window.claw.stream({ ...llm, temperature, messages }, {
    onChunk: (d) => { text += d; onText?.(text); },
    onReasoning: (d) => { if (reasoning.length < 30000) reasoning += d; onReasoning?.(reasoning); },
  });
  run?.reqIds.add(reqId);
  return promise.then((res) => {
    run?.reqIds.delete(reqId);
    if (res.replace) text = res.replace;
    const usage = mkUsage(agent, res.usage, sys + user, text + reasoning);
    for (const o of acct || []) addUsage(o, usage);
    return { text: text.trim(), reasoning, error: res.error, aborted: res.aborted, model: llm.model, usage };
  });
}

function runWorkJob(run, a, prompt, attachments, onLog) {
  if (run.m?.budget && usageTotal(run.m.usage) >= run.m.budget) return Promise.reject(new CollabBudget());
  return new Promise((resolve) => {
    const p = providerById(a.providerId) || providerById(S.defaultProviderId) || S.providers[0];
    const jobId = uid('j');
    collabJobs.set(jobId, (ev) => {
      if (ev.type === 'log') onLog?.(ev.entry);
      if (ev.type === 'done') {
        collabJobs.delete(jobId); run.jobIds.delete(jobId);
        resolve({ text: (ev.text || '').trim(), files: ev.files || [], error: ev.error, aborted: ev.stopped, secs: ev.secs, usage: mkUsage(a, ev.usage, prompt, ev.text) });
      }
    });
    run.jobIds.add(jobId);
    const go = (comsol) => window.claw.work.start({
      jobId, kind: p.kind, command: p.command, effort: a.work.effort || 'medium', model: a.model || p.model,
      dir: a.work.dir, level: a.work.level || 'write', network: !!a.work.network,
      attachments: (attachments || []).map(({ name, path, size, kind }) => ({ name, path, size, kind })),
      extraDirs: [...new Set([...(a.work.extraDirs || []), ...(a.work.comsol !== false ? comsol : [])])], prompt,
    });
    window.claw.work.comsolDirs().then(go, () => go([]));
  });
}

// ---------------- prompts ----------------
function originalBlock(m) {
  let s = `【用户的原始要求（原话，一切以此为准）】\n${m.request}`;
  if (m.attachments?.length) s += `\n（用户附带了文件：${m.attachments.map((a) => a.name).join('、')}，内容附在本消息后面）`;
  if (m.supplements?.length) s += `\n\n【用户的补充说明（原话）】\n${m.supplements.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
  if (m.archive?.trim()) s += `\n\n【项目档案（这个群长期共享的背景资料，用户维护）】\n${m.archive.trim().slice(0, 8000)}`;
  return s;
}
function leadSys(lead) {
  return `你是「${lead.name}」。${lead.persona || ''}${lead.memory?.trim() ? '\n\n【你对用户的长期记忆】\n' + lead.memory.trim() : ''}\n\n你现在是一个多模型协作团队的主管，负责理解用户意图、拆解任务、给成员写任务单、验收和汇总。用户的称呼是「${S.userName}」。`;
}
function chatContext(chat, m) {
  const name = (x) => (x.from === 'user' ? S.userName : agentById(x.from)?.name || '某成员');
  return chat.messages.filter((x) => x !== m && x.text && !x.error && x.type !== 'confirm' && x.type !== 'note' && !(x.from === 'user' && /^\s*\//.test(x.text)))
    .slice(-12).map((x) => `【${name(x)}】: ${x.text.slice(0, 1500)}`).join('\n\n');
}
function planPrompt(chat, m) {
  const members = chatMembers(chat);
  return `${originalBlock(m)}

【此前的聊天记录（供理解背景）】
${chatContext(chat, m) || '（无）'}

【团队成员】
${members.map(rosterLine).join('\n')}

${m.template ? `【沿用的流程模板「${m.template.name}」】\n这类任务之前按下面的分工做得不错。请沿用它的任务划分、负责人和依赖关系（负责人不在团队里时换成最合适的成员），并根据这次的要求重写每张任务单的具体内容：\n${m.template.tasks.map((t) => `${t.id}｜负责人：${t.assignee}｜${t.title}｜目标：${t.goal}｜交付：${t.deliverable}｜合格标准：${t.acceptance}${t.depends_on?.length ? '｜依赖：' + t.depends_on.join('、') : ''}${t.execute ? '｜需要动手执行' : ''}`).join('\n')}\n\n` : ''}请制定协作计划。原则：
1. 先写出你对用户意图的理解。只有当缺少某个信息就完全无法开展时，才把问题写进 questions_for_user；能合理假设的就自己假设，并写进任务单的"已经确定的事"。
2. 按成员特长派活：量大、重复的活给便宜的成员；关键判断和难题留给聪明的成员（包括你自己）；需要成稿的给写手。简单任务不要硬拆，只有 1 个任务也可以。最多 ${COLLAB_MAX_TASKS} 个任务。
3. 每张任务单必须自成一体：接收者看不到聊天记录，只能看到用户原话、附件、这张任务单，以及它依赖的任务的完整产出。所以背景、约束、判断标准都要写清楚，不要写"如上所述""按之前说的"。
4. 互相独立的任务不要设依赖（它们会并行执行）；需要用到别人产出的任务，在 depends_on 里写上那个任务的 id。
5. 需要在电脑上运行程序、读写文件的任务，只能派给标注了【可执行】的成员，并把 execute 设为 true；没有这样的成员就不要安排这类任务，在 understanding 里说明。

只输出一个 JSON 对象，不要输出其他文字：
{"understanding":"你对用户意图的理解","questions_for_user":[],"tasks":[{"id":"T1","assignee":"成员名字","title":"简短标题","goal":"目标","background":"背景","inputs":"输入材料","known":"已经确定的事","deliverable":"要交付什么、什么格式","acceptance":"怎样算合格","donts":"不要做什么","depends_on":[],"execute":false}]}`;
}
function briefText(t) {
  const rows = [['目标', t.goal], ['背景', t.background], ['输入材料', t.inputs], ['已经确定的事', t.known], ['要交付什么', t.deliverable], ['合格标准', t.acceptance], ['不要做', t.donts]];
  return rows.filter((r) => r[1]).map((r) => `${r[0]}：${r[1]}`).join('\n');
}
function workerSys(a, lead) {
  return `你是「${a.name}」。${a.persona || ''}${a.memory?.trim() ? '\n\n【你对用户的长期记忆】\n' + a.memory.trim() : ''}\n\n你在一个多模型协作团队里工作，主管是「${lead.name}」，用户的称呼是「${S.userName}」。你会收到一张任务单，请只完成任务单里的事。`;
}
function workerPrompt(m, t, exec, a) {
  const deps = (t.depends_on || []).map((id) => m.tasks.find((x) => x.id === id)).filter(Boolean);
  let s = `${originalBlock(m)}

【你的任务单 ${t.id}：${t.title}】
${briefText(t)}`;
  if (deps.length) s += `\n\n【前置任务的完整产出】\n` + deps.map((d) => `===== ${d.id}（${agentById(d.assigneeId)?.name || '?'}：${d.title}）=====\n${d.status === 'done' ? d.output : '（这个任务失败了：' + (d.error || '未知原因') + '）'}${d.assumptions && d.assumptions !== '无' ? '\n[该成员的假设与不确定：' + d.assumptions + ']' : ''}`).join('\n\n');
  if (t.question) s += `\n\n【你之前的提问】${t.question}\n【主管的答复】${t.answer}`;
  if (t.feedback) s += `\n\n【你上一版的交付被主管打回】\n打回意见：${t.feedback}\n\n你上一版的交付：\n${t.prevOutput || '（无）'}\n\n请针对打回意见修改，交付完整的新版本。`;
  if (exec) s += `\n\n【执行环境】你现在可以在工作文件夹 ${a.work.dir} 里运行程序、读写文件，请实际动手完成，不要只给方案。不要改动和任务无关的文件。`;
  s += `\n\n回复规则：
- ${t.question ? '不要再提问，按主管的答复继续。' : '如果任务单缺少关键信息、导致完全无法开展，只回复一行：【反问】你的问题。只有一次提问机会，能合理假设的就不要问。'}
- 否则严格按下面三段格式回复：
【我的理解】用一两句话复述你要做的事
【假设与不确定】列出你做的假设和没有把握的地方；没有就写"无"
【交付内容】
完整的交付内容。不要省略，不要只写摘要${exec ? '；写清做了什么、结果如何、产出文件的相对路径' : ''}。`;
  return s;
}
function parseWorker(text) {
  const t = text.trim();
  if (!/【交付内容】/.test(t)) {
    const q = t.match(/^\s*【反问】\s*([\s\S]+)/);
    if (q) return { question: q[1].trim().slice(0, 1500) };
  }
  const sec = (name) => (t.match(new RegExp(`【${name}】\\s*([\\s\\S]*?)(?=\\n?【(?:我的理解|假设与不确定|交付内容)】|$)`)) || [])[1]?.trim() || '';
  const out = (t.split(/【交付内容】/)[1] || '').trim();
  return { understanding: sec('我的理解'), assumptions: sec('假设与不确定'), output: out || t };
}
function tasksDump(m) {
  return m.tasks.map((t) => `===== ${t.id}（${agentById(t.assigneeId)?.name || '?'}）：${t.title} =====
合格标准：${t.acceptance || '（未写）'}
成员的理解：${t.understanding || '（未写）'}
成员的假设与不确定：${t.assumptions || '无'}
交付内容：
${t.status === 'done' ? t.output : '（任务失败：' + (t.error || '未知原因') + '）'}`).join('\n\n');
}
function reviewPrompt(m, canRedo) {
  return `${originalBlock(m)}

【你当初的理解】${m.understanding}

【各任务的完整交付】
${tasksDump(m)}

请逐条对照用户的原话验收：把用户的要求拆成若干条，逐条判断是否满足。${canRedo ? '如果某个任务的交付确实不合格、且重做能明显改善，把它写进 redo，并给出具体的修改意见（哪里不对、要改成什么样）；小瑕疵不要打回，你可以在汇总时自己修正。' : 'redo 请留空数组（已经没有重做机会了）。'}

只输出一个 JSON 对象：
{"checklist":[{"requirement":"用户的一条要求","met":true,"note":"简短说明"}],"redo":[{"task_id":"T1","feedback":"具体修改意见"}]}`;
}
function finalPrompt(m) {
  const cl = (m.checklist || []).map((c) => `- [${c.met ? '已满足' : '未满足'}] ${c.requirement}${c.note ? '（' + c.note + '）' : ''}`).join('\n');
  return `${originalBlock(m)}

【各任务的完整交付】
${tasksDump(m)}

【验收清单】
${cl || '（无）'}

请写出给用户的最终结果：
- 直接给出完整的成果本身（不是过程汇报），把各成员的交付整合成一份连贯的内容，纠正你发现的小问题，不要丢掉交付里的具体数据和细节。
- 如果有未满足的要求、关键假设或不确定的地方，在最后用"需要你留意"单独列出；没有就不写这一节。
- 用中文，直接开始，不要寒暄。`;
}

// ---------------- engine ----------------
function collabStart(chat, text, attachments, template) {
  const lead = collabLead(chat);
  if (chat.type !== 'group' || chatMembers(chat).length < 2) {
    chat.messages.push({ id: uid('m'), type: 'note', from: 'system', text: '协作模式需要在至少有 2 个成员的群里使用。', ts: Date.now() });
    return;
  }
  const m = { id: uid('m'), type: 'collab', from: lead.id, request: text.match(COLLAB_RE)[2].trim(), attachments: attachments || [], supplements: [],
    status: 'planning', tasks: [], checklist: [], understanding: '', questions: [], final: '', text: '', round: 0, ts: Date.now(),
    usage: {}, budget: chat.collabBudget ?? 500000, template: template || null };
  chat.messages.push(m);
  collabPlan(chat, m);
}

async function collabPlan(chat, m) {
  const run = newCollabRun(m);
  const lead = agentById(m.from) || collabLead(chat);
  m.status = 'planning'; m.errorText = ''; m.tasks = []; m.checklist = []; m.final = ''; m.text = ''; m.round = 0;
  m.usage = m.usage || {}; m.archive = chat.archive || '';
  save(); renderCollab(chat, m, true);
  try {
    let plan = null, lastErr = '';
    for (let i = 0; i < 2 && !plan; i++) {
      const r = await callAgent(lead, leadSys(lead), planPrompt(chat, m) + (lastErr ? `\n\n（你上一次的输出无法解析：${lastErr}。这次请只输出合法的 JSON。）` : ''),
        { run, acct: [m.usage], attachments: m.attachments, temperature: 0.3, onReasoning: (t) => { m.reasoning = t; renderCollab(chat, m); } });
      checkStop(run);
      if (r.error) throw new Error(r.error);
      try {
        plan = parseJSON(r.text);
        if (!Array.isArray(plan.tasks) || !plan.tasks.length) { plan = null; throw new Error('没有 tasks'); }
      } catch (e) { lastErr = e.message; }
    }
    if (!plan) throw new Error('主管没有给出可用的计划（' + lastErr + '）。可以换一个更聪明的模型当主管再试。');
    const members = chatMembers(chat);
    const idMap = {};
    plan.tasks.slice(0, COLLAB_MAX_TASKS).forEach((t, i) => { idMap[asText(t.id) || 'T' + (i + 1)] = 'T' + (i + 1); });
    m.tasks = plan.tasks.slice(0, COLLAB_MAX_TASKS).map((t, i) => {
      const nm = asText(t.assignee).replace(/[「」@]/g, '');
      const a = members.find((x) => x.name === nm) || members.find((x) => nm && (x.name.includes(nm) || nm.includes(x.name))) || lead;
      return { id: 'T' + (i + 1), assigneeId: a.id, title: asText(t.title) || '任务 ' + (i + 1), goal: asText(t.goal), background: asText(t.background), inputs: asText(t.inputs),
        known: asText(t.known), deliverable: asText(t.deliverable), acceptance: asText(t.acceptance), donts: asText(t.donts),
        depends_on: (Array.isArray(t.depends_on) ? t.depends_on : []).map((d) => idMap[asText(d)]).filter((d) => d && d !== 'T' + (i + 1)),
        execute: !!t.execute, status: 'pending' };
    });
    m.understanding = asText(plan.understanding);
    m.questions = (Array.isArray(plan.questions_for_user) ? plan.questions_for_user : []).map(asText).filter(Boolean).slice(0, 5);
    m.status = m.questions.length ? 'ask' : 'planned';
  } catch (e) {
    if (e instanceof CollabStop) m.status = 'stopped';
    else if (e instanceof CollabBudget) { m.status = 'error'; m.overBudget = true; m.errorText = `已达到这次协作的用量上限（${(m.budget / 10000).toFixed(0)} 万 tokens），已自动暂停。点「继续执行」会再追加一份额度；上限可以在群设置里改。`; }
    else { m.status = 'error'; m.errorText = String(e.message || e); }
  } finally {
    collabRuns.delete(m.id);
    chat.updated = Date.now(); save(); renderList(); renderCollab(chat, m, true);
  }
}

async function runTask(chat, m, t, run) {
  const lead = agentById(m.from);
  const a = agentById(t.assigneeId) || lead;
  const exec = t.execute && workReady(a);
  t.status = 'running'; t.live = ''; t.error = '';
  if (t.execute && !exec) t.warn = `「${a.name}」没有开启工作模式，这个任务只能给出方案，不会真的执行。`;
  renderCollab(chat, m, true);
  let r;
  if (exec) {
    t.log = [];
    r = await runWorkJob(run, a, workerSys(a, lead) + '\n\n' + workerPrompt(m, t, true, a), m.attachments, (e) => { t.log.push(e); if (t.log.length > 300) t.log.shift(); renderCollab(chat, m); });
    t.files = r.files; t.secs = r.secs;
    t.usage = t.usage || {}; addUsage(t.usage, r.usage); addUsage(m.usage, r.usage);
  } else {
    r = await callAgent(a, workerSys(a, lead), workerPrompt(m, t, false, a), { run, acct: [m.usage, (t.usage = t.usage || {})], attachments: m.attachments, temperature: a.temperature,
      onText: (x) => { t.live = x; renderCollab(chat, m); }, onReasoning: (x) => { t.reasoning = x; renderCollab(chat, m); } });
    t.model = r.model;
  }
  delete t.live;
  checkStop(run);
  if (r.error || !r.text) { t.status = 'error'; t.error = r.error || '没有返回内容'; renderCollab(chat, m, true); return; }
  const p = parseWorker(r.text);
  if (p.question && !t.question) {
    t.question = p.question; t.status = 'asking'; renderCollab(chat, m, true);
    const ans = await callAgent(lead, leadSys(lead), `${originalBlock(m)}\n\n你派给「${a.name}」的任务单 ${t.id}：${t.title}\n${briefText(t)}\n\n「${a.name}」开工前向你提问：\n${t.question}\n\n请直接、具体地回答。如果你也不确定，给出你的最佳判断并说明这是假设。`,
      { run, acct: [m.usage], attachments: m.attachments, temperature: 0.3 });
    checkStop(run);
    t.answer = ans.text || '（主管没能回答，请按最合理的假设继续，并把假设写出来）';
    return runTask(chat, m, t, run);
  }
  t.understanding = p.understanding || ''; t.assumptions = p.assumptions || ''; t.output = p.output || r.text;
  t.status = 'done';
  save(); renderCollab(chat, m, true);
}

async function runWaves(chat, m, run, only) {
  const todo = () => m.tasks.filter((t) => t.status === 'pending' && (!only || only.has(t.id)));
  while (todo().length) {
    checkStop(run);
    let ready = todo().filter((t) => (t.depends_on || []).every((d) => { const x = m.tasks.find((y) => y.id === d); return !x || x.status === 'done' || x.status === 'error'; }));
    if (!ready.length) ready = [todo()[0]]; // dependency cycle: just go
    const isExec = (t) => t.execute && workReady(agentById(t.assigneeId));
    const para = ready.filter((t) => !isExec(t));
    const serial = ready.filter(isExec);
    await Promise.all([
      ...para.map((t) => runTask(chat, m, t, run)),
      (async () => { for (const t of serial) { checkStop(run); await runTask(chat, m, t, run); } })(),
    ]);
  }
}

async function collabExecute(chat, m) {
  if (collabRuns.has(m.id)) return;
  const run = newCollabRun(m);
  const lead = agentById(m.from) || collabLead(chat);
  const t0 = Date.now();
  const maxRedo = chat.collabRedo ?? 1;
  m.status = 'running'; m.errorText = ''; m.usage = m.usage || {};
  if (m.overBudget) { m.budget = (m.budget || 0) + (chat.collabBudget ?? 500000); m.overBudget = false; }
  save(); renderList(); renderCollab(chat, m, true);
  try {
    await runWaves(chat, m, run);
    checkStop(run);
    if (m.tasks.every((t) => t.status === 'error')) throw new Error('所有任务都失败了：' + (m.tasks[0].error || ''));
    const solo = m.tasks.length === 1 && m.tasks[0].assigneeId === lead.id && m.tasks[0].status === 'done';
    if (solo) m.final = m.tasks[0].output;
    else {
      for (;;) {
        m.status = 'reviewing'; renderCollab(chat, m, true);
        const canRedo = m.round < maxRedo;
        const r = await callAgent(lead, leadSys(lead), reviewPrompt(m, canRedo), { run, acct: [m.usage], attachments: m.attachments, temperature: 0.2 });
        checkStop(run);
        let rv = null;
        try { rv = parseJSON(r.text); } catch {}
        m.checklist = (Array.isArray(rv?.checklist) ? rv.checklist : []).map((c) => ({ requirement: asText(c.requirement), met: c.met !== false && c.met !== 'false', note: asText(c.note) })).filter((c) => c.requirement).slice(0, 20);
        const redo = (canRedo && Array.isArray(rv?.redo) ? rv.redo : []).map((x) => ({ t: m.tasks.find((y) => y.id === asText(x.task_id)), fb: asText(x.feedback) })).filter((x) => x.t && x.fb);
        if (!redo.length) break;
        m.round++;
        for (const { t, fb } of redo) { t.feedback = fb; t.prevOutput = t.output; t.redo = (t.redo || 0) + 1; t.status = 'pending'; t.question = ''; t.answer = ''; }
        m.status = 'running'; renderCollab(chat, m, true);
        await runWaves(chat, m, run, new Set(redo.map((x) => x.t.id)));
        checkStop(run);
      }
      m.status = 'writing'; m.final = ''; renderCollab(chat, m, true);
      const f = await callAgent(lead, leadSys(lead), finalPrompt(m), { run, acct: [m.usage], attachments: m.attachments, temperature: 0.4, onText: (x) => { m.final = x; renderCollab(chat, m); } });
      checkStop(run);
      if (f.error || !f.text) throw new Error('主管汇总失败：' + (f.error || '没有返回内容') + '。各成员的交付都保留在上面的任务里。');
      m.final = f.text;
    }
    m.text = m.final; m.status = 'done';
  } catch (e) {
    for (const t of m.tasks) if (t.status === 'running' || t.status === 'asking') { t.status = 'pending'; delete t.live; }
    if (e instanceof CollabStop) m.status = 'stopped';
    else if (e instanceof CollabBudget) { m.status = 'error'; m.overBudget = true; m.errorText = `已达到这次协作的用量上限（${(m.budget / 10000).toFixed(0)} 万 tokens），已自动暂停。点「继续执行」会再追加一份额度；上限可以在群设置里改。`; }
    else { m.status = 'error'; m.errorText = String(e.message || e); }
  } finally {
    collabRuns.delete(m.id);
    m.secs = (m.secs || 0) + Math.round((Date.now() - t0) / 1000);
    chat.updated = Date.now(); save(); renderList(); renderCollab(chat, m, true);
  }
}

// ---------------- rendering ----------------
function renderCollab(chat, m, now) {
  const doIt = () => {
    collabTimers.delete(m.id);
    if (!(view === 'chats' && activeChatId === chat.id)) return;
    const el = document.querySelector(`[data-mid="${m.id}"]`);
    if (!el) return renderMessagesIfActive(chat);
    const box = $('#messages');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    const open = new Set([...el.querySelectorAll('details[open][data-key]')].map((d) => d.dataset.key));
    const sup = el.querySelector('.cb-sup'); const supVal = sup?.value || ''; const supFocus = sup && document.activeElement === sup;
    el.outerHTML = collabHTML(chat, m, open);
    const nsup = document.querySelector(`[data-mid="${m.id}"] .cb-sup`);
    if (nsup && supVal) nsup.value = supVal;
    if (nsup && supFocus) nsup.focus();
    if (atBottom) box.scrollTop = box.scrollHeight;
  };
  if (now) { clearTimeout(collabTimers.get(m.id)); doIt(); }
  else if (!collabTimers.has(m.id)) collabTimers.set(m.id, setTimeout(doIt, 350));
}

function taskHTML(chat, m, t, open) {
  const a = agentById(t.assigneeId);
  const st = { pending: '等待中', running: '进行中', asking: '在问主管', done: '已交付', error: '失败' }[t.status] || t.status;
  const brief = [['目标', t.goal], ['背景', t.background], ['输入材料', t.inputs], ['已经确定的事', t.known], ['要交付什么', t.deliverable], ['合格标准', t.acceptance], ['不要做', t.donts]].filter((r) => r[1]);
  const imgs = (t.files || []).filter((f) => f.img), files = t.files || [];
  const key = 't-' + t.id;
  const tail = t.live ? t.live.replace(/\s+/g, ' ').slice(-70) : t.log?.length && t.status === 'running' ? t.log[t.log.length - 1].text.slice(0, 70) : '';
  return `<details class="cb-task st-${t.status}" data-key="${key}" ${open.has(key) ? 'open' : ''}>
    <summary>${avatarHTML(a, 'sm')}<span class="cb-tt"><span><b>${t.id}</b> ${esc(t.title)}</span><span class="cb-who">${esc(a?.name || '?')}${t.execute ? ' · 🛠 动手' : ''}${t.redo ? ' · 重做第 ' + t.redo + ' 次' : ''}${t.depends_on?.length ? ' · 依赖 ' + t.depends_on.join('、') : ''}${fmtUsage(t.usage) ? ' · ' + fmtUsage(t.usage) : ''}</span>
      ${tail ? `<span class="cb-live">${esc(tail)}</span>` : ''}</span><span class="badge b-${t.status}">${st}</span></summary>
    <div class="cb-body">
      ${t.warn ? `<div class="cb-warn">⚠ ${esc(t.warn)}</div>` : ''}
      ${brief.length ? '<div class="cb-sec">任务单</div>' : ''}<table class="cb-brief">${brief.map((r) => `<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>
      ${t.question ? `<div class="cb-sec">开工前的反问</div><div class="cb-qa"><b>${esc(a?.name || '')}：</b>${esc(t.question)}<br><b>主管：</b>${t.answer ? esc(t.answer) : '回答中…'}</div>` : ''}
      ${t.feedback ? `<div class="cb-sec">主管的打回意见</div><div class="cb-qa">${esc(t.feedback)}</div>` : ''}
      ${t.understanding ? `<div class="cb-sec">它的理解</div><div class="cb-note">${esc(t.understanding)}</div>` : ''}
      ${t.assumptions && t.assumptions !== '无' ? `<div class="cb-sec">假设与不确定</div><div class="cb-note warn">${esc(t.assumptions)}</div>` : ''}
      ${t.status === 'error' ? `<div class="bubble err">${esc(t.error)}</div>` : ''}
      ${t.output ? `<div class="cb-sec">${t.kind ? '内容' : '完整交付'}${t.model ? ` <span class="cb-who">${esc(t.model)}</span>` : ''}</div><div class="cb-out">${md(t.output)}</div>` : t.live ? `<div class="cb-sec">正在写…</div><div class="cb-out">${md(t.live)}</div>` : ''}
      ${imgs.length ? `<div class="wc-imgs">${imgs.map((f) => `<img src="${f.img}" title="${esc(f.rel)}" data-wopen="${esc(f.path)}">`).join('')}</div>` : ''}
      ${files.length ? `<div class="wc-files">${files.map((f) => `<div><span class="fname" data-wopen="${esc(f.path)}">📄 ${esc(f.rel || f.path)}</span><span class="link" data-wreveal="${esc(f.path)}">在文件夹中显示</span></div>`).join('')}</div>` : ''}
      ${t.log?.length ? `<details data-key="${key}-log" ${open.has(key + '-log') ? 'open' : ''}><summary>执行过程（${t.log.length} 条）</summary><div class="wc-log">${t.log.map((e) => `<div class="l-${e.kind}">${esc(e.text)}${e.detail ? `<pre>${esc(e.detail)}</pre>` : ''}</div>`).join('')}</div></details>` : ''}
      ${t.reasoning ? `<details data-key="${key}-think" ${open.has(key + '-think') ? 'open' : ''}><summary>💭 思考过程</summary><div class="think-body">${esc(t.reasoning)}</div></details>` : ''}
    </div></details>`;
}

function collabHTML(chat, m, open = new Set()) {
  const lead = agentById(m.from);
  const st = { planning: '⏳ 主管在拆任务', ask: '❓ 主管有问题要问你', planned: '📋 等你确认计划', running: '⏳ 成员执行中', reviewing: '🔍 主管对照原话验收', writing: '✍️ 主管汇总中', done: '✅ 完成', error: '❌ 出错', stopped: '⏹ 已停止', cancelled: '已取消' }[m.status] || m.status;
  const active = COLLAB_ACTIVE.includes(m.status);
  const tasks = m.tasks || [];
  const doneN = tasks.filter((t) => t.status === 'done').length;
  const execN = tasks.filter((t) => t.execute && workReady(agentById(t.assigneeId))).length;
  let foot = '';
  const supBox = (ph, label) => `<div class="cb-suprow"><input class="cb-sup" placeholder="${ph}"><button class="btn" data-cact="replan">${label}</button></div>`;
  if (m.status === 'planned') foot = `<div class="row-actions"><button class="btn primary" data-cact="go">✅ 按这个计划开始</button><button class="btn" data-cact="cancel">取消</button><span class="desc" style="margin:0;font-size:12px">也可以直接回复「确认」或「取消」${execN ? ` · 其中 ${execN} 个任务会在你电脑的工作文件夹里实际执行` : ''}</span></div>${supBox('主管理解得不对？在这里补充说明', '补充并重新规划')}`;
  else if (m.status === 'ask') foot = `${supBox('在这里回答主管的问题', '回答并重新规划')}<div class="row-actions" style="margin-top:8px"><button class="btn" data-cact="go">不回答，按现在的计划开始</button><button class="btn" data-cact="cancel">取消</button></div>`;
  else if (m.status === 'error' || m.status === 'stopped') foot = `<div class="row-actions">${tasks.length ? '<button class="btn primary" data-cact="go">继续执行（已完成的不重做）</button>' : ''}<button class="btn" data-cact="replan">${m.mode === 'verify' ? '全部重来' : '重新规划'}</button></div>`;
  return `<div class="collab" data-mid="${m.id}">
    <div class="cb-head">${avatarHTML(lead, 'sm')}<span><b>${m.mode === 'verify' ? '🔍 互相核对' : '🤝 协作任务'}</b><span class="cb-who">${m.mode === 'verify' ? '核对人' : '主管'}：${esc(lead?.name || '?')}${tasks.length ? ` · ${doneN}/${tasks.length} ${m.mode === 'verify' ? '步完成' : '个任务已交付'}` : ''}${m.secs ? ` · ${m.secs} 秒` : ''}${fmtUsage(m.usage) ? ' · ' + fmtUsage(m.usage) : ''}</span></span>
      <span class="badge">${m.mode === 'verify' && m.status === 'running' ? '⏳ ' + (m.phase || '进行中') : m.mode === 'verify' && m.status === 'writing' ? '✍️ 核对人给结论中' : st}</span>${active ? '<button class="btn danger" data-cact="stop" style="padding:2px 10px">停止</button>' : ''}</div>
    <div class="cb-sec">你的原话</div><div class="cb-req">${esc(m.request)}${m.attachments?.length ? `<div class="cb-who" style="margin:4px 0 0">📎 ${esc(m.attachments.map((a) => a.name).join('、'))}</div>` : ''}${(m.supplements || []).map((x) => `<div class="cb-supp">补充：${esc(x)}</div>`).join('')}</div>
    ${m.understanding ? `<div class="cb-sec">主管的理解</div><div class="cb-note">${esc(m.understanding)}</div>` : ''}
    ${m.reasoning ? `<details data-key="lead-think" ${open.has('lead-think') ? 'open' : ''}><summary>💭 主管的思考过程</summary><div class="think-body">${esc(m.reasoning)}</div></details>` : ''}
    ${m.questions?.length && m.status === 'ask' ? `<div class="cb-sec">主管想先问你</div><ol class="cb-qs">${m.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>` : ''}
    ${tasks.length ? `<div class="cb-sec">${m.mode === 'verify' ? '各成员的回答和交叉检查' : '任务板'}</div>${tasks.map((t) => taskHTML(chat, m, t, open)).join('')}` : ''}
    ${m.checklist?.length ? `<details data-key="check" ${open.has('check') || m.checklist.some((c) => !c.met) ? 'open' : ''}><summary>对照原话验收（${m.checklist.filter((c) => c.met).length}/${m.checklist.length} 条满足）</summary><div class="cb-check">${m.checklist.map((c) => `<div class="${c.met ? 'ok' : 'no'}">${c.met ? '✓' : '✗'} ${esc(c.requirement)}${c.note ? `<span>${esc(c.note)}</span>` : ''}</div>`).join('')}</div></details>` : ''}
    ${m.errorText ? `<div class="bubble err" style="margin-top:8px">${esc(m.errorText)}</div>` : ''}
    ${m.final ? `<div class="cb-sec">最终结果</div><div class="cb-final">${md(m.final, chatMembers(chat))}</div>${m.status === 'done' ? '<div class="tools" style="display:flex"><span data-cact="copy">复制结果</span><span data-cact="export">导出为文件</span><span data-cact="archive">把结论记入项目档案</span>' + (m.mode === 'verify' ? '' : '<span data-cact="tpl">把这次分工存为模板</span>') + '</div>' : ''}` : ''}
    ${foot}
  </div>`;
}

function collabAction(chat, m, act, el) {
  if (m.mode === 'verify' && (act === 'go' || act === 'replan')) { if (act === 'replan') m.tasks = []; if (['error', 'stopped'].includes(m.status)) verifyExecute(chat, m); }
  else if (act === 'go') { if (['planned', 'ask', 'error', 'stopped'].includes(m.status) && m.tasks.length) collabExecute(chat, m); }
  else if (act === 'cancel') { m.status = 'cancelled'; save(); renderCollab(chat, m, true); }
  else if (act === 'stop') stopCollabIn(chat);
  else if (act === 'copy') { navigator.clipboard.writeText(m.final || ''); toast('已复制'); }
  else if (act === 'export') exportCollab(chat, m);
  else if (act === 'archive') archiveFromCollab(chat, m);
  else if (act === 'tpl') saveTemplateModal(chat, m);
  else if (act === 'replan') {
    const v = el.closest('.collab').querySelector('.cb-sup')?.value.trim();
    if ((m.status === 'planned' || m.status === 'ask') && !v) return toast('先写上要补充的内容');
    if (v) m.supplements.push(v);
    collabPlan(chat, m);
  }
}

// contact editor card
function roleCardHTML(a) {
  const c = a.card || {};
  return `<div class="card" id="role-card"><h3>🪪 特长卡 <span class="badge">协作时主管靠它来派活</span></h3>
    <div class="grid2">
      <div class="field"><label>团队里的定位</label><select id="k-role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${(c.role || '') === k ? 'selected' : ''}>${v.name} — ${v.hint}</option>`).join('')}</select></div>
      <div class="grid2"><div class="field"><label>速度</label><select id="k-speed"><option value="">未填</option>${Object.entries(SPEEDS).map(([k, v]) => `<option value="${k}" ${c.speed === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>价格</label><select id="k-cost"><option value="">未填</option>${Object.entries(COSTS).map(([k, v]) => `<option value="${k}" ${c.cost === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
    </div>
    <div class="field"><label>特长（写给主管看：它擅长什么、不擅长什么）</label><textarea id="k-strengths" rows="2" style="min-height:54px" placeholder="例如：中文写作流畅，适合成稿和润色；数学推导容易出错">${esc(c.strengths || '')}</textarea></div>
  </div>`;
}
