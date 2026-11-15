import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

const temp = mkdtempSync(join(tmpdir(), 'buxu-test-'))
const user = randomUUID()
const other = randomUUID()
let db: DatabaseSync
let queries: ReturnType<typeof import('../../src/lib/server/db/workspace-queries.mjs').workspaceQueries>
const change = (operation: string, ref: string | null, input: object, key = randomUUID()) => queries.mutate(user, operation, key, ref, input)

beforeAll(async () => {
  process.env.DATA_DIR = temp
  const { openDatabase } = await import('../../src/lib/server/db/storage.mjs')
  const { workspaceQueries } = await import('../../src/lib/server/db/workspace-queries.mjs')
  db = openDatabase()
  const second = openDatabase()
  expect(second.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()?.n).toBeGreaterThanOrEqual(2)
  second.close()
  for (const account of [user, other]) {
    db.prepare('INSERT INTO users VALUES (?, ?, ?)').run(account, account, 'test-fixture')
    db.prepare('INSERT INTO preferences(user_id) VALUES (?)').run(account)
    db.prepare('INSERT INTO savings(user_id) VALUES (?)').run(account)
  }
  queries = workspaceQueries(db)
})

afterAll(() => {
  db?.close()
  rmSync(temp, { recursive: true, force: true })
})

describe('SQLite transactions', () => {
  it('updates ancestors, rejects stale deletion and cascades after reconfirmation', () => {
    const { data: goal } = change('goalCreate', null, { title: 'English', description: '', tone: 'violet' })
    const { data: item } = change('itemCreate', goal.id, { title: 'Practice' })
    const { data: task } = change('taskCreate', item.id, { title: 'Record' })
    const before = queries.goal(user, goal.id)
    const key = randomUUID()
    const marked = change('taskUpdate', task.id, { version: task.version, done: true }, key)
    expect(change('taskUpdate', task.id, { version: task.version, done: true }, key)).toMatchObject({ replayed: true, revisions: marked.revisions })
    expect(() => change('taskUpdate', task.id, { version: task.version, done: false }, key)).toThrow(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }))
    expect(queries.goal(user, goal.id)).toMatchObject({ total_tasks: 1, done_tasks: 1 })
    expect(queries.dashboard(user)).toMatchObject({ goals: [{ id: goal.id, total_tasks: 1, done_tasks: 1 }], hasGoals: true })
    expect(() => change('goalDelete', goal.id, { version: before.version, items: 1, tasks: 1 })).toThrow(expect.objectContaining({ status: 409 }))
    expect(() => queries.goal(other, goal.id)).toThrow(expect.objectContaining({ status: 404 }))
    const current = queries.goal(user, goal.id)
    change('goalDelete', goal.id, { version: current.version, items: 1, tasks: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks').get()?.n).toBe(0)
  })

  it('filters across year boundaries, pages ties and keeps savings independent', () => {
    for (const [date, amount, direction] of [['2027-12-31', 2000, 'income'], ['2027-12-31', 3850, 'expense'], ['2028-01-01', 100, 'income']]) {
      change('transactionCreate', null, { amount, occurredOn: date, direction, note: '' })
    }
    change('savingsUpdate', null, { version: 1, current: 0, target: 4000 })
    const first = queries.finance(user, { month: '2027-12', limit: 1 })
    const second = queries.finance(user, { month: '2027-12', cursor: first.nextCursor, limit: 1 })
    expect(first.totals).toEqual({ income: '2000', expense: '3850', balance: '-1850' })
    expect(first.savings.current_cents).toBe(0)
    expect(first.items[0].id).not.toBe(second.items[0].id)
    expect(second.nextCursor).toBeNull()
    expect(queries.finance(user, { month: '2028-01' }).totals.income).toBe('100')
  })
})
