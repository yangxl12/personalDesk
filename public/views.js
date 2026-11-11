import { icon } from './icons.js';
import {
  activeTasks, balance, byId, dateLabel, day, escape as e, focus, goalStats, isUrgent,
  money, phaseLabels, progress, projectStats, taskLabels, timeline
} from './model.js';

export const pages = {
  home: ['工作台', 'home'], directions: ['方向与目标', 'compass'], projects: ['项目与任务', 'layers'],
  notes: ['思考与记录', 'note'], growth: ['成长回顾', 'trend'], finance: ['财务', 'wallet'],
  health: ['健康', 'heart'], settings: ['设置', 'settings']
};

export const button = (label, action, glyph, style = 'secondary') =>
  `<button type="button" class="button ${style}" data-act="${e(action)}">${glyph ? icon(glyph, 17) : ''}<span>${e(label)}</span></button>`;
export const iconButton = (label, action, glyph, style = '') =>
  `<button type="button" class="icon-button ${style}" data-act="${e(action)}" title="${e(label)}" aria-label="${e(label)}">${icon(glyph, 18)}</button>`;
export const link = (label, action, glyph = 'right') =>
  `<button type="button" class="text-button" data-act="${e(action)}">${e(label)}${glyph ? icon(glyph, 15) : ''}</button>`;
const navLink = (page, current) => `<a href="#/${page}" class="nav-link" ${page === current ? 'aria-current="page"' : ''}>${icon(pages[page][1], 19)}${pages[page][0]}</a>`;

export function sidebar(page, data, dark) {
  return `
    <a href="#/home" class="brand"><img src="/assets/mark.svg" width="39" height="39" alt=""><span>步序<small>个人工作台</small></span></a>
    <nav aria-label="主导航">
      <div class="nav-group"><span class="nav-label">工作</span>
        ${['home', 'directions', 'projects', 'notes', 'growth'].map(key => navLink(key, page)).join('')}
      </div>
      <div class="nav-group"><span class="nav-label">生活</span>
        ${['finance', 'health'].map(key => navLink(key, page)).join('')}
      </div>
    </nav>
    <div class="sidebar-foot">
      ${navLink('settings', page)}
      <div class="profile">
        <button class="profile-name" data-act="edit:profile"><span class="avatar">${e(data.name?.slice(0, 1) || '我')}</span><strong>${e(data.name || '个人空间')}</strong></button>
        ${iconButton(dark ? '切换浅色' : '切换深色', 'theme', dark ? 'sun' : 'moon')}
      </div>
    </div>`;
}

export function topbar(page) {
  return `
    <div class="location">${iconButton('打开导航', 'menu', 'menu', 'mobile-menu')}<span class="location-parent">个人空间</span><span class="location-divider">/</span><strong>${pages[page][0]}</strong></div>
    <div class="top-actions">
      <button class="search-trigger" data-act="search" aria-label="全局搜索">${icon('search', 18)}<span>搜索</span><kbd>Ctrl K</kbd></button>
      ${button('AI 助手', 'ai', 'spark', 'quiet ai-trigger')}
      ${button('新建', 'create', 'plus', 'primary')}
    </div>`;
}

export const blank = (label, action, actionLabel) =>
  `<div class="empty"><span class="empty-icon">${icon('inbox', 23)}</span><p>${e(label)}</p>${action ? button(actionLabel, action, 'plus') : ''}</div>`;

const sectionHead = (title, action = '', label = '', extra = '') => `
  <div class="section-head"><div class="section-title"><h2>${title}</h2>${extra}</div>${action ? link(label, action) : ''}</div>`;
const pageHead = (title, description, actions = '') => `
  <header class="page-head"><div><h1>${title}</h1><p>${description}</p></div><div class="page-actions">${actions}</div></header>`;
