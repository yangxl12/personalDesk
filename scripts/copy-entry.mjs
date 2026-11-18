import { copyFileSync, existsSync } from 'node:fs'

// GitHub Pages 没有 SPA 重写：深链一律落到 404.html（应用入口）。
// 根路径额外放一份同名入口，避免访问 /personalDesk/ 时首屏返回 404。
if (existsSync('build/404.html')) copyFileSync('build/404.html', 'build/index.html')
