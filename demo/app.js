"use strict";

const paths = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  finance: '<path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2M3 7h15a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-4a4 4 0 0 1 0-8h4"/><path d="M15 12h.01"/>',
  notes: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
  chats: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/><path d="M8.5 11.5h7"/>',
  spark: '<path d="M10 3c0 5-2 7-7 7 5 0 7 2 7 7 0-5 2-7 7-7-5 0-7-2-7-7Z"/><path d="M18.5 13v7m-3.5-3.5h7M18 3v4m-2-2h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M19 12H5m6 6-6-6 6-6"/>',
  upRight: '<path d="M6 18 18 6M8 6h10v10"/>',
  downRight: '<path d="m6 6 12 12M8 18h10V8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="M12 20H4v-4L16 4a2.8 2.8 0 0 1 4 4L8 20m6-14 4 4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3m4 0-1 15H6L5 6m5 4v7m4-7v7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
  run: '<path d="m13 4-8 9h6l-1 7 9-10h-6l1-6z"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v18H6a2 2 0 1 1 0-4h14M9 8h6"/>',
  settings: '<path d="M10 3h4l.6 2.7 2 .9 2.5-1.1 2 3.5-1.9 1.8v2.4l1.9 1.8-2 3.5-2.5-1.1-2 .9L14 21h-4l-.6-2.7-2-.9-2.5 1.1-2-3.5 1.9-1.8v-2.4L2.9 9l2-3.5 2.5 1.1 2-.9L10 3Z"/><circle cx="12" cy="12" r="3"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20.9 13.4a9 9 0 0 1-10.3-10.3 9 9 0 1 0 10.3 10.3Z"/>',
  cloud: '<path d="M6 18a4 4 0 1 1 .8-7.9 6 6 0 0 1 11.6 1A3.5 3.5 0 0 1 18 18Z"/>',
  rain: '<path d="M6 15a3.5 3.5 0 1 1 .5-7 5.5 5.5 0 0 1 10.6 1 3 3 0 0 1 .9 6m-9 2-1 3m5-3-1 3m5-3-1 3"/>',
  snow: '<path d="M12 3v18m-8-4.5 16-9m-16 0 16 9M9 4.5l3 3 3-3m-6 15 3-3 3 3M4 10.5l4-1 .5-4m7 13 .5-4 4-1M4 13.5l4 1 .5 4m7-13 .5 4 4 1"/>',
  pin: '<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
};

const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const h = escapeHtml;
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const $ = selector => document.querySelector(selector);
const main = $("#main");
const dialog = $("#dialog");
const panel = $("#ai-panel");
const toast = $("#toast");
const pages = [
  ["home", "工作台"], ["goals", "目标管理"], ["finance", "财务概览"],
  ["notes", "思考记录"], ["chats", "AI 对话历史"], ["settings", "设置"],
];
const labels = Object.fromEntries(pages);
const goalTones = ["violet", "mint", "amber"];
const toneIcons = { violet: "goals", mint: "run", amber: "book" };
let data = loadData();
let route = readRoute();
let month = currentMonth();
let menuOpen = false;
let aiOpen = false;
let activeChat = null;
let toastTimer;
let dialogSubmit;
let aiReturnFocus;
const drafts = new Map();
const pending = new Map();
const SETTINGS_KEY = "buxu-prd-demo-settings-v1";
const deepseek = { baseUrl: "https://api.deepseek.com", model: "deepseek-flash" };
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
let settings = loadSettings();
let weatherCoordinates;
let weatherCurrent;
let weatherState = "idle";
const weatherSource = "https://wttr.in/";

function loadSettings() {
  const defaults = { theme: "system", language: "zh-CN", provider: "demo", ...deepseek, apiKey: "" };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

function applyTheme() {
  const dark = settings.theme === "system" ? systemTheme.matches : settings.theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $('meta[name="theme-color"]').content = dark ? "#171522" : "#f7f7fb";
}

function updateClock() {
  const clock = $("#top-clock");
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (clock.dateTime !== time) {
    clock.textContent = time;
    clock.dateTime = time;
    clock.title = new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: "full" }).format(now);
  }
}

function weatherCondition(description) {
  if (/thunder/i.test(description)) return ["rain", "雷雨"];
  if (/snow|blizzard|sleet/i.test(description)) return ["snow", "雪"];
  if (/rain|drizzle|shower/i.test(description)) return ["rain", "雨"];
  if (/fog|mist/i.test(description)) return ["cloud", "雾"];
  if (/overcast/i.test(description)) return ["cloud", "阴"];
  if (/cloud/i.test(description)) return ["cloud", "多云"];
  if (/sunny/i.test(description)) return ["sun", "晴"];
  if (/clear/i.test(description)) return ["moon", "晴"];
  return ["cloud", "天气"];
}

function renderWeather() {
  const slot = $("#top-weather");
  if (weatherCurrent) {
    const { description, temperature } = weatherCurrent;
    const [glyph, condition] = weatherCondition(description);
    const label = `${t(condition)} · ${temperature}°C · wttr.in`;
    slot.innerHTML = `<a class="weather-indicator" href="${weatherSource}" target="_blank" rel="noopener noreferrer" title="${h(label)}" aria-label="${h(label)}">${icon(glyph, 16)}<span>${temperature}°</span></a>`;
    return;
  }
  const label = t({
    idle: "定位查看天气", loading: "正在获取天气",
    denied: "无法定位，请检查浏览器定位权限。", error: "天气暂不可用，点击重试。",
  }[weatherState]);
  slot.innerHTML = `<button class="weather-indicator" type="button" data-action="locate-weather" aria-label="${h(label)}" title="${h(label)}" aria-disabled="${weatherState === "loading"}">${icon(weatherState === "idle" ? "pin" : "cloud", 16)}<span>${weatherState === "denied" || weatherState === "error" ? "—" : t("天气")}</span></button>`;
}