const pill = (label, tone = '') => `<span class="pill ${tone}">${e(label)}</span>`;
const bar = (percent, tone = '') => `<span class="progress ${tone}" role="progressbar" aria-label="完成进度" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></span>`;
const tabs = (options, selected) => `<div class="tabs" aria-label="切换视图">${options.map(([key, label]) =>
  `<button data-act="tab:${key}" aria-pressed="${key === selected}">${label}</button>`).join('')}</div>`;

function taskRow(task, data, options = {}) {
  const project = byId(data.projects, task.project);
  const status = task.status;
  const complete = status === 'done';
  const today = task.focusDate === day();
  const context = project?.title ?? '独立任务';
  const action = options.home
    ? status === 'doing' ? pill('进行中', 'green') : status === 'todo' ? iconButton('开始任务', `start:${task.id}`, 'play', 'start-button') : ''
    : today ? pill('今日重点', 'green') : status === 'todo' || status === 'doing' ? iconButton('加入今日重点', `focus:${task.id}`, 'pin', 'pin-button') : '';
  return `<div class="task-row ${complete ? 'completed' : ''} ${status === 'doing' ? 'in-progress' : ''}">
    <button class="task-check" data-act="toggle:${e(task.id)}" aria-label="${e((complete ? '恢复任务 ' : '完成任务 ') + task.title)}" aria-pressed="${complete}" ${status === 'cancelled' ? 'disabled' : ''}>${complete ? icon('check', 15) : ''}</button>
    <button class="task-body" data-act="task:${e(task.id)}">
      <strong>${e(task.title)}</strong><span class="task-meta">${options.home && project ? '<i></i>' : ''}${e(context)}
      ${task.minutes ? `<span class="meta-dot"></span>${icon('clock', 13)} ${e(task.minutes)} 分钟` : ''}
      ${!options.home && task.due ? `<span class="meta-dot"></span>${e(dateLabel(task.due))}` : ''}</span>
    </button><div class="row-action">${action}</div>
  </div>`;
}

function projectRow(project, data) {
  const stats = projectStats(data, project.id);
  const tone = project.tone === 'sand' ? 'sand' : 'green';
  return `<button class="project-row" data-act="project:${e(project.id)}">
    <span class="tile ${tone}">${icon(tone === 'sand' ? 'book' : 'box', 19)}</span>
    <span class="project-info"><span class="project-title"><strong>${e(project.title)}</strong><span>${stats.percent}%</span></span>
      ${bar(stats.percent, tone)}
      <span class="project-next">${stats.next ? `下一步 · ${e(stats.next.title)}` : project.status === 'done' ? '已完成' : stats.total ? '现有任务已完成' : '添加下一步行动'}</span>
    </span>
  </button>`;
}

const entryTypes = {
  task: ['check', '完成任务', 'green'], note: ['note', '沉淀笔记', 'sand'],
  milestone: ['flag', '项目成果', 'green'], review: ['edit', '每日复盘', 'blue']
};

function entryRow(entry, compact = false) {
  const [glyph, label, tone] = entryTypes[entry.kind];
  const action = { task: 'task', note: 'note', review: 'review', milestone: 'entry' }[entry.kind];
  return `<button class="entry-row ${compact ? 'compact' : ''}" data-act="${action}:${e(entry.id)}">
    <span class="tile ${tone}">${icon(glyph, 17)}</span>
    <span class="entry-text"><strong>${e(entry.title)}</strong><small>${e(compact ? entry.detail || label : [label, entry.detail].filter(Boolean).join(' · '))}</small></span>
    ${compact ? `<time datetime="${e(entry.date)}">${entry.date === day() ? '今天' : e(dateLabel(entry.date))}</time>` : icon('chevron', 16)}
  </button>`;
}

