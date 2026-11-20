import { db } from './db'

// Dexie 没有外键，写入路径统一包在这里，计数维护与实体写入同属一次事务。
// 列出全部表而不是按需挑选：这是本地单用户应用，省掉「表不在事务里」的一类错误。
export function write<T>(work: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [
    db.goals, db.items, db.tasks, db.notes, db.transactions, db.savings,
    db.preferences, db.models, db.chats, db.messages, db.proposals, db.meta, db.tombstones
  ], work)
}
