import type { GoalRow, ItemRow, NoteRow, TaskRow, TombstoneRow, TransactionRow } from '#lib/local/db'
import type { Preferences, Savings } from '#lib/contracts/workspace'

// 合并全是纯函数：不碰 IndexedDB，也不碰网络，好在单测里逐个场景跑。
export type SyncData = {
  goals: GoalRow[]
  items: ItemRow[]
  tasks: TaskRow[]
  notes: NoteRow[]
  transactions: TransactionRow[]
  savings: (Savings & { id: string }) | null
  preferences: (Preferences & { id: string }) | null
}

export type SyncPayload = {
  format: 'buxu-sync'
  rev: number
  deviceId: string
  updatedAt: number
  data: SyncData
  tombstones: TombstoneRow[]
}

type Stamped = { created_at?: number; updated_at?: number }

const stampOf = (row: Stamped) => row.updated_at ?? row.created_at ?? 0

// 行级合并：先看 version，version 打平再看时间戳，都打平就保留远端那份。
// adopted 表示「本地这条胜出，需要推到云端」；为 0 说明远端已是超集，可以省掉一次 PUT。
function mergeRows<T extends { id: string; version: number } & Stamped>(remote: T[], local: T[]) {
  const merged = new Map<string, T>()
  for (const row of remote) merged.set(row.id, row)
  let adopted = 0
  let conflicts = 0
  for (const row of local) {
    const other = merged.get(row.id)
    if (!other) {
      merged.set(row.id, row)
      adopted++
      continue
    }
    if (row.version > other.version) {
      merged.set(row.id, row)
      adopted++
      continue
    }
    if (row.version < other.version) continue
    const mine = stampOf(row)
    const theirs = stampOf(other)
    if (mine > theirs) {
      merged.set(row.id, row)
      adopted++
      conflicts++
    } else if (mine < theirs) {
      conflicts++
    }
  }
  return { rows: [...merged.values()], adopted, conflicts }
}

function mergeSingle<T extends { version: number }>(remote: T | null, local: T | null) {
  if (!local) return { value: remote, adopted: false }
  if (!remote) return { value: local, adopted: true }
  if (local.version === remote.version) return { value: local, adopted: false }
  return local.version > remote.version
    ? { value: local, adopted: true }
    : { value: remote, adopted: false }
}

function mergeTombstones(remote: TombstoneRow[], local: TombstoneRow[]) {
  const merged = new Map<string, TombstoneRow>()
  for (const row of remote) merged.set(row.key, row)
  let added = 0
  for (const row of local) {
    const other = merged.get(row.key)
    if (!other) {
      merged.set(row.key, row)
      added++
      continue
    }
    if (row.deleted_at > other.deleted_at) {
      merged.set(row.key, row)
      added++
    }
  }
  return { rows: [...merged.values()], added }
}

// 墓碑优先：删除时间不早于这行自身的更新时间就删掉。
// 反过来行比墓碑新，说明删完之后又被写回来了（备份导入之类），保留行并把墓碑撤掉。
function reconcile<T extends { id: string } & Stamped>(table: string, rows: T[], tombstones: TombstoneRow[]) {
  const dead = new Map<string, number>()
  for (const row of tombstones) if (row.table === table) dead.set(row.record_id, row.deleted_at)
  if (!dead.size) return { rows, revived: [] as string[] }
  const revived: string[] = []
  const kept = rows.filter(row => {
    const at = dead.get(row.id)
    if (at === undefined) return true
    if (stampOf(row) > at) {
      revived.push(row.id)
      return true
    }
    return false
  })
  return { rows: kept, revived }
}

export function mergePayloads(remote: SyncPayload | null, local: SyncData & { tombstones: TombstoneRow[] }) {
  const base = remote?.data
  const goals = mergeRows(base?.goals ?? [], local.goals)
  const items = mergeRows(base?.items ?? [], local.items)
  const tasks = mergeRows(base?.tasks ?? [], local.tasks)
  const notes = mergeRows(base?.notes ?? [], local.notes)
  const transactions = mergeRows(base?.transactions ?? [], local.transactions)
  const savings = mergeSingle(base?.savings ?? null, local.savings)
  const preferences = mergeSingle(base?.preferences ?? null, local.preferences)
  const tombstones = mergeTombstones(remote?.tombstones ?? [], local.tombstones)

  const buried = [
    ['goals', reconcile('goals', goals.rows, tombstones.rows)],
    ['items', reconcile('items', items.rows, tombstones.rows)],
    ['tasks', reconcile('tasks', tasks.rows, tombstones.rows)],
    ['notes', reconcile('notes', notes.rows, tombstones.rows)],
    ['transactions', reconcile('transactions', transactions.rows, tombstones.rows)]
  ] as const

  const revived = new Set<string>()
  for (const [table, result] of buried) {
    for (const id of result.revived) revived.add(table + ':' + id)
  }

  const data: SyncData = {
    goals: buried[0][1].rows,
    items: buried[1][1].rows,
    tasks: buried[2][1].rows,
    notes: buried[3][1].rows,
    transactions: buried[4][1].rows,
    savings: savings.value,
    preferences: preferences.value
  }

  return {
    data,
    tombstones: revived.size ? tombstones.rows.filter(row => !revived.has(row.key)) : tombstones.rows,
    adopted: goals.adopted + items.adopted + tasks.adopted + notes.adopted + transactions.adopted
      + (savings.adopted ? 1 : 0) + (preferences.adopted ? 1 : 0) + tombstones.added,
    conflicts: goals.conflicts + items.conflicts + tasks.conflicts + notes.conflicts + transactions.conflicts
  }
}
