import { backup, DatabaseSync } from 'node:sqlite'
import { chmodSync, linkSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { databaseFile } from '../src/lib/server/db/storage.mjs'

const target = process.argv[2]
if (!target) {
  console.error('Usage: npm run backup -- <new-snapshot-file>')
  process.exit(1)
}
const destination = resolve(target)
const directory = mkdtempSync(join(dirname(destination), '.buxu-backup-'))
const temporary = join(directory, 'snapshot.sqlite')
try {
  const db = new DatabaseSync(databaseFile, { readOnly: true })
  try {
    await backup(db, temporary)
  } finally {
    db.close()
  }
  const copy = new DatabaseSync(temporary)
  try {
    copy.exec('PRAGMA journal_mode=DELETE')
    const integrity = copy.prepare('PRAGMA integrity_check').all()
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('Backup failed integrity check.')
  } finally {
    copy.close()
  }
  chmodSync(temporary, 0o600)
  linkSync(temporary, destination)
  console.log('Verified snapshot saved.')
} finally {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      unlinkSync(temporary + suffix)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  rmdirSync(directory)
}
