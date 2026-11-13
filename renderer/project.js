/* ClawChat — 项目：一条流水线、一个共享文件夹、每个环节有负责人和审查人，你在关键处把关 */
'use strict';

const PROJ_TEMPLATE = [
  { key: 'data', folder: '01_数据处理', title: '数据处理', needsExec: true, approval: false, output: '',
    task: '把原始数据处理成后面要用的指标表。\n- 输入：见「项目说明.md」里列出的资料\n- 产出：放在 01_数据处理/ 下，至少一份数据表（CSV）\n- 合格标准：数字可以复现；如果资料里有参考结果，要和参考结果逐项比对并报告差异' },
  { key: 'plot', folder: '02_绘图', title: '绘图', needsExec: true, approval: false, output: '',
    task: '根据 01_数据处理/ 的数据表画图。\n- 产出：图片（PNG，300 dpi）放在 02_绘图/ 下，并写一份「图表说明.md」，逐张说明图里画的是什么、数据来自哪个文件的哪几列\n- 合格标准：坐标轴有名称和单位，图例清楚，图里的数字和数据表一致' },
  { key: 'analysis', folder: '03_结果分析', title: '结果分析', needsExec: false, approval: true, output: '结果分析.md',
    task: '根据数据表和图写结果分析。\n- 产出：03_结果分析/结果分析.md\n- 合格标准：每个结论都指明依据的是哪个数据或哪张图；区分"数据直接显示的"和"推测的"；不夸大' },
];
const PROJ_STATUS = { pending: '未开始', running: '负责人在做', review: '审查中', revising: '按意见修改中', waiting: '等你确认', done: '已完成', error: '出错', stopped: '已停止' };
const PROJ_MAX_ROUNDS = 2;

let projSel = { pid: null, sid: null };
const projRuns = new Map(); // projectId -> run
const projTimers = new Map();

const projById = (id) => (S.projects || []).find((p) => p.id === id);
const stageOf = (p, sid) => p.stages.find((s) => s.id === sid);
const isDoer = (a) => isWorkerAgent(a);
const agentName = (id) => agentById(id)?.name || '（未指定）';
function pact(p, who, text) { p.activity = p.activity || []; p.activity.unshift({ ts: Date.now(), who, text }); p.activity.length = Math.min(p.activity.length, 200); }

// ---------------- files the agents share ----------------
function planMd(p) {
  return `# 计划（由 ClawChat 自动更新，请不要手改）\n\n项目：${p.name}\n主管：${agentName(p.leadId)}\n更新时间：${new Date().toLocaleString('zh-CN')}\n\n| 顺序 | 环节 | 文件夹 | 负责人 | 审查人 | 状态 |\n|---|---|---|---|---|---|\n` +
    p.stages.map((s, i) => `| ${i + 1} | ${s.title} | ${s.folder}/ | ${agentName(s.ownerId)} | ${agentName(s.reviewerId)} | ${PROJ_STATUS[s.status]}${s.round ? `（已修改 ${s.round} 轮）` : ''} |`).join('\n') +
    `\n\n约定：\n- 每个环节只改自己的文件夹，读别人的文件夹但不要改。\n- 每个环节做完都要写「交接.md」：做了什么、产出文件、怎么验证的、假设与没把握的地方、给下一环节的提醒。\n- 审查意见写在各环节的「审查.md」里。\n`;
}
async function syncPlan(p) { await window.claw.proj.write(p.dir, '计划.md', planMd(p)); }
async function readBrief(p) { return (await window.claw.proj.read(p.dir, '项目说明.md', 20000)) || ''; }

// ---------------- running agents ----------------
function projWorkJob(run, a, { dir, prompt, level, sessionId, rawLog, attachments, onLog }) {
  return new Promise((resolve) => {
    const prov = providerById(a.providerId) || providerById(S.defaultProviderId) || S.providers[0];
    const jobId = uid('j');
    collabJobs.set(jobId, (ev) => {
      if (ev.type === 'log') onLog?.(ev.entry);
      if (ev.type === 'done') {
        collabJobs.delete(jobId); run.jobIds.delete(jobId);
        resolve({ text: (ev.text || '').trim(), error: ev.error, aborted: ev.stopped, secs: ev.secs, sessionId: ev.sessionId, usage: mkUsage(a, ev.usage, prompt, ev.text) });
      }
    });
    run.jobIds.add(jobId);
    window.claw.work.start({ jobId, kind: prov.kind, command: prov.command, effort: a.work?.effort || 'medium', model: a.model || prov.model, dir, level, sessionId, rawLog,
      network: !!a.work?.network, extraDirs: [], attachments: (attachments || []).map(({ name, path, size, kind }) => ({ name, path, size, kind })), prompt });
  });
}

function stageContextNote(p, st) {
  const i = p.stages.indexOf(st);
  const prev = p.stages.slice(0, i);
  return `项目文件夹（你现在就在这里）：${p.dir}
你是「${agentName(st.ownerId)}」，负责第 ${i + 1} 个环节「${st.title}」，你的文件夹是 ${st.folder}/ 。
${prev.length ? '前面的环节：' + prev.map((s) => `${s.title}（${s.folder}/，负责人 ${agentName(s.ownerId)}）`).join('；') + '。' : '你是第一个环节。'}
${p.stages[i + 1] ? `你做完之后交给：${p.stages[i + 1].title}（负责人 ${agentName(p.stages[i + 1].ownerId)}）。` : '你是最后一个环节。'}`;
}
const HANDOFF_FMT = `## 讲给你听\n（写给项目负责人本人看，不是给下一个 AI。用大白话讲：这一步在整个研究里是干什么的；做了什么；为什么这么做、而不是别的做法；结果说明了什么、不能说明什么；最可能在哪里出错。用到的专业概念各用一句话解释。关键数字最多三五个，不要堆表格）\n## 做了什么\n## 产出文件\n（逐个列出文件名和里面是什么）\n## 怎么验证的\n## 关键决策\n（这一步里需要说明理由的选择：参数、阈值、方法、口径、取舍。每条写三行：决策 / 理由 / 依据（文件名、文献或用户原话；没有依据就写"属于判断"）。没有就写"无"）\n## 假设与没把握的地方\n## 给下一环节的提醒`;

function ownerPromptDoer(p, st, feedback) {
  const i = p.stages.indexOf(st);
  if (feedback) return `你之前完成了这个项目的「${st.title}」环节。现在收到了修改意见，请照着改。

修改意见：
${feedback}

要求：
- 直接修改 ${st.folder}/ 里的产出；需要重新计算或重新画图就实际去做。
- 改完后更新 ${st.folder}/交接.md，在「做了什么」里写明这一轮改了哪些地方。
- 如果你认为某条意见不对，不要硬改，在交接.md 里写明理由。
- 最后用几句中文说明改了什么。`;
  return `${stageContextNote(p, st)}

开工前先读这些文件：
1. 项目说明.md —— 项目目标、资料在哪、验收标准、用户的补充
2. 计划.md —— 整条流水线和分工
3. ${st.folder}/任务.md —— 你这一环节的具体任务
${p.stages.slice(0, i).map((s, k) => `${k + 4}. ${s.folder}/交接.md 以及它列出的产出文件 —— 上游给你的东西，直接读原文件，不要凭印象`).join('\n')}

要求：
- 实际动手完成任务：需要算就写脚本去算，需要画就真的画出来。脚本也保存在 ${st.folder}/ 里，方便别人复现。
- 产出只放在 ${st.folder}/ 里。可以读其他文件夹和项目外的原始资料，但不要修改它们。
- 临时文件（缓存、浏览器配置目录、中间文件等）放到系统临时目录，不要留在项目文件夹里；用完能删就删。
- 发现上游的产出有问题，不要自己悄悄修正，写进交接.md 的「假设与没把握的地方」。
- 完成后写 ${st.folder}/交接.md，必须包含这几节：
${HANDOFF_FMT}
- 最后用几句中文说明完成情况。`;
}