export function home(data) {
  const direction = byId(data.directions, data.mainDirection) ?? data.directions.find(item => item.status === 'active');
  const goal = direction && data.goals.find(item => item.direction === direction.id && item.status === 'active');
  const tasks = focus(data);
  const done = tasks.filter(task => task.status === 'done').length;
  const projects = data.projects.filter(project => project.status === 'active').slice(0, 2);
  const entries = timeline(data).slice(0, 3);
  const status = data.health.find(item => item.date === day());
  const total = balance(data);
  const target = data.finance.target;
  const hour = new Date().getHours();
  const greeting = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 19 ? '下午好' : '晚上好';
  return `
    <header class="greeting">
      <div class="date-stamp">${icon('calendar', 16)}<time datetime="${day()}">${dateLabel(day(), { month: 'long', day: 'numeric', weekday: 'long' }).replace(/(日)(星期)/, '$1 · $2')}</time></div>
      <h1>${greeting}${data.name ? `，${e(data.name)}` : ''}<span>。</span></h1>
    </header>
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <div class="hero-kicker">${icon('compass', 17)}当前方向</div>
        <h2 id="hero-title">${e(direction?.title ?? '设定你的方向')}</h2>
        <p>${e(goal ? `阶段目标 · ${goal.title}` : direction?.description || '从一件你愿意长期投入的事开始。')}</p>
        ${button(goal ? '查看目标' : direction ? '查看方向' : '新建方向', goal ? `goal:${goal.id}` : direction ? `direction:${direction.id}` : 'edit:direction', 'right', 'hero-button')}
      </div>
    </section>
    <div class="dashboard-grid">
      <section class="dashboard-section">
        ${sectionHead('今日三件事', 'nav:projects:tasks', '任务池', `<span class="section-count" aria-label="已完成 ${done} 项，共 ${tasks.length} 项"><span>${done}</span> / ${tasks.length || 3}</span>`)}
        <div class="surface tasks-card">
          ${tasks.length ? tasks.map(task => taskRow(task, data, { home: true })).join('') : blank('今天还没有重点任务。', 'choose-focus', '挑选任务')}
          <div class="card-footer">${tasks.length && tasks.length < 3 ? button('添加今日重点', 'choose-focus', 'plus', 'plain') : button('快速记录', 'edit:note', 'plus', 'plain')}
            ${button('行动建议', 'ai:action', 'spark', 'plain suggestion')}</div>
        </div>
      </section>
      <section class="dashboard-section">
        ${sectionHead('项目进展', 'nav:projects:project-list', '全部项目')}
        <div class="surface projects-card">${projects.length ? projects.map(project => projectRow(project, data)).join('') : blank('暂无进行中的项目。', 'edit:project', '新建项目')}</div>
      </section>
      <section class="dashboard-section">
        ${sectionHead('成长记录', 'nav:growth', '查看时间线')}
        <div class="surface recent-card">${entries.length ? entries.map(entry => entryRow(entry, true)).join('') : blank('完成的任务和笔记会出现在这里。')}
          <div class="card-footer">${button(data.reviews.some(item => item.date === day()) ? '编辑今日复盘' : '写今日复盘', 'edit:review', 'edit', 'plain')}</div>
        </div>
      </section>
      <section class="dashboard-section">
        ${sectionHead('生活速览')}
        <div class="surface life-card">
          <button class="life-row" data-act="nav:finance"><span class="tile green">${icon('wallet', 18)}</span><span><small>当前余额</small><strong class="numeric">${money(total)}</strong></span>${target ? pill(`储蓄 ${progress(total, target)}%`) : ''}${icon('chevron', 16)}</button>
          <button class="life-row" data-act="${status ? 'nav:health' : 'edit:health'}"><span class="tile sand">${icon('heart', 18)}</span><span><small>今日状态</small><strong>${status ? `精力${e(status.energy)} · 心情${e(status.mood)}` : '记录状态'}</strong></span>${icon('chevron', 16)}</button>
        </div>
      </section>
    </div>`;
}

