import { getContext, setContext } from 'svelte'
import type { Attachment } from '#lib/contracts/ai'
import type { ModelStatus } from '#lib/contracts/model'
import type { Preferences } from '#lib/contracts/workspace'
import { english } from '#lib/translations'
import { commit, refreshModules, RequestError } from '#lib/client'
import { goto } from '$app/navigation'
import { resolve } from '$app/paths'

type Field = {
  name: string; label: string; type?: 'text' | 'textarea' | 'select' | 'date'
  value?: string; required?: boolean; options?: [string, string][]; numeric?: boolean
}
export type EditorSpec = {
  title: string; path: string; method?: 'POST' | 'PATCH' | 'DELETE'
  fields?: Field[]; values?: object; description?: string
  toBody?: (values: Record<string, string>) => object
  after?: (data: Record<string, string>) => string
  refreshLocal?: (data: Record<string, string>) => Promise<void> | void
}

export class WorkspaceUi {
  preferences: Preferences
  chatId = $state<string | null>(null)
  chatRevision = $state(0)
  chatModel: ModelStatus
  attachment = $state<Attachment | null>(null)
  editor = $state<EditorSpec | null>(null)
  // 新建思考用独立的一层：只有一个正文框，边写边存，塞不进通用的表单弹窗。
  composer = $state(false)
  remoteChange = $state(false)
  notice = $state('')
  #timer: ReturnType<typeof setTimeout> | undefined
  // Intl.DateTimeFormat 构造很贵，列表里每一行都会调 date()：按语言+时区缓存。
  #dates = new Map<string, Intl.DateTimeFormat>()

  constructor(preferences: () => Preferences, model: () => ModelStatus) {
    this.preferences = $derived.by(preferences)
    this.chatModel = $derived.by(model)
  }

  t(label: string, values: Record<string, string | number> = {}) {
    const template = this.preferences.language === 'en' ? english[label] ?? label : label
    return template.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match))
  }

  date(value: number) {
    const key = this.preferences.language + '\n' + this.preferences.timezone
    let formatter = this.#dates.get(key)
    if (!formatter) {
      if (this.#dates.size > 8) this.#dates.clear()
      formatter = new Intl.DateTimeFormat(this.preferences.language, { dateStyle: 'medium', timeZone: this.preferences.timezone })
      this.#dates.set(key, formatter)
    }
    return formatter.format(value)
  }

  notify(text: string) {
    this.notice = text
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => { this.notice = '' }, 3200)
  }

  // AI 是独立页面，聊天状态留在布局级的 store 里，进出页面不会丢会话。
  openChat(id: string | null = this.chatId) {
    this.chatId = id
    void goto(resolve('ai'))
  }

  resetChat() {
    this.chatId = null
    this.attachment = null
  }

  attach(item: Attachment) {
    this.attachment = item
    void goto(resolve('ai'))
  }

  open(spec: EditorSpec) {
    this.remoteChange = false
    this.editor = spec
  }

  close() {
    this.editor = null
    this.remoteChange = false
  }

  compose() {
    this.composer = true
  }

  endCompose() {
    this.composer = false
  }

  async save(spec: EditorSpec, body: object, key: string) {
    const response = await commit<Record<string, string>>(spec.method ?? 'POST', spec.path, body, key)
    if (response.revisions) await refreshModules(response.revisions)
    if (spec.refreshLocal) await spec.refreshLocal(response.data)
    if (spec.after) await goto(spec.after(response.data))
    this.notify(spec.method === 'DELETE' ? '已删除' : '已保存')
  }

  error(failure: unknown) {
    if (failure instanceof RequestError) {
      if (failure.status === 401) this.notify('会话已过期，请重新登录')
      return this.t(failure.message)
    }
    return this.t('连接失败，请重试')
  }
}

const context = Symbol('workspace')
export function provideUi(preferences: () => Preferences, model: () => ModelStatus) {
  return setContext(context, new WorkspaceUi(preferences, model))
}
export function useUi() {
  return getContext<WorkspaceUi>(context)
}