async function inlineInputs(p, st, { forReview } = {}) {
  const i = p.stages.indexOf(st);
  // this stage's own folder first (when reviewing), then upstream folders newest first, so the budget
  // never runs out before the thing actually under review. Upstream scripts are listed but not pasted.
  const stages = (forReview ? p.stages.slice(0, i + 1) : p.stages.slice(0, i)).reverse();
  const TEXT = /\.(md|txt|csv|tsv|json|py|m|r|jl|svg|log)$/i, DATA = /\.(md|txt|csv|tsv|json)$/i;
  let text = '', atts = [], budget = 90000;
  for (const s of stages) {
    const own = s === st;
    const files = await window.claw.proj.files(p.dir, s.folder);
    text += `\n\n################ 环节「${s.title}」的文件夹 ${s.folder}/ ${own ? '（就是你要审查的这个环节）' : ''}################\n文件清单：${files.map((f) => `${f.rel}（${f.size} 字节）`).join('、') || '（空）'}`;
    const rank = (f) => (/交接\.md$/.test(f.rel) ? 0 : f.rel === st.output ? 1 : DATA.test(f.rel) ? 2 : 3);
    for (const f of [...files].sort((a, b) => rank(a) - rank(b))) {
      if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(f.rel)) { if (atts.length < 8) atts.push({ name: f.rel, path: f.path, size: f.size, kind: 'image' }); continue; }
      if (!(own ? TEXT : DATA).test(f.rel) || f.rel === '任务.md' && !own) continue;
      if (/\.svg$/i.test(f.rel) && f.size > 40000) { text += `\n\n[${f.rel} 是 ${f.size} 字节的矢量图，太大没有贴出，看对应的 png 预览]`; continue; }
      if (budget <= 0) { text += `\n\n[${f.rel} 没有贴出：内容太多了]`; continue; }
      const body = await window.claw.proj.read(p.dir, s.folder + '/' + f.rel, Math.min(own ? 40000 : 20000, budget));
      if (body == null) continue;
      budget -= body.length;
      text += `\n\n======== ${s.folder}/${f.rel} ========\n${body}`;
    }
  }
  return { text, atts };
}

async function runOwner(p, st, run, feedback) {
  const a = agentById(st.ownerId);
  if (!a) throw new Error(`「${st.title}」还没有指定负责人`);
  if (st.needsExec && !isDoer(a)) throw new Error(`「${st.title}」需要能动手的成员（Codex 或 Claude Code），「${a.name}」只能聊天。请换一个负责人。`);
  st.usage = st.usage || {}; p.usage = p.usage || {};
  let finalText = '';
  if (isDoer(a)) {
    const skb = await skillBlock(p, st, { doer: true });
    const job = (sessionId) => projWorkJob(run, a, { dir: p.dir, level: a.work?.level === 'full' ? 'full' : 'write', sessionId, prompt: ownerPromptDoer(p, st, sessionId ? feedback : null) + skb + (feedback && !sessionId ? `\n\n（注意：这是在修改已有的产出。修改意见如下，请先读 ${st.folder}/ 里现有的文件再改。）\n${feedback}` : ''),
      rawLog: `${p.dir}/.clawchat/logs/${st.folder}_负责人.log`, onLog: (e) => { st.log.push(e); if (st.log.length > 400) st.log.shift(); renderProjectSoon(p); } });
    let r = await job(feedback ? st.sessionId : null);
    if (r.error && feedback && st.sessionId && !r.aborted && !run.stop) { st.log.push({ kind: 'warn', text: '接不上之前的会话，改为新开一个会话来修改' }); st.sessionId = null; r = await job(null); }
    addUsage(st.usage, r.usage); addUsage(p.usage, r.usage);
    if (run.stop) throw new CollabStop();
    if (r.error) throw new Error(`${a.name} 执行失败：${r.error}`);
    st.sessionId = r.sessionId || st.sessionId; finalText = r.text;
    let handoff = await window.claw.proj.read(p.dir, st.folder + '/交接.md', 30000);
    if (!handoff || !handoff.trim()) { handoff = `（${a.name} 没有写交接.md，下面是它最后的汇报）\n\n${finalText}`; await window.claw.proj.write(p.dir, st.folder + '/交接.md', handoff); st.log.push({ kind: 'warn', text: '它没有写交接.md，已用它的汇报代替' }); }
  } else {
    const brief = await readBrief(p);
    const inp = await inlineInputs(p, st);
    const prevOut = feedback ? await window.claw.proj.read(p.dir, st.folder + '/' + st.output, 40000) : null;
    const sys = `你是「${a.name}」。${a.persona || ''}\n\n你在一个科研项目的流水线里工作，负责「${st.title}」环节。你不能直接读写文件：需要的文件内容会贴给你，你的产出由系统保存成文件。` + await skillBlock(p, st);
    const user = `${stageContextNote(p, st)}

======== 项目说明.md ========
${brief}

======== ${st.folder}/任务.md ========
${st.task}
${inp.text}
${feedback ? `\n\n################ 你上一版的产出（${st.output}）################\n${prevOut || '（读不到）'}\n\n################ 修改意见 ################\n${feedback}\n\n请照意见修改，输出完整的新版本。如果认为某条意见不对，不要硬改，在交接里写明理由。` : ''}

请按下面的格式输出，两条分隔线必须原样保留：
=====产出=====
（${st.output} 的完整内容，Markdown）
=====交接=====
${HANDOFF_FMT}`;
    st.live = '';
    const r = await callAgent(a, sys, user, { run, acct: [st.usage, p.usage], attachments: inp.atts, temperature: Math.min(a.temperature ?? 0.5, 0.6), onText: (x) => { st.live = x; renderProjectSoon(p); }, onReasoning: (x) => { st.reasoning = x; } , onRetry: (n, err) => { st.log.push({ kind: 'warn', text: `${a.name} 连接断了（${String(err).slice(0, 60)}），第 ${n} 次重试` }); renderProjectSoon(p); } });
    delete st.live;
    if (run.stop) throw new CollabStop();
    if (r.error || !r.text) throw new Error(`${a.name} 出错：${r.error || '没有返回内容'}`);
    const parts = r.text.split(/^=====\s*交接\s*=====\s*$/m);
    const out = parts[0].replace(/^[\s\S]*?=====\s*产出\s*=====\s*/m, '').trim() || r.text.trim();
    await window.claw.proj.write(p.dir, st.folder + '/' + st.output, out + '\n');
    await window.claw.proj.write(p.dir, st.folder + '/交接.md', (parts[1] || `## 做了什么\n写了 ${st.output}。\n（${a.name} 没有按格式写交接）`).trim() + '\n');
    finalText = `已写好 ${st.output}`;
  }
  st.handoff = await window.claw.proj.read(p.dir, st.folder + '/交接.md', 30000);
  st.files = await window.claw.proj.files(p.dir, st.folder);
  await recordDecisions(p, st).catch(() => {});
  return finalText;
}