export function directions(data) {
  return pageHead('方向与目标', '用可验收的目标推进长期方向。',
    button('新建方向', 'edit:direction', 'plus', 'primary')) + (
    data.directions.length ? `<div class="stack">${data.directions.map(direction => {
      const goals = data.goals.filter(goal => goal.direction === direction.id);
      return `<section class="surface content-card direction-card">
        <div class="content-title"><span class="tile green">${icon('compass', 22)}</span>
          <div><h2>${e(direction.title)}</h2><p>${e(direction.description)}</p></div>
          ${direction.id === data.mainDirection ? pill('主方向', 'green') : pill(phaseLabels[direction.status])}
          ${iconButton('查看方向', `direction:${direction.id}`, 'arrow')}
        </div>
        <div class="sub-list">${goals.map(goal => {
          const stats = goalStats(data, goal.id);
          return `<button class="line-row" data-act="goal:${e(goal.id)}">${icon('target', 18)}<strong>${e(goal.title)}</strong><span>${stats.done} / ${stats.total} 个项目</span>${pill(phaseLabels[goal.status], goal.status === 'active' ? 'green' : '')}${icon('chevron', 16)}</button>`;
        }).join('') || '<p class="quiet-copy">暂无阶段目标</p>'}</div>
        ${button('添加阶段目标', `edit:goal::${direction.id}`, 'plus', 'plain')}
      </section>`;
    }).join('')}</div>` : `<div class="surface">${blank('先创建一个长期方向。', 'edit:direction', '新建方向')}</div>`
  );
}

export function projects(data, selected) {
  const current = selected || 'project-list';
  const tabList = [['project-list', '项目'], ['tasks', '任务池'], ['today', '今日重点'], ['planned', '计划'], ['quadrant', '四象限']];
  let content;
  if (current === 'project-list') {
    content = `<div class="collection-grid">${data.projects.map(project => {
      const stats = projectStats(data, project.id);
      const goal = byId(data.goals, project.goal);
      return `<article class="surface content-card project-card"><div class="content-title"><span class="tile ${project.tone === 'sand' ? 'sand' : 'green'}">${icon('box', 22)}</span><div><h2>${e(project.title)}</h2><p>${e(goal?.title || '独立项目')}</p></div>${pill(phaseLabels[project.status], project.status === 'active' ? 'green' : '')}</div>
        <div class="project-count"><span>${stats.done} / ${stats.total} 个任务</span><strong>${stats.percent}%</strong></div>${bar(stats.percent)}
        <div class="project-card-foot"><span>${stats.next ? `下一步 · ${e(stats.next.title)}` : project.status === 'active' ? '待确定下一步' : e(phaseLabels[project.status])}</span>${link('详情', `project:${project.id}`)}</div></article>`;
    }).join('')}</div>`;
    if (!data.projects.length) content = `<div class="surface">${blank('暂无项目。', 'edit:project', '新建项目')}</div>`;
  } else if (current === 'quadrant') {
    const groups = [[true, true, '重要且紧急', 'sand'], [true, false, '重要但不紧急', 'green'],
      [false, true, '紧急但不重要', 'blue'], [false, false, '不紧急也不重要', '']];
    content = `<div class="collection-grid">${groups.map(([important, urgent, title, tone]) => {
      const tasks = activeTasks(data).filter(task => task.important === important && isUrgent(task) === urgent);
      return `<section class="surface quadrant"><div class="quadrant-head"><span class="tile ${tone}">${icon(urgent ? 'bolt' : 'flag', 17)}</span><h2>${title}</h2><span>${tasks.length}</span></div>
        ${tasks.length ? tasks.map(task => taskRow(task, data)).join('') : '<p class="quiet-copy">暂无任务</p>'}</section>`;
    }).join('')}</div>`;
  } else {
    const items = current === 'today' ? focus(data) : current === 'planned' ? activeTasks(data).filter(task => task.due).sort((a, b) => a.due.localeCompare(b.due)) : data.tasks;
    content = `<div class="surface list-card">${items.length ? items.map(task => taskRow(task, data)).join('') : blank('这里还没有任务。', current === 'today' ? 'choose-focus' : 'edit:task', current === 'today' ? '挑选任务' : '新建任务')}</div>`;
  }
  return pageHead('项目与任务', '查看项目进展，安排下一步。',
    button('新建项目', 'edit:project', 'box') + button('新建任务', 'edit:task', 'plus', 'primary')) +
    tabs(tabList, current) + content;
}