async function refreshWeather(interactive = false) {
  if (weatherState === "loading") return;
  const keepFocus = $("#top-weather").contains(document.activeElement);
  weatherState = "loading";
  renderWeather();
  if (keepFocus) $("#top-weather button").focus();
  try {
    if (!weatherCoordinates) {
      try {
        weatherCoordinates = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(position => resolve(position.coords), reject, {
            timeout: 8000, maximumAge: 900000,
          });
        });
      } catch {
        weatherState = "denied";
        if (interactive) notify("无法定位，请检查浏览器定位权限。");
        return;
      }
    }
    const { latitude, longitude } = weatherCoordinates;
    const response = await fetch(`${weatherSource}${latitude.toFixed(2)},${longitude.toFixed(2)}?format=j1`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error();
    const result = await response.json();
    const current = (result.data ?? result).current_condition?.[0];
    const temperature = parseFloat(current?.temp_C);
    const description = current?.weatherDesc?.[0]?.value;
    if (!Number.isFinite(temperature) || typeof description !== "string") throw new Error();
    weatherCurrent = { description, temperature: Math.round(temperature) };
    weatherState = "ready";
  } catch {
    weatherCurrent = null;
    weatherState = "error";
    if (interactive) notify("天气暂不可用，点击重试。");
  } finally {
    const restoreFocus = $("#top-weather").contains(document.activeElement);
    renderWeather();
    if (restoreFocus) $("#top-weather .weather-indicator").focus();
  }
}

function notify(message) {
  toast.textContent = t(message);
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
}

function commit(change) {
  const next = structuredClone(data);
  change(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  data = next;
  return true;
}

function readRoute() {
  const [page, id] = location.hash.slice(1).split("/");
  return { page: Object.hasOwn(labels, page) ? page : "home", id };
}

function navigate(page, id) {
  const hash = "#" + page + (id ? "/" + id : "");
  if (location.hash === hash) {
    menuOpen = false;
    renderNavigation();
    return;
  }
  location.hash = hash;
}

window.addEventListener("hashchange", () => {
  const nextRoute = readRoute();
  if (nextRoute.page === "finance" && route.page !== "finance") month = currentMonth();
  route = nextRoute;
  menuOpen = false;
  render();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
});

const action = (text, name, id = "", glyph = "", kind = "secondary", title = "") =>
  `<button type="button" class="button ${kind}" data-action="${name}" data-id="${h(id)}"${title ? ` aria-label="${h(t(title))}" title="${h(t(title))}"` : ""}>${glyph ? icon(glyph, 17) : ""}${text ? `<span>${h(t(text))}</span>` : ""}</button>`;
const mini = (name, id, glyph, title) => action("", name, id, glyph, "icon-button", title);
const link = (page, label, id = "") => `<a class="text-link" href="#${page}${id ? "/" + h(id) : ""}">${h(t(label))}${icon("arrow", 16)}</a>`;
const sectionHead = (glyph, label, end = "") => `<header class="section-head"><h2><span class="section-icon">${icon(glyph, 19)}</span>${t(label)}</h2>${end}</header>`;
const pageHead = (title, detail = "", end = "") => `<header class="page-head"><div><h1>${h(title)}</h1>${detail ? `<p>${h(detail)}</p>` : ""}</div>${end ? `<div class="page-actions">${end}</div>` : ""}</header>`;
const bar = (percent, label) => `<progress max="100" value="${Math.min(100, percent)}" aria-label="${h(t(label))}"></progress>`;
const empty = (glyph, title, detail, end = "") => `<div class="empty"><span class="empty-icon">${icon(glyph, 24)}</span><strong>${t(title)}</strong>${detail ? `<p>${t(detail)}</p>` : ""}${end}</div>`;

function renderNavigation() {
  const menu = pages.map(([page, label]) => `<a class="nav-link${route.page === page ? " selected" : ""}" href="#${page}"${route.page === page ? ' aria-current="page"' : ""}>${icon(page, 19)}${t(label)}</a>`).join("");
  const logo = `<a class="brand" href="#home" aria-label="${t("步序工作台")}"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>${t("步序")}</span></a>`;
  $("#sidebar").setAttribute("aria-label", t("主菜单"));
  $("#sidebar").innerHTML = `
    <div class="brand-area">${logo}<p>${t("个人成长工作台")}</p></div>
    <nav aria-label="${t("页面")}">${menu}</nav>
    <footer class="sidebar-foot"><span class="avatar">${t("步")}</span><div><strong>${t("我的空间")}</strong><small>${t("本地演示")}</small></div></footer>`;
  $("#topbar").innerHTML = `
    <div class="mobile-brand">${mini("toggle-menu", "", menuOpen ? "close" : "menu", menuOpen ? "关闭菜单" : "展开菜单")}${logo}</div>
    <div class="breadcrumbs"><span>${t("我的空间")}</span>${icon("chevron", 13)}<strong>${t(labels[route.page])}</strong></div>
    <div class="topbar-tools">
      <span class="clock-indicator">${icon("clock", 15)}<time id="top-clock"></time></span>
      <span id="top-weather"></span>
      <button class="button ai-toggle${aiOpen ? " active" : ""}" type="button" data-action="toggle-ai" aria-controls="ai-panel" aria-expanded="${aiOpen}" aria-label="${t("AI 助手")}" title="${t("AI 助手")}">${icon("spark", 20)}</button>
    </div>
    ${menuOpen ? `<nav class="mobile-menu" aria-label="${t("移动端页面")}">${menu}</nav>` : ""}`;
  $("#topbar [data-action=toggle-menu]").setAttribute("aria-expanded", String(menuOpen));
  updateClock();
  renderWeather();
}

function render() {
  document.documentElement.lang = settings.language;
  document.title = t("步序 · 个人工作台");
  applyTheme();
  renderNavigation();
  renderMain();
  renderAI();
}

function renderMain() {
  const views = { home: dashboard, goals: goalPage, finance: financePage, notes: notesPage, chats: chatHistory, settings: settingsPage };
  main.innerHTML = views[route.page]();
  if (route.page === "settings") syncProvider($("#model-form"));
}

function settingsPage() {
  const themes = [["light", "sun", "明亮"], ["dark", "moon", "暗黑"], ["system", "monitor", "跟随系统"]];
  return `${pageHead(t("设置"))}
    <div class="settings-grid">
      <section class="card settings-card">
        ${sectionHead("settings", "外观与语言")}
        <fieldset class="theme-picker">
          <legend>${t("主题")}</legend>
          <div class="theme-options">${themes.map(([value, glyph, label]) => `
            <label><input type="radio" name="theme" value="${value}" ${settings.theme === value ? "checked" : ""}>
            <span>${icon(glyph, 19)}${t(label)}</span></label>`).join("")}</div>
        </fieldset>
        <label class="field language-field"><span>${t("语言")}</span>
          <select id="language">
            <option value="zh-CN" lang="zh-CN" ${settings.language === "zh-CN" ? "selected" : ""}>简体中文</option>
            <option value="en" lang="en" ${settings.language === "en" ? "selected" : ""}>English</option>
          </select>
        </label>
      </section>
      <section class="card settings-card">
        ${sectionHead("spark", "AI 设置")}
        <form class="model-form" id="model-form">
          <label class="field"><span>${t("模型服务")}</span>
            <select name="provider">${[["demo", "模拟回复"], ["deepseek", "DeepSeek"], ["custom", "自定义兼容接口"]].map(([value, label]) =>
              `<option value="${value}" ${settings.provider === value ? "selected" : ""}>${t(label)}</option>`).join("")}</select>
          </label>
          <div class="model-fields">
            <label class="field"><span>${t("接口地址")}</span><input type="url" name="baseUrl" placeholder="https://example.com/v1" spellcheck="false"></label>
            <label class="field"><span>${t("模型名称")}</span><input name="model" maxlength="200" spellcheck="false"></label>
            <label class="field"><span>API Key</span><input type="password" name="apiKey" autocomplete="off" maxlength="2048" spellcheck="false" aria-describedby="key-hint"></label>
            <p class="field-hint" id="key-hint">${t("API Key 保存在当前浏览器，发送消息时使用所选模型。")}</p>
          </div>
          <p class="form-error" role="alert" hidden></p>
          <button class="button primary" type="submit">${t("保存")}</button>
        </form>
      </section>
    </div>`;
}

function syncProvider(form) {
  const { provider, baseUrl, model, apiKey } = form.elements;
  const enabled = provider.value !== "demo";
  const preset = provider.value === "deepseek" ? deepseek : { baseUrl: "", model: "" };
  form.querySelector(".model-fields").hidden = !enabled;
  baseUrl.readOnly = provider.value === "deepseek";
  baseUrl.value = baseUrl.readOnly ? deepseek.baseUrl : provider.value === settings.provider ? settings.baseUrl : preset.baseUrl;
  model.value = provider.value === settings.provider ? settings.model : preset.model;
  apiKey.value = provider.value === settings.provider ? settings.apiKey : "";
  for (const input of [baseUrl, model, apiKey]) {
    input.disabled = !enabled;
    input.required = enabled;
  }
}

function saveSettings(change) {
  const next = { ...settings, ...change };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  settings = next;
  return true;
}

function saveModel(form) {
  const fields = new FormData(form);
  const provider = fields.get("provider");
  const error = form.querySelector(".form-error");
  let config = { provider, ...deepseek, apiKey: "" };
  let message = "";
  if (provider !== "demo") {
    const model = fields.get("model").trim();
    const apiKey = fields.get("apiKey").trim();
    try {
      const url = new URL(fields.get("baseUrl"));
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
          url.username || url.password || url.search || url.hash) throw new Error();
      config = { provider, model, apiKey, baseUrl: url.href.replace(/\/+$/, "") };
    } catch {
      message = "请输入 HTTPS 接口地址，或本机 HTTP 地址。";
    }
    if (!message && !model) message = "请输入模型名称。";
    if (!message && !/^[\x21-\x7e]+$/.test(apiKey)) message = "请输入有效的 API Key。";
  }
  if (!message && !saveSettings(config)) message = "保存失败，请重试。";
  error.textContent = t(message);
  error.hidden = !message;
  if (!message) {
    syncProvider(form);
    renderAI({ scroll: false });
    notify(t("已保存"));
  }
}

