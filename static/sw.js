// 步序的离线外壳。
//
// 站点是纯静态的（adapter-static，入口 404.html），没有服务端。策略：
// - 导航请求：网络优先，断网回退到缓存的应用外壳，深链与离线都能进应用。
// - /_app/ 等带 hash 的静态资源：缓存优先，命中即用。
// - 跨域请求（AI 直连供应商）一律不拦。
//
// 缓存不按版本清空：旧页面可能还在引用上一版 hash 资源，清掉会让它 404。
// 个人自用场景下多留几份旧资源比“更新后白屏”划算。

const SHELL_CACHE = 'buxu-shell'
const ASSET_CACHE = 'buxu-assets'

const SCOPE = self.registration.scope
const SHELL_URL = new URL('./', SCOPE).href
const CORE = ['./', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.svg']

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    // 逐个装，单个文件缺失不能让整个 SW 装不上。
    await Promise.allSettled(CORE.map(url => cache.add(new URL(url, SHELL_URL).href)))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter(name => name.startsWith('buxu-') && name !== SHELL_CACHE && name !== ASSET_CACHE)
      .map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return

  // 导航和 SvelteKit 的 hover 预取都会取 HTML，一并走网络优先。
  const wantsHtml = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')
  if (wantsHtml) {
    event.respondWith(navigate(request))
    return
  }
  event.respondWith(asset(request))
})

async function navigate(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      // 所有路由共用同一份应用外壳，统一挂在 SHELL_URL 下。
      await cache.put(SHELL_URL, response.clone())
    }
    return response
  } catch {
    // 所有路由共用一份外壳，深链离线也回落到它。
    const shell = await caches.match(SHELL_URL)
    return shell || offline()
  }
}

async function asset(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(ASSET_CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

function offline() {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>步序 · 离线</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f6fc;color:#1d1b30;
font:16px/1.6 -apple-system,'PingFang SC','Microsoft YaHei UI',sans-serif;text-align:center;padding:32px">
<div><p style="font-size:18px;font-weight:600;margin:0 0 8px">现在没有网络，也没找到本地副本</p>
<p style="margin:0;color:#7a7796">连上网络刷新一次，之后就能离线打开。</p></div>`
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } })
}
