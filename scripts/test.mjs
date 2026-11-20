import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

// Windows + Git Bash（cd /d/x 起小写盘符 cwd）时，npm 的 .cmd shim 把 vitest CLI
// 解析成小写盘符 URL，而 Vite 把项目 root 归一化成大写盘符。Node ESM 按 URL 字符串
// 缓存模块，于是加载出两份 vitest 运行时：runner 是一份，describe/it 注册到另一份，
// 所有 suite 报「failed to find the current suite」（vitest#11872，官方尚未发修复）。
// 在这里把 cwd 与 vitest 入口都统一成大写盘符再拉起，两侧就始终是同一份实例。
// 非 Windows 的路径以 / 开头，replace 不匹配，行为不变。
const target = process.cwd().replace(/^([a-z]):/, drive => drive.toUpperCase())
const entry = join(target, 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(process.execPath, [entry, 'run', ...process.argv.slice(2)], {
  cwd: target,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)