function goalRow(goal) {
  const stat = goalProgress(goal);
  return `<a class="goal-row ${goal.tone}" href="#goals/${h(goal.id)}">
    <span class="goal-icon">${icon(toneIcons[goal.tone], 20)}</span>
    <div class="goal-row-body"><div class="goal-row-label"><strong>${h(goal.title)}</strong><b>${stat.total ? stat.percent + "%" : ""}</b></div>
    ${stat.total ? bar(stat.percent, t("{title}的任务进度", goal)) : ""}<small>${taskCount(stat)}</small></div>
    ${icon("chevron", 17)}</a>`;
}

const taskCount = stat => stat.total ? t("{done} / {total} 项任务已完成", stat) : t("暂无任务");

function savingsCard() {
  const { current, target } = data.savings;
  const percent = current !== null && target !== null ? current / target * 100 : null;
  const displayed = percent === null ? "" : new Intl.NumberFormat(document.documentElement.lang, {
    maximumFractionDigits: 1,
  }).format(Math.floor(percent * 10) / 10) + "%";
  return `<div class="savings">
    <div class="savings-heading"><span>${icon("goals", 16)} ${t("存款目标")}</span>${mini("edit-savings", "", "edit", "编辑存款")}</div>
    <div class="savings-amount"><strong>${current === null ? t("未填写") : money(current)}</strong><span>${target === null ? t("未设目标") : "/ " + money(target)}</span></div>
    ${percent === null ? action("填写金额", "edit-savings", "", "plus", "quiet") : `${bar(percent, "存款目标进度")}<div class="savings-caption"><span>${t(percent >= 100 ? "已达成" : "当前进度")}</span><b>${displayed}</b></div>`}
  </div>`;
}

function financeStats(totals, compact = false) {
  return `<div class="finance-stats${compact ? " compact" : ""}">${[
    ["收入", "income", "downRight"], ["支出", "expense", "upRight"], ["结余", "balance", "finance"],
  ].map(([label, field, glyph]) => `<div class="stat ${field}"><span>${icon(glyph, 15)}${t(label)}</span><strong>${money(totals[field])}</strong></div>`).join("")}</div>`;
}

function noteCard(note) {
  const title = note.title || summary(note.body, 46);
  return `<a class="note-card" href="#notes/${h(note.id)}">
    <span class="note-meta">${icon("notes", 15)}<time datetime="${h(note.updatedAt)}">${dateLabel(note.updatedAt)}</time></span>
    <strong>${h(title)}</strong>${note.title ? `<p>${h(summary(note.body, 88))}</p>` : ""}
  </a>`;
}

