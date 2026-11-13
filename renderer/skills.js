/* ClawChat — skills library: written rules (SKILL.md) that a stage's agents follow.
   Every model gets the same rules: agents that work in the folder read their own copy,
   chat-only models get the text pasted into their instructions. */
'use strict';

let SKILLS = [];
async function refreshSkills() { try { SKILLS = await window.claw.skills.list(); } catch { SKILLS = []; } return SKILLS; }
const skillByName = (n) => SKILLS.find((s) => s.name === n);

// sensible defaults when the matching skill is installed
const STAGE_SKILL_DEFAULTS = { plot: ['scientific-paper-figures'], analysis: ['academic-writing', 'anti-defensive-writing'], review: ['reviewer-response'] };
function defaultStageSkills(key) { return (STAGE_SKILL_DEFAULTS[key] || []).filter(skillByName); }

function skillsCardHTML() {
  return `<div class="card"><h3>技能库</h3>
    <div class="desc" style="margin:-4px 0 10px;font-size:12px">技能是写给 AI 的工作规则（一个含 SKILL.md 的文件夹），比如"科研图表""审稿回复"。项目的每个环节可以挂上几个技能，负责人和审查人都会按它做、按它查。能动手的 AI 会拿到整个文件夹自己读；只能聊天的模型会把 SKILL.md 贴进它的指令里。</div>
    <div class="row-actions" style="margin-bottom:8px"><button class="btn" data-skact="import-zip">导入 zip 压缩包</button><button class="btn" data-skact="import-dir">导入文件夹</button><span class="desc" id="sk-status" style="margin:0;font-size:12px"></span></div>
    ${SKILLS.length ? SKILLS.map((s) => `<div class="sk-row"><div><b>${esc(s.title)}</b>${s.title !== s.name ? ` <span class="desc">${esc(s.name)}</span>` : ''}${s.builtin ? ' <span class="badge" title="随 ClawChat 附带，经原作者授权收录">内置</span>' : ''}<div class="desc">${esc(s.description.slice(0, 160))}</div></div>
      <div class="sk-meta"><span class="desc">${s.files.length} 个文件</span><button class="btn" data-skact="view" data-sk="${esc(s.name)}">查看</button><button class="btn danger" data-skact="del" data-sk="${esc(s.name)}">删除</button></div></div>`).join('')
      : '<div class="desc">还没有导入技能。</div>'}
    ${SKILLS.some((s) => s.builtin) ? '<div class="desc" style="font-size:11.5px;margin-top:8px">标「内置」的技能来自《科研辅助 Skills · 跨学科分享版》，经原作者授权随 ClawChat 收录。你改过的内置技能，软件升级时不会被覆盖；删掉的不会再自动装回。</div>' : ''}
  </div>`;
}

async function skillsAction(act, t) {
  const status = $('#sk-status');
  if (act === 'import-zip' || act === 'import-dir') {
    const r = await window.claw.skills.import(act === 'import-zip' ? 'zip' : 'dir');
    await refreshSkills(); renderSettings();
    if (!r.ok) return toast('导入失败：' + r.msg, 6000);
    if (r.names.length) toast(`已导入 ${r.names.length} 个技能：${r.names.join('、')}`, 5000);
    return;
  }
  const name = t.dataset.sk;
  if (act === 'del') { if (!confirm(`删除技能「${name}」？已挂在项目环节上的会自动失效。${skillByName(name)?.builtin ? '\n这是内置技能，删掉后不会再自动装回；需要时可以重新导入。' : ''}`)) return; await window.claw.skills.remove(name); await refreshSkills(); return renderSettings(); }
  if (act === 'view') {
    const text = await window.claw.skills.read(name); const s = skillByName(name);
    modal(`<h3>${esc(s?.title || name)}</h3><div class="desc" style="font-size:12px;margin:-6px 0 8px">文件：${esc((s?.files || []).join('、'))}</div><div class="cb-out" style="max-height:60vh;overflow:auto;user-select:text">${md(text || '')}</div><div class="foot"><button class="btn" id="m-cancel">关闭</button></div>`, (m, close) => { $('#m-cancel', m).onclick = close; });
    document.querySelector('#modal-root .modal').style.width = '720px';
  }
  if (status) status.textContent = '';
}

function stageSkillsHTML(st, editable) {
  const on = new Set(st.skills || []);
  const missing = [...on].filter((n) => !skillByName(n));
  if (!SKILLS.length && !on.size) return `<div class="field"><label>用到的技能</label><div class="desc" style="font-size:12px">还没有导入技能。可以在「设置 → 技能库」导入，比如科研图表、审稿回复。</div></div>`;
  return `<div class="field"><label>用到的技能（负责人按它做，审查人按它查）</label><div class="sk-chips">${SKILLS.map((s) => `<span class="sk-chip ${on.has(s.name) ? 'on' : ''} ${editable ? '' : 'ro'}" ${editable ? `data-pjskill="${esc(s.name)}"` : ''} title="${esc(s.description)}">${on.has(s.name) ? '✓ ' : ''}${esc(s.title)}</span>`).join('')}
    ${missing.map((n) => `<span class="sk-chip miss" title="这个技能已经从技能库删掉了">⚠ ${esc(n)}（已删除）</span>`).join('')}</div></div>`;
}

// instructions to add for a stage's agents
async function skillBlock(p, st, { doer, reviewer } = {}) {
  const names = (st.skills || []).filter(skillByName);
  if (!names.length) return '';
  const who = reviewer ? '这个环节的负责人应当遵守下面的技能规则；审查时也要对照这些规则检查。' : '这个环节要遵守下面的技能规则。';
  if (doer) {
    const copied = await window.claw.skills.copyInto(names, p.dir);
    if (!copied.length) return '';
    return `\n\n【技能规则】${who}开工前先完整读一遍每个技能的 SKILL.md；它提到的参考文件，用到时再去读（就在同一个文件夹里）。这些文件只读，不要修改：\n${copied.map((c) => `- ${skillByName(c.name)?.title || c.name}：${c.rel}`).join('\n')}\n规则和任务说明冲突时，以任务说明和项目说明为准。`;
  }
  const parts = [];
  for (const n of names) { const t = await window.claw.skills.read(n); if (t) parts.push(`======== 技能：${skillByName(n)?.title || n} ========\n${t}`); }
  return parts.length ? `\n\n【技能规则】${who}它引用的参考文件没有贴出，按正文规则执行即可。规则和任务说明冲突时，以任务说明和项目说明为准。\n\n${parts.join('\n\n')}` : '';
}
