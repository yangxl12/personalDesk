import { z } from 'zod'

const text = (max: number, required = false) => z.string().trim()
  .refine(value => !required || value.length > 0, '此字段必填')
  .refine(value => [...value].length <= max, '内容过长')
const title = text(120, true)
export const id = z.uuid()
export const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const count = z.number().int().nonnegative()
const tone = z.enum(['violet', 'mint', 'amber'])
const amount = (allowZero: boolean) => z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/, '请输入最多两位小数的金额')
  .transform(value => {
    const [whole, fraction = ''] = value.split('.')
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  })
  .pipe(z.number().int().min(allowZero ? 0 : 1).max(10_000_000_000))

export const month = z.string().regex(/^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/)
const date = z.iso.date().refine(value => month.safeParse(value.slice(0, 7)).success, '日期超出范围')
const goal = { title, description: text(4000).default(''), tone: tone.default('violet') }
const item = { title }
const note = { title: text(120).default(''), body: text(30000, true) }
const transaction = {
  direction: z.enum(['income', 'expense']), amount: amount(false), occurredOn: date, note: text(500).default('')
}

export const inputs = {
  goalCreate: z.strictObject(goal),
  goalUpdate: z.strictObject({ ...goal, version }),
  goalDelete: z.strictObject({ version, tasks: count }),
  taskCreate: z.strictObject(item),
  taskUpdate: z.strictObject({ title: title.optional(), done: z.boolean().optional(), version })
    .refine(value => value.title !== undefined || value.done !== undefined),
  taskDelete: z.strictObject({ version }),
  noteCreate: z.strictObject(note),
  noteUpdate: z.strictObject({ ...note, version }),
  noteDelete: z.strictObject({ version }),
  transactionCreate: z.strictObject(transaction),
  transactionUpdate: z.strictObject({ ...transaction, version }),
  transactionDelete: z.strictObject({ version }),
  savingsUpdate: z.strictObject({ current: amount(true).nullable(), target: amount(false).nullable(), version }),
  preferencesUpdate: z.strictObject({
    theme: z.enum(['system', 'light', 'dark']),
    language: z.enum(['zh-CN', 'en']),
    timezone: z.string().min(1).max(100).refine(value => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value })
        return !/^[+-]/.test(value)
      } catch {
        return false
      }
    }, '请输入有效的 IANA 时区'),
    ai_goals: z.number().int().min(0).max(1).default(1),
    ai_notes: z.number().int().min(0).max(1).default(1),
    ai_finance: z.number().int().min(0).max(1).default(1),
    version
  })
}

export type Row = { id: string; version: number }
export type Progress = { done_tasks: number; total_tasks: number }
export type Goal = Row & Progress & {
  title: string; description: string; tone: z.infer<typeof tone>; updated_at: number; items?: number
}
export type Task = Row & { title: string; done: number; item_id: string; created_at: number; completed_at: number | null }
export type TaskBrief = Pick<Task, 'id' | 'title' | 'done' | 'version'>
export type GoalTask = Omit<Task, 'item_id'>
export type GoalPlan = { tasks: TaskBrief[]; total: number }
export type Note = Row & { title: string; summary: string; updated_at: number; created_at: number; body: string }
export type NoteSummary = Omit<Note, 'body'>
export type Transaction = Row & {
  direction: 'income' | 'expense'; amount_cents: number; occurred_on: string; note: string
}
export type Savings = { current_cents: number | null; target_cents: number | null; version: number }
export type Preferences = z.infer<typeof inputs.preferencesUpdate> & { ai_version: number }
export type List<T> = { items: T[]; nextCursor: string | null }
export type Revisions = Record<string, number>
export type Totals = { income: string; expense: string; balance: string }
export type Finance = List<Transaction> & { month: string; totals: Totals; savings: Savings }
export type DashboardGoal = Goal & { plan: GoalPlan }
export type Dashboard = {
  // 笔记卡片直接渲染 markdown，所以工作台要带正文，不能只给摘要。
  goals: DashboardGoal[]; hasGoals: boolean; notes: Note[]; month: string; totals: Totals; savings: Savings
}

// 同一格式的构造不便宜，today 在每次载入工作台、记账弹窗打开时都会被调用：按时区缓存。
const dayFormatters = new Map<string, Intl.DateTimeFormat>()
export function today(timezone: string) {
  let formatter = dayFormatters.get(timezone)
  if (!formatter) {
    if (dayFormatters.size > 16) dayFormatters.clear()
    formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayFormatters.set(timezone, formatter)
  }
  return formatter.format(new Date())
}

export function decimal(cents: string | number) {
  const integer = BigInt(cents)
  const magnitude = integer < 0n ? -integer : integer
  return (integer < 0n ? '-' : '') + (magnitude / 100n) + '.' + String(magnitude % 100n).padStart(2, '0')
}

export function money(cents: string | number) {
  const [whole, fraction] = decimal(cents).split('.')
  return '¥' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction
}
