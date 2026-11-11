import { icon } from './icons.js';
import {
  activeTasks, balance, byId, createWorkspace, dateLabel, day, escape as e, focus, loadWorkspace,
  phaseLabels, projectStats, storageKey, taskLabels, uid
} from './model.js';
import * as view from './views.js';
import { form } from './dialogs.js';
import { assistantContext, assistantPanel, assistantResult, localCandidates, modes } from './assistant.js';

const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#toast');
const tabs = {};
let data = loadWorkspace();
let page = 'home';
let aiConfig = null;
let pendingAI;
let conversion;
let modalTrigger;
let toastTimer;
let visibleDay = day();

const dark = () => document.documentElement.dataset.theme === 'dark';
const persist = () => {
  try { localStorage.setItem(storageKey, JSON.stringify(data)); }
  catch { toast('浏览器无法保存工作台数据。'); }
};
const find = (list, id) => byId(data[list], id);
const put = (list, item, key = 'id') => {
  const index = list.findIndex(old => old[key] === item[key]);
  if (index < 0) list.push(item);
  else list[index] = item;
};
const compact = (text, length = 120) => text.trim().split(/\r?\n/)[0].slice(0, length);
const { button, iconButton, link, pill } = view;

function render() {
  document.querySelector('#sidebar').innerHTML = view.sidebar(page, data, dark());
  document.querySelector('#topbar').innerHTML = view.topbar(page);
  main.innerHTML = page === 'settings' ? view.settings(data, aiConfig, dark()) : view[page](data, tabs[page]);
  document.title = page === 'home' ? '步序 · 个人工作台' : `${view.pages[page][0]} · 步序`;
}

function route() {
  const name = location.hash.slice(2);
  page = Object.hasOwn(view.pages, name) ? name : 'home';
  document.body.classList.remove('menu-open');
  render();
  window.scrollTo(0, 0);
}

function navigate(target, tab) {
  if (tab) tabs[target] = tab;
  if (dialog.open) dialog.close();
  if (location.hash === `#/${target}` || target === 'home' && !location.hash) route();
  else location.hash = `/${target}`;
}

function toast(message) {
  notice.textContent = message;
  notice.hidden = false;
  if (notice.showPopover && !notice.matches(':popover-open')) notice.showPopover();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (notice.hidePopover && notice.matches(':popover-open')) notice.hidePopover();
    notice.hidden = true;
  }, 2900);
}

function modal(title, content, style = '') {
  if (!dialog.open) modalTrigger = document.activeElement;
  dialog.className = style;
  dialog.innerHTML = `<div class="modal-head"><h2 id="dialog-title">${e(title)}</h2>${iconButton('关闭', 'close', 'close')}</div><div class="modal-content">${content}</div>`;
  if (!dialog.open) dialog.showModal();
  const first = dialog.querySelector('input:not([type=checkbox]), select, textarea, .choice-row');
  (first ?? dialog.querySelector('.modal-head button')).focus();
}

function closeModal() {
  dialog.close();
  conversion = undefined;
}

function details(title, { context = '', body = '', actions = '', meta = '' } = {}) {
  modal(title, `${context ? `<div class="chain">${context}</div>` : ''}${meta}
    ${body}<footer class="modal-footer detail-actions">${actions}</footer>`);
}
const paragraph = value => value ? `<p class="detail-copy">${e(value)}</p>` : '';
const detailSection = (title, content) => content ? `<div class="detail-section"><h3>${title}</h3>${content}</div>` : '';
const trail = nodes => nodes.filter(Boolean).map(([item, action]) => link(item.title, `${action}:${item.id}`, '')).join(icon('chevron', 13));

