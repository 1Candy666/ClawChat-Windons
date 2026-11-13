/* ClawChat — one-click group-meeting deck from a project's files.
   The lead picks what to say; the program lays it out and flags any number it cannot find in the files. */
'use strict';

function exportReportModal(p) {
  if (projRuns.has(p.id)) return toast('项目正在运行，等它停下来再导出');
  if (!p.stages.some((s) => s.handoff)) return toast('还没有任何环节交付，暂时没有可汇报的内容');
  const last = p.lastReport?.ts;
  modal(`<h3>📊 导出组会汇报</h3>
    <div class="desc" style="margin:0 0 12px;font-size:12.5px;line-height:1.7">主管「${esc(agentName(p.leadId))}」读项目里的交接、产出、决策记录和图，挑出要讲的内容；程序排成可编辑的 PPT（每页备注里有讲稿），同时生成一份文字版，可以直接发给导师。<br>幻灯片上的每个数字都会去项目文件里核对，找不到的标红。</div>
    <div class="field"><label>汇报范围</label><select id="rp-range">
      ${last ? `<option value="since">上次组会以来的新进展（上次导出：${new Date(last).toLocaleString('zh-CN')}）</option>` : ''}
      <option value="all">整个项目到目前为止</option></select></div>
    <div class="field"><label>想重点讲什么、或者要回避什么（可不填）</label><textarea id="rp-focus" rows="2" placeholder="例如：重点讲起步方式的影响；导师上次问过网格的问题，要正面回答"></textarea></div>
    <label style="display:flex;gap:6px;align-items:center;font-size:13px;margin:4px 0 10px"><input type="checkbox" id="rp-qa" checked>最后加一页「导师可能会问」（附答案要点和出处）</label>
    <div class="foot"><span class="desc" id="rp-err" style="margin:0 auto 0 0;font-size:12px;color:var(--danger)"></span><button class="btn" id="m-cancel">取消</button><button class="btn primary" id="rp-ok">开始生成</button></div>`,
  (m, close) => {
    $('#m-cancel', m).onclick = close;
    $('#rp-ok', m).onclick = () => { const opts = { range: $('#rp-range', m).value, focus: $('#rp-focus', m).value.trim(), qa: $('#rp-qa', m).checked }; close(); buildReport(p, opts); };
  });
}

const REPORT_SCHEMA = `{"title": "汇报标题", "subtitle": "一句话副标题", "coverNotes": "开场白讲稿",
 "slides": [
  {"type": "bullets", "title": "页标题", "bullets": ["要点", "..."], "notes": "这一页的讲稿", "sources": ["出处文件"]},
  {"type": "figure", "title": "页标题", "image": "图片路径（必须是下面列出的图片之一）", "caption": "图注", "bullets": ["图旁边的 1~3 条要点，可以没有"], "notes": "讲稿", "sources": ["出处文件"]},
  {"type": "table", "title": "页标题", "columns": ["列名"], "rows": [["单元格"]], "bullets": ["表下的结论，可以没有"], "notes": "讲稿", "sources": ["出处文件"]},
  {"type": "qa", "title": "导师可能会问", "items": [{"q": "问题", "a": "答案要点", "src": "出处文件"}]}
 ]}`;

