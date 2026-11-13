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
    const [major, minor, patch] = version.split('.').map(Number)
    if (major !== 3 || minor < 51 || (minor === 51 && patch < 3) || minor === 52) {
      throw new Error('Unsupported SQLite version: ' + version)
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
