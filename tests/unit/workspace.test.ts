import { describe, expect, it } from 'vitest'
import { decimal, inputs } from '../../src/lib/contracts/workspace'
import { inspect } from '../../src/lib/local/store/transfer'
import { defaultPreferences, defaultSavings } from '../../src/lib/local/db'

describe('workspace business rules', () => {
  it('confirms goal deletion by task count only', () => {
    expect(inputs.goalDelete.parse({ version: 1, tasks: 3 })).toEqual({ version: 1, tasks: 3 })
    expect(inputs.goalDelete.safeParse({ version: 1, items: 1, tasks: 3 }).success).toBe(false)
    expect(inputs.goalCreate.parse({ title: '  读书  ' })).toMatchObject({ title: '读书', description: '', tone: 'violet' })
  })

  it('stores money as exact cents and validates real dates', () => {
    const entry = { direction: 'expense', amount: '38.50', occurredOn: '2028-02-29' }
    expect(inputs.transactionCreate.parse(entry).amount).toBe(3850)
    expect(inputs.transactionCreate.parse({ ...entry, amount: '100000000.00' }).amount).toBe(10_000_000_000)
    for (const amount of ['0', '1e2', '-1', '1.001', '100000000.01']) {
      expect(inputs.transactionCreate.safeParse({ ...entry, amount }).success).toBe(false)
    }
    expect(inputs.transactionCreate.safeParse({ ...entry, occurredOn: '2027-02-29' }).success).toBe(false)
    expect(decimal('-12345678901234567890')).toBe('-123456789012345678.90')
    expect(inputs.savingsUpdate.parse({ current: '0', target: null, version: 1 }).current).toBe(0)
  })

  it('accepts untitled notes and counts Unicode code points', () => {
    expect(inputs.noteCreate.parse({ body: '  一个想法  ' })).toEqual({ title: '', body: '一个想法' })
    expect(inputs.noteCreate.safeParse({ body: '  ' }).success).toBe(false)
    expect(inputs.noteCreate.safeParse({ body: '正文', title: '🌱'.repeat(120) }).success).toBe(true)
    expect(inputs.noteCreate.safeParse({ body: '正文', title: '🌱'.repeat(121) }).success).toBe(false)
  })

  it('restores a valid Unicode title and rejects an unusable backup timezone', () => {
    const note = {
      ...inputs.noteCreate.parse({ body: '正文', title: '🌱'.repeat(120) }),
      id: crypto.randomUUID(), summary: '正文', created_at: 1, updated_at: 1, version: 1
    }
    const data = {
      goals: [], items: [], tasks: [], notes: [note], transactions: [], chats: [], messages: [],
      savings: defaultSavings, preferences: { ...defaultPreferences }
    }
    const file = { format: 'buxu-backup', version: 1, exportedAt: 1, data }
    expect(inspect(JSON.stringify(file)).data.notes).toEqual([note])
    data.preferences.timezone = 'invalid/timezone'
    expect(() => inspect(JSON.stringify(file))).toThrow('备份文件内容校验失败')
  })
})
