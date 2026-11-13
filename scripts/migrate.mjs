import { openDatabase } from '../src/lib/server/db/storage.mjs'

const db = openDatabase()
try {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()
  console.log(`Database ready with ${count} migrations.`)
} finally {
  db.close()
}
