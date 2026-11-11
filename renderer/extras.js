/* ClawChat — 项目档案、流程模板、结果导出 */
'use strict';

function archiveBlock(chat) {
  return chat.archive?.trim() ? `\n\n【项目档案（这个群长期共享的背景资料，用户维护）】\n${chat.archive.trim().slice(0, 8000)}` : '';
}

function archiveModal(chat) {
  modal(`<h3>📁 项目档案</h3>
    <div class="desc" style="margin:0 0 10px;font-size:12.5px;line-height:1.7">写下这个群长期要用的背景：课题是什么、已经确定的结论、常用的文件路径和参数、写作要求等。聊天、干活和协作时，每个成员都会看到它，不用每次重复交代。</div>
    <div class="field"><textarea id="m-archive" rows="14" style="min-height:260px" placeholder="例如：\n- 课题：三维间隔织物服装的微气候 CFD 研究\n- 仿真文件在 D:\\仿真项目，主模型是 case3.mph\n- 已确定：入口风速范围 1~5 m/s，环境温度 25℃\n- 写作要求：中文，学术语气，不要编造文献">${esc(chat.archive || '')}</textarea></div>
    <div class="foot"><span class="desc" style="margin:0 auto 0 0;font-size:12px" id="m-arch-n"></span><button class="btn" id="m-cancel">取消</button><button class="btn primary" id="m-ok">保存</button></div>`,
  (m, close) => {
    const ta = $('#m-archive', m), n = $('#m-arch-n', m);
    const upd = () => { n.textContent = `${ta.value.length} 字${ta.value.length > 8000 ? '（超过 8000 字的部分不会发给模型）' : ''}`; };
    ta.oninput = upd; upd();
    $('#m-cancel', m).onclick = close;
    $('#m-ok', m).onclick = () => { chat.archive = ta.value.trim(); save(); close(); renderMainIfActive(chat); toast('档案已保存'); };
  });
  document.querySelector('#modal-root .modal').style.width = '620px';
}

async function archiveFromCollab(chat, m) {
  const lead = agentById(m.from) || collabLead(chat);
  toast('主管正在提炼要记入档案的结论…', 5000);
  const r = await callAgent(lead, leadSys(lead), `${originalBlock({ ...m, archive: '' })}\n\n【这次协作的最终结果】\n${m.final}\n\n【现有的项目档案】\n${chat.archive || '（空）'}\n\n请从这次的结果里提炼出以后还会用到的、已经确定的结论或约定（事实、参数、路径、决定），只要现有档案里没有的。每条一行，以"- "开头，最多 6 条，每条不超过 60 字。没有值得记的就只回复：无`, { temperature: 0.2, acct: [m.usage] });
  if (r.error) return toast('提炼失败：' + r.error, 5000);
  const lines = r.text.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
  if (!lines.length) return toast('这次没有需要记入档案的新结论');
  chat.archive = ((chat.archive || '').trim() + `\n\n# ${new Date().toLocaleDateString('zh-CN')} 协作结论\n` + lines.join('\n')).trim();
  save(); renderMainIfActive(chat);
  toast(`已把 ${lines.length} 条结论记入项目档案（点「📁 档案」可以查看和修改）`, 4000);
}

