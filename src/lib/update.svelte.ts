import { replaceState } from '$app/navigation'

type Status = 'dev' | 'idle' | 'checking' | 'latest' | 'available' | 'failed'

// 静态站点没有服务端，浏览器手里的旧 HTML 和 Service Worker 缓存都可能把新部署挡住。
// 「检查更新」只做两件事：比版本号、必要时把三处旧壳子拆掉再带参数刷新。
class Updater {
  // 构建时注入的提交短 SHA，跟 build/version.json 里的 id 同源。
  readonly version = __BUILD_ID__
  status = $state<Status>(import.meta.env.DEV ? 'dev' : 'idle')
  remote = $state<{ id: string; builtAt?: string } | null>(null)
  applying = $state(false)

  // 每次重启回来看一眼：老页面开了一整天，不查就一直是旧代码。
  autoCheck() {
    if (this.status === 'idle') void this.check()
  }

  async check() {
    if (this.status === 'checking' || this.status === 'dev') return
    this.status = 'checking'
    try {
      // 时间戳 + no-store：CDN 和浏览器缓存都可能把上一次部署的 version.json 递回来。
      // 它是构建时才生成的文件，不在 static 里，所以按 base 拼绝对地址，不走 asset()。
      const response = await fetch(`${__BUILD_BASE__}/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(String(response.status))
      const body = await response.json() as { id?: unknown; builtAt?: unknown }
      const id = typeof body.id === 'string' ? body.id : ''
      this.remote = id && id !== this.version
        ? { id, builtAt: typeof body.builtAt === 'string' ? body.builtAt : undefined }
        : null
      this.status = this.remote ? 'available' : 'latest'
    } catch {
      this.remote = null
      this.status = 'failed'
    }
  }

  async apply() {
    if (this.applying) return
    this.applying = true
    await clearOffline()
    // 带一次性参数刷新：绕过浏览器与 CDN 对入口 HTML 的强缓存，拿到新部署的那份。
    // 参数在下次启动时由 init() 抹掉。
    const url = new URL(location.href)
    url.searchParams.set('v', Date.now().toString(36))
    location.replace(url.href)
  }

  // 刷新后清掉地址里的 ?v=…，别让它跟着每一次站内跳转。
  init() {
    if (typeof window === 'undefined') return
    const url = new URL(location.href)
    if (!url.searchParams.has('v')) return
    url.searchParams.delete('v')
    void replaceState(url, {})
  }
}

// 注销旧 Service Worker、清掉应用缓存：缓存留着是给还开着的旧页面兜底，
// 但用户主动点「更新」时旧壳子只会帮倒忙。
async function clearOffline() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
    }
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.filter(name => name.startsWith('buxu-')).map(name => caches.delete(name)))
    }
  } catch {
    // 清不掉也照刷不误，浏览器的常规校验还能再兜一层。
  }
}

export const updater = new Updater()