function dashboard() {
  const active = data.goals.filter(goal => !isComplete(goalProgress(goal)));
  const totals = monthlyTotals(data.transactions, currentMonth());
  const next = active[0];
  const done = data.goals.reduce((count, goal) => count + goalProgress(goal).done, 0);
  const headline = next ? t("继续推进「{title}」", { title: next.title }) : t(data.goals.length ? "目标都已完成" : "从一个目标开始");
  const caption = active.length ? t("{active} 个目标进行中 · 累计完成 {done} 项任务", { active: active.length, done }) : t("把想做的事拆成一个个小任务。");
  return `
    <section class="hero" aria-labelledby="hero-title">
      <a class="hero-body" href="#goals${next ? "/" + h(next.id) : ""}">
        <h1 id="hero-title">${h(headline)}</h1>
        <p>${h(caption)}</p>
      </a>
      <div class="hero-art" aria-hidden="true">
        <div class="orbit orbit-a"></div><div class="orbit orbit-b"></div>
        <div class="art-grid"></div><div class="art-light"></div>
        <div class="stair stair-one"></div><div class="stair stair-two"></div><div class="stair stair-three"></div>
        <span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✦</span>
        <span class="art-dot"></span><span class="art-check">${icon("check", 29)}</span>
      </div>
    </section>
    <div class="dashboard-grid">
      <section class="card goals-card">
        ${sectionHead("goals", "进行中的目标", link("goals", "全部目标"))}
        ${active.length ? `<div class="goal-rows">${active.map(goalRow).join("")}</div>` :
          empty("goals", data.goals.length ? "暂无进行中的目标" : "还没有目标", "", data.goals.length ? link("goals", "目标管理") : action("新建目标", "edit-goal", "", "plus", "quiet"))}
      </section>
      <section class="card finance-card">
        ${sectionHead("finance", "本月财务", link("finance", "财务概览"))}
        ${totals.count ? financeStats(totals, true) : empty("finance", "本月暂无收支", "")}
        ${savingsCard()}
        ${action("记一笔", "edit-transaction", "", "plus", "quiet log-button")}
      </section>
      <section class="card notes-card">
        ${sectionHead("notes", "最近思考", `<div class="section-actions">${link("notes", "全部记录")}${action("新建记录", "edit-note", "", "plus", "quiet")}</div>`)}
        ${data.notes.length ? `<div class="note-grid">${updatedFirst(data.notes).slice(0, 3).map(noteCard).join("")}</div>` :
          empty("notes", "还没有思考记录", "随手记下一件值得回看的事。")}
      </section>
    </div>`;
}

function goalPage() {
  const goal = data.goals.find(record => record.id === route.id);
  if (route.id && !goal) return missing("goals", "这项目标已不存在");
  if (!goal) return `${pageHead(t("目标管理"), t("把目标拆成事项，再从一个任务开始。"), action("新建目标", "edit-goal", "", "plus", "primary"))}
    ${data.goals.length ? `<div class="collection-grid">${data.goals.map(goalTile).join("")}</div>` :
      `<section class="card">${empty("goals", "还没有目标", "", action("新建目标", "edit-goal", "", "plus", "primary"))}</section>`}`;
  const stat = goalProgress(goal);
  return `<a class="back-link" href="#goals">${icon("back", 17)} ${t("全部目标")}</a>
    ${pageHead(goal.title, goal.description, [
      action("发给 AI", "share-goal", goal.id, "spark", "quiet"), action("编辑", "edit-goal", goal.id, "edit"), mini("delete-goal", goal.id, "trash", "删除目标"),
    ].join(""))}
    <section class="card detail-progress ${goal.tone}">
      <span class="goal-icon">${icon(toneIcons[goal.tone], 22)}</span>
      <div class="detail-progress-body"><div><strong>${t("目标进度")}</strong><small>${taskCount(stat)}</small></div>
      ${stat.total ? bar(stat.percent, "目标进度") : ""}</div>${badge(stat)}
    </section>
    <div class="section-divider"><h2>${t("事项与任务")}</h2>${action("新建事项", "edit-item", "", "plus", "primary")}</div>
    <div class="item-list">${goal.items.length ? goal.items.map(itemCard).join("") :
      `<section class="card">${empty("notes", "还没有事项", "创建事项后就可以添加任务。")}</section>`}</div>`;
}

const badge = stat => `<span class="badge ${isComplete(stat) ? "complete" : ""}">${t(isComplete(stat) ? "已完成" : "进行中")}</span>`;

function goalTile(goal) {
  const stat = goalProgress(goal);
  return `<a class="card collection-tile ${goal.tone}" href="#goals/${h(goal.id)}">
    <div class="tile-head"><span class="goal-icon">${icon(toneIcons[goal.tone], 22)}</span>${badge(stat)}</div>
    <h2>${h(goal.title)}</h2>${goal.description ? `<p>${h(summary(goal.description))}</p>` : ""}
    <div class="tile-progress"><span>${taskCount(stat)}</span>${stat.total ? `<b>${stat.percent}%</b>` : ""}</div>
    ${stat.total ? bar(stat.percent, "目标进度") : ""}</a>`;
}

function itemCard(item) {
  const stat = progress(item.tasks);
  return `<section class="card item-card">
    <header><div><h3>${h(item.title)}</h3><small>${taskCount(stat)}${stat.total ? ` · ${stat.percent}%` : ""}</small></div><div class="row-actions">
    ${mini("edit-item", item.id, "edit", "编辑事项")}${mini("delete-item", item.id, "trash", "删除事项")}</div></header>
    ${stat.total ? bar(stat.percent, t("{title}的任务进度", item)) : ""}
    <div class="task-list">${item.tasks.map(task => `<div class="task-row">
      <label class="${task.done ? "done" : ""}"><input type="checkbox" data-task="${h(task.id)}" data-item="${h(item.id)}" ${task.done ? "checked" : ""}><span>${h(task.title)}</span></label>
      <div class="row-actions">${mini("edit-task", item.id + "/" + task.id, "edit", "编辑任务")}${mini("delete-task", item.id + "/" + task.id, "trash", "删除任务")}</div>
    </div>`).join("")}</div>
    ${action("添加任务", "edit-task", item.id, "plus", "quiet")}
  </section>`;
}

function notesPage() {
  const note = data.notes.find(record => record.id === route.id);
  if (route.id && !note) return missing("notes", "这条记录已不存在");
  if (note) return `<a class="back-link" href="#notes">${icon("back", 17)} ${t("全部记录")}</a>
    ${pageHead(note.title || summary(note.body, 46), t("更新于 {date}", { date: dateLabel(note.updatedAt) }), [
      action("发给 AI", "share-note", note.id, "spark", "quiet"), action("编辑", "edit-note", note.id, "edit"), mini("delete-note", note.id, "trash", "删除记录"),
    ].join(""))}
    <article class="card note-body">${h(note.body)}</article>`;
  return `${pageHead(t("思考记录"), t("记录一个想法，留给之后的自己。"), action("新建记录", "edit-note", "", "plus", "primary"))}
    ${data.notes.length ? `<div class="collection-grid notes-collection">${updatedFirst(data.notes).map(noteCard).join("")}</div>` :
      `<section class="card">${empty("notes", "还没有思考记录", "", action("新建记录", "edit-note", "", "plus", "primary"))}</section>`}`;
}

