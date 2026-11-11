/* ClawChat — 任务看板：所有群里的协作、核对和干活任务 */
'use strict';

let taskFilter = 'all';
const TASK_FILTERS = [['all', '全部'], ['active', '进行中'], ['waiting', '等你处理'], ['done', '已完成'], ['failed', '出错 / 已停止']];

function allTasks() {
  const out = [];
  for (const c of S.chats) for (const m of c.messages) {
    if (m.type === 'collab') {
      const bucket = COLLAB_ACTIVE.includes(m.status) ? 'active' : ['planned', 'ask'].includes(m.status) ? 'waiting' : m.status === 'done' ? 'done' : m.status === 'cancelled' ? 'cancelled' : 'failed';
      out.push({ chat: c, m, kind: m.mode === 'verify' ? '核对' : '协作', icon: m.mode === 'verify' ? '🔍' : '🤝', title: m.request, who: agentById(m.from), bucket,
        sub: m.tasks?.length ? `${m.tasks.filter((t) => t.status === 'done').length}/${m.tasks.length} 步完成` : '', usage: m.usage, secs: m.secs });
    } else if (m.type === 'work') {
      out.push({ chat: c, m, kind: '干活', icon: '🛠', title: m.task, who: agentById(m.from), bucket: m.status === 'running' ? 'active' : m.status === 'done' ? 'done' : 'failed',
        sub: m.files?.length ? `产出 ${m.files.length} 个文件` : '', secs: m.secs });
    } else if (m.type === 'confirm' && m.status === 'pending') {
      out.push({ chat: c, m, kind: '干活', icon: '🛠', title: m.task, who: agentById(m.agentId), bucket: 'waiting', sub: '等你确认执行' });
    }
  }
  return out.filter((t) => t.bucket !== 'cancelled').sort((a, b) => (b.m.ts || 0) - (a.m.ts || 0));
}

function renderTaskFilters(body) {
  const all = allTasks();
  const n = (k) => (k === 'all' ? all.length : all.filter((t) => t.bucket === k).length);
  body.innerHTML = `<div class="section-label">任务</div>` + TASK_FILTERS.map(([k, label]) => `<div class="item ${taskFilter === k ? 'active' : ''}" data-tfilter="${k}"><div class="meta"><div class="title"><span>${label}</span><span class="time">${n(k)}</span></div></div></div>`).join('');
}

function renderTasksPage() {
  const f = filter.trim().toLowerCase();
  const list = allTasks().filter((t) => (taskFilter === 'all' || t.bucket === taskFilter) && (!f || (t.title || '').toLowerCase().includes(f)));
  const label = { active: '进行中', waiting: '等你处理', done: '已完成', failed: '出错 / 已停止' };
  const total = {}; list.forEach((t) => addUsage(total, t.usage));
  $('#main').innerHTML = `<div class="page"><h2>任务看板</h2>
    <p class="desc">所有群里的协作、核对和干活任务。点一条可以跳到它所在的聊天。${fmtUsage(total) ? `<br>当前列表合计：${fmtUsage(total)}` : ''}</p>
    ${list.map((t) => `<div class="task-row b-${t.bucket}" data-tjump="${t.chat.id}|${t.m.id}">
        <div class="ti">${t.icon}</div>
        <div class="tm"><div class="tt">${esc((t.title || '').replace(/\s+/g, ' ').slice(0, 90))}</div>
          <div class="ts">${t.kind} · ${esc(chatTitle(t.chat))}${t.who ? ' · ' + esc(t.who.name) : ''}${t.sub ? ' · ' + t.sub : ''}${t.secs ? ' · ' + t.secs + ' 秒' : ''}${fmtUsage(t.usage) ? ' · ' + fmtUsage(t.usage) : ''} · ${fmtTime(t.m.ts)}</div></div>
        <span class="badge tb-${t.bucket}">${label[t.bucket]}</span></div>`).join('') || '<div class="empty" style="min-height:240px"><div><div class="big">📋</div>这里还没有任务。在群里发 <code>/协作</code>、<code>/核对</code> 或 <code>/干活</code> 试试。</div></div>'}
  </div>`;
}

function jumpToTask(chatId, msgId) {
  view = 'chats'; activeChatId = chatId; renderAll();
  setTimeout(() => {
    const el = document.querySelector(`[data-mid="${msgId}"]`);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
  }, 60);
}

function refreshTasksIfOpen() { if (view === 'tasks') { renderList(); renderTasksPage(); } }
