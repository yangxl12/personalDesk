import { clearConfig, readConfig, runSync, saveConfig, syncStatus, type SyncConfig } from './engine'

type Status = Awaited<ReturnType<typeof syncStatus>>

// 同步状态收在这里，界面只读状态、不碰 GitHub API。
// 触发点三个：启动一次、本地写入后延迟 3 秒、回到前台一次。
class SyncState {
  configured = $state(false)
  busy = $state(false)
  lastAt = $state(0)
  conflicts = $state(0)
  rev = $state(0)
  error = $state('')
  notice = $state('')
  #started = false
  #timer: ReturnType<typeof setTimeout> | null = null

  #mutated = () => {
    if (!readConfig() || this.busy) return
    if (this.#timer) clearTimeout(this.#timer)
    // 输入过程会连续提交，攒够 3 秒静默再推，避免每敲一下就发一次请求。
    this.#timer = setTimeout(() => { void this.sync('auto') }, 3000)
  }

  #visible = () => {
    if (document.visibilityState !== 'visible') return
    if (!readConfig() || this.busy) return
    void this.sync('auto')
  }

  async init() {
    if (this.#started || typeof window === 'undefined') return
    this.#started = true
    // 先按本地配置点亮状态，避免设置页从「未配置」表单闪一下。
    this.configured = !!readConfig()
    const status = await syncStatus()
    this.#apply(status)
    if (!status.configured) return
    window.addEventListener('buxu:revisions', this.#mutated)
    document.addEventListener('visibilitychange', this.#visible)
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
    }
  }

  connect(config: SyncConfig) {
    saveConfig(config)
    this.configured = true
    this.error = ''
    this.notice = ''
    void this.sync('manual')
  }

  disconnect() {
    clearConfig()
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