// Objective check: compare a produced CSV with a reference result the user already trusts.
async function runCheck(p, st) {
  if (!st.refFile?.trim()) { st.check = null; return null; }
  const ref = st.refFile.trim().replace(/^["']|["']$/g, '');
  const name = (st.refOut || '').trim() || ref.split(/[\\/]/).pop();
  const files = await window.claw.proj.files(p.dir, st.folder);
  const hit = files.find((f) => f.rel.replace(/\\/g, '/') === name.replace(/\\/g, '/')) || files.find((f) => f.rel.split(/[\\/]/).pop() === name.split(/[\\/]/).pop());
  let ck;
  if (!(await window.claw.proj.exists(ref))) ck = { ok: false, error: `找不到参考文件：${ref}`, problems: [] };
  else if (!hit) ck = { ok: false, error: `在 ${st.folder}/ 里找不到要比对的产出文件「${name}」`, problems: [] };
  else { ck = await window.claw.proj.compareCsv(ref, hit.path, +st.refTol || 1e-9); ck.out = hit.rel; }
  ck.ref = ref; ck.ts = Date.now();
  st.check = ck;
  const body = ck.error ? `没有比成：${ck.error}` : ck.ok
    ? `全部一致：比对了 ${ck.compared} 个单元格，最大相对差 ${ck.maxRel.toExponential(2)}（容差 ${ck.rtol}）。`
    : `不一致，共 ${ck.problems.length} 处（比对了 ${ck.compared} 个单元格，容差 ${ck.rtol}）：\n${ck.problems.map((x) => '- ' + x).join('\n')}`;
  await window.claw.proj.write(p.dir, st.folder + '/比对结果.md', `# 和参考结果的自动比对（${new Date().toLocaleString('zh-CN')}）\n\n- 参考文件：${ref}\n- 产出文件：${ck.out ? st.folder + '/' + ck.out : '（没找到）'}\n- 结论：${ck.ok ? '一致' : '不一致'}\n\n${body}\n\n这份比对由程序逐格计算得出，不是模型的判断。\n`);
  return ck;
}
function checkFeedback(st) {
  const ck = st.check;
  return `结论：需要修改\n\n## 检查了什么\n程序把 ${st.folder}/${ck.out || '（产出文件）'} 和参考结果 ${ck.ref} 逐格比对（数值容差 ${ck.rtol || st.refTol || 1e-9}）。\n\n## 问题\n${ck.error ? '1. ' + ck.error : ck.problems.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n请找出原因并修正计算（不要为了通过而直接照抄参考文件里的数字）。参考结果只用来核对，产出必须由原始数据算出来。`;
}

const REVIEW_RULES = `审查要求：
- 对照「任务.md」的合格标准和「项目说明.md」的验收标准，逐条检查。
- 核对交接.md 里说的和实际文件是否一致；抽查关键数字能否从上游数据得到。
- 只指出真正影响结果正确性或可用性的问题，不要挑措辞和风格。
- 回复的第一行必须是「结论：通过」「结论：需要修改」「结论：无法核实」三者之一。
- 「需要修改」只用于你确实发现了错误或缺漏。你自己看不到、读不了的东西（例如图片看不见、原始数据没贴出来），不算负责人的错，不要据此要求修改；如果正是这些东西决定了能不能通过，就写「结论：无法核实」，并说明需要谁、用什么方式去核实。
- 之后分两节写：「## 检查了什么」（你实际核对的内容和结果）和「## 问题」（编号列出；每条写明在哪个文件、哪里不对、应该怎么改；没有就写"无"）。`;

async function runReviewer(p, st, run) {
  const a = agentById(st.reviewerId);
  if (!a) return { pass: true, text: '结论：通过\n\n（没有指定审查人，跳过审查）', skipped: true };
  st.usage = st.usage || {}; p.usage = p.usage || {};
  let text;
  if (isDoer(a)) {
    const prompt = `项目文件夹（你现在就在这里）：${p.dir}
你是「${a.name}」，这个项目里「${st.title}」环节的审查人。负责人是「${agentName(st.ownerId)}」。你的任务是独立检查它的产出，不是替它重做。

先读：项目说明.md、${st.folder}/任务.md、${st.folder}/交接.md，以及 ${st.folder}/ 里的产出文件和它用到的上游文件。${st.check?.ok ? `\n程序已经把产出和参考结果逐格比对过，结果在 ${st.folder}/比对结果.md（一致）。数值是否等于参考结果不用你再查，你重点看：方法是否合理、是不是真的从原始数据算出来的（而不是照抄参考文件）、交接写得是否属实。` : ''}
你处于只读模式：可以读文件、可以运行不写文件的命令来核对数字（例如用 Python 读 CSV 重新算一遍），但不能修改任何文件。

${REVIEW_RULES}${await skillBlock(p, st, { doer: true, reviewer: true })}`;
    const r = await projWorkJob(run, a, { dir: p.dir, level: 'read', prompt, rawLog: `${p.dir}/.clawchat/logs/${st.folder}_审查人.log`, onLog: (e) => { st.log.push({ ...e, text: '[审查] ' + e.text }); if (st.log.length > 400) st.log.shift(); renderProjectSoon(p); } });
    addUsage(st.usage, r.usage); addUsage(p.usage, r.usage);
    if (run.stop) throw new CollabStop();
    if (r.error || !r.text) throw new Error(`审查人 ${a.name} 执行失败：${r.error || '没有返回内容'}`);
    text = r.text;
  } else {
    const brief = await readBrief(p);
    const inp = await inlineInputs(p, st, { forReview: true });
    const sys = `你是「${a.name}」。${a.persona || ''}\n\n你在一个科研项目里担任「${st.title}」环节的审查人。你不能直接读文件，相关文件的内容会贴给你${inp.atts.length ? '，图片也附上了' : ''}。` + await skillBlock(p, st, { reviewer: true });
    const user = `负责人是「${agentName(st.ownerId)}」。你的任务是独立检查它的产出，不是替它重做。

======== 项目说明.md ========
${brief}
${inp.text}

${REVIEW_RULES}
- 你只能看到贴出来的内容。没法核实的地方（比如看不到的原始数据、没贴出来的大文件），要明确写"无法核实"，不要当作已通过。`;
    const r = await callAgent(a, sys, user, { run, acct: [st.usage, p.usage], attachments: inp.atts, temperature: 0.2, onRetry: (n, err) => { st.log.push({ kind: 'warn', text: `[审查] ${a.name} 连接断了（${String(err).slice(0, 60)}），第 ${n} 次重试` }); renderProjectSoon(p); } });
    if (run.stop) throw new CollabStop();
    if (r.error || !r.text) throw new Error(`审查人 ${a.name} 出错：${r.error || '没有返回内容'}`);
    text = r.text;
  }
  const head = text.slice(0, 200);
  const unsure = /结论[:：]\s*无法核实/.test(head);
  const pass = !unsure && /结论[:：]\s*通过/.test(head) && !/结论[:：]\s*需要修改/.test(head);
  return { pass, unsure, text };
}

// the owner's work is already in the folder and only the review step failed
function canRereview(st) { return ['error', 'stopped'].includes(st.status) && !!(st.delivered || (st.handoff && /^审查人/.test(st.error || ''))); }

async function runStage(p, st, { feedback, humanFeedback, reviewOnly } = {}) {
  if (projRuns.has(p.id)) return toast('这个项目正在运行，等它停下来再操作');
  const run = { stop: false, reqIds: new Set(), jobIds: new Set() };
  projRuns.set(p.id, run);
  const t0 = Date.now();
  st.log = st.log || []; st.error = '';
  try {
    await window.claw.proj.write(p.dir, st.folder + '/任务.md', `# ${st.title}：任务说明\n\n${st.task}\n`);
    if (reviewOnly) { /* keep the delivered work, only redo checking and review */ }
    else if (!feedback) { st.delivered = false; st.round = 0; st.review = null; st.check = null; st.log = []; st.sessionId = null; st.handoff = ''; }
    else if (humanFeedback) st.round = 0;
    st.stale = false; st.note = ''; st.quiz = null; st.quizSkipped = false;
    p.stages.slice(p.stages.indexOf(st) + 1).forEach((s) => { if (s.status === 'done' || s.status === 'waiting') s.stale = true; });
    let fb = feedback || null;
    if (feedback) st.lastFeedback = { feedback, humanFeedback: !!humanFeedback };
    for (;;) {
      if (reviewOnly) { reviewOnly = false; pact(p, '系统', `「${st.title}」的产出保留，只重新审查`); }
      else {
        st.status = fb ? 'revising' : 'running'; st.delivered = false;
        pact(p, agentName(st.ownerId), fb ? `开始按${humanFeedback ? '你的' : '审查'}意见修改「${st.title}」` : `开始做「${st.title}」`);
        await syncPlan(p); save(); renderProject(p);
        const said = await runOwner(p, st, run, fb);
        st.delivered = true;
        pact(p, agentName(st.ownerId), `交付了「${st.title}」：${(said || '').replace(/\s+/g, ' ').slice(0, 80)}`);
      }
      st.status = 'review'; await syncPlan(p); save(); renderProject(p);
      const ck = await runCheck(p, st);
      save(); renderProject(p);
      if (ck) pact(p, '自动比对', ck.ok ? `「${st.title}」的产出和参考结果一致（${ck.compared} 个单元格）` : `「${st.title}」的产出和参考结果不一致${ck.error ? '：' + ck.error : `，${ck.problems.length} 处`}`);
      let rv;
      if (ck && !ck.ok) rv = { pass: false, text: checkFeedback(st), auto: true };
      else rv = await runReviewer(p, st, run);
      st.review = { pass: rv.pass, text: rv.text, by: rv.auto ? '' : st.reviewerId, auto: !!rv.auto, round: st.round || 0, skipped: rv.skipped };
      const rvName = rv.auto ? '自动比对' : agentName(st.reviewerId);
      await window.claw.proj.append(p.dir, st.folder + '/审查.md', `\n\n# 第 ${(st.round || 0) + 1} 次审查（${rvName}，${new Date().toLocaleString('zh-CN')}）\n\n${rv.text}\n`);
      if (!rv.auto) pact(p, rvName, rv.skipped ? `「${st.title}」没有审查人，跳过审查` : rv.pass ? `审查通过了「${st.title}」` : rv.unsure ? `「${st.title}」有些地方核实不了，交给你判断` : `审查「${st.title}」：需要修改`);
      if (rv.pass) break;
      if (rv.unsure) { st.note = `审查人「${rvName}」有些地方核实不了（见审查意见），需要你来看一眼再决定：通过，或者写上意见打回。`; break; }
      if ((st.round || 0) >= PROJ_MAX_ROUNDS) { st.note = `审查了 ${PROJ_MAX_ROUNDS + 1} 次仍未通过，需要你来决定：通过，或者写上意见打回。`; break; }
      st.round = (st.round || 0) + 1; fb = rv.text; humanFeedback = false;
    }
    st.lastFeedback = null;
    st.files = await window.claw.proj.files(p.dir, st.folder);
    if (!st.review.pass || st.approval) { st.status = 'waiting'; if (st.review.pass) st.note = '审查已通过。这个环节需要你确认后才算完成。'; pact(p, '系统', `「${st.title}」等你确认`); }
    else { st.status = 'done'; st.note = ''; }
  } catch (e) {
    delete st.live;
    if (e instanceof CollabStop) { st.status = 'stopped'; pact(p, '你', `停止了「${st.title}」`); }
    else { st.status = 'error'; st.error = String(e.message || e); pact(p, '系统', `「${st.title}」出错：${st.error.slice(0, 100)}`); }
  } finally {
    projRuns.delete(p.id);
    st.secs = (st.secs || 0) + Math.round((Date.now() - t0) / 1000);
    await syncPlan(p).catch(() => {}); save(); renderProject(p);
  }
  return st.status;
}

async function runPipeline(p) {
  for (const st of p.stages) {
    if (st.status === 'done') continue;
    if (st.status === 'waiting') { projSel.sid = st.id; renderProject(p); toast(`「${st.title}」在等你确认`); return; }
    projSel.sid = st.id;
    const s = await runStage(p, st, { reviewOnly: canRereview(st) });
    if (s !== 'done') return;
  }
  pact(p, '系统', '所有环节都完成了'); save(); renderProject(p);
}
function stopProject(p) {
  const run = projRuns.get(p.id); if (!run) return;
  run.stop = true;
  for (const id of run.reqIds) window.claw.abort(id);
  for (const id of run.jobIds) window.claw.work.stop(id);
}

// ---------------- the lead drafts the project files ----------------
async function draftProject(p) {
  const lead = agentById(p.leadId);
  const run = { stop: false, reqIds: new Set(), jobIds: new Set() };
  projRuns.set(p.id, run);
  p.status = 'drafting'; p.error = ''; save(); renderProject(p);
  try {
    const scan = await window.claw.proj.scan(p.inputs.split('\n').map((x) => x.trim()).filter(Boolean));
    p.scan = scan.map((s) => ({ path: s.path, exists: s.exists }));
    const scanText = scan.map((s) => `### ${s.path}\n${s.exists ? '' : '（这个路径不存在或读不了）\n'}${s.tree.length ? '文件：\n' + s.tree.join('\n') : ''}${s.readme ? '\n\n其中的说明文件内容：\n' + s.readme : ''}`).join('\n\n') || '（用户没有给资料位置）';
    const doers = S.agents.filter(isDoer);
    const user = `【用户想做成什么（原话）】
${p.goal}
${p.answers?.length ? '\n【用户对你之前问题的回答（原话）】\n' + p.answers.map((x, i) => `${i + 1}. ${x}`).join('\n') + '\n' : ''}
【用户给的资料位置，以及我替你看到的内容】
${scanText}

【团队成员】
${S.agents.map((a) => rosterLine(a).replace('【可执行：能在用户电脑的工作文件夹里运行程序、读写文件】', '【能动手：可以在项目文件夹里运行程序、读写文件】')).join('\n')}

【流水线（固定三个环节）】
1. 数据处理（文件夹 01_数据处理/）——必须由【能动手】的成员负责
2. 绘图（文件夹 02_绘图/）——必须由【能动手】的成员负责
3. 结果分析（文件夹 03_结果分析/，产出 结果分析.md）——任何成员都可以

请写出项目文件。用下面的分隔线分成 6 段，分隔线必须原样输出。只写用户说过的或资料里有的内容，不要编造数据、路径或结论。

=====项目说明=====
用 Markdown 写，包含这几节：## 目标、## 已有的资料（逐个列出完整路径和它是什么）、## 要交付什么、## 验收标准（尽量可检查，资料里有参考结果的话写明怎么比对）、## 约束和注意事项、## 需要用户确认的问题（没有就写"无"）
=====01_数据处理=====
这个环节的任务说明：做什么、输入是哪些文件（写完整路径）、产出哪些文件、怎样算合格。负责人只会读到项目说明和这份任务说明，所以要写完整。
=====02_绘图=====
同上。要具体到画哪几张图、每张图的横纵轴是什么。
=====03_结果分析=====
同上。要具体到分析需要回答哪几个问题。
=====参考结果=====
如果资料里有用户已经确认过的参考结果（例如一份期望的指标表 CSV），而某个环节的产出应该和它一致，就写一行，格式严格如下；没有就只写"无"：
数据处理｜参考文件：完整路径｜产出文件名：这个环节应该产出的同类文件的文件名
=====分工=====
三行，格式严格如下（名字必须是团队成员里的名字；审查人尽量不要和负责人是同一个）：
数据处理｜负责人：名字｜审查人：名字
绘图｜负责人：名字｜审查人：名字
结果分析｜负责人：名字｜审查人：名字`;
    const r = await callAgent(lead, leadSys(lead).replace('一个多模型协作团队的主管', '一个科研项目的主管'), user, { run, acct: [(p.usage = p.usage || {})], temperature: 0.3 });
    if (run.stop) throw new CollabStop();
    if (r.error || !r.text) throw new Error(r.error || '主管没有返回内容');
    const sec = (name) => { const m = r.text.match(new RegExp(`=====\\s*${name}\\s*=====\\s*([\\s\\S]*?)(?=\\n=====|$)`)); return m ? m[1].trim() : ''; };
    const brief = sec('项目说明') || `## 目标\n${p.goal}\n\n## 已有的资料\n${p.inputs}\n`;
    const pick = (line, role) => { const m = line.match(new RegExp(role + '[:：]\\s*([^｜|\\n]+)')); const nm = m ? m[1].trim().replace(/[「」]/g, '') : ''; return S.agents.find((a) => a.name === nm) || S.agents.find((a) => nm && (a.name.includes(nm) || nm.includes(a.name))); };
    const assign = sec('分工').split('\n');
    p.stages.forEach((st) => {
      const t = sec(st.folder); if (t) st.task = t;
      const line = assign.find((l) => l.includes(st.title)) || '';
      let owner = pick(line, '负责人'), reviewer = pick(line, '审查人');
      if (st.needsExec && !isDoer(owner)) owner = doers[0];
      if (!owner) owner = st.needsExec ? doers[0] : (S.agents.find((a) => !isDoer(a)) || S.agents[0]);
      if (!reviewer || reviewer.id === owner?.id) reviewer = S.agents.find((a) => a.id !== owner?.id && a.id !== p.leadId) || S.agents.find((a) => a.id !== owner?.id) || reviewer || null;
      st.ownerId = owner?.id || ''; st.reviewerId = reviewer?.id || '';
    });
    for (const line of sec('参考结果').split('\n')) {
      const st = p.stages.find((x) => line.includes(x.title)); if (!st) continue;
      const rf = (line.match(/参考文件[:：]\s*([^｜|\n]+)/) || [])[1]?.trim(), ro = (line.match(/产出文件名[:：]\s*([^｜|\n]+)/) || [])[1]?.trim();
      if (rf && !/^无$/.test(rf) && (await window.claw.proj.exists(rf))) { st.refFile = rf; st.refOut = ro || ''; }
    }
    const qs = (brief.split(/##\s*需要用户确认的问题/)[1] || '').split(/\n##\s/)[0].trim();
    p.questions = qs && !/^无[。.]?$/.test(qs) ? qs : '';
    await window.claw.proj.mkdirs(p.dir, [...p.stages.map((s) => s.folder), '.clawchat/logs']);
    await window.claw.proj.write(p.dir, '项目说明.md', `# ${p.name}\n\n> 用户的原话：${p.goal.replace(/\n/g, '\n> ')}\n\n${brief}\n`);
    for (const st of p.stages) await window.claw.proj.write(p.dir, st.folder + '/任务.md', `# ${st.title}：任务说明\n\n${st.task}\n`);
    await syncPlan(p);
    p.brief = await readBrief(p);
    p.status = 'ready';
    pact(p, agentName(p.leadId), '起草了项目说明、各环节的任务和分工');
  } catch (e) {
    p.status = 'draft-error'; p.error = e instanceof CollabStop ? '已停止' : String(e.message || e);
  } finally { projRuns.delete(p.id); save(); renderProject(p); renderList(); }
}

async function projChat(p, text, { question } = {}) {
  const lead = agentById(p.leadId);
  p.chat = p.chat || [];
  p.chat.push({ from: 'user', text, ts: Date.now() });
  // a requirement goes into the brief every stage reads; a question about the work does not
  if (!question) await window.claw.proj.append(p.dir, '项目说明.md', `\n\n## 用户补充（${new Date().toLocaleString('zh-CN')}）\n${text}\n`);
  p.brief = await readBrief(p);
  const msg = { from: lead.id, text: '', ts: Date.now(), pending: true };
  p.chat.push(msg); renderProject(p);
  const status = p.stages.map((s, i) => `${i + 1}. ${s.title}（负责人 ${agentName(s.ownerId)}，审查人 ${agentName(s.reviewerId)}）：${PROJ_STATUS[s.status]}${s.error ? '，错误：' + s.error.slice(0, 200) : ''}${s.note ? '，' + s.note : ''}\n${s.handoff ? '   交接摘要：' + s.handoff.replace(/\s+/g, ' ').slice(0, 600) : ''}${s.review ? '\n   审查：' + s.review.text.replace(/\s+/g, ' ').slice(0, 400) : ''}`).join('\n');
  const qa = question ? (await inlineInputs(p, question, { forReview: true })).text.slice(0, 40000) : '';
  const hist = p.chat.slice(-12, -1).map((m) => `${m.from === 'user' ? S.userName : agentName(m.from)}：${m.text}`).join('\n');
  const r = await callAgent(lead, leadSys(lead).replace('一个多模型协作团队的主管，负责理解用户意图、拆解任务、给成员写任务单、验收和汇总', '一个科研项目的主管，负责向用户说明进展、回答问题、记录用户的要求'),
    (question ? `======== 项目说明.md ========\n${p.brief}\n\n======== 用户在问「${question.title}」环节，相关文件如下 ========${qa}\n\n======== 你和用户最近的对话 ========\n${hist}\n\n用户没看懂这个环节的某处，请讲给他听：用大白话，先说结论再说原因，专业概念用一句话解释，必要时指出看哪个文件的哪一部分。只依据上面的文件，文件里没有的就说没有，不要编。300 字以内。` : `======== 项目说明.md（用户刚说的话已经追加在最后，后面的环节都会读到）========\n${p.brief}\n\n======== 各环节的进展 ========\n${status}\n\n======== 你和用户最近的对话 ========\n${hist}\n\n请回复用户最后一句话。要求：如实说明进展，不知道的就说不知道；用户提了新要求时，说明它会影响哪个环节、是否需要重跑（重跑要用户在界面上点，你不能自己启动）；简洁，不要客套。`),
    { acct: [(p.usage = p.usage || {})], temperature: 0.4, onText: (x) => { msg.text = x; renderProjectSoon(p); } });
  msg.pending = false; msg.text = r.error ? '（出错：' + r.error + '）' : r.text;
  pact(p, '你', (question ? '问主管：' : '给主管留言：') + text.replace(/\s+/g, ' ').slice(0, 60));
  save(); renderProject(p);
}

// ---------------- UI ----------------
function newProjectModal() {
  if (!S.agents.some(isDoer)) return toast('项目需要至少一个能动手的联系人。请先在「设置」里添加 Codex（ChatGPT 订阅）。', 6000);
  modal(`<h3>🧪 新建项目</h3>
    <div class="desc" style="margin:0 0 12px;font-size:12.5px;line-height:1.7">回答下面几件事，主管会据此起草项目说明、每个环节的任务和分工，给你过目后再开工。<br>流水线：数据处理 → 绘图 → 结果分析。</div>
    <div class="field"><label>项目名字</label><input id="np-name" maxlength="40" placeholder="例如：网格与起步方式对比"></div>
    <div class="field"><label>你想做成什么？用大白话说就行</label><textarea id="np-goal" rows="4" style="min-height:90px" placeholder="例如：我有四个算例的流场和颗粒数据，想算出各截面的指标并比较，画成图，再写一段网格无关性和起步方式影响的分析。"></textarea></div>
    <div class="field"><label>原始数据和资料在哪？（每行一个文件夹或文件的完整路径）</label><textarea id="np-inputs" rows="3" style="min-height:64px" placeholder="F:\\数据\\某次计算"></textarea>
      <div class="row-actions" style="margin-top:6px"><button class="btn" id="np-addin">📁 添加文件夹…</button></div></div>
    <div class="field"><label>项目文件夹（所有产出都放在这里；要选一个空文件夹或新建一个）</label>
      <div class="row-actions"><input id="np-dir" style="flex:1" placeholder="点右边按钮选择"><button class="btn" id="np-pick">📁 选择…</button></div></div>
    <div class="field"><label>主管（跟你对话、起草计划；选最聪明的那个）</label><select id="np-lead">${S.agents.map((a) => `<option value="${a.id}" ${a.card?.role === 'lead' ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
    <div class="foot"><span class="desc" id="np-err" style="margin:0 auto 0 0;font-size:12px;color:var(--danger)"></span><button class="btn" id="m-cancel">取消</button><button class="btn primary" id="np-ok">让主管起草计划</button></div>`,
  (m, close) => {
    $('#m-cancel', m).onclick = close;
    $('#np-pick', m).onclick = async () => { const d = await window.claw.proj.pick('选择项目文件夹'); if (d) $('#np-dir', m).value = d; };
    $('#np-addin', m).onclick = async () => { const d = await window.claw.proj.pick('选择资料所在的文件夹'); if (d) { const ta = $('#np-inputs', m); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + d; } };
    $('#np-ok', m).onclick = async () => {
      const name = $('#np-name', m).value.trim(), goal = $('#np-goal', m).value.trim(), inputs = $('#np-inputs', m).value.trim(), dir = $('#np-dir', m).value.trim().replace(/[\\/]+$/, '');
      const err = (t) => { $('#np-err', m).textContent = t; };
      if (!name) return err('起个名字'); if (!goal) return err('说说想做成什么'); if (!dir) return err('选一个项目文件夹');
      if (!(await window.claw.proj.isEmpty(dir))) return err('这个文件夹里已经有东西了。请选一个空文件夹，避免和现有文件混在一起。');
      const p = { id: uid('pj'), name, goal, inputs, dir, leadId: $('#np-lead', m).value, status: 'drafting', chat: [], activity: [], usage: {}, answers: [], ts: Date.now(),
        stages: PROJ_TEMPLATE.map((t) => ({ ...t, id: uid('st'), status: 'pending', ownerId: '', reviewerId: '', log: [], files: [], skills: defaultStageSkills(t.key) })) };
      S.projects = S.projects || []; S.projects.push(p);
      projSel = { pid: p.id, sid: p.stages[0].id };
      close(); view = 'projects'; renderAll();
      draftProject(p);
    };
  });
  document.querySelector('#modal-root .modal').style.width = '600px';
}

function renderProjectList(body) {
  const list = (S.projects || []).slice().sort((a, b) => b.ts - a.ts);
  body.innerHTML = `<div class="section-label">项目</div>` + (list.map((p) => {
    const done = p.stages.filter((s) => s.status === 'done').length;
    const cur = p.stages.find((s) => s.status !== 'done');
    return `<div class="item ${projSel.pid === p.id ? 'active' : ''}" data-proj="${p.id}"><div class="av" style="background:#e8e2f8">🧪</div><div class="meta"><div class="title"><span>${esc(p.name)}</span><span class="time">${done}/${p.stages.length}</span></div>
      <div class="sub">${p.status === 'drafting' ? '主管在起草计划…' : p.status === 'draft-error' ? '起草失败' : cur ? esc(cur.title + ' · ' + PROJ_STATUS[cur.status]) : '全部完成'}</div></div></div>`;
  }).join('') || '<div class="section-label" style="line-height:1.8">还没有项目。<br>点上面的 ＋ 新建一个。</div>');
}

function renderProjectSoon(p) { if (!projTimers.has(p.id)) projTimers.set(p.id, setTimeout(() => { projTimers.delete(p.id); renderProject(p, true); }, 400)); }

function stagePanelHTML(p, st) {
  const running = projRuns.has(p.id);
  const mine = ['running', 'review', 'revising'].includes(st.status);
  const editable = !running && ['pending', 'error', 'stopped'].includes(st.status);
  const opt = (id, filter) => S.agents.filter(filter).map((a) => `<option value="${a.id}" ${a.id === id ? 'selected' : ''}>${esc(a.name)}${isDoer(a) ? '（能动手）' : ''}</option>`).join('');
  const imgs = (st.files || []).filter((f) => f.img);
  const files = (st.files || []).filter((f) => !['任务.md'].includes(f.rel));
  let actions = '';
  if (!running) {
    if (['error', 'stopped'].includes(st.status) && st.lastFeedback) actions = `<button class="btn primary" data-pjact="refix">▶ 重试：继续按意见修改</button><button class="btn" data-pjact="reject">换一条意见</button><button class="btn" data-pjact="run">从头重做</button>`;
    else if (canRereview(st)) actions = `<button class="btn primary" data-pjact="rereview">▶ 只重新审查（产出保留）</button><button class="btn" data-pjact="reject">写意见让它修改</button><button class="btn" data-pjact="run">从头重做</button>`;
    else if (['error', 'stopped'].includes(st.status) && st.handoff) actions = `<button class="btn primary" data-pjact="reject">写意见让它修改（产出保留）</button><button class="btn" data-pjact="run">从头重做</button>`;
    else if (['pending', 'error', 'stopped'].includes(st.status)) actions = `<button class="btn primary" data-pjact="run">▶ ${st.status === 'pending' ? '开始这个环节' : '重新做这个环节'}</button>`;
    else if (st.status === 'waiting') actions = (quizOn(st) && !st.quiz?.passed ? (st.quiz ? '' : `<button class="btn primary" data-pjact="approve">✅ 通过（先答几个问题）</button>`) : `<button class="btn primary" data-pjact="approve">✅ 通过，进入下一环节</button>`) + `<button class="btn" data-pjact="reject">打回修改</button>`;
    else if (st.status === 'done') actions = `<button class="btn" data-pjact="reject">打回修改</button><button class="btn" data-pjact="run">从头重做</button>${st.quiz ? '' : '<button class="btn" data-pjact="quiz-start">🎓 考考我</button>'}`;
  } else if (mine) actions = `<button class="btn danger" data-pjact="stop">■ 停止</button>`;
  return `<div class="pj-stage" id="proj-stage">
    <div class="pj-shead"><b>${esc(st.title)}</b><span class="badge pjb-${st.status}">${PROJ_STATUS[st.status]}${st.round ? ` · 已修改 ${st.round} 轮` : ''}</span><span class="cb-who">${st.folder}/${st.secs ? ' · ' + st.secs + ' 秒' : ''}${fmtUsage(st.usage) ? ' · ' + fmtUsage(st.usage) : ''}</span></div>
    <div class="grid2" style="margin-top:8px"><div class="field"><label>负责人${st.needsExec ? '（这个环节要运行程序，只能选能动手的）' : ''}</label><select data-pjf="ownerId" ${editable ? '' : 'disabled'}>${opt(st.ownerId, st.needsExec ? isDoer : () => true)}</select></div>
      <div class="field"><label>审查人（独立检查负责人的产出）</label><select data-pjf="reviewerId" ${editable ? '' : 'disabled'}><option value="">不审查</option>${opt(st.reviewerId, () => true)}</select></div></div>
    <div class="grid2"><div class="field"><label>参考结果文件（可不填；填了就由程序逐格比对，不靠模型判断）</label><input data-pjf="refFile" value="${esc(st.refFile || '')}" placeholder="例如 F:\\…\\expected\\指标对比.csv" ${editable ? '' : 'disabled'}></div>
      <div class="field"><label>要比对的产出文件名（留空 = 和参考文件同名）</label><input data-pjf="refOut" value="${esc(st.refOut || '')}" ${editable ? '' : 'disabled'}></div></div>
    ${stageSkillsHTML(st, !running && !['running', 'review', 'revising'].includes(st.status))}
    ${st.check ? `<div class="cb-note ${st.check.ok ? 'okbox' : 'warn'}" style="margin-bottom:8px"><b>${st.check.ok ? '✅ 和参考结果一致' : '❌ 和参考结果不一致'}</b>（程序逐格比对${st.check.compared ? `，共 ${st.check.compared} 个单元格，最大相对差 ${Number(st.check.maxRel || 0).toExponential(1)}` : ''}）${st.check.error ? '\n' + esc(st.check.error) : ''}${st.check.problems?.length ? '\n' + st.check.problems.slice(0, 8).map(esc).join('\n') + (st.check.problems.length > 8 ? `\n…共 ${st.check.problems.length} 处，详见 比对结果.md` : '') : ''}</div>` : ''}
    ${st.stale ? '<div class="cb-note warn" style="margin-bottom:8px">上游环节在这之后被修改过，这里的产出可能已经过时，建议重做。</div>' : ''}
    ${st.note && st.status === 'waiting' ? `<div class="cb-note warn" style="margin-bottom:8px">${esc(st.note)}</div>` : ''}
    ${st.error ? `<div class="bubble err" style="margin-bottom:8px;white-space:pre-wrap">${esc(st.error)}</div>` : ''}
    ${explainHTML(p, st)}
    <div class="row-actions">${actions}<label style="font-size:12.5px;display:flex;align-items:center;gap:4px;margin-left:auto;color:var(--muted)"><input type="checkbox" data-pjf="approval" ${st.approval ? 'checked' : ''} ${editable ? '' : 'disabled'}>做完后要我确认</label><label style="font-size:12.5px;display:flex;align-items:center;gap:4px;color:var(--muted)" title="你点通过之前，主管先问你两三个问题，确认你弄懂了"><input type="checkbox" data-pjf="quizOn" ${quizOn(st) ? 'checked' : ''} ${running ? 'disabled' : ''}>通过前考考我</label></div>
    ${quizHTML(p, st)}
    ${['waiting', 'done', 'error', 'stopped'].includes(st.status) ? `<div class="cb-suprow" style="display:none" id="pj-reject-row"><input class="cb-sup" id="pj-feedback" placeholder="写上要改什么，越具体越好"><button class="btn primary" data-pjact="reject-send">发给负责人修改</button></div>` : ''}
    <details ${editable ? 'open' : ''} data-key="task"><summary>任务说明${editable ? '（开工前可以修改）' : ''}</summary>${editable ? `<textarea data-pjf="task" class="pj-task">${esc(st.task)}</textarea>` : `<div class="cb-out">${md(st.task)}</div>`}</details>
    ${st.live ? `<details open data-key="live"><summary>正在写…</summary><div class="cb-out">${md(st.live)}</div></details>` : ''}
    ${imgs.length ? `<div class="cb-sec">产出的图</div><div class="wc-imgs">${imgs.map((f) => `<img src="${f.img}" title="${esc(f.rel)}" data-wopen="${esc(f.path)}">`).join('')}</div>` : ''}
    ${files.length ? `<div class="cb-sec">文件夹里的文件</div><div class="wc-files">${files.map((f) => `<div><span class="fname" data-wopen="${esc(f.path)}">📄 ${esc(f.rel)}</span><span class="desc">${fmtSize(f.size)}</span><span class="link" data-wreveal="${esc(f.path)}">在文件夹中显示</span></div>`).join('')}</div>` : ''}
    ${st.handoff ? `<details ${mdSection(st.handoff, '讲给你听') ? '' : 'open'} data-key="handoff"><summary>交接（${esc(agentName(st.ownerId))} 写的）</summary><div class="cb-out">${md(st.handoff)}</div></details>` : ''}
    ${st.review ? `<details open data-key="review"><summary>审查（${st.review.auto ? '程序自动比对' : esc(agentName(st.review.by))}）：${st.review.pass ? '✅ 通过' : '❌ 需要修改'}</summary><div class="cb-out">${md(st.review.text)}</div></details>` : ''}
    ${st.log?.length ? `<details ${mine ? 'open' : ''} data-key="log"><summary>执行过程（${st.log.length} 条）</summary><div class="wc-log" id="pj-log">${st.log.map((e) => `<div class="l-${e.kind}">${esc(e.text)}${e.detail ? `<pre>${esc(e.detail)}</pre>` : ''}</div>`).join('')}</div></details>` : ''}
  </div>`;
}

function renderProject(p, soft) {
  if (view !== 'projects' || projSel.pid !== p.id) { if (view === 'projects') renderList(); return; }
  const main = $('#main');
  const running = projRuns.has(p.id);
  if (p.status === 'drafting' || p.status === 'draft-error') {
    main.innerHTML = `<div class="page"><h2>🧪 ${esc(p.name)}</h2><div class="empty" style="min-height:300px"><div>${p.status === 'drafting' ? `<div class="big">📝</div>主管「${esc(agentName(p.leadId))}」正在看你的资料、起草项目说明和分工…<br><span style="font-size:12px">一般需要半分钟到两分钟</span>` : `<div class="big">⚠️</div>起草失败：${esc(p.error)}<br><br><button class="btn primary" data-pjact="redraft">重试</button> <button class="btn danger" data-pjact="delete">删除这个项目</button>`}</div></div></div>`;
    return;
  }
  const st = stageOf(p, projSel.sid) || p.stages[0];
  projSel.sid = st.id;
  const strip = p.stages.map((s, i) => `<div class="pj-chip ${s.id === st.id ? 'on' : ''} pjs-${s.status}" data-pjstage="${s.id}"><div class="n">${i + 1}</div><div><b>${esc(s.title)}</b><span>${esc(agentName(s.ownerId))} · ${PROJ_STATUS[s.status]}${s.stale ? ' · ⚠ 上游改过' : ''}</span></div></div>${i < p.stages.length - 1 ? '<div class="pj-arrow">→</div>' : ''}`).join('');
  const allDone = p.stages.every((s) => s.status === 'done');
  if (soft && $('#proj-stage') && document.activeElement?.closest?.('#proj-stage textarea, #proj-stage input')) { $('#proj-strip').innerHTML = strip; $('#proj-activity').innerHTML = activityHTML(p); $('#proj-chat').innerHTML = chatHTML(p); return; }
  if (soft && $('#proj-stage')) {
    // refresh in place while agents work: keep scroll, open sections and anything being typed
    const el = $('#proj-stage'); const open = new Set([...el.querySelectorAll('details[open][data-key]')].map((d) => d.dataset.key)); const closed = new Set([...el.querySelectorAll('details:not([open])[data-key]')].map((d) => d.dataset.key));
    const log = $('#pj-log'); const logBottom = log ? log.scrollHeight - log.scrollTop - log.clientHeight < 60 : true;
    el.outerHTML = stagePanelHTML(p, st);
    document.querySelectorAll('#proj-stage details[data-key]').forEach((d) => { if (open.has(d.dataset.key)) d.open = true; else if (closed.has(d.dataset.key)) d.open = false; });
    const nl = $('#pj-log'); if (nl && logBottom) nl.scrollTop = nl.scrollHeight;
    $('#proj-strip').innerHTML = strip; $('#proj-activity').innerHTML = activityHTML(p); $('#proj-chat').innerHTML = chatHTML(p);
    return;
  }
  const chatVal = $('#pj-chat-input')?.value || '';
  main.innerHTML = `<div class="page pj-page">
    <div class="pj-head"><div><h2>🧪 ${esc(p.name)}</h2><div class="desc" style="margin:0"><span class="link" data-pjact="open">📁 ${esc(p.dir)}</span>${fmtUsage(p.usage) ? ' · 累计 ' + fmtUsage(p.usage) : ''}</div></div>
      <div class="row-actions">${running ? '<button class="btn danger" data-pjact="stop">■ 停止</button>' : allDone ? '<span class="badge pjb-done">全部完成</span>' : '<button class="btn primary" data-pjact="runall">▶ 按顺序往下做</button>'}<button class="btn" data-pjact="brief">项目说明</button><button class="btn" data-pjact="decisions">决策记录</button><button class="btn danger" data-pjact="delete">删除</button></div></div>
    ${p.questions ? `<div class="cb-note warn" style="margin:10px 0"><b>主管想先向你确认：</b>\n${esc(p.questions)}\n<div class="cb-suprow"><input class="cb-sup" id="pj-answer" placeholder="在这里回答，主管会据此重新起草"><button class="btn" data-pjact="answer">回答并重新起草</button><button class="btn" data-pjact="noanswer">不用了，就这样</button></div></div>` : ''}
    <div class="pj-strip" id="proj-strip">${strip}</div>
    <div class="pj-cols"><div class="pj-left">${stagePanelHTML(p, st)}</div>
      <div class="pj-right"><div class="pj-box"><div class="cb-sec" style="margin-top:0">和主管「${esc(agentName(p.leadId))}」说</div><div class="pj-chat" id="proj-chat">${chatHTML(p)}</div>
        <div class="cb-suprow"><input class="cb-sup" id="pj-chat-input" placeholder="问进展，或补充要求（会记进项目说明）"><button class="btn" data-pjact="chat">发送</button></div></div>
        <div class="pj-box"><div class="cb-sec" style="margin-top:0">动态</div><div class="pj-activity" id="proj-activity">${activityHTML(p)}</div></div></div></div>
  </div>`;
  if (chatVal) $('#pj-chat-input').value = chatVal;
  const nl = $('#pj-log'); if (nl) nl.scrollTop = nl.scrollHeight;
  const ch = $('#proj-chat'); if (ch) ch.scrollTop = ch.scrollHeight;
  renderList();
}
function chatHTML(p) { return (p.chat || []).map((m) => `<div class="${m.from === 'user' ? 'me' : 'them'}"><div>${m.pending && !m.text ? '…' : md(m.text)}</div></div>`).join('') || '<div class="desc" style="margin:0;font-size:12px">主管了解项目说明和每个环节的进展。你在这里说的要求，后面的环节都会读到。</div>'; }
function activityHTML(p) { return (p.activity || []).slice(0, 40).map((a) => `<div><span class="t">${fmtTime(a.ts)}</span><b>${esc(a.who)}</b> ${esc(a.text)}</div>`).join('') || '<div class="desc" style="margin:0;font-size:12px">还没有动态</div>'; }

function renderProjectsPage() {
  const p = projById(projSel.pid) || (S.projects || []).slice().sort((a, b) => b.ts - a.ts)[0];
  if (!p) {
    $('#main').innerHTML = `<div class="empty"><div><div class="big">🧪</div><b>项目</b>：把一件科研工作交给一个团队，按环节接力完成。<br>每个环节有负责人和审查人，产出都放在一个文件夹里，关键处由你确认。<br><br><button class="btn primary" data-pjact="new">＋ 新建项目</button></div></div>`;
    return;
  }
  projSel.pid = p.id; renderProject(p);
}

async function projectAction(act, t) {
  if (act === 'new') return newProjectModal();
  const p = projById(projSel.pid); if (!p) return;
  const st = stageOf(p, projSel.sid);
  if (act === 'open') return window.claw.proj.open(p.dir);
  if (act === 'stop') return stopProject(p);
  if (act === 'runall') return runPipeline(p);
  if (act === 'redraft') return draftProject(p);
  if (act === 'answer') { const v = $('#pj-answer').value.trim(); if (!v) return toast('先写上回答'); p.answers.push(v); return draftProject(p); }
  if (act === 'noanswer') { p.questions = ''; save(); return renderProject(p); }
  if (act === 'delete') { if (projRuns.has(p.id)) return toast('先停止再删除'); if (!confirm(`从 ClawChat 里移除项目「${p.name}」？\n项目文件夹里的文件不会被删除。`)) return; S.projects = S.projects.filter((x) => x !== p); projSel = { pid: null, sid: null }; save(); return renderAll(); }
  if (act === 'brief') { const b = await readBrief(p); modal(`<h3>项目说明.md</h3><div class="cb-out" style="max-height:60vh;overflow:auto;user-select:text">${md(b || '（空）')}</div><div class="foot"><button class="btn" id="m-cancel">关闭</button></div>`, (m, close) => { $('#m-cancel', m).onclick = close; }); document.querySelector('#modal-root .modal').style.width = '680px'; return; }
  if (act === 'chat') { const inp = $('#pj-chat-input'); const v = inp.value.trim(); if (!v) return; inp.value = ''; return projChat(p, v); }
  if (!st) return;
  if (act === 'run') {
    if (st.status === 'done' && !confirm('从头重做会覆盖这个环节现有的产出。确定吗？')) return;
    const s = await runStage(p, st);
    if (s === 'done' && t.dataset.then !== 'stay') { const nx = p.stages[p.stages.indexOf(st) + 1]; if (nx && nx.status === 'pending') toast(`「${st.title}」完成了。下一个是「${nx.title}」，点「按顺序往下做」继续。`, 4000); }
  }
  if (act === 'rereview') return runStage(p, st, { reviewOnly: true });
  if (act === 'refix' && st.lastFeedback) return runStage(p, st, st.lastFeedback);
  if (act === 'approve') { if (quizOn(st) && !st.quiz?.passed && !st.quizSkipped) { if (!st.quiz?.qs?.length) await quizStart(p, st); return; } return approveStage(p, st); }
  if (['quiz-start', 'quiz-submit', 'quiz-skip', 'quiz-ask', 'quiz-simpler', 'ask', 'decisions'].includes(act)) return understandAction(act, p, st, t);
  if (act === 'reject') { const row = $('#pj-reject-row'); if (row) { row.style.display = 'flex'; $('#pj-feedback').focus(); } }
  if (act === 'reject-send') { const v = $('#pj-feedback').value.trim(); if (!v) return toast('写上要改什么'); pact(p, '你', `打回了「${st.title}」：${v.slice(0, 60)}`); await runStage(p, st, { feedback: `（来自用户「${S.userName}」的意见，优先级最高）\n${v}`, humanFeedback: true }); }
}
