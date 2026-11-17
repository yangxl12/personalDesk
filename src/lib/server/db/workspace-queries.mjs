import { randomUUID, createHash } from 'node:crypto'
import { transact } from './storage.mjs'
import { Fault, conflict, missing } from './fault.mjs'

const columns = {
  goal: 'id, title, description, tone, total_tasks, done_tasks, updated_at, version',
  task: 'id, item_id, title, done, completed_at, created_at, version',
  note: 'id, title, body, summary, created_at, updated_at, version',
  noteList: 'id, title, summary, created_at, updated_at, version',
  transaction: 'id, direction, amount_cents, occurred_on, note, version',
  savings: 'current_cents, target_cents, version',
  preferences: 'theme, language, timezone, ai_goals, ai_notes, ai_finance, ai_version, version'
}
const done = '(total_tasks > 0 AND done_tasks = total_tasks)'
const summaries = text => [...text.replace(/\s+/gu, ' ')].slice(0, 80).join('')
const outline = { tasks: 5 }

export function workspaceQueries(db) {
  const one = (sql, ...args) => db.prepare(sql).get(...args)
  const all = (sql, ...args) => db.prepare(sql).all(...args)
  const run = (sql, ...args) => db.prepare(sql).run(...args)
  const row = (kind, table, user, id) => {
    const value = one(`SELECT ${columns[kind]} FROM ${table} WHERE user_id=? AND id=?`, user, id)
    if (!value) missing()
    return value
  }
  const expectVersion = (value, input) => {
    if (value.version !== input.version) conflict(value)
    return value
  }
  const preference = user => one(`SELECT ${columns.preferences} FROM preferences WHERE user_id=?`, user)
  const savings = user => one(`SELECT ${columns.savings} FROM savings WHERE user_id=?`, user)
  const revisions = user => Object.fromEntries(all('SELECT module, revision FROM module_revisions WHERE user_id=?', user)
    .map(({ module, revision }) => [module, revision]))

  function page(projection, key, ascending, query, args, scope, options) {
    const { cursor, limit = 30 } = options
    const direction = ascending ? 'ASC' : 'DESC'
    const operator = ascending ? '>' : '<'
    let decoded
    if (cursor) {
      try {
        decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString())
      } catch {
        throw new Fault(400, 'INVALID_CURSOR', '分页参数无效')
      }
      if (!Array.isArray(decoded) || decoded.length !== 3 || decoded[0] !== scope ||
        typeof decoded[2] !== 'string' || (key === 'occurred_on' ? typeof decoded[1] !== 'string' : !Number.isSafeInteger(decoded[1]))) {
        throw new Fault(400, 'INVALID_CURSOR', '分页参数无效')
      }
    }
    const window = decoded ? ` AND (${key}, id) ${operator} (?, ?)` : ''
    const rows = all(`SELECT ${projection} FROM ${query}${window} ORDER BY ${key} ${direction}, id ${direction} LIMIT ?`,
      ...args, ...(decoded ? decoded.slice(1) : []), limit + 1)
    const hasMore = rows.length > limit
    if (hasMore) rows.pop()
    const last = rows.at(-1)
    const nextCursor = hasMore ? Buffer.from(JSON.stringify([scope, last[key], last.id])).toString('base64url') : null
    return { items: rows, nextCursor }
  }

  function goalDetail(user, id) {
    // Tasks live under the goal's single internal container; the container is never exposed.
    return {
      goal: row('goal', 'goals', user, id),
      tasks: all(`SELECT t.id, t.title, t.done, t.completed_at, t.created_at, t.version FROM tasks t
        JOIN goal_items i ON t.user_id=i.user_id AND t.item_id=i.id
        WHERE t.user_id=? AND i.goal_id=? ORDER BY t.done, t.created_at, t.id`, user, id)
    }
  }

  // Dashboard projection: a flat list of each goal's first few tasks.
  function dashboardTasks(user) {
    const rows = all(`SELECT id, goal_id, title, done, version FROM (
        SELECT t.id, i.goal_id, t.title, t.done, t.version,
          ROW_NUMBER() OVER (PARTITION BY i.goal_id ORDER BY t.done, t.created_at, t.id) AS position
        FROM tasks t JOIN goal_items i ON t.user_id=i.user_id AND t.item_id=i.id
        WHERE t.user_id=?) WHERE position<=? ORDER BY goal_id, position`, user, outline.tasks)
    const byGoal = new Map()
    for (const { id, goal_id, title, done, version } of rows) {
      const list = byGoal.get(goal_id)
      if (list) list.push({ id, title, done, version })
      else byGoal.set(goal_id, [{ id, title, done, version }])
    }
    return byGoal
  }

  function goals(user, options) {
    const { status = 'all' } = options
    const filter = { all: '', active: ' AND ' + done + ' = 0', done: ' AND ' + done + ' = 1' }[status]
    return page(columns.goal, 'updated_at', false, 'goals WHERE user_id=?' + filter, [user], 'goals:' + status, options)
  }

  function accountMonth(user) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: preference(user).timezone, year: 'numeric', month: '2-digit'
    }).format(new Date())
  }

  function bounds(month) {
    const [year, number] = month.split('-').map(Number)
    const end = number === 12 ? (year + 1) + '-01' : year + '-' + String(number + 1).padStart(2, '0')
    return [month + '-01', year === 9999 && number === 12 ? '9999-12-32' : end + '-01']
  }

  function totals(user, month) {
    const sum = db.prepare(`SELECT direction, SUM(amount_cents) AS cents FROM transactions
      WHERE user_id=? AND occurred_on>=? AND occurred_on<? GROUP BY direction`)
    sum.setReadBigInts(true)
    const values = Object.fromEntries(sum.all(user, ...bounds(month)).map(value => [value.direction, value.cents]))
    const income = values.income ?? 0n
    const expense = values.expense ?? 0n
    return { income: String(income), expense: String(expense), balance: String(income - expense) }
  }

  const reads = {
    revisions,
    preferences: preference,
    savings,
    dashboard: user => transact(db, () => {
      const month = accountMonth(user)
      const tasks = dashboardTasks(user)
      const goals = all(`SELECT ${columns.goal} FROM goals WHERE user_id=? ORDER BY ${done} ASC, updated_at DESC, id DESC`, user)
      return {
        goals: goals.map(goal => ({ ...goal, plan: { tasks: tasks.get(goal.id) ?? [], total: goal.total_tasks } })),
        hasGoals: Boolean(one('SELECT 1 FROM goals WHERE user_id=? LIMIT 1', user)),
        notes: all(`SELECT ${columns.noteList} FROM notes WHERE user_id=? ORDER BY updated_at DESC, id DESC`, user),
        month, totals: totals(user, month), savings: savings(user)
      }
    }, 'DEFERRED'),
    goals,
    goal: (user, id) => goalDetail(user, id).goal,
    goalPage: (user, id) => transact(db, () => goalDetail(user, id), 'DEFERRED'),
    goalTasks: (user, id) => goalDetail(user, id).tasks,
    notes: (user, options) => page(columns.noteList, 'updated_at', false, 'notes WHERE user_id=?', [user], 'notes', options),
    note: (user, id) => row('note', 'notes', user, id),
    finance: (user, options) => transact(db, () => {
      const month = options.month ?? accountMonth(user)
      const records = page(columns.transaction, 'occurred_on', false, 'transactions WHERE user_id=? AND occurred_on>=? AND occurred_on<?',
        [user, ...bounds(month)], 'finance:' + month, options)
      return { ...records, month, totals: totals(user, month), savings: savings(user) }
    }, 'DEFERRED')
  }

  function touchGoal(user, id, now, taskDelta = 0, doneDelta = 0) {
    run(`UPDATE goals SET version=version+1, updated_at=?, total_tasks=total_tasks+?, done_tasks=done_tasks+?
      WHERE user_id=? AND id=?`, now, taskDelta, doneDelta, user, id)
  }

  function touchAncestors(user, itemId, now, taskDelta = 0, doneDelta = 0) {
    const item = one(`UPDATE goal_items SET version=version+1, total_tasks=total_tasks+?, done_tasks=done_tasks+?
      WHERE user_id=? AND id=? RETURNING goal_id`, taskDelta, doneDelta, user, itemId)
    touchGoal(user, item.goal_id, now, taskDelta, doneDelta)
  }

  const writes = {
    goalCreate(user, id, input, now) {
      run('INSERT INTO goals (id,user_id,title,description,tone,updated_at) VALUES (?,?,?,?,?,?)',
        id, user, input.title, input.description, input.tone, now)
      return row('goal', 'goals', user, id)
    },
    goalUpdate(user, id, input, now) {
      expectVersion(row('goal', 'goals', user, id), input)
      run('UPDATE goals SET title=?, description=?, tone=?, updated_at=?, version=version+1 WHERE user_id=? AND id=? AND version=?',
        input.title, input.description, input.tone, now, user, id, input.version)
      return row('goal', 'goals', user, id)
    },
    goalDelete(user, id, input) {
      const goal = expectVersion(row('goal', 'goals', user, id), input)
      if (goal.total_tasks !== input.tasks) conflict(goal)
      run('DELETE FROM goals WHERE user_id=? AND id=? AND version=?', user, id, input.version)
      return { id }
    },
    taskCreate(user, id, input, now, goalId) {
      row('goal', 'goals', user, goalId)
      let container = one('SELECT id FROM goal_items WHERE user_id=? AND goal_id=? ORDER BY created_at, id LIMIT 1', user, goalId)
      if (!container) {
        const containerId = randomUUID()
        run('INSERT INTO goal_items (id,user_id,goal_id,title,created_at) VALUES (?,?,?,?,?)',
          containerId, user, goalId, input.title, now)
        container = { id: containerId }
      }
      run('INSERT INTO tasks (id,user_id,item_id,title,created_at) VALUES (?,?,?,?,?)', id, user, container.id, input.title, now)
      touchAncestors(user, container.id, now, 1)
      return row('task', 'tasks', user, id)
    },
    taskUpdate(user, id, input, now) {
      const task = expectVersion(row('task', 'tasks', user, id), input)
      const completed = input.done === undefined ? task.done : Number(input.done)
      const completedAt = completed ? task.completed_at ?? now : null
      run(`UPDATE tasks SET title=?, done=?, completed_at=?, version=version+1 WHERE user_id=? AND id=? AND version=?`,
        input.title ?? task.title, completed, completedAt, user, id, input.version)
      touchAncestors(user, task.item_id, now, 0, completed - task.done)
      return row('task', 'tasks', user, id)
    },
    taskDelete(user, id, input, now) {
      const task = expectVersion(row('task', 'tasks', user, id), input)
      run('DELETE FROM tasks WHERE user_id=? AND id=? AND version=?', user, id, input.version)
      touchAncestors(user, task.item_id, now, -1, -task.done)
      return { id }
    },
    noteCreate(user, id, input, now) {
      run('INSERT INTO notes (id,user_id,title,body,summary,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
        id, user, input.title, input.body, summaries(input.body), now, now)
      return reads.note(user, id)
    },
    noteUpdate(user, id, input, now) {
      expectVersion(reads.note(user, id), input)
      run('UPDATE notes SET title=?, body=?, summary=?, updated_at=?, version=version+1 WHERE user_id=? AND id=? AND version=?',
        input.title, input.body, summaries(input.body), now, user, id, input.version)
      return reads.note(user, id)
    },
    noteDelete(user, id, input) {
      expectVersion(reads.note(user, id), input)
      run('DELETE FROM notes WHERE user_id=? AND id=? AND version=?', user, id, input.version)
      return { id }
    },
    transactionCreate(user, id, input) {
      run('INSERT INTO transactions (id,user_id,direction,amount_cents,occurred_on,note) VALUES (?,?,?,?,?,?)',
        id, user, input.direction, input.amount, input.occurredOn, input.note)
      return row('transaction', 'transactions', user, id)
    },
    transactionUpdate(user, id, input) {
      expectVersion(row('transaction', 'transactions', user, id), input)
      run(`UPDATE transactions SET direction=?, amount_cents=?, occurred_on=?, note=?, version=version+1
        WHERE user_id=? AND id=? AND version=?`, input.direction, input.amount, input.occurredOn, input.note, user, id, input.version)
      return row('transaction', 'transactions', user, id)
    },
    transactionDelete(user, id, input) {
      expectVersion(row('transaction', 'transactions', user, id), input)
      run('DELETE FROM transactions WHERE user_id=? AND id=? AND version=?', user, id, input.version)
      return { id }
    },
    savingsUpdate(user, _id, input) {
      expectVersion(savings(user), input)
      run('UPDATE savings SET current_cents=?, target_cents=?, version=version+1 WHERE user_id=? AND version=?',
        input.current, input.target, user, input.version)
      return savings(user)
    },
    preferencesUpdate(user, _id, input) {
      const previous = expectVersion(preference(user), input)
      const changed = Number(['ai_goals', 'ai_notes', 'ai_finance'].some(key => previous[key] !== input[key]))
      run(`UPDATE preferences SET theme=?, language=?, timezone=?, ai_goals=?, ai_notes=?, ai_finance=?,
        ai_version=ai_version+?, version=version+1 WHERE user_id=? AND version=?`,
        input.theme, input.language, input.timezone, input.ai_goals, input.ai_notes, input.ai_finance, changed, user, input.version)
      if (changed) {
        const chats = one("SELECT COUNT(*) AS total FROM ai_proposals WHERE status='pending' AND user_id=?", user).total
        if (chats) run(`INSERT INTO module_revisions VALUES (?, 'chats', 1)
          ON CONFLICT(user_id,module) DO UPDATE SET revision=revision+1`, user)
        run(`UPDATE ai_proposals SET status='invalidated' WHERE status='pending' AND user_id=?`, user)
      }
      return preference(user)
    }
  }

  function mutate(user, operation, key, ref, input) {
    return transact(db, () => {
      const now = Date.now()
      const fingerprint = createHash('sha256').update(JSON.stringify([ref, input])).digest('hex')
      run('DELETE FROM idempotency_keys WHERE created_at < ?', now - 604_800_000)
      const prior = one('SELECT fingerprint, result FROM idempotency_keys WHERE user_id=? AND operation=? AND key=?', user, operation, key)
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new Fault(409, 'IDEMPOTENCY_CONFLICT', '提交标识已用于其他内容')
        const saved = JSON.parse(prior.result)
        return { ...saved, replayed: true }
      }
      const result = apply(user, operation, ref, input, now)
      const { id: entityId, version, occurred_on } = result.data
      run('INSERT INTO idempotency_keys VALUES (?,?,?,?,?,?)', user, operation, key, fingerprint,
        JSON.stringify({ data: { id: entityId, version, occurred_on }, revisions: result.revisions }), now)
      return result
    })
  }

  function apply(user, operation, ref, input, now = Date.now()) {
    const id = operation.endsWith('Create') ? randomUUID() : ref
    const data = writes[operation](user, id, input, now, ref)
    const module = operation.startsWith('preferences') ? 'preferences' :
      operation.startsWith('note') ? 'notes' :
      /^(transaction|savings)/.test(operation) ? 'finance' : 'goals'
    const revision = one(`INSERT INTO module_revisions VALUES (?, ?, 1)
      ON CONFLICT(user_id, module) DO UPDATE SET revision = revision + 1 RETURNING revision`, user, module).revision
    return { data, revisions: { [module]: revision } }
  }

  return { ...reads, mutate, apply }
}
