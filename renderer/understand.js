/* ClawChat — keeping the person in the loop: "讲给你听", the decision log, and the understanding check.
   The work is only worth something if the person whose name is on it understands it. */
'use strict';

// pull one "## 标题" section out of a markdown handoff
function mdSection(text, title) {
  const m = (text || '').match(new RegExp(`^##\\s*${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
}
const isNone = (t) => !t || /^[（(]?\s*(无|没有|暂无|none)\s*[）)。.]?$/i.test(t.trim());

// after an owner delivers: copy its "关键决策" into the project-wide 决策记录.md
async function recordDecisions(p, st) {
  const dec = mdSection(st.handoff, '关键决策');
  if (isNone(dec)) return;
  const head = `\n\n## 「${st.title}」${st.round ? `第 ${st.round + 1} 轮` : ''}（${agentName(st.ownerId)}，${new Date().toLocaleString('zh-CN')}）\n\n`;
  const exists = await window.claw.proj.exists(p.dir + '/决策记录.md');
  if (!exists) await window.claw.proj.write(p.dir, '决策记录.md', '# 决策记录\n\n这个项目里每个需要说明理由的选择：选了什么、为什么、依据在哪。由 ClawChat 从各环节的交接里汇总，审稿人或导师问起时先翻这里。\n');
  await window.claw.proj.append(p.dir, '决策记录.md', head + dec + '\n');
}

// ---------------- the understanding check ----------------
const quizOn = (st) => st.quizOn !== false;
const PLAIN_TALK = '写给没有这个方向背景的人：短句，先说结论再说原因；用这个项目里的具体东西举例（哪个算例、哪个截面、哪一列）；不要引入新术语，非用不可的术语当场用一句话解释；可以打比方';
function quizAgent(p, st) { return agentById(p.leadId) || agentById(st.reviewerId) || agentById(st.ownerId); }

function parseJsonArray(text) {
  const s = (text || '').replace(/```(?:json)?/g, '');
  const i = s.indexOf('['), j = s.lastIndexOf(']');
  if (i < 0 || j <= i) return null;
  try { const a = JSON.parse(s.slice(i, j + 1)); return Array.isArray(a) ? a : null; } catch { return null; }
}

async function quizStart(p, st) {
  const a = quizAgent(p, st);
  if (!a) return toast('这个项目没有主管，没法出题');
  st.quiz = { busy: '主管正在读这个环节的产出、出题…', qs: [], answers: [], results: [] };
  renderProject(p);
  const brief = (await readBrief(p) || '').slice(0, 6000);
  const inp = await inlineInputs(p, st, { forReview: true });
  const sys = `你是「${a.name}」，这个科研项目的主管。现在要确认项目负责人「${S.userName}」真的理解了「${st.title}」这个环节——论文署的是他的名字，审稿人和导师问起时要他自己答得上来。你的目的是帮他弄懂，不是为难他。`;
  const user = `======== 项目说明.md ========\n${brief}\n\n======== ${st.folder}/任务.md ========\n${st.task}\n${inp.text.slice(0, 40000)}

请出 2 到 3 个问题，检验他是否理解这个环节：
- 至少一题问「为什么这么做 / 这个选择的理由是什么」；
- 至少一题问「这个结果说明了什么、不能说明什么」；
- 可以有一题问「最可能在哪里出错 / 怎么检查对不对」；
- 不要考数字记忆（除非那个数字本身就是结论），不要考文件名；
- 问题要具体到这个项目，不要泛泛而谈；每题一两句话；问题本身用大白话问，不要堆术语。

只输出一个 JSON 数组，不要别的文字：
[{"q": "问题", "key": "答到哪几点就算懂了（2~3 点，写给判卷用，不给他看）", "src": "答案主要在哪个文件"}]`;
  const r = await callAgent(a, sys, user, { acct: [(st.usage = st.usage || {}), (p.usage = p.usage || {})], temperature: 0.3 });
  const qs = parseJsonArray(r.text)?.filter((x) => x && x.q).slice(0, 3);
  if (r.error || !qs?.length) { st.quiz = { error: r.error || '主管没有按格式出题，再试一次' }; save(); return renderProject(p); }
  st.quiz = { qs: qs.map((x) => ({ q: String(x.q), key: String(x.key || ''), src: String(x.src || '') })), answers: qs.map(() => ''), results: [], round: 0, ts: Date.now() };
  pact(p, a.name, `给「${st.title}」出了 ${qs.length} 道理解题`);
  save(); renderProject(p);
}

async function quizSubmit(p, st) {
  const qz = st.quiz; const a = quizAgent(p, st);
  if (!qz?.qs?.length || !a) return;
  const todo = qz.qs.map((_, i) => i).filter((i) => !qz.results[i]?.ok);
  if (todo.some((i) => !(qz.answers[i] || '').trim())) return toast('每道题都写一点吧，说不清也可以写"不知道"');
  qz.busy = '主管正在看你的回答…'; renderProject(p);
  const sys = `你是「${a.name}」，这个科研项目的主管，正在帮「${S.userName}」确认他是否理解了「${st.title}」环节。判断标准：抓住了要点就算懂，措辞粗糙、不完整都没关系；但方向错了、把不确定说成确定、或者只是复述字面而没说出原因，就算没懂。`;
  const user = todo.map((i) => `### 第 ${i + 1} 题\n问题：${qz.qs[i].q}\n要点（判卷用）：${qz.qs[i].key}\n答案出处：${qz.qs[i].src}\n他的回答：${qz.answers[i].trim()}`).join('\n\n') + `

对每一题给出判断，按题目顺序输出一个 JSON 数组，不要别的文字：
[{"ok": true 或 false, "say": "对他说的话"}]
- ok 为 true 时，say 用一两句肯定他答对的部分，再补一个容易忽略的点；
- ok 为 false 时，say 把这题讲明白（200 字以内），说清他差在哪，并告诉他去看哪个文件的哪一部分。
- say 要${PLAIN_TALK}。`;
  const r = await callAgent(a, sys, user, { acct: [st.usage, p.usage], temperature: 0.2 });
  const res = parseJsonArray(r.text);
  delete qz.busy;
  if (r.error || !res || res.length < todo.length) { qz.error = r.error || '主管没有按格式判卷，再提交一次'; save(); return renderProject(p); }
  delete qz.error;
  todo.forEach((i, k) => { qz.results[i] = { ok: !!res[k].ok, say: String(res[k].say || ''), answer: qz.answers[i] }; });
  qz.round = (qz.round || 0) + 1;
  qz.passed = qz.qs.every((_, i) => qz.results[i]?.ok);
  await window.claw.proj.append(p.dir, st.folder + '/理解关卡.md', `${qz.round === 1 ? '# 理解关卡\n\n用来确认项目负责人自己弄懂了这个环节。' : ''}\n\n## 第 ${qz.round} 次作答（${new Date().toLocaleString('zh-CN')}，判卷：${a.name}）\n\n` +
    todo.map((i) => `### ${qz.qs[i].q}\n\n**${S.userName}的回答：** ${qz.answers[i].trim()}\n\n**${qz.results[i].ok ? '✅ 懂了' : '❌ 还没懂'}：** ${qz.results[i].say}`).join('\n\n') + '\n');
  pact(p, a.name, qz.passed ? `「${st.title}」的理解题你都答到点子上了` : `「${st.title}」还有 ${qz.qs.filter((_, i) => !qz.results[i]?.ok).length} 题没答到点子上，已经讲给你听`);
  save(); renderProject(p);
}

function quizHTML(p, st) {
  const qz = st.quiz;
  if (!qz) return '';
  if (qz.busy && !qz.qs?.length) return `<div class="pj-quiz"><div class="pj-qhead">🎓 理解关卡</div><div class="desc">${esc(qz.busy)}</div></div>`;
  if (qz.error && !qz.qs?.length) return `<div class="pj-quiz"><div class="pj-qhead">🎓 理解关卡</div><div class="bubble err">${esc(qz.error)}</div><div class="row-actions"><button class="btn" data-pjact="quiz-start">重新出题</button></div></div>`;
  const busy = !!qz.busy;
  return `<div class="pj-quiz">
    <div class="pj-qhead">🎓 理解关卡 ${qz.passed ? '<span class="badge pjb-done">已通过</span>' : ''}</div>
    <div class="desc" style="margin:0 0 8px">用你自己的话回答，说个大概就行，不用查文件。目的不是考你，是确认审稿人或导师问起时你答得上来。</div>
    ${qz.qs.map((x, i) => { const r = qz.results[i]; return `<div class="pj-q">
      <div class="pj-qq">${i + 1}. ${esc(x.q)}</div>
      ${r?.ok ? `<div class="pj-qa-done">${esc(r.answer || qz.answers[i])}</div>` : `<textarea data-pjqa="${i}" rows="2" placeholder="写你的理解…" ${busy ? 'disabled' : ''}>${esc(qz.answers[i] || '')}</textarea>`}
      ${r ? `<div class="cb-note ${r.ok ? 'okbox' : 'warn'}" style="margin-top:6px"><b>${r.ok ? '✅ 懂了' : '❌ 还差一点'}</b>　${esc(r.say)}</div>
        ${(r.thread || []).map((x) => `<div class="pj-fu"><div class="pj-fu-q">你追问：${esc(x.q)}</div><div class="pj-fu-a">${x.a ? md(x.a) : '<span class="desc">主管在想怎么讲…</span>'}</div></div>`).join('')}
        <div class="pj-fu-row"><input data-pjfu="${i}" placeholder="哪里没看懂？把那句话贴过来，或者直接问" ${r.busy ? 'disabled' : ''}><button class="btn" data-pjact="quiz-ask" data-qi="${i}" ${r.busy ? 'disabled' : ''}>追问</button><span class="link" data-pjact="quiz-simpler" data-qi="${i}">说简单点</span></div>` : ''}
    </div>`; }).join('')}
    ${qz.error ? `<div class="bubble err" style="margin:6px 0">${esc(qz.error)}</div>` : ''}
    <div class="row-actions">${qz.passed ? (st.status === 'waiting' ? '<button class="btn primary" data-pjact="approve">✅ 通过，进入下一环节</button>' : '')
      : `<button class="btn primary" data-pjact="quiz-submit" ${busy ? 'disabled' : ''}>${busy ? esc(qz.busy) : qz.round ? '再答一次' : '提交回答'}</button>${st.status === 'waiting' ? '<span class="link" data-pjact="quiz-skip" style="font-size:12.5px">跳过关卡，直接通过</span>' : ''}`}
      <span class="link" data-pjact="quiz-start" style="font-size:12.5px;margin-left:auto">换一组题</span></div>
  </div>`;
}

// the plain-language part of the handoff, shown first, with a way to ask about it
function explainHTML(p, st) {
  const t = mdSection(st.handoff, '讲给你听');
  if (!t) return '';
  return `<details open data-key="explain" class="pj-explain"><summary>📖 讲给你听（${esc(agentName(st.ownerId))} 写的）</summary><div class="cb-out">${md(t)}</div>
    <div class="cb-suprow"><input class="cb-sup" id="pj-ask" placeholder="哪里没看懂？直接问，主管会结合这个环节的文件讲给你"><button class="btn" data-pjact="ask">问主管</button></div></details>`;
}

// follow-up on one question: keep asking until it makes sense
async function quizAsk(p, st, i, text) {
  const qz = st.quiz, r = qz?.results?.[i], a = quizAgent(p, st);
  if (!r || !a || r.busy) return;
  r.thread = r.thread || [];
  const item = { q: text, a: '' }; r.thread.push(item); r.busy = true; renderProject(p);
  const inp = await inlineInputs(p, st, { forReview: true });
  const sys = `你是「${a.name}」，这个科研项目的主管，正在给「${S.userName}」讲「${st.title}」环节里他没弄懂的地方。他不是这个方向出身，看不懂就会直接问。你的回答要${PLAIN_TALK}。只依据下面的文件，文件里没有的就说没有，不要编。`;
  const user = `相关文件：${inp.text.slice(0, 30000)}

======== 正在讲的题 ========
问题：${qz.qs[i].q}
要点：${qz.qs[i].key}
他原来的回答：${r.answer || qz.answers[i] || ''}
你之前的讲解：${r.say}
${r.thread.slice(0, -1).map((x) => `他追问：${x.q}\n你回答：${x.a}`).join('\n')}

======== 他现在问 ========
${text}

直接回答他这一问，250 字以内。如果他是没看懂你上一段话里的某个说法，就换一种讲法，别把原话再说一遍。`;
  const res = await callAgent(a, sys, user, { acct: [(st.usage = st.usage || {}), (p.usage = p.usage || {})], temperature: 0.3, onText: (x) => { item.a = x; renderProjectSoon(p); } });
  item.a = res.error ? '（出错了：' + res.error + '）' : res.text; delete r.busy;
  if (!res.error) await window.claw.proj.append(p.dir, st.folder + '/理解关卡.md', `\n\n#### 追问：${text}\n\n${item.a}\n`);
  save(); renderProject(p);
}

async function understandAction(act, p, st, t) {
  if (act === 'quiz-ask' || act === 'quiz-simpler') {
    const i = +t.dataset.qi; const inp = document.querySelector(`[data-pjfu="${i}"]`);
    const text = act === 'quiz-simpler' ? '你上面讲的我还是没看懂，能不能用更简单的话、举这个项目里的具体例子再讲一遍？' : inp?.value.trim();
    if (!text) return inp?.focus();
    return quizAsk(p, st, i, text);
  }
  if (act === 'quiz-start') return quizStart(p, st);
  if (act === 'quiz-submit') return quizSubmit(p, st);
  if (act === 'quiz-skip') { st.quizSkipped = true; pact(p, '你', `跳过了「${st.title}」的理解关卡`); return approveStage(p, st); }
  if (act === 'ask') {
    const v = $('#pj-ask')?.value.trim(); if (!v) return;
    $('#pj-ask').value = '';
    return projChat(p, `【关于「${st.title}」环节】${v}`, { question: st });
  }
  if (act === 'decisions') {
    const b = await window.claw.proj.read(p.dir, '决策记录.md', 200000);
    modal(`<h3>决策记录.md</h3><div class="cb-out" style="max-height:60vh;overflow:auto;user-select:text">${md(b || '（还没有记录。各环节交接里的「关键决策」会自动汇总到这里。）')}</div><div class="foot"><button class="btn" id="m-cancel">关闭</button></div>`, (m, close) => { $('#m-cancel', m).onclick = close; });
    document.querySelector('#modal-root .modal').style.width = '680px';
  }
}

async function approveStage(p, st) {
  st.status = 'done'; st.note = '';
  pact(p, '你', `确认通过了「${st.title}」`);
  await syncPlan(p); save(); renderProject(p);
}
