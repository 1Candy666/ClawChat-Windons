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
  const text = `# ${name}\n\n> 原话：${m.request.replace(/\n/g, '\n> ')}\n${(m.supplements || []).map((x) => `> 补充：${x}\n`).join('')}\n## 最终结果\n\n${m.final}\n\n---\n\n## 附：各任务的完整交付\n\n` +
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
    <div class="desc" style="margin:0 0 10px;font-size:12.5px;line-height:1.7">主管「${esc(lead?.name || '?')}」会先拆任务给你确认，再按特长派给成员，最后对照你的原话验收并汇总。已添加的附件会一起带上。</div>
    <div class="field"><label>要它们完成什么（说得越具体越好）</label><textarea id="m-req" rows="5" style="min-height:110px">${esc(pre)}</textarea></div>
    <div class="field"><label>流程</label><div class="row-actions"><select id="m-tpl" style="flex:1"><option value="">让主管自己规划</option>${tpls.map((t) => `<option value="${t.id}">沿用模板：${esc(t.name)}（${t.tasks.length} 个任务）</option>`).join('')}</select>
      ${tpls.length ? '<button class="btn danger" id="m-tdel">删除所选模板</button>' : ''}</div></div>
    <div class="foot"><button class="btn" id="m-cancel">取消</button><button class="btn primary" id="m-ok">开始</button></div>`,
  (el, close) => {
    $('#m-req', el).focus();
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
      const um = { id: uid('m'), from: 'user', text: '/协作 ' + req, ts: Date.now() };
      if (atts.length) { um.attachments = atts; pendingAtts.delete(chat.id); }
      chat.messages.push(um); chat.updated = Date.now();
      collabStart(chat, um.text, um.attachments, tpl);
      save(); renderList(); renderMainIfActive(chat);
    };
  });
  document.querySelector('#modal-root .modal').style.width = '560px';
}
