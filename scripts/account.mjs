import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { hashPassword } from '../src/lib/server/auth/password.mjs'
import { openDatabase, transact } from '../src/lib/server/db/storage.mjs'

const [operation, rawName, passwordFile] = process.argv.slice(2)
const username = rawName?.trim().toLowerCase()
if (!['init', 'reset'].includes(operation) || !username || !/^[a-z0-9_.-]{1,64}$/.test(username) || !passwordFile) {
  console.error('Usage: npm run account -- <init|reset> <username> <private-password-file>')
  process.exit(1)
}
const password = readFileSync(passwordFile, 'utf8').replace(/^\uFEFF/, '').replace(/\r?\n$/, '')
if ([...password].length < 12 || Buffer.byteLength(password) > 512) {
  console.error('Use at least 12 characters and at most 512 UTF-8 bytes.')
  process.exit(1)
}
const digest = await hashPassword(password)
const db = openDatabase()
try {
  transact(db, () => {
    const user = db.prepare('SELECT id, username FROM users LIMIT 1').get()
    if (operation === 'init') {
      if (user) throw new Error('The personal account already exists.')
      const id = randomUUID()
      db.prepare('INSERT INTO users VALUES (?, ?, ?)').run(id, username, digest)
      db.prepare('INSERT INTO preferences (user_id) VALUES (?)').run(id)
      db.prepare('INSERT INTO savings (user_id) VALUES (?)').run(id)
      return
    }
    if (user?.username !== username) throw new Error('Account not found.')
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(digest, user.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
  })
  console.log(operation === 'init' ? 'Account created.' : 'Password reset and sessions revoked.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  db.close()
}