function taskDetail(id) {
  const task = find('tasks', id);
  if (!task) return;
  const project = find('projects', task.project);
  const goal = project && find('goals', project.goal);
  const direction = goal && find('directions', goal.direction);
  const today = task.focusDate === day();
  const actionable = task.status === 'todo' || task.status === 'doing';
  const notes = data.notes.filter(note => note.task === id);
  details(task.title, {
    context: trail([direction && [direction, 'direction'], goal && [goal, 'goal'], project && [project, 'project']]),
    meta: `<div class="detail-meta">${pill(taskLabels[task.status], task.status === 'done' || task.status === 'doing' ? 'green' : '')}
      ${today ? pill('今日重点', 'green') : ''}${task.minutes ? pill(`${task.minutes} 分钟`) : ''}${task.due ? pill(dateLabel(task.due)) : ''}</div>`,
    body: paragraph(task.description) + (direction?.description ? detailSection('方向', paragraph(direction.description)) : '') +
      detailSection('关联笔记', notes.map(note => `<div class="detail-link">${link(note.title, `note:${note.id}`)}</div>`).join('')),
    actions: button('编辑', `edit:task:${id}`, 'edit') +
      (actionable ? button('AI 拆解', `ai:task:${id}`, 'spark') : '') +
      (today || actionable ? button(today ? '移出今日' : '加入今日', `focus:${id}`, 'pin') : '') +
      (task.status === 'todo' ? button('开始', `start:${id}`, 'play', 'primary') : task.status === 'doing'
        ? button('完成', `toggle:${id}`, 'check', 'primary') : task.status === 'done' ? button('恢复任务', `toggle:${id}`, 'right') : '')
  });
}

function directionDetail(id) {
  const direction = find('directions', id);
  if (!direction) return;
  const goals = data.goals.filter(goal => goal.direction === id);
  details(direction.title, {
    meta: `<div class="detail-meta">${pill(direction.id === data.mainDirection ? '主方向' : phaseLabels[direction.status], 'green')}</div>`,
    body: paragraph(direction.description) + detailSection('期望成果', paragraph(direction.outcome)) +
      detailSection('阶段目标', goals.map(goal => `<div class="detail-link">${link(goal.title, `goal:${goal.id}`)}</div>`).join('') || '<p class="quiet-copy">暂无阶段目标</p>'),
    actions: button('编辑方向', `edit:direction:${id}`, 'edit') + button('添加目标', `edit:goal::${id}`, 'plus', 'primary')
  });
}

function goalDetail(id) {
  const goal = find('goals', id);
  if (!goal) return;
  const direction = find('directions', goal.direction);
  const projects = data.projects.filter(project => project.goal === id);
  details(goal.title, {
    context: trail([direction && [direction, 'direction']]),
    meta: `<div class="detail-meta">${pill(phaseLabels[goal.status], 'green')}${goal.end ? pill(`目标日期 · ${dateLabel(goal.end)}`) : ''}</div>`,
    body: paragraph(goal.description) + detailSection('完成标准', paragraph(goal.criteria)) +
      detailSection('关联项目', projects.map(project => `<div class="detail-link">${link(project.title, `project:${project.id}`)}</div>`).join('') || '<p class="quiet-copy">暂无关联项目</p>'),
    actions: button('编辑', `edit:goal:${id}`, 'edit') + button('AI 拆解', `ai:goal:${id}`, 'spark') + button('新建项目', `edit:project::${id}`, 'plus', 'primary')
  });
}

function projectDetail(id) {
  const project = find('projects', id);
  if (!project) return;
  const goal = find('goals', project.goal);
  const direction = goal && find('directions', goal.direction);
  const tasks = data.tasks.filter(task => task.project === id);
  const stats = projectStats(data, id);
  details(project.title, {
    context: trail([direction && [direction, 'direction'], goal && [goal, 'goal']]),
    meta: `<div class="detail-meta">${pill(phaseLabels[project.status], 'green')}${pill(`${stats.done} / ${stats.total} 个任务`)}</div>${view.bar(stats.percent)}`,
    body: paragraph(project.description) + detailSection('里程碑', paragraph(project.milestone)) +
      detailSection('项目任务', tasks.map(task => view.taskRow(task, data)).join('') || '<p class="quiet-copy">添加一个具体的下一步。</p>'),
    actions: button('编辑项目', `edit:project:${id}`, 'edit') + button('添加任务', `edit:task::${id}`, 'plus', 'primary')
  });
}

