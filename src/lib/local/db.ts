import Dexie, { type Table } from 'dexie'
import type { RunStatus } from '#lib/contracts/ai'
import type { Preferences, Savings } from '#lib/contracts/workspace'
import type { ModelProvider } from '#lib/contracts/model'

export type Tone = 'violet' | 'mint' | 'amber'

export type GoalRow = {
  id: string
  title: string
  description: string
  tone: Tone
  total_tasks: number
  done_tasks: number
  // 卡片顺序按创建时间固定，编辑标题不会让目标跳到别的位置。
  created_at: number
  updated_at: number
  version: number
}

// 目标是任务的唯一容器，界面不暴露这一层，只为保持既有数据形状。
export type ItemRow = {
  id: string
  goal_id: string
  title: string
  total_tasks: number
  done_tasks: number
  created_at: number
  version: number
}

export type TaskRow = {
  id: string
  item_id: string
  title: string
  done: number
  completed_at: number | null
  created_at: number
  version: number
}

export type NoteRow = {
  id: string
  title: string
  body: string
  summary: string
  created_at: number
  updated_at: number
  version: number
}

export type TransactionRow = {
  id: string
  direction: 'income' | 'expense'
  amount_cents: number
  occurred_on: string
  note: string
  version: number
}

export type SavingsRow = Savings & { id: string }

export type PreferenceRow = Preferences & { id: string }

export type ModelRow = {
  ref: string
  provider: ModelProvider
  id: string
  label?: string
  baseUrl: string
  // 明文存放：本地自用，密钥不出浏览器，也不随备份导出。
  apiKey: string
}

export type ChatRow = {
  id: string
  title: string
  updated_at: number
  version: number
}

export type MessageRow = {
  id: string
  conversation_id: string
  seq: number
  role: 'user' | 'assistant'
  text: string
  state: RunStatus
  domains: number
  sources: string
  created_at: number
  run_id: string | null
  error_code: string | null
  // 用户消息上留一份原始请求，重试时不必再问一遍附件和页面上下文。
  input?: string
}

export type ProposalRow = {
  id: string
  run_id: string
  conversation_id: string
  status: 'pending' | 'applied' | 'rejected' | 'expired' | 'invalidated'
  payload: string
  preview: string
  result: string | null
  expires_at: number
}

export type MetaRow = { key: string; value: number | string }

export const defaultPreferences: Preferences = {
  theme: 'system',
  language: 'zh-CN',
  timezone: 'Asia/Shanghai',
  ai_goals: 1,
  ai_notes: 1,
  ai_finance: 1,
  ai_version: 1,
  version: 1
}

export const defaultSavings: Savings = { current_cents: null, target_cents: null, version: 1 }

class BuxuDatabase extends Dexie {
  goals!: Table<GoalRow, string>
  items!: Table<ItemRow, string>
  tasks!: Table<TaskRow, string>
  notes!: Table<NoteRow, string>
  transactions!: Table<TransactionRow, string>
  savings!: Table<SavingsRow, string>
  preferences!: Table<PreferenceRow, string>
  models!: Table<ModelRow, string>
  chats!: Table<ChatRow, string>
  messages!: Table<MessageRow, string>
  proposals!: Table<ProposalRow, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('buxu')
    this.version(1).stores({
      goals: 'id, updated_at, title',
      items: 'id, goal_id, [goal_id+created_at]',
      tasks: 'id, item_id, [item_id+created_at]',
      notes: 'id, updated_at, created_at',
      transactions: 'id, occurred_on, [occurred_on+id]',
      savings: 'id',
      preferences: 'id',
      models: 'ref, provider',
      chats: 'id, updated_at',
      messages: 'id, conversation_id, &[conversation_id+seq], created_at',
      proposals: 'id, run_id, status',
      meta: 'key'
    })
    // 目标加了 created_at：老数据用它原来的 updated_at 兜底，卡片顺序不至于全乱。
    this.version(2).stores({
      goals: 'id, updated_at, created_at, title',
      items: 'id, goal_id, [goal_id+created_at]',
      tasks: 'id, item_id, [item_id+created_at]',
      notes: 'id, updated_at, created_at',
      transactions: 'id, occurred_on, [occurred_on+id]',
      savings: 'id',
      preferences: 'id',
      models: 'ref, provider',
      chats: 'id, updated_at',
      messages: 'id, conversation_id, &[conversation_id+seq], created_at',
      proposals: 'id, run_id, status',
      meta: 'key'
    }).upgrade(tx => tx.table('goals').toCollection().modify((row: GoalRow) => {
      if (typeof row.created_at !== 'number') row.created_at = row.updated_at
    }))
  }
}

export const db = new BuxuDatabase()

let opening: Promise<void> | null = null

// 首屏 load 里先 await 这里，之后所有仓储调用都可以直接用 db。
export function openDb(): Promise<void> {
  opening ??= (async () => {
    await db.open()
    await ensureSingleton()
    await settleInterruptedRuns()
  })().catch(failure => {
    opening = null
    throw failure
  })
  return opening
}

async function ensureSingleton() {
  const row = await db.preferences.get('default')
  if (!row) {
    await db.preferences.put({ id: 'default', ...defaultPreferences })
  } else if (row.ai_goals !== 1 || row.ai_notes !== 1 || row.ai_finance !== 1) {
    // AI 数据访问不再提供开关，历史数据里关掉的旧值一律放开。
    await db.preferences.put({ ...row, ai_goals: 1, ai_notes: 1, ai_finance: 1 })
  }
  if (!(await db.savings.get('default'))) {
    await db.savings.put({ id: 'default', ...defaultSavings })
  }
}

// 刷新即中断：浏览器端没有后台进程，残留的「生成中」一律按中断处理。
async function settleInterruptedRuns() {
  const stale = await db.messages.filter(message => message.state === 'queued' || message.state === 'running').toArray()
  if (!stale.length) return
  await db.messages.bulkPut(stale.map(message => ({
    ...message,
    state: 'interrupted' as RunStatus,
    error_code: message.error_code ?? 'AI_INTERRUPTED'
  })))
}