function financePage() {
  const totals = monthlyTotals(data.transactions, month);
  const records = data.transactions.filter(record => record.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  return `${pageHead(t("财务概览"), t("查看每月收支与当前存款进度。"), action("记一笔", "edit-transaction", "", "plus", "primary"))}
    <div class="finance-grid">
      <section class="card">${sectionHead("finance", "月度概况", `<label class="month-field"><span class="sr-only">${t("选择月份")}</span><input type="month" id="month" value="${h(month)}"></label>`)}
      ${financeStats(totals)}</section>
      <section class="card">${sectionHead("goals", "存款")}${savingsCard()}</section>
    </div>
    <section class="card ledger">${sectionHead("notes", "收支记录", `<span class="muted">${t("{count} 笔", { count: records.length })}</span>`)}
    ${records.length ? `<div class="ledger-list">${records.map(transactionRow).join("")}</div>` :
      empty("finance", "这个月暂无收支记录", "", action("记一笔", "edit-transaction", "", "plus", "quiet"))}</section>`;
}

function transactionRow(record) {
  const income = record.type === "income";
  const label = t(income ? "收入" : "支出");
  return `<div class="transaction-row">
    <span class="transaction-icon ${record.type}">${icon(income ? "downRight" : "upRight", 19)}</span>
    <div class="transaction-name"><strong>${h(record.note || label)}</strong><small>${dateLabel(record.date)} · ${label}</small></div>
    <b class="${record.type}">${income ? "+" : "−"}${money(record.cents)}</b>
    <div class="row-actions">${mini("edit-transaction", record.id, "edit", "编辑收支")}${mini("delete-transaction", record.id, "trash", "删除收支")}</div>
  </div>`;
}

const chatTitle = chat => summary(chat.messages.find(message => message.role === "user")?.text || t("新会话"), 34);

function chatHistory() {
  return `${pageHead(t("AI 对话历史"), t("打开一段对话，接着聊。"), action("新建会话", "new-chat", "", "plus", "primary"))}
    <section class="card history-card">
    ${data.chats.length ? updatedFirst(data.chats).map(chat => `<div class="history-row">
      <button class="history-entry" type="button" data-action="open-chat" data-id="${h(chat.id)}">
      <span class="section-icon">${icon("chats", 20)}</span><span><strong>${h(chatTitle(chat))}</strong><small><time datetime="${h(chat.updatedAt)}">${activityLabel(chat.updatedAt)}</time> · ${t("{count} 条消息", { count: chat.messages.length })}</small></span>${icon("chevron", 17)}</button>
      ${mini("delete-chat", chat.id, "trash", "删除会话")}</div>`).join("") :
      empty("chats", "还没有对话", "", action("新建会话", "new-chat", "", "plus", "primary"))}
    </section>`;
}

function missing(page, message) {
  return `<section class="card">${empty(page, message, "", link(page, t("返回{page}", { page: t(labels[page]) })))}</section>`;
}

const textField = (label, name, value, { required = false, long = false, max = 120 } = {}) =>
  `<label class="field"><span>${t(label)}${required ? "" : ` <small>${t("选填")}</small>`}</span>${
    long ? `<textarea name="${name}" rows="5" maxlength="${max}" ${required ? "required" : ""}>${h(value)}</textarea>` :
      `<input name="${name}" value="${h(value)}" maxlength="${max}" ${required ? "required" : ""}>`
  }</label>`;

const numberField = (label, name, cents, min, required) => `<label class="field"><span>${t(label)}</span><input
  type="number" name="${name}" value="${cents == null ? "" : (cents / 100).toFixed(2)}" min="${min}" max="999999999.99" step="0.01" inputmode="decimal" ${required ? "required" : ""}></label>`;

function openDialog(title, fields, submit, { danger = false, label = "保存" } = {}) {
  dialogSubmit = submit;
  dialog.innerHTML = `<form id="edit-form">
    <header class="dialog-head"><h2 id="dialog-title">${t(title)}</h2>${mini("close-dialog", "", "close", "关闭弹窗")}</header>
    <div class="dialog-fields">${fields}<p class="form-error" role="alert" hidden></p></div>
    <footer>${action("取消", "close-dialog")}<button type="submit" class="button ${danger ? "danger" : "primary"}">${t(label)}</button></footer>
  </form>`;
  dialog.showModal();
  const initial = dialog.querySelector(".dialog-fields input, .dialog-fields textarea, .dialog-fields select") ||
    dialog.querySelector("footer [data-action=close-dialog]");
  initial.focus();
}

function save(change, after = renderMain) {
  if (!commit(change)) return "保存失败，请重试。";
  after();
  return "";
}

function formError(message) {
  const error = dialog.querySelector(".form-error");
  error.textContent = t(message);
  error.hidden = !message;
}

const titleRequired = fields => fields.get("title").trim();
const centsFrom = value => value === "" ? null : Math.round(Number(value) * 100);
const goalBy = (state, id = route.id) => state.goals.find(goal => goal.id === id);
const itemBy = (state, id) => goalBy(state).items.find(item => item.id === id);

function editGoal(id) {
  const goal = goalBy(data, id);
  openDialog(goal ? "编辑目标" : "新建目标",
    textField("目标名称", "title", goal?.title, { required: true }) +
    textField("说明", "description", goal?.description, { long: true, max: 1000 }),
    fields => {
      const title = titleRequired(fields);
      if (!title) return "请输入目标名称。";
      const description = fields.get("description").trim();
      const recordId = goal?.id || uid();
      return save(next => {
        if (goal) Object.assign(goalBy(next, recordId), { title, description });
        else next.goals.push({ id: recordId, title, description, tone: goalTones[next.goals.length % goalTones.length], items: [] });
      }, () => goal ? renderMain() : navigate("goals", recordId));
    });
}

function editItem(id) {
  const item = itemBy(data, id);
  openDialog(item ? "编辑事项" : "新建事项", textField("事项名称", "title", item?.title, { required: true }), fields => {
    const title = titleRequired(fields);
    if (!title) return "请输入事项名称。";
    return save(next => {
      if (item) itemBy(next, id).title = title;
      else goalBy(next).items.push({ id: uid(), title, tasks: [] });
    });
  });
}

function editTask(key) {
  const [itemId, taskId] = key.split("/");
  const task = itemBy(data, itemId).tasks.find(record => record.id === taskId);
  openDialog(task ? "编辑任务" : "添加任务", textField("任务名称", "title", task?.title, { required: true }), fields => {
    const title = titleRequired(fields);
    if (!title) return "请输入任务名称。";
    return save(next => {
      const tasks = itemBy(next, itemId).tasks;
      if (task) tasks.find(record => record.id === taskId).title = title;
      else tasks.push({ id: uid(), title, done: false });
    });
  });
}

function editNote(id) {
  const note = data.notes.find(record => record.id === id);
  openDialog(note ? "编辑记录" : "新建记录",
    textField("标题", "title", note?.title) + textField("正文", "body", note?.body, { required: true, long: true, max: 10000 }),
    fields => {
      const title = fields.get("title").trim();
      const body = fields.get("body").trim();
      if (!body) return "请输入记录正文。";
      const record = { id: note?.id || uid(), title, body, updatedAt: new Date().toISOString() };
      return save(next => {
        if (note) Object.assign(next.notes.find(entry => entry.id === id), record);
        else next.notes.push(record);
      });
    });
}

function editTransaction(id) {
  const record = data.transactions.find(entry => entry.id === id);
  const typeField = `<fieldset class="type-field"><legend>${t("类型")}</legend><div>${[
    ["expense", "支出"], ["income", "收入"],
  ].map(([value, label]) => `<label><input type="radio" name="type" value="${value}" ${(record?.type || "expense") === value ? "checked" : ""}><span>${t(label)}</span></label>`).join("")}</div></fieldset>`;
  openDialog(record ? "编辑收支" : "记一笔", typeField + numberField("金额（人民币）", "amount", record?.cents, 0.01, true) +
    `<label class="field"><span>${t("日期")}</span><input type="date" name="date" value="${h(record?.date || localDate())}" required></label>` +
    textField("备注", "note", record?.note),
  fields => {
    const updated = { id: record?.id || uid(), type: fields.get("type"), cents: centsFrom(fields.get("amount")), date: fields.get("date"), note: fields.get("note").trim() };
    if (!updated.cents || updated.cents < 0) return "金额必须大于 0。";
    return save(next => {
      if (record) Object.assign(next.transactions.find(entry => entry.id === id), updated);
      else next.transactions.push(updated);
    }, () => {
      if (route.page === "finance") month = updated.date.slice(0, 7);
      renderMain();
    });
  });
}

function editSavings() {
  openDialog("编辑存款",
    `<p class="field-hint">${t("存款手动更新，月度收支独立统计。")}</p>` +
    numberField("当前存款（人民币）", "current", data.savings.current, 0, false) +
    numberField("存款目标（人民币）", "target", data.savings.target, 0.01, false),
  fields => save(next => {
    next.savings = { current: centsFrom(fields.get("current")), target: centsFrom(fields.get("target")) };
  }));
}

function confirmDelete(kind, id) {
  const [itemId, taskId] = id.split("/");
  const goal = kind === "goal" ? goalBy(data, id) : null;
  const item = kind === "item" || kind === "task" ? itemBy(data, itemId) : null;
  const objects = {
    goal: "目标", item: "事项", task: "任务", note: "思考记录", transaction: "收支记录", chat: "会话",
  };
  const unit = { goal: "个", item: "个", task: "项", note: "条", transaction: "笔", chat: "段" }[kind];
  const name = t(objects[kind], {}, { "思考记录": "note", "收支记录": "transaction" });
  let detail = t("确定删除这{unit}{name}？", { unit, name });
  if (goal?.items.length) detail = t("删除「{title}」将一并删除 {items} 个事项和 {tasks} 项任务。", { title: goal.title, items: goal.items.length, tasks: goalProgress(goal).total });
  if (kind === "item" && item.tasks.length) detail = t("删除「{title}」将一并删除 {tasks} 项任务。", { title: item.title, tasks: item.tasks.length });
  openDialog(t("删除{name}", { name }), `<p class="delete-copy">${h(detail)}</p>`, () => save(next => {
    const lists = { goal: "goals", note: "notes", transaction: "transactions", chat: "chats" };
    if (lists[kind]) {
      const key = lists[kind];
      next[key] = next[key].filter(record => record.id !== id);
    } else if (kind === "item") {
      const current = goalBy(next);
      current.items = current.items.filter(record => record.id !== itemId);
    } else {
      const parent = itemBy(next, itemId);
      parent.tasks = parent.tasks.filter(record => record.id !== taskId);
    }
  }, () => {
    if (kind === "chat") {
      drafts.delete(id);
      if (activeChat === id) activeChat = null;
      renderAI();
    }
    if (kind === "goal") navigate("goals");
    else if (kind === "note") navigate("notes");
    else renderMain();
  }), { danger: true, label: "确认删除" });
}

const mobile = matchMedia("(max-width: 760px)");

function syncPanelMode() {
  const modal = aiOpen && mobile.matches;
  $(".workspace").inert = modal;
  document.body.classList.toggle("chat-fullscreen", modal);
  panel.setAttribute("role", modal ? "dialog" : "complementary");
  panel.setAttribute("aria-modal", String(modal));
}

function setAIOpen(open) {
  if (open && !aiOpen) {
    const trigger = document.activeElement;
    aiReturnFocus = trigger?.matches("[data-action=toggle-ai]") ? null : trigger;
  }
  aiOpen = open;
  menuOpen = false;
  renderNavigation();
  renderAI();
  if (open) $("#chat-input").focus();
  else (aiReturnFocus?.isConnected ? aiReturnFocus : $("#topbar [data-action=toggle-ai]")).focus();
}

function renderAI({ scroll = true } = {}) {
  panel.hidden = !aiOpen;
  syncPanelMode();
  if (!aiOpen) return;
  panel.setAttribute("aria-label", t("AI 助手"));
  const chat = data.chats.find(entry => entry.id === activeChat);
  const sending = pending.get(activeChat);
  const focused = document.activeElement?.id === "chat-input";
  const selection = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const previousScroll = panel.querySelector(".message-list")?.scrollTop;
  panel.innerHTML = `<header class="ai-head"><span class="section-icon">${icon("spark", 21)}</span><div><strong>${t("AI 助手")}</strong><small>${settings.provider === "demo" ? t("模拟回复") : h(settings.model)}</small></div>
    ${mini("new-chat", "", "plus", "新建会话")}${mini("toggle-ai", "", "close", "关闭 AI 助手")}</header>
    ${chat ? `<div class="conversation-title">${h(chatTitle(chat))}</div>` : ""}
    <div class="message-list" aria-label="${t("会话消息")}">
      ${chat ? chat.messages.map(message => chatMessage(message, sending)).join("") :
      `<div class="chat-welcome"><span class="empty-icon">${icon("spark", 28)}</span><h2>${t("今天想聊什么？")}</h2>
      <p>${t("聊聊目标的下一步，或整理一个刚记下的想法。")}</p>
      ${action("帮我拆解一个目标", "chat-prompt", t("帮我把一个目标拆成更容易开始的任务。"), "goals", "quiet")}
      ${action("和我做一次周复盘", "chat-prompt", t("带我做一次十分钟的周复盘。"), "notes", "quiet")}</div>`}
      ${sending ? `<p class="sending" role="status">${t("AI 正在回复…")}</p>` : ""}
    </div>
    <form class="composer" id="chat-form">
      <div class="composer-field"><textarea id="chat-input" rows="2" maxlength="12000" aria-label="${t("输入消息")}" placeholder="${t("输入消息…")}">${h(drafts.get(activeChat) || "")}</textarea>
      <button type="submit" class="button primary send-button" aria-label="${t("发送消息")}" title="${t("发送消息")}" ${sending ? "disabled" : ""}>${icon("send", 18)}</button></div>
      <small>${t("Enter 发送 · Shift + Enter 换行")}</small>
    </form>`;
  if (focused) {
    $("#chat-input").focus({ preventScroll: true });
    $("#chat-input").setSelectionRange(...selection);
  }
  const list = panel.querySelector(".message-list");
  list.scrollTop = scroll ? list.scrollHeight : previousScroll || 0;
}

function chatMessage(message, sending) {
  return `<article class="message ${message.role}">
    ${message.role === "assistant" ? `<span class="message-avatar">${icon("spark", 16)}</span>` : ""}
    <div class="message-content"><div class="bubble">${h(message.text)}</div>
    ${message.status === "failed" && sending !== message.id ? `<div class="message-error">${t("发送失败")} ${sending ? "" : action("重试", "retry-message", message.id, "", "quiet")}</div>` : ""}</div>
  </article>`;
}

function openChat(id) {
  activeChat = id;
  setAIOpen(true);
}

function draftMessage(text) {
  const before = drafts.get(activeChat);
  const draft = (before ? before + "\n\n" : "") + text;
  setAIOpen(true);
  if (draft.length > 12000) return notify("内容超过 12,000 字，请缩短草稿后再试。");
  drafts.set(activeChat, draft);
  const input = $("#chat-input");
  input.value = draft;
  input.setSelectionRange(input.value.length, input.value.length);
}

function shareGoal(id) {
  const goal = goalBy(data, id);
  const lines = goal.items.map(item => {
    const stat = progress(item.tasks);
    const tasks = item.tasks.map(task => `  - ${t(task.done ? "已完成" : "待完成")} · ${task.title}`);
    return [`- ${item.title}（${stat.done}/${stat.total}）`, ...tasks].join("\n");
  });
  draftMessage([t("我想聊聊目标「{title}」。", goal), goal.description, ...lines].filter(Boolean).join("\n"));
}

function shareNote(id) {
  const note = data.notes.find(record => record.id === id);
  const title = !note.title ? "" : document.documentElement.lang === "en" ? ` “${note.title}”` : `「${note.title}」`;
  draftMessage(`${t("我想聊聊这条思考记录{title}。", { title })}\n\n${note.body}`);
}

function mockReply(chat, message) {
  const previous = chat.messages.filter(entry => entry.role === "user" && entry.id !== message.id && entry.status !== "failed");
  if (document.documentElement.lang === "en") {
    const focus = previous.length ? `Building on “${summary(previous.at(-1).text, 24)}”, try this:\n\n` : "";
    if (/review|复盘/i.test(message.text)) return focus + "Write down one win from this week, one obstacle, and one step you can take in ten minutes next week.\n\nWhich moment would you like to start with?";
    if (/note|思考记录/i.test(message.text)) return focus + "Pick one idea from your note and turn it into a small experiment you can try this week.\n\nWhat would help you tell if it worked?";
    return focus + `You mentioned “${summary(message.text, 36)}”. Pick a step you can start in ten minutes and decide what done would look like.\n\nWhat feels easiest to start today?`;
  }
  const focus = previous.length ? `接着你前面提到的「${summary(previous.at(-1).text, 24)}」，` : "";
  if (/复盘/.test(message.text)) return `${focus}可以试试三步：先写下本周做成的一件事，再找出一处卡点，最后给下周定一个十分钟内能开始的小动作。\n\n你这周最想回顾的是哪件事？`;
  if (/思考记录/.test(message.text)) return `${focus}可以先从这条记录里找一句最想验证的话，再把它改成一个本周能尝试的小实验。\n\n你想保留这条想法，还是试着把它变成行动？`;
  if (/目标|任务|英语/.test(message.text)) {
    const next = message.text.match(/待完成 · ([^\n]+)/)?.[1];
    return `${focus}${next ? "可以先从「" + next + "」开始。" : "挑一个十分钟内就能着手的小任务。"}给它写一个明确的完成标准，然后安排在一个固定时间做一次。\n\n哪一步现在最容易开始？`;
  }
  return `${focus}我注意到你提到「${summary(message.text, 28)}」。可以先写下你希望发生的变化，再选一个今天就能尝试的动作。\n\n你更想先理清思路，还是一起定一个行动？`;
}

function sendMessage() {
  const text = (drafts.get(activeChat) || "").trim();
  if (!text || pending.has(activeChat)) return;
  const oldChat = activeChat;
  const chatId = oldChat || uid();
  const messageId = uid();
  const saved = commit(next => {
    let chat = next.chats.find(entry => entry.id === chatId);
    if (!chat) {
      chat = { id: chatId, updatedAt: "", messages: [] };
      next.chats.push(chat);
    }
    chat.messages.push({ id: messageId, role: "user", text, status: "failed" });
    chat.updatedAt = new Date().toISOString();
  });
  if (!saved) return notify("保存失败，请重试。");
  drafts.delete(oldChat);
  activeChat = chatId;
  requestReply(chatId, messageId, text === "/失败");
}

async function modelReply(config, messages) {
  const response = await fetch(config.baseUrl.replace(/\/chat\/completions$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, messages, stream: false }),
    redirect: "error",
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(t("接口返回 HTTP {status}，请检查 AI 设置后重试。", { status: response.status }));
  const result = await response.json().catch(() => null);
  const reply = result?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) throw new Error(t("模型未返回文本，请重试。"));
  return reply.trim();
}

