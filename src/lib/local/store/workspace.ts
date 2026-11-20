import { db, openDb, type GoalRow, type ItemRow, type NoteRow, type TaskRow, type TransactionRow } from '../db'
import { randomId } from '#lib/random-id'
import { write } from '../tx'
import { markDeleted } from './tombstone'
import {
  inputs, month, today, type Dashboard, type DashboardGoal, type Finance, type Goal, type GoalPlan, type GoalTask, type List,
  type Note, type NoteSummary, type Preferences, type Revisions, type Savings, type TaskBrief, type Totals, type Progress
} from '#lib/contracts/workspace'

export type PageOptions = { cursor?: string; limit: number }
export type GoalOptions = PageOptions & { status: 'all' | 'active' | 'done' }
export type Mutation = { data: Record<string, unknown>; revisions: Revisions }
type Operation = keyof typeof inputs

const OUTLINE_TASKS = 5
const dayDate = /^\d{4}-\d{2}-\d{2}$/

export const summaries = (text: string) => [...text.replace(/\s+/gu, ' ')].slice(0, 80).join('')

export const isDone = (value: Progress) => value.total_tasks > 0 && value.done_tasks === value.total_tasks

function encode(parts: (string | number)[]) {
  return btoa(JSON.stringify(parts)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decode(value: string): unknown[] | null {
  try {
    const text = value.replace(/-/g, '+').replace(/_/g, '/')
    const parts: unknown = JSON.parse(atob(text.padEnd(Math.ceil(text.length / 4) * 4, '=')))
    return Array.isArray(parts) ? parts : null
  } catch {
    return null
  }
}

export function fault(status: number, code: string, message: string, fields?: unknown) {
  return Object.assign(new Error(message), { status, code, fields })
}

export const notFound = () => fault(404, 'NOT_FOUND', '记录不存在或已删除')
const invalidCursor = () => fault(400, 'INVALID_CURSOR', '分页参数无效')

// Dexie 没有外键，写入路径统一包在 tx.ts 的事务里，计数维护与实体写入同属一次事务。
export async function bump(module: string) {
  const key = 'rev:' + module
  const current = await db.meta.get(key)
  const value = Number(current?.value ?? 0) + 1
  await db.meta.put({ key, value })
  return value
}

export const bumpRevision = bump

export async function revisions(): Promise<Revisions> {
  const rows = await db.meta.toArray()
  return Object.fromEntries(rows.filter(row => row.key.startsWith('rev:'))
    .map(row => [row.key.slice(4), Number(row.value)]))
}

export async function preferences(): Promise<Preferences> {
  await openDb()
  const row = await db.preferences.get('default')
  if (!row) throw notFound()
  const { id: _id, ...value } = row
  return value
}

export async function preferencesRow() {
  const row = await db.preferences.get('default')
  if (!row) throw notFound()
  return row
}

export async function savings(): Promise<Savings> {
  await openDb()
  const row = await db.savings.get('default')
  if (!row) throw notFound()
  return { current_cents: row.current_cents, target_cents: row.target_cents, version: row.version }
}

export function accountMonth(timezone: string) {
  // 复用 today() 的缓存格式化器，截掉日就是月份，不再单独构造 Intl。
  return today(timezone).slice(0, 7)
}

export function pageOptions(query: URLSearchParams): PageOptions {
  const cursor = query.get('cursor') ?? undefined
  const raw = query.get('limit')
  const limit = raw === null ? 30 : Number(raw)
  if ((cursor && (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor))) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw fault(400, 'INVALID_QUERY', '分页参数无效')
  }
  return { cursor, limit }
}

export function goalOptions(query: URLSearchParams): GoalOptions {
  const status = query.get('status') ?? 'all'
  if (status !== 'all' && status !== 'active' && status !== 'done') throw fault(400, 'INVALID_QUERY', '目标状态无效')
  return { ...pageOptions(query), status }
}

export function financeOptions(query: URLSearchParams) {
  const selected = query.get('month') ?? undefined
  if (selected !== undefined && !month.safeParse(selected).success) throw fault(400, 'INVALID_QUERY', '月份格式无效')
  const from = query.get('from') ?? undefined
  const to = query.get('to') ?? undefined
  // 工作台按年/月/日筛选时传日期区间（两端都包含），按月查的旧路径继续用 month。
  if (from || to) {
    if (!from || !to || !dayDate.test(from) || !dayDate.test(to) || from > to) {
      throw fault(400, 'INVALID_QUERY', '日期范围无效')
    }
    return { ...pageOptions(query), from, to }
  }
  return { ...pageOptions(query), month: selected }
}

export function bounds(month: string): [string, string] {
  const [year, number] = month.split('-').map(Number)
  const end = number === 12 ? (year + 1) + '-01' : year + '-' + String(number + 1).padStart(2, '0')
  return [month + '-01', year === 9999 && number === 12 ? '9999-12-32' : end + '-01']
}

function totals(rows: TransactionRow[]): Totals {
  let income = 0n
  let expense = 0n
  for (const row of rows) {
    if (row.direction === 'income') income += BigInt(row.amount_cents)
    else expense += BigInt(row.amount_cents)
  }
  return { income: String(income), expense: String(expense), balance: String(income - expense) }
}

type Keyed = { id: string }

function cmp(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : left > right ? 1 : 0
  const a = String(left)
  const b = String(right)
  return a < b ? -1 : a > b ? 1 : 0
}

// 列表按 (key, id) 排序后用游标切片；游标就是上一页最后一条的 key 与 id。
export function slicePage<T extends Keyed>(rows: T[], key: (row: T) => string | number, ascending: boolean,
  scope: string, options: PageOptions): List<T> {
  let start = 0
  if (options.cursor) {
    const decoded = decode(options.cursor)
    const boundary = decoded?.[1]
    if (decoded?.length !== 3 || decoded[0] !== scope ||
      !(typeof boundary === 'string' || typeof boundary === 'number') || typeof decoded[2] !== 'string') {
      throw invalidCursor()
    }
    const cursorId = decoded[2]
    start = rows.findIndex(row => {
      const order = cmp(key(row), boundary)
      if (order !== 0) return ascending ? order > 0 : order < 0
      return ascending ? row.id > cursorId : row.id < cursorId
    })
    if (start < 0) return { items: [], nextCursor: null }
  }
  const page = rows.slice(start, start + options.limit)
  const last = page.at(-1)
  const hasMore = start + options.limit < rows.length
  return { items: page, nextCursor: hasMore && last ? encode([scope, key(last), last.id]) : null }
}

export const descByTime = <T extends Keyed>(key: (row: T) => number) => (left: T, right: T) =>
  key(right) - key(left) || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0)

