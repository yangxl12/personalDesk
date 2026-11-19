# personalDesk（步序）项目笔记

## 协作约定
- 每次代码改动提交时，把 `.workbuddy/memory/` 工作日志**一起** `git add -A` + commit 并直接 push 到 `origin/main`，不留未提交的尾巴。

## 技术要点
- SvelteKit + Svelte 5 + adapter-static，base 路径 `/personalDesk`，dev 端口 6173。
- 弹窗统一用原生 `<dialog>`：背景实色 `--dialog-bg`（无 backdrop-filter），打开时由 `src/lib/scroll-lock.ts` 锁住 body 滚动，引用计数支持嵌套。
- `npm run build` 编译通过但会在 adapter-static 删 `build/` 时被 safe-delete shim 打断（trash 报 Some operations were aborted），不是代码问题。
- CSS 改动后 HMR 可能让 `/src/app.css` 的 `__vite__css` 变空，验证样式前先重启 dev server。
