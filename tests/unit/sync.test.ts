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
})