async function tasksByGoal(goalIds: string[]) {
  const grouped = new Map<string, TaskRow[]>()
  if (!goalIds.length) return grouped
  const items = await db.items.where('goal_id').anyOf(goalIds).toArray()
  if (!items.length) return grouped
  const owner = new Map(items.map(item => [item.id, item.goal_id]))
  const tasks = await db.tasks.where('item_id').anyOf(items.map(item => item.id)).toArray()
  for (const task of tasks) {
    const goalId = owner.get(task.item_id)
    if (!goalId) continue
    const list = grouped.get(goalId)
    if (list) list.push(task)
    else grouped.set(goalId, [task])
  }
  for (const list of grouped.values()) list.sort((left, right) =>
    left.done - right.done || left.created_at - right.created_at || (left.id < right.id ? -1 : 1))
  return grouped
}

const brief = (task: TaskRow): TaskBrief => ({ id: task.id, title: task.title, done: task.done, version: task.version })
const summaryOf = ({ body: _body, ...rest }: NoteRow): NoteSummary => rest

// 导入的旧备份可能没有 created_at，用 updated_at 兜底。
const createdAt = (row: GoalRow) => row.created_at > 0 ? row.created_at : row.updated_at

export async function dashboard(): Promise<Dashboard> {
  await openDb()
  const settings = await preferences()
  const month = accountMonth(settings.timezone)
  // 目标卡片按创建顺序排列：新建的目标永远追加在最后，编辑标题不会改变位置。
  const goals = (await db.goals.toArray()).sort((left, right) =>
    createdAt(left) - createdAt(right) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  const grouped = await tasksByGoal(goals.map(goal => goal.id))
  // grouped 里已完成的任务排在后面：先用这个顺序挑出要展示的几条，避免已勾选的占满卡片；
  // 挑完之后再按创建顺序还原，勾一下不会让任务行整体换位置（换位置看起来就是一蹦一蹦的闪）。
  const plan = (goal: GoalRow): GoalPlan => {
    const picked = (grouped.get(goal.id) ?? []).slice(0, OUTLINE_TASKS)
      .sort((left, right) => left.created_at - right.created_at || (left.id < right.id ? -1 : 1))
    return { tasks: picked.map(brief), total: goal.total_tasks }
  }
  const notes = (await db.notes.toArray()).sort(descByTime<NoteRow>(row => row.updated_at))
  const [start, end] = bounds(month)
  const monthRows = await db.transactions.where('occurred_on').between(start, end, true, false).toArray()
  return {
    goals: goals.map(goal => ({ ...goal, plan: plan(goal) }) as DashboardGoal),
    hasGoals: goals.length > 0,
    notes,
    month,
    totals: totals(monthRows),
    savings: await savings()
  }
}

export async function goals(options: GoalOptions): Promise<List<Goal>> {
  await openDb()
  const rows = (await db.goals.toArray()).sort(descByTime<GoalRow>(row => row.updated_at))
  const filtered = options.status === 'all' ? rows : rows.filter(row => isDone(row) === (options.status === 'done'))
  return slicePage(filtered, row => row.updated_at, false, 'goals:' + options.status, options)
}

export async function goalById(goalId: string): Promise<Goal> {
  const goal = await db.goals.get(goalId)
  if (!goal) throw notFound()
  return { ...goal, items: await db.items.where('goal_id').equals(goalId).count() }
}

export async function goalTasks(goalId: string): Promise<GoalTask[]> {
  await openDb()
  if (!(await db.goals.get(goalId))) throw notFound()
  return (await tasksByGoal([goalId])).get(goalId)?.map(({ item_id: _item, ...rest }) => rest) ?? []
}

export async function goalPage(goalId: string): Promise<{ goal: Goal; tasks: GoalTask[] }> {
  return { goal: await goalById(goalId), tasks: await goalTasks(goalId) }
}

export async function notes(options: PageOptions): Promise<List<NoteSummary>> {
  await openDb()
  const rows = (await db.notes.toArray()).map(summaryOf).sort(descByTime<NoteSummary>(row => row.updated_at))
  return slicePage(rows, row => row.updated_at, false, 'notes', options)
}

export async function note(noteId: string): Promise<Note> {
  const value = await db.notes.get(noteId)
  if (!value) throw notFound()
  return value
}

export async function finance(options: PageOptions & { month?: string; from?: string; to?: string }): Promise<Finance> {
  await openDb()
  const month = options.month ?? accountMonth((await preferences()).timezone)
  // 区间查询两端都包含；按月的旧路径仍用 [本月首日, 下月首日) 的左闭右开区间。
  const range: [string, string, boolean] = options.from && options.to
    ? [options.from, options.to, true]
    : [...bounds(month), false]
  const [start, end, inclusive] = range
  const rows = await db.transactions.where('occurred_on').between(start, end, true, inclusive).toArray()
  rows.sort((left, right) => right.occurred_on.localeCompare(left.occurred_on) ||
    (left.id < right.id ? 1 : left.id > right.id ? -1 : 0))
  return {
    ...slicePage(rows, row => row.occurred_on, false, 'finance:' + start, options),
    month: start.slice(0, 7),
    totals: totals(rows),
    savings: await savings()
  }
}

async function ancestors(itemId: string, now: number, taskDelta: number, doneDelta: number) {
  const item = await db.items.get(itemId)
  if (!item) throw notFound()
  item.version += 1
  item.total_tasks += taskDelta
  item.done_tasks += doneDelta
  item.updated_at = now
  await db.items.put(item)
  const goal = await db.goals.get(item.goal_id)
  if (!goal) throw notFound()
  goal.version += 1
  goal.updated_at = now
  goal.total_tasks += taskDelta
  goal.done_tasks += doneDelta
  await db.goals.put(goal)
}

async function container(goalId: string, now: number, title: string) {
  const items = (await db.items.where('goal_id').equals(goalId).toArray())
    .sort((left, right) => left.created_at - right.created_at || (left.id < right.id ? -1 : 1))
  if (items[0]) return items[0]
  const created: ItemRow = {
    id: randomId(), goal_id: goalId, title, total_tasks: 0, done_tasks: 0,
    created_at: now, updated_at: now, version: 1
  }
  await db.items.put(created)
  return created
}

function moduleOf(operation: Operation) {
  if (operation.startsWith('preferences')) return 'preferences'
  if (operation.startsWith('note')) return 'notes'
  return /^(transaction|savings)/.test(operation) ? 'finance' : 'goals'
}

export function apply(operation: Operation, ref: string | null, input: unknown): Promise<Mutation> {
  return write(async () => {
    const now = Date.now()
    const data = await execute(operation, ref, input, now)
    const module = moduleOf(operation)
    return { data, revisions: { [module]: await bump(module) } }
  })
}

async function execute(operation: Operation, ref: string | null, input: unknown, now: number): Promise<Record<string, unknown>> {
  switch (operation) {
    case 'goalCreate': {
      const value = input as typeof inputs.goalCreate._output
      const row: GoalRow = {
        id: randomId(), title: value.title, description: value.description, tone: value.tone,
        total_tasks: 0, done_tasks: 0, created_at: now, updated_at: now, version: 1
      }
      await db.goals.put(row)
      return row
    }
    case 'goalUpdate': {
      const value = input as typeof inputs.goalUpdate._output
      const goal = await db.goals.get(ref ?? '')
      if (!goal) throw notFound()
      goal.title = value.title
      goal.description = value.description
      goal.tone = value.tone
      goal.updated_at = now
      goal.version += 1
      await db.goals.put(goal)
      return goal
    }
    case 'goalDelete': {
      const goal = await db.goals.get(ref ?? '')
      if (!goal) throw notFound()
      const items = await db.items.where('goal_id').equals(goal.id).toArray()
      const itemIds = items.map(item => item.id)
      const tasks = itemIds.length ? await db.tasks.where('item_id').anyOf(itemIds).toArray() : []
      // 级联删掉的子孙同样要留墓碑，否则对端下次同步会把整棵子树带回来。
      await markDeleted('tasks', tasks.map(row => row.id), now)
      await markDeleted('items', itemIds, now)
      await markDeleted('goals', [goal.id], now)
      if (itemIds.length) await db.tasks.where('item_id').anyOf(itemIds).delete()
      await db.items.where('goal_id').equals(goal.id).delete()
      await db.goals.delete(goal.id)
      return { id: goal.id }
    }
    case 'taskCreate': {
      const value = input as typeof inputs.taskCreate._output
      const goal = await db.goals.get(ref ?? '')
      if (!goal) throw notFound()
      const item = await container(goal.id, now, value.title)
      const row: TaskRow = {
        id: randomId(), item_id: item.id, title: value.title, done: 0,
        completed_at: null, created_at: now, updated_at: now, version: 1
      }
      await db.tasks.put(row)
      await ancestors(item.id, now, 1, 0)
      return row
    }
    case 'taskUpdate': {
      const value = input as typeof inputs.taskUpdate._output
      const task = await db.tasks.get(ref ?? '')
      if (!task) throw notFound()
      const previous = task.done
      const done = value.done === undefined ? previous : Number(value.done)
      if (value.title !== undefined) task.title = value.title
      task.completed_at = done ? task.completed_at ?? now : null
      task.done = done
      task.updated_at = now
      task.version += 1
      await db.tasks.put(task)
      await ancestors(task.item_id, now, 0, done - previous)
      return task
    }
    case 'taskDelete': {
      const task = await db.tasks.get(ref ?? '')
      if (!task) throw notFound()
      await markDeleted('tasks', [task.id], now)
      await db.tasks.delete(task.id)
      await ancestors(task.item_id, now, -1, -task.done)
      return { id: task.id }
    }
    case 'noteCreate': {
      const value = input as typeof inputs.noteCreate._output
      const row: NoteRow = {
        id: randomId(), title: value.title, body: value.body, summary: summaries(value.body),
        created_at: now, updated_at: now, version: 1
      }
      await db.notes.put(row)
      return row
    }
    case 'noteUpdate': {
      const value = input as typeof inputs.noteUpdate._output
      const row = await db.notes.get(ref ?? '')
      if (!row) throw notFound()
      row.title = value.title
      row.body = value.body
      row.summary = summaries(value.body)
      row.updated_at = now
      row.version += 1
      await db.notes.put(row)
      return row
    }
    case 'noteDelete': {
      const row = await db.notes.get(ref ?? '')
      if (!row) throw notFound()
      await markDeleted('notes', [row.id], now)
      await db.notes.delete(row.id)
      return { id: row.id }
    }
    case 'transactionCreate': {
      const value = input as typeof inputs.transactionCreate._output
      const row: TransactionRow = {
        id: randomId(), direction: value.direction, amount_cents: value.amount,
        occurred_on: value.occurredOn, note: value.note, updated_at: now, version: 1
      }
      await db.transactions.put(row)
      return row
    }
    case 'transactionUpdate': {
      const value = input as typeof inputs.transactionUpdate._output
      const row = await db.transactions.get(ref ?? '')
      if (!row) throw notFound()
      row.direction = value.direction
      row.amount_cents = value.amount
      row.occurred_on = value.occurredOn
      row.note = value.note
      row.updated_at = now
      row.version += 1
      await db.transactions.put(row)
      return row
    }
    case 'transactionDelete': {
      const row = await db.transactions.get(ref ?? '')
      if (!row) throw notFound()
      await markDeleted('transactions', [row.id], now)
      await db.transactions.delete(row.id)
      return { id: row.id }
    }
    case 'savingsUpdate': {
      const value = input as typeof inputs.savingsUpdate._output
      const row = await db.savings.get('default')
      if (!row) throw notFound()
      row.current_cents = value.current
      row.target_cents = value.target
      row.version += 1
      await db.savings.put(row)
      return { current_cents: row.current_cents, target_cents: row.target_cents, version: row.version }
    }
    case 'preferencesUpdate': {
      const value = input as typeof inputs.preferencesUpdate._output
      const row = await db.preferences.get('default')
      if (!row) throw notFound()
      const changed = row.ai_goals !== value.ai_goals || row.ai_notes !== value.ai_notes || row.ai_finance !== value.ai_finance
      Object.assign(row, {
        theme: value.theme, language: value.language, timezone: value.timezone,
        ai_goals: value.ai_goals, ai_notes: value.ai_notes, ai_finance: value.ai_finance
      })
      if (changed) {
        // 授权变更后，待确认的方案就地失效，避免按旧授权提交。
        row.ai_version += 1
        const pending = await db.proposals.where('status').equals('pending').toArray()
        if (pending.length) {
          await db.proposals.bulkPut(pending.map(proposal => ({ ...proposal, status: 'invalidated' as const })))
          await bump('chats')
        }
      }
      row.version += 1
      await db.preferences.put(row)
      const { id: _id, ...rest } = row
      return rest
    }
    default:
      throw notFound()
  }
}