function noteDetail(id) {
  const note = find('notes', id);
  if (!note) return;
  const project = find('projects', note.project);
  const task = find('tasks', note.task);
  details(note.title, {
    context: trail([project && [project, 'project'], task && [task, 'task']]),
    meta: `<div class="detail-meta">${pill(note.kind === 'inbox' ? '收集箱' : '笔记')}${pill(dateLabel(note.created))}</div>`,
    body: paragraph(note.body),
    actions: button('编辑', `edit:note:${id}`, 'edit') + button('AI 整理', `ai:note:${id}`, 'spark') +
      (note.kind === 'inbox' ? button('整理为…', `file:${id}`, 'right', 'primary') : '')
  });
}

const choice = (title, caption, glyph, action) =>
  `<button class="choice-row" data-act="${e(action)}"><span class="tile green">${icon(glyph, 18)}</span><span><strong>${e(title)}</strong>${caption ? `<small>${e(caption)}</small>` : ''}</span>${icon('chevron', 17)}</button>`;

function chooseFocus() {
  const candidates = activeTasks(data).filter(task => task.focusDate !== day());
  modal('挑选今日重点', candidates.length ? candidates.map(task =>
    choice(task.title, find('projects', task.project)?.title ?? '独立任务', 'pin', `pick-focus:${task.id}`)).join('') :
    view.blank('没有可选的待办任务。', 'edit:task', '新建任务'));
}

function changeFocus(id, onlyAdd = false) {
  const task = find('tasks', id);
  if (!task) return false;
  if (task.focusDate === day() && !onlyAdd) {
    task.focusDate = '';
    toast('已移出今日重点');
  } else if (!['todo', 'doing'].includes(task.status) || task.focusDate === day()) {
    toast('这项任务已安排或已结束');
    return false;
  } else if (focus(data).length >= 3) {
    toast('今日重点已满。先移出一项再添加。');
    return false;
  } else {
    task.focusDate = day();
    toast('已加入今日重点');
  }
  persist();
  render();
  return true;
}

function setTaskStatus(task, status) {
  if (task.status !== status) {
    task.completed = status === 'done' ? day() : '';
    task.status = status;
  }
  if (status === 'cancelled' && task.focusDate === day()) task.focusDate = '';
}

function makeTask(title, project = '', description = '', minutes = 0) {
  return { id: uid(), title: compact(title), description, project, minutes, status: 'todo', due: '',
    important: true, urgent: false, focusDate: '', created: day() };
}

function showForm(type, id = '', parent = '') {
  const editor = form(type, id, parent, data, aiConfig);
  modal(editor.title, editor.content);
  if (conversion && conversion.type === type && !id) {
    const note = find('notes', conversion.id);
    dialog.querySelector('[name=title]').value = note.title;
    dialog.querySelector('[name=description]').value = note.body;
    if (type === 'task') dialog.querySelector('[name=project]').value = note.project || '';
  }
}

function showSearch() {
  modal('全局搜索', `<label class="search-box">${icon('search', 20)}<input type="search" placeholder="搜索方向、目标、项目、任务或笔记" aria-label="搜索内容"></label><div id="search-results"></div>`, 'search-modal');
}

function search(text) {
  const term = text.trim().toLocaleLowerCase();
  const groups = [['directions', 'direction', '方向'], ['goals', 'goal', '目标'], ['projects', 'project', '项目'], ['tasks', 'task', '任务'], ['notes', 'note', '记录']];
  const items = term ? groups.flatMap(([list, type, label]) => data[list].filter(item =>
    [item.title, item.description, item.body, item.criteria].some(value => value?.toLocaleLowerCase().includes(term)))
    .map(item => choice(item.title, label, 'search', `${type}:${item.id}`))).slice(0, 20) : [];
  dialog.querySelector('#search-results').innerHTML = items.join('') || (term ? '<p class="quiet-copy search-empty">没有找到匹配的内容。</p>' : '');
}

