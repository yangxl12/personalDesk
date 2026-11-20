import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) }
})

// 一份最小的 GitHub Contents API 替身：一个文件、一个 sha，PUT 时校验 sha 是否对得上。
let remote: { text: string; sha: string } | null = null
let revision = 0
const calls: string[] = []

vi.stubGlobal('fetch', async (_url: string, init: RequestInit = {}) => {
  const method = init.method ?? 'GET'
  calls.push(method)
  if (method === 'GET') {
    if (!remote) return new Response('{"message":"Not Found"}', { status: 404 })
    return Response.json({
      content: Buffer.from(remote.text, 'utf8').toString('base64'),
      encoding: 'base64',
      sha: remote.sha,
      size: remote.text.length
    })
  }
  const body = JSON.parse(String(init.body)) as { content: string; sha?: string }
  if (remote && body.sha !== remote.sha) return new Response('{"message":"Conflict"}', { status: 409 })
  revision += 1
  remote = { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 'sha-' + revision }
  return Response.json({ content: { sha: remote.sha } })
})

const { db } = await import('../../src/lib/local/db')
const { readConfig, runSync, saveConfig, syncStatus } = await import('../../src/lib/sync/engine')

const note = (id: string, version: number, at: number) => ({
  id, title: id, body: '正文', summary: '正文', created_at: at, updated_at: at, version
})

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(table => table.clear()))
  storage.clear()
  remote = null
  revision = 0
  calls.length = 0
  saveConfig({ token: 'token', owner: 'owner', repo: 'repo', path: 'sync.json' })
})

describe('sync engine', () => {
  it('refuses to run without a configuration', async () => {
    storage.clear()
    expect(readConfig()).toBeNull()
    await expect(runSync()).rejects.toThrow('还没有配置同步')
  })

  it('pushes local rows into an empty repository and reports the revision', async () => {
    await db.notes.put(note('a', 1, 100))
    const report = await runSync()
    expect(report.pushed).toBe(true)
    expect(report.rev).toBe(1)
    expect(remote?.text).toContain('"id":"a"')
    const status = await syncStatus()
    expect(status.lastAt).toBeGreaterThan(0)
    expect(status.rev).toBe(1)
  })

  it('pulls rows onto a fresh device without pushing anything', async () => {
    await db.notes.put(note('a', 1, 100))
    await runSync()

    await db.notes.clear()
    calls.length = 0
    const report = await runSync()
    expect(report.pushed).toBe(false)
    expect(calls).toEqual(['GET'])
    expect((await db.notes.toArray()).map(row => row.id)).toEqual(['a'])
  })

  it('skips the push when both sides already agree', async () => {
    await db.notes.put(note('a', 1, 100))
    await runSync()
    calls.length = 0
    const report = await runSync()
    expect(report.pushed).toBe(false)
    expect(calls).toEqual(['GET'])
  })

  it('keeps a deleted row deleted after a round trip', async () => {
    await db.notes.put(note('a', 1, 100))
    await runSync()

    await db.notes.delete('a')
    await db.tombstones.put({ key: 'notes:a', table: 'notes', record_id: 'a', deleted_at: 200 })
    await runSync()

    await db.notes.clear()
    await db.tombstones.clear()
    await runSync()
    expect(await db.notes.count()).toBe(0)
  })

  // 另一端还留着这条笔记的情形：墓碑必须在解析阶段活下来，否则删除传不过去。
  it('deletes a locally surviving row when the remote tombstone says so', async () => {
    await db.notes.put(note('a', 1, 100))
    await runSync()

    await db.notes.delete('a')
    await db.tombstones.put({ key: 'notes:a', table: 'notes', record_id: 'a', deleted_at: 200 })
    await runSync()

    await db.notes.put(note('a', 1, 100))
    await db.tombstones.clear()

    await runSync()
    expect(await db.notes.count()).toBe(0)
  })
})