async function buildReport(p, { range, focus, qa }) {
  const lead = agentById(p.leadId);
  if (!lead) return toast('这个项目没有主管');
  p.exporting = '主管正在读项目文件、挑汇报内容…'; renderProject(p);
  try {
    const since = range === 'since' ? p.lastReport?.ts : 0;
    const brief = (await readBrief(p) || '').slice(0, 6000);
    const decisions = (await window.claw.proj.read(p.dir, '决策记录.md', 8000)) || '';
    const imgs = []; let stagesText = '';
    for (const st of p.stages) {
      const files = await window.claw.proj.files(p.dir, st.folder);
      files.filter((f) => /\.(png|jpe?g)$/i.test(f.rel)).forEach((f) => imgs.push(`${st.folder}/${f.rel.replace(/\\/g, '/')}`));
      if (!st.handoff) { stagesText += `\n\n################ 环节「${st.title}」：${PROJ_STATUS[st.status]}，还没有产出 ################`; continue; }
      const out = st.output ? await window.claw.proj.read(p.dir, st.folder + '/' + st.output, 12000) : '';
      stagesText += `\n\n################ 环节「${st.title}」（${st.folder}/，${PROJ_STATUS[st.status]}，负责人 ${agentName(st.ownerId)}）################`
        + `${st.check ? `\n程序比对：${st.check.ok ? `与参考结果一致（${st.check.compared} 个单元格）` : '与参考结果不一致'}` : ''}`
        + `${st.review ? `\n审查结论：${(st.review.text || '').split('\n')[0]}` : ''}`
        + `\n文件：${files.map((f) => f.rel).join('、')}`
        + `\n\n======== ${st.folder}/交接.md ========\n${st.handoff.slice(0, 9000)}`
        + (out ? `\n\n======== ${st.folder}/${st.output} ========\n${out}` : '');
    }
    const acts = (p.activity || []).filter((a) => !since || a.ts > since).slice(0, 40).reverse().map((a) => `${new Date(a.ts).toLocaleString('zh-CN')} ${a.who}：${a.text}`).join('\n');
    const sys = `你是「${lead.name}」，这个科研项目的主管。现在要帮「${S.userName}」准备组会汇报：他要站在导师和同学面前讲这些工作，所以内容要真实、讲得清、经得起追问。`;
    const user = `======== 项目说明.md ========\n${brief}\n${stagesText}\n\n======== 决策记录.md ========\n${decisions.slice(0, 8000) || '（无）'}\n\n======== 可以放进幻灯片的图片 ========\n${imgs.join('\n') || '（没有）'}\n\n======== ${since ? '上次组会以来的' : ''}项目动态 ========\n${acts || '（无）'}

请设计一份组会汇报幻灯片（不含封面）。${since ? '范围：上次组会以来的新进展；之前已经讲过的内容最多用一页带过。' : '范围：整个项目到目前为止。'}${focus ? `\n他特别交代：${focus}` : ''}
要求：
- 结构建议：背景和目标 → 这段时间做了什么 → 关键结果（尽量用图或表）→ 结论：能说明什么、不能说明什么 → 问题和没把握的地方 → 下一步${qa ? ' → 导师可能会问（type 为 qa，3~4 个尖锐问题，答案要点 + 出处）' : ''}。一般 7~11 页，内容少就少做几页，不要凑数。
- 每页最多 5 条要点，每条不超过 40 个字，是结论或事实，不是空话。
- **所有数字只能照抄上面文件里出现过的，保留原文的精度**；文件里没有的数字一个都不能写。不要编造没做过的工作，没完成的就写没完成。
- 图片只能用上面列出的路径，原样照抄；不需要就不放。
- notes 是讲稿：口语，讲给导师听，150~250 字；要讲出"为什么"，不只是念要点。
- sources 写这一页内容出自哪个文件。
- 只输出一个 JSON 对象，不要别的文字，格式：
${REPORT_SCHEMA}`;
    const r = await callAgent(lead, sys, user, { acct: [(p.usage = p.usage || {})], temperature: 0.3 });
    if (r.error) throw new Error(r.error);
    const s = (r.text || '').replace(/```(?:json)?/g, ''); const i = s.indexOf('{'), j = s.lastIndexOf('}');
    let deck; try { deck = JSON.parse(s.slice(i, j + 1)); } catch { throw new Error('主管没有按格式给出幻灯片内容，再试一次'); }
    if (!Array.isArray(deck.slides) || !deck.slides.length) throw new Error('主管给出的幻灯片是空的');
    deck.slides = deck.slides.filter((x) => qa || x.type !== 'qa');
    const now = new Date(), stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    deck.date = now.toLocaleDateString('zh-CN');
    p.exporting = '正在排版、核对数字…'; renderProject(p);
    const outRel = `组会汇报/组会汇报_${stamp}.pptx`;
    const res = await window.claw.ppt.build({ dir: p.dir, outPath: p.dir.replace(/[\\/]+$/, '') + '/' + outRel, deck, presenter: S.userName });
    if (!res.ok) throw new Error(res.msg);
    await window.claw.proj.write(p.dir, `组会汇报/组会汇报_${stamp}.md`, reportMarkdown(p, deck, res.flagged));
    p.lastReport = { ts: Date.now(), path: res.path, slides: res.slides, flagged: res.flagged };
    pact(p, lead.name, `生成了组会汇报（${res.slides} 页${res.flagged.length ? `，${res.flagged.reduce((n, x) => n + x.numbers.length, 0)} 个数字没在文件里找到，已标红` : '，数字都能在项目文件里找到'}）`);
    delete p.exporting; save(); renderProject(p);
    reportDoneModal(p, res, `组会汇报/组会汇报_${stamp}.md`);
  } catch (e) {
    delete p.exporting; save(); renderProject(p);
    toast('生成失败：' + String(e.message || e).slice(0, 200), 7000);
  }
}

function reportMarkdown(p, deck, flagged) {
  const L = [`# ${deck.title || p.name}`, '', deck.subtitle || '', '', `汇报人：${S.userName}　日期：${deck.date}`, ''];
  if (flagged.length) L.push(`> ⚠ 以下页面有数字没在项目文件里找到，请核对：${flagged.map((x) => `第 ${x.slide} 页（${x.numbers.join('、')}）`).join('；')}`, '');
  (deck.slides || []).forEach((s, k) => {
    L.push(`## ${k + 2}. ${s.title || ''}`, '');
    if (s.type === 'figure' && s.image) L.push(`![${s.caption || ''}](../${s.image})`, '', s.caption ? `*${s.caption}*` : '', '');
    if (s.type === 'table' && s.columns) { L.push('| ' + s.columns.join(' | ') + ' |', '|' + s.columns.map(() => '---').join('|') + '|', ...(s.rows || []).map((r) => '| ' + s.columns.map((_, j) => String(r[j] ?? '')).join(' | ') + ' |'), ''); }
    if (s.type === 'qa') (s.items || []).forEach((x) => L.push(`**问：${x.q}**`, '', `答：${x.a}${x.src ? `（见 ${x.src}）` : ''}`, ''));
    (s.bullets || []).forEach((b) => L.push(`- ${b}`));
    if (s.bullets?.length) L.push('');
    if (s.notes) L.push(`> 讲稿：${s.notes}`, '');
    if (s.sources?.length) L.push(`<sub>来源：${s.sources.join('；')}</sub>`, '');
  });
  return L.join('\n');
}

function reportDoneModal(p, res, mdRel) {
  modal(`<h3>✅ 组会汇报已生成</h3>
    <div class="desc" style="margin:0 0 10px;font-size:13px;line-height:1.8">共 ${res.slides} 页，每页备注里有讲稿。PowerPoint 和 WPS 都能打开、继续改。<br>同一个文件夹里还有一份文字版（.md），可以直接发给导师。</div>
    ${res.flagged.length ? `<div class="cb-note warn" style="margin-bottom:10px"><b>有 ${res.flagged.reduce((n, x) => n + x.numbers.length, 0)} 个数字没在项目文件里找到，已在幻灯片上标红</b>，讲之前请核对：<br>${res.flagged.map((x) => `第 ${x.slide} 页「${esc(x.title || '')}」：${x.numbers.map(esc).join('、')}`).join('<br>')}</div>` : '<div class="cb-note okbox" style="margin-bottom:10px">幻灯片上的数字都能在项目文件里找到。</div>'}
    <div class="foot"><button class="btn" id="rp-md">打开文字版</button><button class="btn" id="rp-dir">打开文件夹</button><button class="btn primary" id="rp-open">打开 PPT</button></div>`,
  (m, close) => {
    $('#rp-open', m).onclick = () => { window.claw.proj.open(res.path); close(); };
    $('#rp-dir', m).onclick = () => { window.claw.proj.open(p.dir.replace(/[\\/]+$/, '') + '/组会汇报'); };
    $('#rp-md', m).onclick = () => { window.claw.proj.open(p.dir.replace(/[\\/]+$/, '') + '/' + mdRel); };
  });
}
