import { getContext, setContext } from 'svelte'
import type { Attachment } from '#lib/contracts/ai'
import type { ModelStatus } from '#lib/contracts/model'
import type { Preferences } from '#lib/contracts/workspace'
import { english } from '#lib/translations'
import { commit, refreshModules, RequestError } from '#lib/client'
import { goto } from '$app/navigation'

type Field = {
  name: string; label: string; type?: 'text' | 'textarea' | 'select' | 'date'
  value?: string; required?: boolean; options?: [string, string][]; numeric?: boolean
}
export type EditorSpec = {
  title: string; path: string; method?: 'POST' | 'PATCH' | 'DELETE'
  fields?: Field[]; values?: object; description?: string
  toBody?: (values: Record<string, string>) => object
  after?: (data: Record<string, string>) => string
  refreshLocal?: () => Promise<void>
}

export class WorkspaceUi {
  preferences: Preferences
  chatOpen = $state(false)
  chatId = $state<string | null>(null)
  chatRevision = $state(0)
  chatModel: ModelStatus
  attachment = $state<Attachment | null>(null)
  editor = $state<EditorSpec | null>(null)
  remoteChange = $state(false)
  notice = $state('')
  #timer: ReturnType<typeof setTimeout> | undefined

  constructor(preferences: () => Preferences, model: () => ModelStatus) {
    this.preferences = $derived.by(preferences)
    this.chatModel = $derived.by(model)
  }

  t(label: string, values: Record<string, string | number> = {}) {
    const template = this.preferences.language === 'en' ? english[label] ?? label : label
    return template.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match))
  }

  date(value: number) {
    return new Intl.DateTimeFormat(this.preferences.language, { dateStyle: 'medium', timeZone: this.preferences.timezone }).format(value)
  }

  notify(text: string) {
    this.notice = text
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => { this.notice = '' }, 3200)
  }

  showChat(id: string | null = this.chatId) {
    this.chatId = id
    this.chatOpen = true
  }

  resetChat() {
    this.chatId = null
    this.attachment = null
  }

  attach(item: Attachment) {
    this.showChat()
    this.attachment = item
  }

  open(spec: EditorSpec) {
    this.remoteChange = false
    this.editor = spec
  }

  close() {
    this.editor = null
    this.remoteChange = false
  }

  async save(spec: EditorSpec, body: object, key: string) {
    const response = await commit<Record<string, string>>(spec.method ?? 'POST', spec.path, body, key)
    if (response.revisions) await refreshModules(response.revisions)
    if (spec.refreshLocal) await spec.refreshLocal()
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
