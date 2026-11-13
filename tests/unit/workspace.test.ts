import { describe, expect, it } from 'vitest'
import { decimal, inputs, progress } from '../../src/lib/contracts/workspace'

describe('workspace business rules', () => {
  it('caps an unfinished goal at 99% and distinguishes empty goals', () => {
    expect(progress({ done_tasks: 0, total_tasks: 0 })).toBe(0)
    expect(progress({ done_tasks: 999, total_tasks: 1000 })).toBe(99)
    expect(progress({ done_tasks: 1000, total_tasks: 1000 })).toBe(100)
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
})