async function request(path, method = 'GET', payload) {
  const response = await fetch(`/api/${path}`, { method, headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(33000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求未完成，请重试。');
  return result;
}

function showAI(mode = 'action', id) {
  pendingAI = undefined;
  modal('AI 助手', assistantPanel(data, modes[mode] ? mode : 'action', id, Boolean(aiConfig)));
}

async function generate(form, fields) {
  const mode = form.dataset.mode;
  const { source, prompt } = fields;
  let result;
  if (mode === 'action' && !aiConfig) result = localCandidates(data);
  else {
    const context = assistantContext(data, mode, source, prompt);
    if (mode === 'action' && !context.candidates.length) {
      modal(modes[mode], assistantResult(mode, [], data));
      return;
    }
    const response = await request('assistant', 'POST', { mode, context });
    result = mode === 'action' ? response.items.map(item => {
      const candidate = context.candidates.find(task => task.id === item.id);
      return candidate && { ...candidate, reason: item.reason || candidate.reason };
    }).filter(Boolean) : response;
  }
  if (!form.isConnected || !dialog.open) return;
  pendingAI = { mode, source, result };
  modal(modes[mode], assistantResult(mode, result, data));
}

function applyAI() {
  if (!pendingAI) return;
  const { mode, source, result } = pendingAI;
  let projectId = mode === 'task' ? find('tasks', source)?.project : mode === 'note' ? find('notes', source)?.project : '';
  if (mode === 'goal') {
    projectId = uid();
    data.projects.push({ id: projectId, goal: source, title: result.project || '目标行动计划', milestone: result.milestone,
      description: result.summary, status: 'active', tone: 'green' });
  }
  for (const task of result.tasks) data.tasks.push(makeTask(task.title, projectId || '', '', task.minutes));
  pendingAI = undefined;
  persist();
  render();
  closeModal();
  toast(mode === 'goal' ? '已创建项目与任务' : '已加入任务池');
}

function confirm(title, message, accept, label) {
  modal(title, `<p class="detail-copy">${e(message)}</p><footer class="modal-footer"><div class="spacer"></div>${button('取消', 'close')}${button(label, accept, '', 'danger')}</footer>`);
}

function action(value) {
  const [type, id, arg] = value.split(':');
  switch (type) {
    case 'nav': return navigate(id, arg);
    case 'tab': tabs[page] = id; return render();
    case 'menu': return document.body.classList.toggle('menu-open');
    case 'theme':
      document.documentElement.dataset.theme = dark() ? 'light' : 'dark';
      try { localStorage.setItem('buxu.theme', document.documentElement.dataset.theme); } catch {}
      return render();
    case 'close': return closeModal();
    case 'create': return modal('新建', [
      ['任务', '加入任务池', 'list', 'edit:task'], ['记录', '先收集，稍后整理', 'note', 'edit:note'],
      ['方向', '设定长期投入的事', 'compass', 'edit:direction'], ['项目', '推进一个具体目标', 'box', 'edit:project']
    ].map(item => choice(...item)).join(''));
    case 'search': return showSearch();
    case 'edit': return showForm(id, arg, value.split(':')[3]);
    case 'task': return taskDetail(id);
    case 'project': return projectDetail(id);
    case 'direction': return directionDetail(id);
    case 'goal': return goalDetail(id);
    case 'note': return noteDetail(id);
    case 'review': return showForm('review', id);
    case 'entry': {
      const entry = find('entries', id);
      return entry && details(entry.title, { body: paragraph(entry.detail), meta: pill(dateLabel(entry.date)) });
    }
    case 'start': case 'toggle': {
      const task = find('tasks', id);
      if (!task || task.status === 'cancelled' || type === 'start' && task.status !== 'todo') return;
      const status = type === 'start' ? 'doing' : task.status === 'done' ? 'todo' : 'done';
      setTaskStatus(task, status);
      persist();
      render();
      if (dialog.open) taskDetail(id);
      return toast({ doing: '已开始任务', done: '已记录到成长时间线', todo: '已恢复到任务池' }[status]);
    }
    case 'choose-focus': return chooseFocus();
    case 'focus': case 'pick-focus': case 'suggest-focus':
      if (changeFocus(id, type !== 'focus') && dialog.open) {
        if (type === 'focus') taskDetail(id);
        else closeModal();
      }
      return;
    case 'file': return modal('整理记录', [
      ['笔记', '保存原文', 'note', `save-note:${id}`], ['任务', '从想法提炼下一步', 'list', `convert:task:${id}`],
      ['项目', '从想法建立项目', 'box', `convert:project:${id}`]
    ].map(item => choice(...item)).join(''));
    case 'save-note': {
      const note = find('notes', id);
      if (!note) return;
      note.kind = 'note';
      note.filed = day();
      persist();
      render();
      closeModal();
      return toast('已整理为笔记');
    }
    case 'convert':
      conversion = { type: id, id: arg };
      return showForm(id);
    case 'habit': {
      const tracked = data.habitLog[day()] || [];
      data.habitLog[day()] = tracked.includes(id) ? tracked.filter(item => item !== id) : [...tracked, id];
      persist();
      return render();
    }
    case 'ai': return showAI(id, arg);
    case 'accept-ai': return applyAI();
    case 'disconnect-ai': return request('config', 'DELETE').then(() => {
      aiConfig = null; render(); toast('已断开模型');
    });
    case 'export': {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `步序备份-${day()}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return toast('已导出备份');
    }
    case 'reset': return confirm('清空工作台？', '任务、笔记和其他记录将从此浏览器删除。', 'reset-confirmed', '清空工作台');
    case 'reset-confirmed':
      data = createWorkspace(false);
      persist();
      closeModal();
      navigate('home');
      return toast('工作台已清空');
    case 'remove': return confirm('删除这条记录？', '删除后无法在工作台中恢复。', `delete:${id}:${arg}`, '删除');
    case 'delete': {
      const records = { task: 'tasks', note: 'notes', habit: 'habits' };
      if (id === 'transaction') data.finance.transactions = data.finance.transactions.filter(item => item.id !== arg);
      else data[records[id]] = data[records[id]].filter(item => item.id !== arg);
      if (id === 'task') {
        for (const note of data.notes.filter(note => note.task === arg)) delete note.task;
        for (const review of data.reviews.filter(review => review.task === arg)) delete review.task;
      }
      persist();
      render();
      closeModal();
      return toast('已删除');
    }
  }
}

function save(type, id, f) {
  const itemId = id || uid();
  switch (type) {
    case 'profile': data.name = f.name; break;
    case 'direction':
      put(data.directions, { id: itemId, title: f.title, description: f.description, outcome: f.outcome, status: f.status });
      if (f.primary && f.status === 'active') data.mainDirection = itemId;
      else if (data.mainDirection === itemId) data.mainDirection = '';
      break;
    case 'goal':
      if (f.start && f.end && f.start > f.end) throw new Error('目标日期须在开始日期之后。');
      put(data.goals, { id: itemId, ...f }); break;
    case 'project': {
      const old = find('projects', id);
      put(data.projects, { id: itemId, ...f, tone: old?.tone ?? (data.projects.length % 2 ? 'sand' : 'green') });
      if (f.status === 'done' && old?.status !== 'done' && !data.entries.some(entry => entry.project === itemId && entry.title === (f.milestone || f.title))) {
        data.entries.push({ id: uid(), kind: 'milestone', title: f.milestone || f.title, detail: f.title, date: day(), project: itemId });
      }
      break;
    }
    case 'task': {
      const old = find('tasks', id) ?? makeTask(f.title);
      const inFocus = Boolean(f.focus && f.status !== 'cancelled');
      if (inFocus && old.focusDate !== day() && focus(data).length >= 3) throw new Error('今日重点最多 3 项。');
      const task = { ...old, id: itemId, title: f.title, description: f.description, project: f.project, minutes: Number(f.minutes),
        due: f.due, important: Boolean(f.important), urgent: Boolean(f.urgent),
        focusDate: inFocus ? day() : old.focusDate === day() ? '' : old.focusDate };
      setTaskStatus(task, f.status);
      put(data.tasks, task);
      break;
    }
    case 'note': {
      const old = find('notes', id);
      put(data.notes, { ...old, ...f, id: itemId, title: f.title || compact(f.body), created: old?.created ?? day(),
        filed: f.kind === 'note' ? old?.filed || day() : '' });
      break;
    }
    case 'review': {
      if (![f.done, f.gain, f.block, f.next].some(Boolean)) throw new Error('写下一项再保存。');
      if (f.createTask && !f.next) throw new Error('请填写下一步。');
      const date = id || day();
      const old = data.reviews.find(review => review.date === date);
      const review = { ...old, date, done: f.done, gain: f.gain, block: f.block, next: f.next };
      if (f.createTask && !review.task) {
        const task = makeTask(f.next, '', f.next);
        task.due = date === day() ? day(1) : '';
        data.tasks.push(task);
        review.task = task.id;
      }
      put(data.reviews, review, 'date');
      break;
    }
    case 'budget': {
      const current = Math.round(Number(f.balance) * 100);
      const target = Math.round(Number(f.target) * 100);
      if (!Number.isSafeInteger(current) || !Number.isSafeInteger(target)) throw new Error('金额超出可记录范围。');
      data.finance.opening += current - balance(data);
      data.finance.target = target;
      break;
    }
    case 'transaction': put(data.finance.transactions, { id: itemId, ...f, amount: Math.round(Number(f.amount) * 100) }); break;
    case 'health': put(data.health, { date: day(), ...f }, 'date'); break;
    case 'habit': put(data.habits, { id: itemId, title: f.title }); break;
  }
  if (conversion?.type === type && !id) {
    const note = find('notes', conversion.id);
    note.kind = 'note';
    note.filed = day();
    note[type] = itemId;
  }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-act]');
  if (!target) {
    if (event.target === dialog) closeModal();
    if (!event.target.closest('#sidebar')) document.body.classList.remove('menu-open');
    return;
  }
  try {
    await action(target.dataset.act);
    if (!target.isConnected && !dialog.open && document.activeElement === document.body) {
      document.querySelector(`[data-act="${CSS.escape(target.dataset.act)}"]`)?.focus();
    }
  } catch (error) { toast(error.message); }
});

dialog.addEventListener('input', event => {
  if (event.target.type === 'search') search(event.target.value);
});
dialog.addEventListener('change', event => {
  if (event.target.name === 'mode') showAI(event.target.value);
  if (event.target.name === 'provider') {
    const urls = { deepseek: 'https://api.deepseek.com/v1', openai: 'https://api.openai.com/v1' };
    event.target.form.elements.base.value = urls[event.target.value] || '';
  }
});
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  dialog.replaceChildren();
  conversion = undefined;
  pendingAI = undefined;
  if (modalTrigger?.isConnected) modalTrigger.focus();
});
dialog.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const type = form.dataset.form;
  const fields = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
  const errorNode = form.querySelector('.form-error');
  const submit = form.querySelector('[type=submit]');
  if (!submit || submit.disabled) return;
  errorNode.hidden = true;
  submit.disabled = true;
  const label = submit.textContent;
  try {
    if (type === 'assistant') {
      submit.textContent = '生成中…';
      await generate(form, fields);
      return;
    }
    if ('title' in fields && !fields.title && type !== 'note') throw new Error('请输入名称。');
    if (type === 'note' && !fields.body) throw new Error('请输入记录内容。');
    if (type === 'goal' && !fields.criteria) throw new Error('请输入完成标准。');
    if (type === 'ai-config') {
      submit.textContent = '连接中…';
      aiConfig = await request('config', 'POST', fields);
    } else {
      save(type, form.dataset.id, fields);
      persist();
    }
    render();
    if (form.isConnected && dialog.open) closeModal();
    toast(type === 'ai-config' ? '模型已连接' : '已保存');
  } catch (error) {
    errorNode.textContent = error.name === 'TimeoutError' ? '请求超时，请重试。' : error.message;
    errorNode.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
});

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    showSearch();
  }
  if (event.key === 'Escape') {
    if (dialog.open) {
      event.preventDefault();
      closeModal();
    }
    document.body.classList.remove('menu-open');
  }
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && visibleDay !== day()) {
    visibleDay = day();
    render();
  }
});
persist();
route();
request('config').then(config => {
  aiConfig = config.connected ? config : null;
  if (page === 'settings') render();
}).catch(() => {});