async function requestReply(chatId, messageId, simulateFailure = false) {
  if (pending.has(chatId)) return;
  const chat = data.chats.find(entry => entry.id === chatId);
  const index = chat?.messages.findIndex(entry => entry.id === messageId);
  if (!chat || index < 0) return;
  const context = { messages: chat.messages.slice(0, index + 1) };
  const message = context.messages.at(-1);
  const config = settings;
  pending.set(chatId, messageId);
  if (route.page === "chats") renderMain();
  renderAI();
  try {
    let reply;
    if (config.provider === "demo") {
      await new Promise(resolve => setTimeout(resolve, 550));
      if (simulateFailure) return;
      reply = mockReply(context, message);
    } else {
      const messages = context.messages.filter(entry => entry.status !== "failed" || entry.id === messageId)
        .map(({ role, text }) => ({ role, content: text }));
      reply = await modelReply(config, messages);
    }
    if (data.chats.some(entry => entry.id === chatId)) {
      const saved = commit(next => {
        const current = next.chats.find(entry => entry.id === chatId);
        const at = current.messages.findIndex(entry => entry.id === messageId);
        delete current.messages[at].status;
        current.messages.splice(at + 1, 0, { id: uid(), role: "assistant", text: reply });
        current.updatedAt = new Date().toISOString();
      });
      if (!saved) notify("回复保存失败，可以重试。");
    }
  } catch (error) {
    if (activeChat === chatId && aiOpen) {
      notify(error instanceof TypeError || error.name === "TimeoutError"
        ? "无法连接模型服务，请检查接口地址和网络后重试。" : error.message);
    }
  } finally {
    pending.delete(chatId);
    if (route.page === "chats") renderMain();
    if (activeChat === chatId) renderAI();
  }
}

