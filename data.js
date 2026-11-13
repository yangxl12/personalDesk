const STORAGE_KEY = "buxu-prd-demo-v1";

const pad = value => String(value).padStart(2, "0");
const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const currentMonth = () => localDate().slice(0, 7);
const dateLabel = value => new Intl.DateTimeFormat(document.documentElement.lang, {
  month: "long", day: "numeric",
}).format(new Date(value.length === 10 ? value + "T12:00:00" : value));
const activityLabel = value => new Intl.DateTimeFormat(document.documentElement.lang, {
  month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));
const money = cents => new Intl.NumberFormat(document.documentElement.lang, {
  style: "currency", currency: "CNY", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2,
}).format(cents / 100);
const updatedFirst = records => [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const summary = (text, limit = 80) => {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? compact.slice(0, limit) + "…" : compact;
};

function seedData() {
  const now = new Date();
  const dayInMonth = day => localDate(new Date(now.getFullYear(), now.getMonth(), Math.min(day, now.getDate())));
  const previousMonth = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 10));
  const daysAgo = days => new Date(now.getTime() - days * 86400000).toISOString();
  const makeTasks = (prefix, items) => items.map(([title, done], index) => ({
    id: `${prefix}-${index}`, title, done: Boolean(done),
  }));
  return {
    goals: [
      { id: "english", title: "提升英语口语", description: "能自然地做一个三分钟的英文自我介绍。", tone: "violet", items: [
        { id: "intro", title: "练习自我介绍", tasks: makeTasks("intro", [
          ["写一份草稿", 1], ["整理常用表达", 1], ["录音练习一次", 0],
        ]) },
        { id: "practice", title: "积累日常表达", tasks: makeTasks("practice", [
          ["收集十个常用短语", 1], ["做一次影子跟读", 1], ["找朋友练习对话", 0],
        ]) },
      ] },
      { id: "run", title: "建立跑步习惯", description: "完成每周两次轻松跑，先把节奏稳定下来。", tone: "mint", items: [
        { id: "routine", title: "完成四周跑步计划", tasks: makeTasks("routine", [
          ["第一周 · 两次轻松跑", 1], ["第二周 · 两次轻松跑", 1],
          ["第三周 · 两次轻松跑", 0], ["第四周 · 两次轻松跑", 0],
        ]) },
      ] },
      { id: "read", title: "读完《认知觉醒》", description: "读完并记录三条可以立刻实践的想法。", tone: "amber", items: [
        { id: "reading", title: "读书与笔记", tasks: makeTasks("reading", [
          ["读完上半部分", 1], ["读完全书", 0], ["整理读书笔记", 0],
        ]) },
      ] },
    ],
    notes: [
      { id: "small", title: "把任务拆得再小一点", body: "有些事迟迟没开始，是因为下一步还不够具体。先把「练英语」改成「录一段 60 秒的自我介绍」，看能不能更轻松地开始。", updatedAt: daysAgo(0) },
      { id: "weekend", title: "周末散步时想到的事", body: "试着给日程留一段空白。散步时不听播客，沿着河边走一圈，看看脑子会自己想到什么。", updatedAt: daysAgo(2) },
      { id: "routine-note", title: "", body: "想试试每周五花十分钟复盘，只记三件事：做成了什么、哪里卡住了、下周从哪一步开始。", updatedAt: daysAgo(4) },
    ],
    transactions: [
      { id: "salary", type: "income", cents: 980000, date: dayInMonth(5), note: "本月工资" },
      { id: "freelance", type: "income", cents: 270000, date: dayInMonth(11), note: "设计兼职" },
      { id: "rent", type: "expense", cents: 260000, date: dayInMonth(3), note: "房租" },
      { id: "food", type: "expense", cents: 48250, date: dayInMonth(10), note: "餐饮和买菜" },
      { id: "commute", type: "expense", cents: 20000, date: dayInMonth(9), note: "交通充值" },
      { id: "books", type: "expense", cents: 19800, date: dayInMonth(8), note: "买书" },
      { id: "past-pay", type: "income", cents: 980000, date: previousMonth, note: "上月工资" },
      { id: "past-rent", type: "expense", cents: 260000, date: previousMonth, note: "上月房租" },
    ],
    savings: { current: 3260000, target: 5000000 },
    chats: [
      { id: "speaking", updatedAt: daysAgo(1), messages: [
        { id: "speaking-user", role: "user", text: "怎样把英语口语练习安排得更容易坚持？" },
        { id: "speaking-ai", role: "assistant", text: "先把练习固定在一个已有习惯之后，比如晚饭后。每次用 5 分钟完成一个小任务：读一遍自我介绍、录一遍，再记下一处想改的表达。\n\n今天可以从写出开头三句话开始。" },
      ] },
      { id: "review", updatedAt: daysAgo(5), messages: [
        { id: "review-user", role: "user", text: "帮我想一个十分钟的周复盘流程" },
        { id: "review-ai", role: "assistant", text: "前 3 分钟回顾完成了什么，中间 4 分钟选一件遇到阻碍的事，最后 3 分钟写下下周可以开始的一个动作。" },
      ] },
    ],
  };
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn("读取演示数据失败", error);
  }
  return seedData();
}

function progress(tasks) {
  const done = tasks.filter(task => task.done).length;
  const total = tasks.length;
  const percent = total ? Math.round(done / total * 100) : 0;
  return { done, total, percent: done < total ? Math.min(percent, 99) : percent };
}

const goalProgress = goal => progress(goal.items.flatMap(item => item.tasks));
const isComplete = ({ total, done }) => total > 0 && done === total;

function monthlyTotals(transactions, month) {
  const totals = { income: 0, expense: 0, balance: 0, count: 0 };
  for (const transaction of transactions) {
    if (!transaction.date.startsWith(month)) continue;
    totals[transaction.type] += transaction.cents;
    totals.count++;
  }
  totals.balance = totals.income - totals.expense;
  return totals;
}
