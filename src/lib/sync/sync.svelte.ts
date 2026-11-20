import { clearConfig, readConfig, runSync, saveConfig, syncStatus, type SyncConfig } from './engine'

type Status = Awaited<ReturnType<typeof syncStatus>>

// 页面可见时每隔这段时间静默拉一次：两边一致就只更新「上次同步时间」，
// 不写库也不刷新，所以代价只有一个 GET。
const POLL_MS = 90_000

// 同步状态收在这里，界面只读状态、不碰 GitHub API。
// 触发点五个：启动一次、本地写入后延迟 3 秒、回到前台一次、恢复联网一次、可见期间定时拉取。
class SyncState {
  configured = $state(false)
  busy = $state(false)
  lastAt = $state(0)
  conflicts = $state(0)
  rev = $state(0)
  error = $state('')
  notice = $state('')
  #started = false
  #attached = false
  #timer: ReturnType<typeof setTimeout> | null = null
  #ticker: ReturnType<typeof setInterval> | null = null
  // busy 期间发生的本地写入记在这里，等这轮同步结束立即补排，而不是等下一次轮询。
  #pending = false

  // 本地写入收口：输入过程会连续提交，攒够 3 秒静默再推，避免每敲一下就发一次请求。
  #mutated = () => {
    if (!readConfig()) return
    if (this.busy) {
      this.#pending = true
      return
    }
    this.#schedule()
  }

  #schedule() {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => { void this.sync('auto') }, 3000)
  }

  #visible = () => {
    if (document.visibilityState !== 'visible') {
      this.#stopTick()
      // 切后台不带着被攒下的那次推：回前台会立即同步一次，这些写入不会丢。
      if (this.#timer) {
        clearTimeout(this.#timer)
        this.#timer = null
      }
      return
    }
    this.#startTick()
    if (!readConfig() || this.busy) return
    void this.sync('auto')
  }

  // 断网期间的写入在恢复联网的第一时间补推，不用等轮询或切前台。
  #online = () => {
    if (!readConfig() || this.busy) return
    void this.sync('auto')
  }

  #startTick() {
    if (this.#ticker) return
    this.#ticker = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!readConfig() || this.busy) return
      void this.sync('auto')
    }, POLL_MS)
  }

  #stopTick() {
    if (!this.#ticker) return
    clearInterval(this.#ticker)
    this.#ticker = null
  }

  #attach() {
    if (this.#attached || typeof window === 'undefined') return
    this.#attached = true
    window.addEventListener('buxu:revisions', this.#mutated)
    window.addEventListener('online', this.#online)
    document.addEventListener('visibilitychange', this.#visible)
  }

  #detach() {
    if (!this.#attached) return
    this.#attached = false
    window.removeEventListener('buxu:revisions', this.#mutated)
    window.removeEventListener('online', this.#online)
    document.removeEventListener('visibilitychange', this.#visible)
    this.#stopTick()
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    this.#pending = false
  }

  async init() {
    if (this.#started || typeof window === 'undefined') return
    this.#started = true
    // 先按本地配置点亮状态，避免设置页从「未配置」表单闪一下。
    this.configured = !!readConfig()
    const status = await syncStatus()
    this.#apply(status)
    if (!status.configured) return
    this.#attach()
    this.#startTick()
    void this.sync('auto')
  }

  async sync(reason: 'auto' | 'manual') {
    if (this.busy) return
    this.busy = true
    this.error = ''
    if (reason === 'manual') this.notice = ''
    try {
      const report = await runSync()
      this.lastAt = report.at
      this.conflicts = report.conflicts
      this.rev = report.rev
      if (reason === 'manual') this.notice = report.pushed ? '已同步' : '已是最新'
    } catch (failure) {
      this.error = failure instanceof Error ? failure.message : '同步失败'
    } finally {
      this.busy = false
      if (this.#pending) {
        this.#pending = false
        this.#schedule()
      }
    }
  }

  connect(config: SyncConfig) {
    saveConfig(config)
    this.configured = true
    this.error = ''
    this.notice = ''
    // init 只在「启动时已配置」的场景挂监听；首次连接要在这里补挂，
    // 否则连接后的本地写入、切前台、恢复联网全都触发不了同步。
    this.#attach()
    this.#startTick()
    void this.sync('manual')
  }

  disconnect() {
    clearConfig()
    this.#detach()
    this.configured = false
    this.lastAt = 0
    this.conflicts = 0
    this.rev = 0
    this.notice = ''
    this.error = ''
  }

  #apply(status: Status) {
    this.configured = status.configured
    this.lastAt = status.lastAt
    this.conflicts = status.conflicts
    this.rev = status.rev
  }
}

export const sync = new SyncState()
