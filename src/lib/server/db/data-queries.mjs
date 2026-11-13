import { randomUUID } from 'node:crypto'
import { transact } from './storage.mjs'
import { Fault } from './fault.mjs'

export function dataQueries(db, workspace) {
  const one = (sql, ...args) => db.prepare(sql).get(...args)
  const all = (sql, ...args) => db.prepare(sql).all(...args)
  const run = (sql, ...args) => db.prepare(sql).run(...args)

  function existing(user, fingerprint) {
    const duplicate = one('SELECT counts FROM demo_imports WHERE user_id=? AND fingerprint=?', user, fingerprint)
    const populated = ['goals', 'notes', 'transactions', 'conversations'].some(table => one(`SELECT 1 FROM ${table} WHERE user_id=? LIMIT 1`, user))
    const { current_cents, target_cents } = workspace.savings(user)
    return { duplicate: !!duplicate, populated: populated || current_cents !== null || target_cents !== null }
  }

  function bump(user, module) {
    return one(`INSERT INTO module_revisions VALUES (?, ?, 1)
      ON CONFLICT(user_id,module) DO UPDATE SET revision=revision+1 RETURNING revision`, user, module).revision
  }

  return {
    importStatus(user, fingerprint) {
      return existing(user, fingerprint)
    },
    importDemo(user, fingerprint, counts, payload) {
      return transact(db, () => {
        const { duplicate, populated } = existing(user, fingerprint)
        if (duplicate) return { data: { counts, duplicate: true } }
        if (populated) throw new Fault(409, 'IMPORT_ACCOUNT_NOT_EMPTY', 'Demo 数据只能导入到空账号')
        const now = Date.now()
        const { data, preferences } = payload
        for (const goal of data.goals) {
          const goalId = randomUUID()
          const tasks = goal.items.flatMap(item => item.tasks)
          run(`INSERT INTO goals(id,user_id,title,description,tone,total_tasks,done_tasks,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
            goalId, user, goal.title, goal.description, goal.tone, tasks.length, tasks.filter(task => task.done).length, now)
          for (const [order, item] of goal.items.entries()) {
            const itemId = randomUUID()
            run(`INSERT INTO goal_items(id,user_id,goal_id,title,total_tasks,done_tasks,created_at) VALUES (?,?,?,?,?,?,?)`,
              itemId, user, goalId, item.title, item.tasks.length, item.tasks.filter(task => task.done).length, now + order)
            for (const [index, task] of item.tasks.entries()) {
              run(`INSERT INTO tasks(id,user_id,item_id,title,done,completed_at,created_at) VALUES (?,?,?,?,?,?,?)`,
                randomUUID(), user, itemId, task.title, Number(task.done), null, now + index)
            }
          }
        }
        for (const note of data.notes) {
          const summary = [...note.body.replace(/\s+/gu, ' ')].slice(0, 80).join('')
          run(`INSERT INTO notes(id,user_id,title,body,summary,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
            randomUUID(), user, note.title, note.body, summary, note.updatedAt, note.updatedAt)
        }
        for (const entry of data.transactions) {
          run(`INSERT INTO transactions(id,user_id,direction,amount_cents,occurred_on,note) VALUES (?,?,?,?,?,?)`,
            randomUUID(), user, entry.type, entry.cents, entry.date, entry.note)
        }
        run('UPDATE savings SET current_cents=?,target_cents=?,version=version+1 WHERE user_id=?',
          data.savings.current, data.savings.target, user)
        if (preferences) {
          run('UPDATE preferences SET theme=?,language=?,version=version+1 WHERE user_id=?', preferences.theme, preferences.language, user)
        }
        for (const chat of data.chats) {
          const chatId = randomUUID()
          const title = [...chat.messages[0].text.trim().replace(/\s+/gu, ' ')].slice(0, 40).join('')
          run('INSERT INTO conversations (id,user_id,title,updated_at) VALUES (?,?,?,?)', chatId, user, title, chat.updatedAt)
          for (const [index, message] of chat.messages.entries()) {
            run(`INSERT INTO messages(id,user_id,conversation_id,seq,role,text,state,domains,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
              randomUUID(), user, chatId, index + 1, message.role, message.text, message.status === 'failed' ? 'failed' : 'completed', 7, chat.updatedAt)
          }
        }
        const modules = ['goals', 'notes', 'finance', 'chats', 'preferences']
        const revisions = Object.fromEntries(modules.map(module => [module, bump(user, module)]))
        run('INSERT INTO demo_imports VALUES (?,?,?,?)', user, fingerprint, JSON.stringify(counts), now)
        return { data: { counts, duplicate: false }, revisions }
      })
    },
    exportData(user) {
      return transact(db, () => {
        const { theme, language, timezone } = workspace.preferences(user)
        return {
          format: 'buxu', version: 1, exportedAt: new Date().toISOString(), preferences: { theme, language, timezone },
          data: {
            goals: all('SELECT id,title,description,tone,total_tasks,done_tasks,updated_at,version FROM goals WHERE user_id=?', user),
            items: all('SELECT id,goal_id,title,total_tasks,done_tasks,created_at,version FROM goal_items WHERE user_id=?', user),
            tasks: all('SELECT id,item_id,title,done,completed_at,created_at,version FROM tasks WHERE user_id=?', user),
            notes: all('SELECT id,title,body,summary,created_at,updated_at,version FROM notes WHERE user_id=?', user),
            transactions: all('SELECT id,direction,amount_cents,occurred_on,note,version FROM transactions WHERE user_id=?', user),
            savings: workspace.savings(user),
            conversations: all('SELECT id,title,updated_at,version FROM conversations WHERE user_id=?', user),
            messages: all('SELECT id,conversation_id,seq,role,text,state,created_at,sources FROM messages WHERE user_id=? ORDER BY conversation_id,seq', user)
              .map(message => ({ ...message, sources: JSON.parse(message.sources) })),
            proposals: all(`SELECT p.id,r.conversation_id,p.status,p.preview,p.expires_at FROM ai_proposals p
              JOIN ai_runs r ON p.user_id=r.user_id AND p.run_id=r.id WHERE p.user_id=?`, user).map(row => ({ ...row, preview: JSON.parse(row.preview) }))
          }
        }
      }, 'DEFERRED')
    }
  }
}
