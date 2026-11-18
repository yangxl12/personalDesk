import adapter from '@sveltejs/adapter-static'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 6173,
    strictPort: true
  },
  plugins: [sveltekit({
    adapter: adapter({ pages: 'build', assets: 'build', fallback: '404.html', precompress: false }),
    paths: { base: '/personalDesk' },
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
