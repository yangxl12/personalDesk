import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

export const dataDir = resolve(process.env.DATA_DIR || 'data')
export const databaseFile = join(dataDir, 'buxu.sqlite')
const migrationDir = new URL('../../../../migrations/', import.meta.url)

export function transact(db, work, mode = 'IMMEDIATE') {
  db.exec('BEGIN ' + mode)
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function openDatabase() {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(databaseFile)
  try {
    const version = String(db.prepare('SELECT sqlite_version() AS version').get().version)
    const [major, minor] = version.split('.').map(Number)
    // 只挡真正跑不动的情况：STRICT 表需要 3.37（2021-12）。其余一律放行，
    // 不按 Node 大版本或补丁号设卡——node:sqlite 的 SQLite 版本随 Node 走，
    // 卡补丁号只会让能跑的 runtime 被误伤。
    if (major < 3 || (major === 3 && minor < 37)) {
      throw new Error(`SQLite ${version} is too old: 3.37+ required for STRICT tables. Use a newer Node.`)
    }
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
    transact(db, () => {
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL) STRICT')
      const files = readdirSync(migrationDir).filter(name => /^\d{3}_.*\.sql$/.test(name)).sort()
      if (!files.length) throw new Error('No migrations found')
      const applied = db.prepare('SELECT * FROM schema_migrations').all()
      if (applied.some(row => !files.includes(row.version))) throw new Error('Database schema is newer than this application')
      for (const name of files) {
        const sql = readFileSync(new URL(name, migrationDir), 'utf8').replace(/\r\n/g, '\n')
        const checksum = createHash('sha256').update(sql).digest('hex')
        const previous = applied.find(row => row.version === name)
        if (previous) {
          if (previous.checksum !== checksum) throw new Error('Migration checksum changed: ' + name)
          continue
        }
        db.exec(sql)
        db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, checksum)
      }
    })
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
