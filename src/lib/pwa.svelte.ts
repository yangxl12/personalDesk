import { asset } from '$app/paths'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallState = 'installable' | 'installed' | 'ios' | 'unsupported'

// 安装、离线与独立窗口的状态都收在这里，界面只读状态、不碰浏览器 API。
class PwaState {
  installable = $state(false)
  installed = $state(false)
  ios = $state(false)
  #prompt: InstallPromptEvent | null = null
  #started = false

  get state(): InstallState {
    if (this.installed) return 'installed'
    if (this.installable) return 'installable'
    if (this.ios) return 'ios'
    return 'unsupported'
  }

  init() {
    if (this.#started || typeof window === 'undefined') return
    this.#started = true

    const standalone = window.matchMedia('(display-mode: standalone)')
    this.installed = standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    this.ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)

    window.addEventListener('beforeinstallprompt', event => {
      // 拦下浏览器自带的横幅，改由设置页的按钮触发。
      event.preventDefault()
      this.#prompt = event as InstallPromptEvent
      this.installable = true
    })
    window.addEventListener('appinstalled', () => {
      this.#prompt = null
      this.installable = false
      this.installed = true
    })
    standalone.addEventListener('change', event => {
      this.installed = event.matches
    })

    syncThemeColor()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor)

    // 开发环境的 Service Worker 会跟 HMR 打架，只在构建产物里注册。
    if (import.meta.env.PROD) void this.register()
  }

  async install() {
    const prompt = this.#prompt
    if (!prompt) return 'missing' as const
    this.#prompt = null
    this.installable = false
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    return outcome
  }

  async register() {
    if (!('serviceWorker' in navigator)) return
    try {
      // 不传 scope：默认就是 sw.js 所在目录，仓库改名也不用跟着改。
      const registration = await navigator.serviceWorker.register(asset('sw.js'))
      // 每次启动顺手查一次更新，避免长装的旧版本一直不刷新。
      void registration.update().catch(() => {})
    } catch {
      // 注册失败只影响离线能力，不必打扰用户。
    }
  }
}

export const pwa = new PwaState()

// theme-color 跟随实际底色，安卓状态栏才不会和应用背景撞色。
export function syncThemeColor() {
  if (typeof document === 'undefined') return
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  const color = getComputedStyle(document.documentElement).getPropertyValue('--base').trim()
  if (color) meta.setAttribute('content', color)
}
