import { z } from 'zod'
import { db } from '../db'
import { write } from '../tx'
import { bump, fault } from './workspace'
import type { ChatRow, GoalRow, ItemRow, MessageRow, NoteRow, TaskRow, TransactionRow } from '../db'
import type { Preferences, Savings } from '#lib/contracts/workspace'

const amount = z.number().int()
const stamp = z.number().int()
const tone = z.enum(['violet', 'mint', 'amber'])
const state = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'])

const goal = z.object({
  id: z.uuid(), title: z.string().max(120), description: z.string().max(4000), tone,
  total_tasks: z.number().int().nonnegative(), done_tasks: z.number().int().nonnegative(),
  updated_at: stamp, version: z.number().int().positive()
})
const item = z.object({
  id: z.uuid(), goal_id: z.uuid(), title: z.string().max(120),
  total_tasks: z.number().int().nonnegative(), done_tasks: z.number().int().nonnegative(),
  created_at: stamp, version: z.number().int().positive()
})
const task = z.object({
  id: z.uuid(), item_id: z.uuid(), title: z.string().max(120), done: z.union([z.literal(0), z.literal(1)]),
  completed_at: stamp.nullable(), created_at: stamp, version: z.number().int().positive()
})
const note = z.object({
  id: z.uuid(), title: z.string().max(120), body: z.string().min(1), summary: z.string(),
  created_at: stamp, updated_at: stamp, version: z.number().int().positive()
})
const transaction = z.object({
  id: z.uuid(), direction: z.enum(['income', 'expense']), amount_cents: amount,
  occurred_on: z.string(), note: z.string().max(500), version: z.number().int().positive()
})
const saving = z.object({
  current_cents: amount.nullable(), target_cents: amount.nullable(), version: z.number().int().positive()
})
const preference = z.object({
  theme: z.enum(['system', 'light', 'dark']), language: z.enum(['zh-CN', 'en']),
  timezone: z.string().min(1).max(100), ai_goals: z.number().int().min(0).max(1),
  ai_notes: z.number().int().min(0).max(1), ai_finance: z.number().int().min(0).max(1),
  ai_version: z.number().int().nonnegative(), version: z.number().int().positive()
})
const chat = z.object({ id: z.uuid(), title: z.string().max(200), updated_at: stamp, version: z.number().int().positive() })
const message = z.object({
  id: z.uuid(), conversation_id: z.uuid(), seq: z.number().int().nonnegative(),
  role: z.enum(['user', 'assistant']), text: z.string(), state, domains: z.number().int().nonnegative(),
  sources: z.string(), created_at: stamp, run_id: z.uuid().nullable(), error_code: z.string().nullable(),
  input: z.string().optional()
})
const backup = z.object({
  format: z.literal('buxu-backup'),
  version: z.number().int().positive(),
  exportedAt: stamp,
  counts: z.record(z.string(), z.number().int().nonnegative()).optional(),
  data: z.object({
    goals: z.array(goal), items: z.array(item), tasks: z.array(task), notes: z.array(note),
    transactions: z.array(transaction), savings: saving, preferences: preference,
    chats: z.array(chat), messages: z.array(message)
  })
})
export type Backup = z.infer<typeof backup>
export type BackupData = {
  goals: GoalRow[]
  items: ItemRow[]
  tasks: TaskRow[]
  notes: NoteRow[]
  transactions: TransactionRow[]
  savings: Savings
  preferences: Preferences
  chats: ChatRow[]
  messages: MessageRow[]
}

export const FORMAT_VERSION = 1
const WEEK = 7 * 86_400_000

const countsOf = (data: BackupData) => ({
  goals: data.goals.length, tasks: data.tasks.length, notes: data.notes.length,
  transactions: data.transactions.length, chats: data.chats.length, messages: data.messages.length
})

export async function exportBackup() {
  const [goals, items, tasks, notes, transactions, saving, preference, chats, messages] = await Promise.all([
    db.goals.toArray(), db.items.toArray(), db.tasks.toArray(), db.notes.toArray(), db.transactions.toArray(),
    db.savings.get('default'), db.preferences.get('default'), db.chats.toArray(), db.messages.toArray()
  ])
  const data: BackupData = {
    goals,
    items,
    tasks,
    notes,
    transactions,
    savings: {
      current_cents: saving?.current_cents ?? null,
      target_cents: saving?.target_cents ?? null,
      version: saving?.version ?? 1
    },
    preferences: preference
      ? {
        theme: preference.theme, language: preference.language, timezone: preference.timezone,
        ai_goals: preference.ai_goals, ai_notes: preference.ai_notes, ai_finance: preference.ai_finance,
        ai_version: preference.ai_version, version: preference.version
      }
      : {
        theme: 'system', language: 'zh-CN', timezone: 'Asia/Shanghai',
        ai_goals: 1, ai_notes: 1, ai_finance: 1, ai_version: 1, version: 1
      },
    chats,
    messages
  }
  const counts = countsOf(data)
  await db.meta.put({ key: 'lastBackupAt', value: Date.now() })
  return { format: 'buxu-backup' as const, version: FORMAT_VERSION, exportedAt: Date.now(), counts, data }
}

