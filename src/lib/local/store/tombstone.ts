import { db } from '../db'

// 只有参与同步的表需要墓碑；AI 会话与消息不在同步范围，删除时不记。
export type SyncedTable = 'goals' | 'items' | 'tasks' | 'notes' | 'transactions'

export const SYNCED_TABLES: SyncedTable[] = ['goals', 'items', 'tasks', 'notes', 'transactions']

// 墓碑时间就是删除发生的时刻，合并时拿它和对面同一条记录的更新时间比大小。
// 调用点都在 write() 事务里，所以这里不再单开事务。
export async function markDeleted(table: SyncedTable, ids: string[], at: number) {
  if (!ids.length) return
  await db.tombstones.bulkPut(ids.map(id => ({
    key: table + ':' + id,
    table,
    record_id: id,
    deleted_at: at
  })))
}