export function notes(data, selected) {
  const current = selected || 'inbox';
  const notes = data.notes.filter(note => note.kind === current).slice().reverse();
  return pageHead('思考与记录', '收下灵感，把想法整理成行动。',
    button('快速记录', 'edit:note', 'plus', 'primary')) + tabs([['inbox', '收集箱'], ['note', '笔记']], current) +
    (notes.length ? `<div class="collection-grid">${notes.map(note => `<button class="surface note-card" data-act="note:${e(note.id)}">
      <span class="tile ${current === 'inbox' ? 'sand' : 'green'}">${icon(current === 'inbox' ? 'inbox' : 'note', 20)}</span>
      <h2>${e(note.title)}</h2><p>${e(note.body)}</p><span class="note-date">${e(dateLabel(note.created))}${note.project ? ` · ${e(byId(data.projects, note.project)?.title)}` : ''}</span></button>`).join('')}</div>`
      : `<div class="surface">${blank(current === 'inbox' ? '收集箱是空的。' : '还没有正式笔记。', `edit:note::${current}`, '新建记录')}</div>`);
}

export function growth(data, selected) {
  const current = selected || 'all';
  const entries = timeline(data).filter(entry => current === 'all' || entry.date >= day(current === '7d' ? -6 : -29));
  const dates = [...new Set(entries.map(entry => entry.date))];
  return pageHead('成长回顾', '回看做过的事，决定下一步。',
    button(data.reviews.some(review => review.date === day()) ? '编辑今日复盘' : '写今日复盘', 'edit:review', 'edit', 'primary')) +
    tabs([['all', '全部'], ['7d', '近 7 天'], ['30d', '近 30 天']], current) +
    (dates.length ? `<div class="timeline">${dates.map(date => `<section class="timeline-day"><div class="timeline-date"><time datetime="${e(date)}">${date === day() ? '今天' : e(dateLabel(date))}</time></div><div class="surface">${entries.filter(entry => entry.date === date).map(entry => entryRow(entry)).join('')}</div></section>`).join('')}</div>` : `<div class="surface">${blank('这段时间还没有成长记录。')}</div>`);
}

export function finance(data) {
  const { target, transactions } = data.finance;
  const total = balance(data);
  const sumToday = type => transactions.filter(item => item.type === type && item.date === day()).reduce((sum, item) => sum + item.amount, 0);
  const percent = progress(total, target);
  const sorted = transactions.slice().reverse().sort((a, b) => b.date.localeCompare(a.date));
  return pageHead('财务', '记录收支，了解储蓄进度。',
    button('调整余额与目标', 'edit:budget', 'settings') + button('记一笔', 'edit:transaction', 'plus', 'primary')) +
    `<div class="collection-grid"><section class="surface content-card balance-card"><span>当前余额</span><strong class="numeric">${money(total)}</strong><div><span>今日收入 <b>${money(sumToday('income'))}</b></span><span>今日支出 <b>${money(sumToday('expense'))}</b></span></div></section>
    <section class="surface content-card savings-card"><h2>储蓄目标</h2><p>${target ? money(target) : '尚未设置目标'}</p>${target ? bar(percent) + `<span>${percent}% 已达成</span>` : link('设置目标', 'edit:budget')}</section></div>
    <section class="page-section">${sectionHead('收支记录')}<div class="surface list-card">
      ${sorted.length ? sorted.map(item => `<button class="line-row finance-row" data-act="edit:transaction:${e(item.id)}"><span class="tile ${item.type === 'income' ? 'green' : 'sand'}">${icon('wallet', 18)}</span><strong>${e(item.title)}</strong><span>${e(dateLabel(item.date))}</span><b class="numeric">${item.type === 'income' ? '+' : '−'}${money(item.amount)}</b></button>`).join('') : blank('还没有收支记录。', 'edit:transaction', '记一笔')}</div></section>`;
}