function exportCollab(chat, m) {
  const name = (m.request || '协作结果').replace(/[\\/:*?"<>|\n\r]/g, ' ').trim().slice(0, 24) || '协作结果';
  const text = `# ${name}\n\n> 原话：${m.request.replace(/\n/g, '\n> ')}\n${(m.supplements || []).map((x) => `> 补充：${x}\n`).join('')}\n## 最终结果\n\n${m.final}\n\n---\n\n## 附：各成员的完整内容\n\n` +
    m.tasks.map((t) => `### ${t.id} ${t.title}（${agentById(t.assigneeId)?.name || '?'}）\n\n${t.assumptions && t.assumptions !== '无' ? `**假设与不确定：** ${t.assumptions}\n\n` : ''}${t.output || '（无交付）'}`).join('\n\n') +
    (m.checklist?.length ? `\n\n---\n\n## 附：验收清单\n\n${m.checklist.map((c) => `- [${c.met ? 'x' : ' '}] ${c.requirement}${c.note ? '（' + c.note + '）' : ''}`).join('\n')}` : '') + '\n';
  window.claw.saveText(name + '.md', text).then((p) => { if (p) toast('已保存到 ' + p, 4000); });
}

function saveTemplateModal(chat, m) {
  modal(`<h3>把这次分工存为模板</h3>
    <div class="desc" style="margin:0 0 10px;font-size:12.5px">下次做同类任务时选这个模板，主管会沿用这次的任务划分和负责人，只按新要求重写任务单。</div>
    <div class="field"><label>模板名字</label><input id="m-tname" maxlength="20" value="${esc(m.request.replace(/\s+/g, ' ').slice(0, 12))}"></div>
    <div class="foot"><button class="btn" id="m-cancel">取消</button><button class="btn primary" id="m-ok">保存</button></div>`,
  (el, close) => {
    $('#m-cancel', el).onclick = close;
    $('#m-ok', el).onclick = () => {
      const name = $('#m-tname', el).value.trim(); if (!name) return toast('起个名字');
      S.templates = S.templates || [];
      S.templates.push({ id: uid('t'), name, tasks: m.tasks.map((t) => ({ id: t.id, assignee: agentById(t.assigneeId)?.name || '', title: t.title, goal: t.goal, deliverable: t.deliverable, acceptance: t.acceptance, depends_on: t.depends_on || [], execute: !!t.execute })) });
      save(); close(); toast(`模板「${name}」已保存，点「🤝 协作」时可以选用`, 3500);
    };
  });
}

function collabModal(chat) {
  const ta0 = $('#composer-input');
  const pre = (ta0?.value || '').replace(/^\s*\/\S*\s*/, '');
  const tpls = S.templates || [];
  const lead = collabLead(chat);
  modal(`<h3>🤝 发起协作</h3>
    <div class="desc" style="margin:0 0 10px;font-size:12.5px;line-height:1.7">当前的主管 / 核对人是「${esc(lead?.name || '?')}」（在群设置里改）。已添加的附件会一起带上。</div>
    <div class="field"><label>要它们完成什么（说得越具体越好）</label><textarea id="m-req" rows="5" style="min-height:110px">${esc(pre)}</textarea></div>
    <div class="field"><label>方式</label><select id="m-mode"><option value="collab">分工协作：主管拆任务，按特长派活，验收后汇总（适合要交付成果的活）</option><option value="verify">互相核对：各自独立回答，再交叉检查，最后列出一致、分歧和没法确认的（适合查事实、验数字、拿主意）</option></select></div>
    <div class="field" id="m-tplrow"><label>流程</label><div class="row-actions"><select id="m-tpl" style="flex:1"><option value="">让主管自己规划</option>${tpls.map((t) => `<option value="${t.id}">沿用模板：${esc(t.name)}（${t.tasks.length} 个任务）</option>`).join('')}</select>
      ${tpls.length ? '<button class="btn danger" id="m-tdel">删除所选模板</button>' : ''}</div></div>
    <div class="foot"><button class="btn" id="m-cancel">取消</button><button class="btn primary" id="m-ok">开始</button></div>`,
  (el, close) => {
    $('#m-req', el).focus();
    $('#m-mode', el).onchange = (e) => { $('#m-tplrow', el).style.display = e.target.value === 'verify' ? 'none' : ''; };
    $('#m-cancel', el).onclick = close;
    const del = $('#m-tdel', el);
    if (del) del.onclick = () => {
      const id = $('#m-tpl', el).value; if (!id) return toast('先在左边选一个模板');
      S.templates = S.templates.filter((t) => t.id !== id); save(); close(); collabModal(chat);
    };
    $('#m-ok', el).onclick = () => {
      const req = $('#m-req', el).value.trim(); if (!req) return toast('先写上要完成什么');
      const tpl = tpls.find((t) => t.id === $('#m-tpl', el).value) || null;
      close();
      if (ta0) ta0.value = '';
      const atts = pendingAtts.get(chat.id) || [];
      const verify = $('#m-mode', el).value === 'verify';
      const um = { id: uid('m'), from: 'user', text: (verify ? '/核对 ' : '/协作 ') + req, ts: Date.now() };
      if (atts.length) { um.attachments = atts; pendingAtts.delete(chat.id); }
      chat.messages.push(um); chat.updated = Date.now();
      if (verify) verifyStart(chat, um.text, um.attachments); else collabStart(chat, um.text, um.attachments, tpl);
      save(); renderList(); renderMainIfActive(chat);
    };
  });
  document.querySelector('#modal-root .modal').style.width = '560px';
}

// ---------------- 互相核对：各自独立回答 → 交叉检查 → 核对人给结论 ----------------
const VERIFY_RE = /^\s*\/(核对|verify)\s+([\s\S]+)/i;

function verifyStart(chat, text, attachments) {
  const members = chatMembers(chat);
  if (chat.type !== 'group' || members.length < 2) {
    chat.messages.push({ id: uid('m'), type: 'note', from: 'system', text: '互相核对需要在至少有 2 个成员的群里使用。', ts: Date.now() });
    return;
  }
  const judge = collabLead(chat);
  const m = { id: uid('m'), type: 'collab', mode: 'verify', from: judge.id, request: text.match(VERIFY_RE)[2].trim(), attachments: attachments || [], supplements: [],
    status: 'running', tasks: [], checklist: [], understanding: '', questions: [], final: '', text: '', round: 0, ts: Date.now(), usage: {}, budget: chat.collabBudget ?? 500000 };
  chat.messages.push(m);
  verifyExecute(chat, m);
}

function answerSys(a) {
  return `你是「${a.name}」。${a.persona || ''}${a.memory?.trim() ? '\n\n【你对用户的长期记忆】\n' + a.memory.trim() : ''}\n\n用户的称呼是「${S.userName}」。`;
}

async function verifyExecute(chat, m) {
  if (collabRuns.has(m.id)) return;
  const run = newCollabRun(m);
  const judge = agentById(m.from) || collabLead(chat);
  const members = chatMembers(chat);
  const answerers = members.length >= 3 ? members.filter((a) => a.id !== judge.id) : members;
  const t0 = Date.now();
  m.status = 'running'; m.errorText = ''; m.usage = m.usage || {}; m.archive = chat.archive || '';
  if (m.overBudget) { m.budget = (m.budget || 0) + (chat.collabBudget ?? 500000); m.overBudget = false; }
  if (!m.tasks.length) {
    m.tasks = [
      ...answerers.map((a, i) => ({ id: 'A' + (i + 1), kind: 'answer', assigneeId: a.id, title: '独立回答', status: 'pending' })),
      ...answerers.map((a, i) => ({ id: 'B' + (i + 1), kind: 'cross', assigneeId: a.id, title: '交叉检查', status: 'pending' })),
    ];
  }
  const step = async (t, prompt) => {
    const a = agentById(t.assigneeId);
    if (!a) { t.status = 'error'; t.error = '这个成员已经不在了'; return; }
    t.status = 'running'; t.live = ''; t.error = ''; renderCollab(chat, m, true);
    const r = await callAgent(a, answerSys(a), prompt, { run, acct: [m.usage, (t.usage = t.usage || {})], attachments: m.attachments, temperature: Math.min(a.temperature ?? 0.7, 0.7),
      onText: (x) => { t.live = x; renderCollab(chat, m); }, onReasoning: (x) => { t.reasoning = x; renderCollab(chat, m); } });
    delete t.live; t.model = r.model;
    checkStop(run);
    if (r.error || !r.text) { t.status = 'error'; t.error = r.error || '没有返回内容'; } else { t.output = r.text; t.status = 'done'; }
    save(); renderCollab(chat, m, true);
  };
  const nameOf = (t) => agentById(t.assigneeId)?.name || '?';
  try {
    save(); renderList(); renderCollab(chat, m, true);
    // 1. independent answers, in parallel, blind to each other
    m.phase = '成员各自独立作答（互相看不到）';
    const A = m.tasks.filter((t) => t.kind === 'answer');
    await Promise.all(A.filter((t) => t.status !== 'done').map((t) => step(t, `${originalBlock(m)}

请独立回答上面的问题。其他成员也在各自回答，你们互相看不到，之后会交叉核对。
要求：
- 先给结论，再给依据。
- 对关键的事实、数字和引用，逐条标注你的把握：【确定】【较有把握】【不确定】，并说明依据来自哪里（用户的附件、公认的常识，还是你的记忆）。
- 不知道就直接说不知道。不要编造文献、数据、出处或原话。`)));
    checkStop(run);
    const okA = A.filter((t) => t.status === 'done');
    if (!okA.length) throw new Error('没有成员给出回答：' + (A[0]?.error || ''));
    // 2. cross-check
    if (okA.length >= 2) {
      m.phase = '成员交叉检查彼此的回答';
      const B = m.tasks.filter((t) => t.kind === 'cross');
      await Promise.all(B.filter((t) => t.status !== 'done').map((t) => {
        const mine = okA.find((x) => x.assigneeId === t.assigneeId);
        if (!mine) { t.status = 'error'; t.error = '它没有给出独立回答，跳过交叉检查'; return null; }
        const others = okA.filter((x) => x !== mine);
        return step(t, `${originalBlock(m)}

【你之前的回答】
${mine.output}

【其他成员的独立回答】
${others.map((x) => `===== ${nameOf(x)} =====\n${x.output}`).join('\n\n')}

请交叉核对，只写下面三段，不要重复完整回答：
【我要修正的】你自己的回答里，现在认为有错或需要收回的地方；没有就写"无"。不要因为别人说得不一样就改口，只在你确实被说服时才修正。
【我认为别人有问题的】逐条指出：谁、哪句话、为什么有问题；没有就写"无"。
【仍然存在的分歧】你和别人之间没有被解决的不同看法；没有就写"无"。`);
      }));
      checkStop(run);
    }
    // 3. verdict
    m.status = 'writing'; m.phase = ''; m.final = ''; renderCollab(chat, m, true);
    const cross = m.tasks.filter((t) => t.kind === 'cross' && t.status === 'done');
    const f = await callAgent(judge, leadSys(judge).replace('的主管，负责理解用户意图、拆解任务、给成员写任务单、验收和汇总', '的核对人，负责比较各成员的回答、找出分歧并给出结论'), `${originalBlock(m)}

【各成员的独立回答】
${okA.map((x) => `===== ${nameOf(x)} =====\n${x.output}`).join('\n\n')}

【交叉核对的意见】
${cross.map((x) => `===== ${nameOf(x)} =====\n${x.output}`).join('\n\n') || '（无）'}

你是核对人。请给用户一份结论，按下面四节写（某一节没有内容就写"无"）：
## 结论
直接回答用户的问题。
## 大家一致的
各成员都认同、可以放心用的内容。
## 有分歧的
每条写清：分歧是什么、各方的说法、你判断哪个更可信以及理由。
## 没法确认的
没有可靠依据、需要用户自己去查证的说法，尤其是具体的数字、文献和引文。

不要为了显得一致而抹平分歧；成员都没有把握的内容，不要写成确定的结论。`,
      { run, acct: [m.usage], attachments: m.attachments, temperature: 0.3, onText: (x) => { m.final = x; renderCollab(chat, m); } });
    checkStop(run);
    if (f.error || !f.text) throw new Error('核对人汇总失败：' + (f.error || '没有返回内容') + '。各成员的回答都保留在上面。');
    m.final = f.text; m.text = m.final; m.status = 'done';
  } catch (e) {
    for (const t of m.tasks) if (t.status === 'running') { t.status = 'pending'; delete t.live; }
    if (e instanceof CollabStop) m.status = 'stopped';
    else if (e instanceof CollabBudget) { m.status = 'error'; m.overBudget = true; m.errorText = `已达到这次的用量上限（${(m.budget / 10000).toFixed(0)} 万 tokens），已自动暂停。点「继续执行」会再追加一份额度。`; }
    else { m.status = 'error'; m.errorText = String(e.message || e); }
  } finally {
    collabRuns.delete(m.id); m.phase = '';
    m.secs = (m.secs || 0) + Math.round((Date.now() - t0) / 1000);
    chat.updated = Date.now(); save(); renderList(); renderCollab(chat, m, true);
  }
}