const actions = {
  "toggle-menu": () => {
    menuOpen = !menuOpen;
    renderNavigation();
    $("#topbar [data-action=toggle-menu]").focus();
  },
  "toggle-ai": () => setAIOpen(!aiOpen),
  "locate-weather": () => refreshWeather(true),
  "close-dialog": () => dialog.close(),
  "edit-goal": editGoal, "edit-item": editItem, "edit-task": editTask,
  "edit-note": editNote, "edit-transaction": editTransaction, "edit-savings": editSavings,
  "delete-goal": id => confirmDelete("goal", id),
  "delete-item": id => confirmDelete("item", id),
  "delete-task": id => confirmDelete("task", id),
  "delete-note": id => confirmDelete("note", id),
  "delete-transaction": id => confirmDelete("transaction", id),
  "delete-chat": id => confirmDelete("chat", id),
  "share-goal": shareGoal, "share-note": shareNote,
  "open-chat": openChat, "new-chat": () => { drafts.delete(null); openChat(null); },
  "chat-prompt": draftMessage,
  "retry-message": id => requestReply(activeChat, id),
};

document.addEventListener("click", event => {
  const button = event.target.closest("[data-action]");
  if (button) actions[button.dataset.action]?.(button.dataset.id);
  const menuLink = event.target.closest(".mobile-menu a");
  if (menuLink && menuLink.hash === location.hash) navigate(route.page);
});

