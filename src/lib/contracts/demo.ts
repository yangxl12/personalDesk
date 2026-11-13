import { z } from 'zod'
import { inputs } from './workspace'

const recordId = z.string().min(1).max(120)
const stamp = z.iso.datetime({ offset: true }).transform(value => Date.parse(value))
const title = z.string().pipe(inputs.itemCreate.shape.title)
const task = z.object({ id: recordId, title, done: z.boolean() })
const item = z.object({ id: recordId, title, tasks: z.array(task).max(1000) })
const goal = z.object({ id: recordId, title: z.string(), description: z.string().optional(), tone: z.string().optional(), items: z.array(item).max(1000) })
  .transform(({ id, items, ...value }, ctx) => {
    const result = inputs.goalCreate.safeParse(value)
    if (!result.success) {
      ctx.addIssue({ code: 'custom', message: '目标标题、说明或颜色无效' })
      return z.NEVER
    }
    return { id, items, ...result.data }
  })
const note = z.object({ id: recordId, title: z.string().optional(), body: z.string(), updatedAt: stamp })
  .transform(({ id, updatedAt, ...value }, ctx) => {
    const result = inputs.noteCreate.safeParse(value)
    if (!result.success) {
      ctx.addIssue({ code: 'custom', message: '思考正文或标题无效' })
      return z.NEVER
    }
    return { id, updatedAt, ...result.data }
  })
const ledger = z.object({
  id: recordId, type: z.enum(['income', 'expense']), cents: z.number().int().positive().max(10_000_000_000),
  date: inputs.transactionCreate.shape.occurredOn, note: inputs.transactionCreate.shape.note
})
const message = z.object({
  id: recordId, role: z.enum(['user', 'assistant']),
  text: z.string().refine(value => [...value].length <= 30000),
  status: z.enum(['failed', 'sent']).optional()
})
const chat = z.object({ id: recordId, updatedAt: stamp, messages: z.array(message).min(1).max(2000) })
  .refine(value => value.messages[0].role === 'user' && value.messages[0].text.trim().length > 0, '对话须以用户消息开头')
const data = z.object({
  goals: z.array(goal).max(2000), notes: z.array(note).max(10000), transactions: z.array(ledger).max(30000),
  savings: z.object({
    current: z.number().int().min(0).max(10_000_000_000).nullable(),
    target: z.number().int().min(1).max(10_000_000_000).nullable()
  }), chats: z.array(chat).max(1000)
})
export const demoImport = z.strictObject({
  format: z.literal('buxu-demo'), version: z.literal(1), data,
  preferences: z.object({ theme: z.enum(['system', 'light', 'dark']), language: z.enum(['zh-CN', 'en']) }).optional()
}).superRefine(({ data }, ctx) => {
  const groups = [
    data.goals, data.goals.flatMap(goal => goal.items),
    data.goals.flatMap(goal => goal.items.flatMap(item => item.tasks)),
    data.notes, data.transactions, data.chats, data.chats.flatMap(chat => chat.messages)
  ]
  for (const group of groups) {
    if (new Set(group.map(row => row.id)).size !== group.length) {
      ctx.addIssue({ code: 'custom', message: '导入文件中有重复的记录标识' })
      return
    }
  }
})

export function demoCounts({ data }: z.infer<typeof demoImport>) {
  const items = data.goals.flatMap(goal => goal.items)
  return {
    goals: data.goals.length, items: items.length, tasks: items.reduce((sum, item) => sum + item.tasks.length, 0),
    notes: data.notes.length, transactions: data.transactions.length, chats: data.chats.length,
    messages: data.chats.reduce((sum, chat) => sum + chat.messages.length, 0),
    savings: Number(data.savings.current !== null || data.savings.target !== null)
  }
}