export function inspect(text: string): { data: BackupData; counts: ReturnType<typeof countsOf> } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw fault(422, 'INVALID_IMPORT', '备份文件的 JSON 格式无效')
  }
  const parsed = backup.safeParse(raw)
  if (!parsed.success) {
    throw fault(422, 'INVALID_IMPORT', '备份文件内容校验失败',
      parsed.error.issues.slice(0, 10).map(issue => ({ path: issue.path.join('.'), message: issue.message })))
  }
  if (parsed.data.version > FORMAT_VERSION) {
    throw fault(422, 'IMPORT_VERSION', '备份文件来自更高版本，请先更新应用')
  }
  const data = parsed.data.data as unknown as BackupData
  const problems: { path: string; message: string }[] = []
  const goals = new Set(data.goals.map(row => row.id))
  const items = new Set(data.items.map(row => row.id))
  const chats = new Set(data.chats.map(row => row.id))
  for (const row of data.items) if (!goals.has(row.goal_id)) problems.push({ path: 'items.' + row.id, message: '找不到所属目标' })
  for (const row of data.tasks) if (!items.has(row.item_id)) problems.push({ path: 'tasks.' + row.id, message: '找不到所属任务组' })
  for (const row of data.messages) if (!chats.has(row.conversation_id)) problems.push({ path: 'messages.' + row.id, message: '找不到所属会话' })
  const sequences = new Set<string>()
  for (const row of data.messages) {
    const key = row.conversation_id + ':' + row.seq
    if (sequences.has(key)) problems.push({ path: 'messages.' + row.id, message: '会话内的消息序号重复' })
    sequences.add(key)
  }
  if (problems.length) throw fault(422, 'INVALID_IMPORT', '备份文件内容校验失败', problems.slice(0, 10))
  return { data, counts: countsOf(data) }
}

export function importBackup(data: BackupData, mode: 'merge' | 'replace') {
  return write(async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.goals.clear(), db.items.clear(), db.tasks.clear(), db.notes.clear(),
        db.transactions.clear(), db.chats.clear(), db.messages.clear(), db.proposals.clear()
      ])
    } else {
      // 消息在 (会话, 序号) 上有唯一约束，合并时先让位给文件里的版本。
      for (const row of data.messages) {
        const taken = await db.messages.where('[conversation_id+seq]').equals([row.conversation_id, row.seq]).first()
        if (taken && taken.id !== row.id) await db.messages.delete(taken.id)
      }
    }
    await db.goals.bulkPut(data.goals)
    await db.items.bulkPut(data.items)
    await db.tasks.bulkPut(data.tasks)
    await db.notes.bulkPut(data.notes)
    await db.transactions.bulkPut(data.transactions)
    await db.chats.bulkPut(data.chats)
    await db.messages.bulkPut(data.messages)
    await db.savings.put({ id: 'default', ...data.savings })
    await db.preferences.put({ id: 'default', ...data.preferences })
    const revisions: Record<string, number> = {}
    for (const module of ['goals', 'notes', 'finance', 'chats', 'preferences']) revisions[module] = await bump(module)
    return { data: { counts: countsOf(data) }, revisions }
  })
}

export async function backupNotice() {
  const [done, dismissed] = await Promise.all([db.meta.get('lastBackupAt'), db.meta.get('backupDismissed')])
  if (dismissed && Date.now() - Number(dismissed.value) < WEEK) return { due: false }
  const last = Number(done?.value ?? 0)
  if (last && Date.now() - last < WEEK) return { due: false }
  const [goals, notes, transactions] = await Promise.all([db.goals.count(), db.notes.count(), db.transactions.count()])
  return { due: goals + notes + transactions > 0 }
}

export async function dismissBackupNotice() {
  await db.meta.put({ key: 'backupDismissed', value: Date.now() })
  return { data: { due: false } }
}