export function health(data) {
  const today = data.health.find(record => record.date === day());
  const history = data.health.filter(record => record.date !== day()).slice().sort((a, b) => b.date.localeCompare(a.date));
  const tracked = data.habitLog[day()] || [];
  return pageHead('健康', '留意今天的状态，给休息留点空间。',
    button(today ? '更新状态' : '记录状态', 'edit:health', 'edit', 'primary')) +
    `<div class="collection-grid"><section class="surface content-card"><h2>今日状态</h2>
      ${today ? `<div class="health-metrics">${[['bolt', '精力', today.energy], ['smile', '心情', today.mood], ['moon', '睡眠', today.sleep]].map(([glyph, label, value]) => `<div><span class="tile green">${icon(glyph, 18)}</span><small>${label}</small><strong>${e(value)}</strong></div>`).join('')}</div>` : blank('今天还没有记录。', 'edit:health', '记录状态')}</section>
    <section class="surface content-card"><div class="section-head"><h2>今日习惯</h2>${iconButton('添加习惯', 'edit:habit', 'plus')}</div>
      ${data.habits.length ? data.habits.map(item => `<div class="habit-row"><button class="task-check" aria-label="${e(item.title)}" aria-pressed="${tracked.includes(item.id)}" data-act="habit:${e(item.id)}">${tracked.includes(item.id) ? icon('check', 15) : ''}</button><span>${e(item.title)}</span>${iconButton('编辑习惯', `edit:habit:${item.id}`, 'edit')}</div>`).join('') : '<p class="quiet-copy">暂无习惯</p>'}</section></div>
    ${history.length ? `<section class="page-section">${sectionHead('状态记录')}<div class="surface list-card">${history.map(record => `<div class="line-row"><strong>${e(dateLabel(record.date))}</strong><span>精力${e(record.energy)} · 心情${e(record.mood)} · 睡眠${e(record.sleep)}</span></div>`).join('')}</div></section>` : ''}`;
}

export function settings(data, aiConfig, dark) {
  return pageHead('设置', '管理个人工作台和数据。') + `<div class="stack settings-list">
    <section class="surface content-card"><h2>个人空间</h2>
      <div class="setting-row"><div><strong>称呼</strong><p>${e(data.name || '未设置')}</p></div>${button('编辑', 'edit:profile', 'edit')}</div>
      <div class="setting-row"><div><strong>外观</strong><p>${dark ? '深色' : '浅色'}</p></div>${button(dark ? '使用浅色' : '使用深色', 'theme', dark ? 'sun' : 'moon')}</div>
    </section>
    <section class="surface content-card"><h2>AI 服务</h2>
      <div class="setting-row"><div><strong>${aiConfig ? e(aiConfig.model) : '未连接'}</strong><p>${aiConfig ? e(aiConfig.base) : '支持兼容 OpenAI API 的模型服务。'}</p></div><div class="setting-actions">${aiConfig ? button('断开', 'disconnect-ai', 'close') : ''}${button(aiConfig ? '更换配置' : '连接模型', 'edit:ai-config', 'spark')}</div></div>
    </section>
    <section class="surface content-card"><h2>工作台数据</h2>
      <div class="setting-row"><div><strong>导出备份</strong><p>下载当前浏览器中的工作台数据。</p></div>${button('导出 JSON', 'export', 'download')}</div>
      <div class="setting-row"><div><strong>清空工作台</strong><p>删除此浏览器中的工作台记录。</p></div>${button('清空', 'reset', 'trash')}</div>
    </section></div>`;
}

export { taskRow, bar, pill };
