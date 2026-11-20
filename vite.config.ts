import { execSync } from 'node:child_process'
import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig, type Plugin } from 'vite'

// 设置页的「检查更新」要拿一个能跨部署比对的版本号：用提交短 SHA 而不是构建时间，
// 同一份代码重复构建不会误报有新版本；不在 git 仓库里（比如源码包）时退回时间戳。
const buildId = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
})() || Date.now().toString(36)
const builtAt = new Date().toISOString()
// 与 paths.base 同源：检查更新要拼一个绝对地址，用它就不会跟着当前页面的相对路径跑偏。
const base = '/personalDesk'

// 版本号写进产物根目录，页面启动时读到的常量就是它，两者对不上就是有新部署。
// 挂在这个插件里而不是构建脚本里：adapter-static 会把 bundle 里的资源一起写进 build/。
function versionFile(): Plugin {
  return {
    name: 'buxu:version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: buildId, builtAt }) })
    }
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId), __BUILD_BASE__: JSON.stringify(base) },
  server: {
    port: 6173,
    strictPort: true
  },
  plugins: [versionFile(), sveltekit({
    adapter: adapter({ pages: 'build', assets: 'build', fallback: '404.html', precompress: false }),
    paths: { base },
    csp: {
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
        // 勾选框的对勾是内联 SVG 背景图，需要放开 data: 图片。
        'img-src': ['self', 'data:'],
        // AI 由浏览器直连供应商，地址可在设置页自定义，无法枚举域名。
        'connect-src': ['self', 'https:'],
        'object-src': ['none'],
        'base-uri': ['none'],
        'frame-ancestors': ['none'],
        'form-action': ['self']
      }
    }
  })]
})
