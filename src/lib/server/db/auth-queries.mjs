import { transact } from './storage.mjs'

const day = 86_400_000

export function authQueries(db) {
  return {
    loginAttempt(username, address) {
      return transact(db, () => {
        const now = Date.now()
        db.prepare('DELETE FROM login_attempts WHERE expires_at <= ?').run(now)
        const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username)
        const scopes = ['user:' + (user?.id ?? 'unknown'), 'source:' + address]
        const read = db.prepare('SELECT count FROM login_attempts WHERE scope = ?')
        if (scopes.some(scope => (read.get(scope)?.count ?? 0) >= 8)) return { limited: true }
        const update = db.prepare(`INSERT INTO login_attempts VALUES (?, 1, ?)
          ON CONFLICT(scope) DO UPDATE SET count = count + 1`)
        for (const scope of scopes) update.run(scope, now + 900_000)
        return { limited: false, user }
      })
    },
    createSession(userId, passwordHash, tokenHash) {
      return transact(db, () => {
        const user = db.prepare('SELECT id FROM users WHERE id = ? AND password_hash = ?').get(userId, passwordHash)
        if (!user) return false
        const now = Date.now()
        db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR idle_until <= ?').run(now, now)
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(tokenHash, userId, now + 7 * day, now + 30 * day)
        db.prepare('DELETE FROM login_attempts WHERE scope = ?').run('user:' + userId)
        return true
      })
    },
    session(tokenHash) {
      const now = Date.now()
      const user = db.prepare(`SELECT u.id, u.username, s.idle_until, s.expires_at FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.idle_until > ? AND s.expires_at > ?`).get(tokenHash, now, now)
      if (!user) return null
      if (user.idle_until < now + 6 * day) {
        db.prepare('UPDATE sessions SET idle_until = ? WHERE token_hash = ?').run(Math.min(now + 7 * day, user.expires_at), tokenHash)
      }
      return { id: user.id, username: user.username }
    },
    revoke(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
    }
  }
}
