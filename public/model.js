export function day(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(part => String(part).padStart(2, '0')).join('-');
}

export const dateLabel = (value, options = { month: 'long', day: 'numeric' }) =>
  new Intl.DateTimeFormat('zh-CN', options).format(new Date(`${value}T12:00:00`));
export const money = cents => new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency: 'CNY', maximumFractionDigits: cents % 100 ? 2 : 0
}).format(cents / 100);
export const uid = () => crypto.randomUUID();
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const storageKey = 'buxu.workspace.v1';
export const taskLabels = { todo: '待处理', doing: '进行中', done: '已完成', cancelled: '已取消' };
export const phaseLabels = { active: '进行中', paused: '已暂停', done: '已完成', archived: '已归档' };

export function createWorkspace(demo = true) {
  const base = {
    version: 1, name: demo ? '林舟' : '', mainDirection: '', directions: [], goals: [],
    projects: [], tasks: [], notes: [], reviews: [], entries: [], health: [],
    habits: [], habitLog: {}, finance: { opening: 0, target: 0, transactions: [] }
  };
  if (!demo) return base;

  const task = (id, title, project, minutes, options = {}) => ({
    id, title, project, minutes, status: 'todo', focusDate: '', due: '',
    important: true, urgent: false, description: '', created: day(-4), ...options
  });
  return {
    ...base, mainDirection: 'd1',
    directions: [{
      id: 'd1', title: '做出有价值的产品', description: '用设计和技术解决真实问题，持续打磨自己的作品。',
      outcome: '建立一套从发现问题到验证产品的工作方法。', status: 'active'
    }],
    goals: [{
      id: 'g1', direction: 'd1', title: '发布个人产品的第一个版本',
      description: '完成个人工作台的最小闭环，让 3 位用户试用并收集反馈。',
      criteria: '完成方向、任务、记录和复盘闭环，收到 3 份试用反馈。',
      start: day(-18), end: day(30), status: 'active'
    }],
    projects: [
      { id: 'p1', goal: 'g1', title: '个人工作台', description: '验证从目标到每日行动的最小闭环。', milestone: '可点击原型', status: 'active', tone: 'green' },
      { id: 'p2', goal: 'g1', title: 'AI Agent 学习计划', description: '用一个可调用工具的 Agent 验证任务拆解方案。', milestone: '跑通一次工具调用', status: 'active', tone: 'sand' }
    ],
    tasks: [
      task('t1', '完成工作台首页原型', 'p1', 45, { status: 'doing', focusDate: day(), due: day(), urgent: true, description: '用低保真原型串起当前方向、今日重点和项目进展。' }),
      task('t2', '跑通一次 Agent 工具调用', 'p2', 30, { focusDate: day(), description: '用一个查询工具验证最小调用链路。' }),
      task('t3', '整理访谈的三个关键发现', 'p1', 20, { focusDate: day(), status: 'done', completed: day() }),
      task('t4', '访谈 3 位潜在用户', 'p1', 60, { status: 'done', completed: day(-2) }),
      task('t5', '梳理工作台的核心流程', 'p1', 30, { status: 'done', completed: day(-3) }),
      task('t6', '邀请首位用户试用原型', 'p1', 15, { due: day(3) }),
      task('t7', '完成工具调用示例阅读', 'p2', 25, { status: 'done', completed: day(-1) }),
      task('t8', '记录工具调用失败的处理方式', 'p2', 25),
      task('t9', '整理 Agent 拆解笔记', 'p2', 20, { due: day(5) })
    ],
    notes: [
      { id: 'n1', title: '让下一步足够具体', body: '访谈里出现了同一个问题：目标很明确，第一步却不够具体。下个版本先验证「打开就能开始」。', kind: 'note', project: 'p1', created: day(-1) },
      { id: 'n2', title: '试试每次只做一个小实验', body: '把 Agent 的测试拆成单次工具调用，每次记录一个发现。', kind: 'inbox', project: 'p2', created: day() }
    ],
    entries: [{ id: 'e1', date: day(-2), title: '完成首轮用户访谈', detail: '个人工作台', kind: 'milestone' }],
    health: [{ date: day(), energy: '充足', mood: '平稳', sleep: '不错' }],
    habits: [{ id: 'h1', title: '出门走 20 分钟' }],
    finance: { opening: 1248000, target: 2000000, transactions: [
      { id: 'f1', type: 'expense', amount: 3600, title: '午餐', date: day() }
    ] }
  };
}

export function loadWorkspace() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    if (data?.version === 1) return data;
  } catch {}
  return createWorkspace();
}

export const byId = (list, id) => list.find(item => item.id === id);
export const focus = data => data.tasks.filter(task => task.focusDate === day() && task.status !== 'cancelled');
export const activeTasks = data => data.tasks.filter(task => ['todo', 'doing'].includes(task.status));
export const isUrgent = task => task.urgent || Boolean(task.due && task.due <= day());
export const balance = data => data.finance.transactions.reduce((total, item) =>
  total + (item.type === 'income' ? item.amount : -item.amount), data.finance.opening);
export const progress = (done, total) => total > 0 ? Math.max(0, Math.min(100, Math.round(done / total * 100))) : 0;

export function projectStats(data, id) {
  const tasks = data.tasks.filter(task => task.project === id && task.status !== 'cancelled');
  const done = tasks.filter(task => task.status === 'done').length;
  const next = tasks.find(task => task.status === 'doing') ?? tasks.find(task => task.status === 'todo');
  return { done, total: tasks.length, next, percent: progress(done, tasks.length) };
}

export function goalStats(data, id) {
  const projects = data.projects.filter(project => project.goal === id && project.status !== 'archived');
  const done = projects.filter(project => project.status === 'done').length;
  return { done, total: projects.length, percent: progress(done, projects.length) };
}

export function timeline(data) {
  return [
    ...data.tasks.filter(task => task.status === 'done' && task.completed).map(task => ({
      id: task.id, date: task.completed, title: task.title, kind: 'task',
      detail: byId(data.projects, task.project)?.title ?? '独立任务'
    })),
    ...data.notes.filter(note => note.kind === 'note').map(note => ({
      id: note.id, date: note.filed ?? note.created, title: note.title, detail: '笔记', kind: 'note'
    })),
    ...data.reviews.map(review => ({
      id: review.date, date: review.date, title: '每日复盘', detail: review.gain || review.done, kind: 'review'
    })),
    ...data.entries
  ].sort((a, b) => b.date.localeCompare(a.date));
}
