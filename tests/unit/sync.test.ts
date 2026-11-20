import { describe, expect, it } from 'vitest'
import { mergePayloads, type SyncData, type SyncPayload } from '../../src/lib/sync/merge'
import type { TombstoneRow } from '../../src/lib/local/db'

type Local = SyncData & { tombstones: TombstoneRow[] }

const note = (id: string, version: number, at: number) => ({
  id, title: id, body: '正文', summary: '正文', created_at: at, updated_at: at, version
})

const empty = (): Local => ({
  goals: [], items: [], tasks: [], notes: [], transactions: [],
  savings: null, preferences: null, tombstones: []
})

const remote = (data: Partial<SyncData>, tombstones: TombstoneRow[] = [], rev = 1): SyncPayload => ({
  format: 'buxu-sync', rev, deviceId: 'remote-device', updatedAt: 0,
  data: { ...empty(), ...data }, tombstones
})

const grave = (table: string, id: string, at: number): TombstoneRow => ({
  key: table + ':' + id, table, record_id: id, deleted_at: at
})

const tx = (id: string, version: number, at: number) => ({
  id, direction: 'expense' as const, amount_cents: 100, occurred_on: '2026-11-01',
  note: '', updated_at: at, version
})

const pref = (theme: 'system' | 'light' | 'dark', version: number) => ({
  id: 'default', theme, language: 'zh-CN' as const, timezone: 'Asia/Shanghai',
  ai_goals: 1, ai_notes: 1, ai_finance: 1, ai_version: 1, version
})

const goal = (id: string, total: number, done: number) => ({
  id, title: id, description: '', tone: 'violet' as const, total_tasks: total, done_tasks: done,
  created_at: 100, updated_at: 100, version: 3
})

const item = (id: string, goalId: string, total: number, done: number) => ({
  id, goal_id: goalId, title: id, total_tasks: total, done_tasks: done,
  created_at: 100, updated_at: 100, version: 3
})

const task = (id: string, itemId: string, done = 0) => ({
  id, item_id: itemId, title: id, done, completed_at: null,
  created_at: 100, updated_at: 100, version: 1
})

