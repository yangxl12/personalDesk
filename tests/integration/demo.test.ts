import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { demoCounts, demoImport } from '../../src/lib/contracts/demo'
import type { DatabaseSync } from 'node:sqlite'

const temp = mkdtempSync(join(tmpdir(), 'buxu-import-'))
const user = randomUUID()
let db: DatabaseSync
let storage: ReturnType<typeof import('../../src/lib/server/db/data-queries.mjs').dataQueries>
let workspace: ReturnType<typeof import('../../src/lib/server/db/workspace-queries.mjs').workspaceQueries>
const fixture = {
  format: 'buxu-demo', version: 1,
  data: {
    goals: [{ id: 'g', title: '练习英语', items: [{ id: 'i', title: '录音', tasks: [{ id: 't', title: '读一遍', done: true }] }] }],
    notes: [{ id: 'n', body: '正文', updatedAt: '2026-11-01T13:00:00.000Z' }],
    transactions: [{ id: 'e', type: 'expense', cents: 3850, date: '2026-11-03', note: '午饭' }],
    savings: { current: 0, target: 10000 },
    chats: [{ id: 'c', updatedAt: '2026-11-13T13:00:00.000Z', messages: [{ id: 'm', role: 'user', text: '你好', status: 'failed' }] }]
  }
}

beforeAll(async () => {
  process.env.DATA_DIR = temp
  const { openDatabase } = await import('../../src/lib/server/db/storage.mjs')
  const { workspaceQueries } = await import('../../src/lib/server/db/workspace-queries.mjs')
  const { dataQueries } = await import('../../src/lib/server/db/data-queries.mjs')
  db = openDatabase()
  db.prepare('INSERT INTO users VALUES (?, ?, ?)').run(user, 'test-user', 'test-fixture')
  db.prepare('INSERT INTO preferences(user_id) VALUES (?)').run(user)
  db.prepare('INSERT INTO savings(user_id) VALUES (?)').run(user)
  workspace = workspaceQueries(db)
  storage = dataQueries(db, workspace)
})

afterAll(() => {
  db?.close()
  rmSync(temp, { recursive: true, force: true })
})

it('validates Demo records, rolls back a partial write and imports the same file only once', () => {
  const parsed = demoImport.parse(fixture)
  const counts = demoCounts(parsed)
  expect(counts).toMatchObject({ goals: 1, items: 1, tasks: 1, notes: 1, transactions: 1, chats: 1 })
  expect(demoImport.safeParse({ ...fixture, data: { ...fixture.data, notes: [...fixture.data.notes, ...fixture.data.notes] } }).success).toBe(false)
  const invalid = structuredClone(parsed)
  invalid.data.transactions[0].cents = -3850
  expect(() => storage.importDemo(user, 'broken', counts, invalid)).toThrow()
  expect(storage.importStatus(user, 'broken')).toEqual({ duplicate: false, populated: false })
  expect(storage.importDemo(user, 'same', counts, parsed).data.duplicate).toBe(false)
  expect(storage.importDemo(user, 'same', counts, parsed).data.duplicate).toBe(true)
  expect(() => storage.importDemo(user, 'other', counts, parsed)).toThrow(expect.objectContaining({ status: 409 }))
  expect(workspace.finance(user, { month: '2026-11' }).totals.balance).toBe('-3850')
  const exported = storage.exportData(user)
  expect(exported.data.goals[0]).toMatchObject({ done_tasks: 1, total_tasks: 1 })
  expect(exported.data.messages[0]).toMatchObject({ state: 'failed' })
  expect(JSON.stringify(exported)).not.toContain('test-fixture')
})
