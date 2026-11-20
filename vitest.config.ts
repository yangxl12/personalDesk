import { defineConfig } from 'vitest/config'

// 独立于 vite.config.ts：不加载 sveltekit 插件（它把 worker 里的 vitest 模块解析弄坏，
// 报「Vitest failed to find the current suite」），测试全是纯逻辑 + fake-indexeddb，
// #lib 走 package.json 的 subpath imports，不需要 SvelteKit 环境。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