document.addEventListener("input", event => {
  if (event.target.id === "chat-input") drafts.set(activeChat, event.target.value);
  if (event.target.closest("#edit-form")) formError("");
  const error = event.target.closest("#model-form")?.querySelector(".form-error");
  if (error) error.hidden = true;
});

document.addEventListener("change", event => {
  const input = event.target;
  if (input.matches(".theme-picker input")) {
    if (saveSettings({ theme: input.value })) applyTheme();
    else {
      document.querySelector(`.theme-picker input[value="${settings.theme}"]`).checked = true;
      notify("保存失败，请重试。");
    }
  }
  if (input.id === "language") {
    const modelDraft = new FormData($("#model-form"));
    if (saveSettings({ language: input.value })) {
      toast.hidden = true;
      render();
      const form = $("#model-form");
      form.elements.provider.value = modelDraft.get("provider");
      syncProvider(form);
      for (const name of ["baseUrl", "model", "apiKey"]) {
        if (modelDraft.has(name)) form.elements[name].value = modelDraft.get(name);
      }
      $("#language").focus();
    } else {
      input.value = settings.language;
      notify("保存失败，请重试。");
    }
  }
  if (input.matches('#model-form [name="provider"]')) syncProvider(input.form);
  if (input.id === "month" && input.value) {
    month = input.value;
    renderMain();
    $("#month").focus();
  }
  if (input.matches("[data-task]")) {
    const { item, task } = input.dataset;
    if (commit(next => { itemBy(next, item).tasks.find(entry => entry.id === task).done = input.checked; })) {
      renderMain();
      main.querySelector(`[data-task="${CSS.escape(task)}"]`).focus();
    } else {
      input.checked = !input.checked;
      notify("保存失败，请重试。");
    }
  }
});

document.addEventListener("submit", event => {
  if (event.target.id === "edit-form") {
    event.preventDefault();
    const result = dialogSubmit(new FormData(event.target));
    if (result) formError(result);
    else {
      dialog.close();
      notify("已保存");
    }
  }
  if (event.target.id === "chat-form") {
    event.preventDefault();
    sendMessage();
  }
  if (event.target.id === "model-form") {
    event.preventDefault();
    saveModel(event.target);
  }
});

document.addEventListener("keydown", event => {
  if (event.target.id === "chat-input" && event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    sendMessage();
  }
  if (event.key === "Escape" && !dialog.open) {
    if (aiOpen) setAIOpen(false);
    else if (menuOpen) actions["toggle-menu"]();
  }
});

mobile.addEventListener("change", syncPanelMode);
systemTheme.addEventListener("change", applyTheme);
render();
setInterval(updateClock, 1000);
setInterval(() => { if (weatherCoordinates) refreshWeather(); }, 15 * 60 * 1000);
navigator.permissions?.query({ name: "geolocation" }).then(permission => {
  if (permission.state === "granted") refreshWeather();
}).catch(() => {});


function exportDemoData() {
  if (!confirm('导出当前 Demo 数据？如果仍在使用初始样例，导出文件也会包含样例。')) return;
  const options = confirm('是否一并导出外观与语言偏好？');
  const output = { format: 'buxu-demo', version: 1, data };
  if (options) output.preferences = { theme: settings.theme, language: settings.language };
  const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'buxu-demo.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const demoExport = document.createElement('button');
demoExport.type = 'button';
demoExport.className = 'button secondary demo-export';
demoExport.textContent = '导出 Demo 数据';
demoExport.addEventListener('click', exportDemoData);
document.body.append(demoExport);
