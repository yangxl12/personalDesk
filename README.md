# 步序

步序是管理目标、记录思考和查看收支的个人工作台。当前版本为**纯静态本地自用版**：所有数据存在浏览器 IndexedDB 里，不需要服务器进程，可直接托管在 GitHub Pages。

- 没有账号与登录，单浏览器单份数据，不跨设备同步。
- AI 由浏览器直连供应商，API Key 保存在本地数据库，不随备份导出。
- 数据被浏览器清理后无法恢复，请定期导出备份（超过 7 天未导出会在工作台提示）。

改造范围与契约见 [本地化改造实现方案](docs/2026-11-18-步序本地化改造实现方案.md)。

## 本地运行

使用 Node.js 22.17 及以上（含 24.x），npm 11。

```bash
npm ci
npm run dev
```

默认地址是 `http://localhost:6173/personalDesk/`。`base` 固定为 `/personalDesk`（与仓库名一致），仓库改名时需同步修改 `vite.config.ts` 里的 `paths.base`，否则资源全部 404、页面白屏。

### 手机访问开发环境

电脑和手机连接同一 Wi-Fi 后运行 `npm run dev:lan`，在手机浏览器打开终端显示的 `Network` 地址并补上 `/personalDesk/`。此命令固定 6173 端口；端口被占用会报错。Windows 防火墙需允许当前 Wi-Fi 子网访问该端口。局域网是 HTTP，不属于安全上下文，装不了 PWA——要装到手机上得用下面的构建产物经 HTTPS 访问，或先部署一次。

## 构建与预览

```bash
npm run build
npm run preview:static
```

产物在 `build/`：`404.html` 是应用入口（GitHub Pages 没有 SPA 重写，深链一律落到它，首屏 404 属预期），构建时额外复制一份 `index.html`，让根路径正常返回 200。本机预览地址同样带 `/personalDesk/`。

## 装到桌面（PWA）

站点是标准 PWA：`static/manifest.webmanifest` 声明名称、图标与 `standalone` 显示模式，`static/sw.js` 提供离线外壳。满足安装条件时（HTTPS 或 localhost）浏览器地址栏会给安装入口，应用内「设置 → 安装到桌面」是同一个入口；iOS 没有 `beforeinstallprompt`，那里给的是「分享 → 添加到主屏幕」的步骤。

- **离线可用**：首次访问后应用外壳与已加载的 `_app/` 资源写入 Cache Storage，断网照样进应用改数据（数据本来就在 IndexedDB）。
- **图标**：192 / 512 / maskable 512 / `apple-touch-icon` 180 / `favicon.ico`·`svg` 都在 `static/icons/`，由 `npm run icons` 生成。改配色只动 `scripts/generate-icons.mjs` 里的常量，重跑一次即可，不用手绘。
- **只在构建产物里注册 Service Worker**：`vite dev` 下不注册，免得和 HMR 抢请求。验证离线要跑 `npm run build && npm run preview:static`。
- **更新不清空旧缓存**：新 SW 装好即接管，但保留旧版本缓存——还开着的旧页面仍引用上一版 hash 资源，清掉就是白屏。
- **状态栏配色**：`theme-color` 跟着 `--base` 走，切主题时由 `src/lib/pwa.svelte.ts` 同步，安卓状态栏不会和应用背景撞色。
- **更新代码**：「设置 → 代码更新」显示当前构建的提交号，点「检查更新」跟线上的 `version.json` 比对；有新版本时一键注销旧 Service Worker、清掉 `buxu-*` 缓存并带 `?v=` 强制刷新，不用手动清缓存或重装。`version.json` 由 `vite.config.ts` 在构建时写入 `build/`。

## 部署到 GitHub Pages

仓库 `yangxl12/personalDesk`，站点根路径 `/personalDesk`。`.github/workflows/pages.yml` 在推送到 `main` 后构建并发布。

首次部署需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。选成「Deploy from a branch」会读到空分支，表现为 404。免费账号的私有仓库无法发布 Pages，仓库须为 public。

## 配置 AI

打开「设置 → AI 设置 → 添加模型」，填写供应商、模型名称和 API Key。DeepSeek 允许浏览器跨域直连，已实测可用；`openai-compatible` 类供应商策略不一，保存前务必点「测试连接」，失败时界面会给出明确提示，而不是静默失败。

API Key 明文保存在 IndexedDB 的 `models` 表中，同源脚本可读，本地自用场景可接受。它不会出现在构建产物里，也不会被导出到备份文件，还原备份后需要重新填写。

目标、思考和财务的访问权限在设置中分别开启；改动授权会中断正在进行的回复，并让待确认的操作卡失效。

## 备份与恢复

「设置 → 数据管理」可导出 `buxu-backup-*.json` 并重新导入。导入先预览条数与校验错误，支持两种方式：

- **替换**（默认）：清空现有数据后写入，按钮为危险色二次确认。
- **合并**：保留现有数据，同标识记录覆盖。

备份不含 AI 模型配置与操作卡。`format` 版本高于当前支持值时会拒绝导入。

## 验证

```bash
npm run check
npm test
npm run build
```

## Demo

[单文件 Demo](demo/步序-Demo.html) 与[多文件 Demo](demo/index.html) 可独立打开，与正式版数据互不影响。

仓库提供 `.githooks/pre-commit` 暂存区扫描。安装 Gitleaks 后，在本仓库运行 `git config core.hooksPath .githooks` 启用。CI 也会扫描检出的文件。