describe('sync merge', () => {
  it('pushes everything when the repository is still empty', () => {
    const local: Local = { ...empty(), notes: [note('a', 1, 100)] }
    const plan = mergePayloads(null, local)
    expect(plan.data.notes).toHaveLength(1)
    expect(plan.adopted).toBe(1)
  })

  it('lets the newer version win and asks for no push', () => {
    const local: Local = { ...empty(), notes: [note('a', 1, 100)] }
    const plan = mergePayloads(remote({ notes: [note('a', 2, 200)] }), local)
    expect(plan.data.notes[0].version).toBe(2)
    expect(plan.adopted).toBe(0)
    expect(plan.conflicts).toBe(0)
  })

  it('unions rows written on both devices', () => {
    const local: Local = { ...empty(), notes: [note('a', 1, 100)] }
    const plan = mergePayloads(remote({ notes: [note('b', 1, 100)] }), local)
    expect(plan.data.notes.map(row => row.id).sort()).toEqual(['a', 'b'])
    expect(plan.adopted).toBe(1)
  })

  it('breaks a same-version tie with the newer timestamp and counts it', () => {
    const local: Local = { ...empty(), notes: [note('a', 2, 300)] }
    const plan = mergePayloads(remote({ notes: [note('a', 2, 200)] }), local)
    expect(plan.data.notes[0].updated_at).toBe(300)
    expect(plan.adopted).toBe(1)
    expect(plan.conflicts).toBe(1)
  })

  it('applies a remote tombstone to the local row', () => {
    const local: Local = { ...empty(), notes: [note('a', 1, 100)] }
    const plan = mergePayloads(remote({}, [grave('notes', 'a', 200)]), local)
    expect(plan.data.notes).toHaveLength(0)
    expect(plan.tombstones).toHaveLength(1)
  })

  it('propagates a local delete to the remote row', () => {
    const local: Local = { ...empty(), tombstones: [grave('notes', 'a', 200)] }
    const plan = mergePayloads(remote({ notes: [note('a', 1, 100)] }), local)
    expect(plan.data.notes).toHaveLength(0)
    expect(plan.adopted).toBe(1)
  })

  it('revives a row written after the delete and drops its tombstone', () => {
    const local: Local = { ...empty(), notes: [note('a', 3, 300)] }
    const plan = mergePayloads(remote({}, [grave('notes', 'a', 200)]), local)
    expect(plan.data.notes).toHaveLength(1)
    expect(plan.tombstones).toHaveLength(0)
  })

  it('compares single rows by version', () => {
    const local: Local = {
      ...empty(),
      preferences: {
        id: 'default', theme: 'dark', language: 'zh-CN', timezone: 'Asia/Shanghai',
        ai_goals: 1, ai_notes: 1, ai_finance: 1, ai_version: 1, version: 2
      }
    }
    const plan = mergePayloads(remote({
      preferences: {
        id: 'default', theme: 'light', language: 'en', timezone: 'Asia/Shanghai',
        ai_goals: 1, ai_notes: 1, ai_finance: 1, ai_version: 1, version: 5
      }
    }), local)
    expect(plan.data.preferences?.theme).toBe('light')
    expect(plan.adopted).toBe(0)
  })

  it('leaves the inputs untouched', () => {
    const local: Local = { ...empty(), notes: [note('a', 1, 100)] }
    const payload = remote({ notes: [note('b', 1, 100)] })
    mergePayloads(payload, local)
    expect(local.notes).toHaveLength(1)
    expect(payload.data.notes).toHaveLength(1)
  })

  it('breaks a transaction tie with updated_at and counts it', () => {
    const local: Local = { ...empty(), transactions: [tx('a', 2, 300)] }
    const plan = mergePayloads(remote({ transactions: [tx('a', 2, 200)] }), local)
    expect(plan.data.transactions[0].updated_at).toBe(300)
    expect(plan.adopted).toBe(1)
    expect(plan.conflicts).toBe(1)
  })

  it('keeps identical single rows quiet at the same version', () => {
    const local: Local = { ...empty(), preferences: pref('dark', 2) }
    const plan = mergePayloads(remote({ preferences: pref('dark', 2) }), local)
    expect(plan.data.preferences?.theme).toBe('dark')
    expect(plan.conflicts).toBe(0)
    expect(plan.adopted).toBe(0)
  })

  it('lets the cloud win a same-version single-row conflict and reports it', () => {
    const local: Local = { ...empty(), preferences: pref('dark', 2) }
    const plan = mergePayloads(remote({ preferences: pref('light', 2) }), local)
    expect(plan.data.preferences?.theme).toBe('light')
    expect(plan.conflicts).toBe(1)
    expect(plan.adopted).toBe(0)
  })

  it('reports savings divergence instead of splitting silently', () => {
    const local: Local = { ...empty(), savings: { id: 'default', current_cents: 500, target_cents: null, version: 3 } }
    const plan = mergePayloads(remote({
      savings: { id: 'default', current_cents: 900, target_cents: null, version: 3 }
    }), local)
    expect(plan.data.savings?.current_cents).toBe(900)
    expect(plan.conflicts).toBe(1)
  })

  it('recomputes stale counts after merging and pushes the repair', () => {
    // 目标行记着 5 个任务（3 完成），任务表里实际只有 2 行：合并后要现算修正并升 version。
    const local: Local = {
      ...empty(),
      goals: [goal('g', 5, 3)],
      items: [item('i', 'g', 5, 3)],
      tasks: [task('t1', 'i'), task('t2', 'i')]
    }
    const plan = mergePayloads(remote({}), local)
    const repairedGoal = plan.data.goals.find(row => row.id === 'g')
    const repairedItem = plan.data.items.find(row => row.id === 'i')
    expect(repairedGoal?.total_tasks).toBe(2)
    expect(repairedGoal?.done_tasks).toBe(0)
    expect(repairedGoal?.version).toBe(4)
    expect(repairedItem?.total_tasks).toBe(2)
    expect(repairedItem?.done_tasks).toBe(0)
    expect(repairedItem?.version).toBe(4)
    // 6 = goal + item + 2 tasks 的采纳，加上 goal/item 各一条修正。
    expect(plan.adopted).toBe(6)
  })

  it('leaves consistent counts alone', () => {
    const local: Local = {
      ...empty(),
      goals: [goal('g', 2, 1)],
      items: [item('i', 'g', 2, 1)],
      tasks: [task('t1', 'i'), task('t2', 'i', 1)]
    }
    const plan = mergePayloads(remote({}), local)
    expect(plan.data.goals[0].version).toBe(3)
    expect(plan.data.items[0].version).toBe(3)
  })
})
