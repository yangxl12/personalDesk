import { createHash, randomUUID } from 'node:crypto'
import { transact } from './storage.mjs'
import { Fault, conflict, missing } from './fault.mjs'

const active = "('queued','running')"
const stable = new Set(['completed','failed','cancelled','interrupted'])
const chatColumns = 'id, title, updated_at, version'
const mask = p => p.ai_goals + 2 * p.ai_notes + 4 * p.ai_finance

export function aiQueries(db, workspace) {
  const one = (sql, ...args) => db.prepare(sql).get(...args)
  const all = (sql, ...args) => db.prepare(sql).all(...args)
  const run = (sql, ...args) => db.prepare(sql).run(...args)
  function touch(user, conversation) {
    run('UPDATE conversations SET updated_at=?, version=version+1 WHERE user_id=? AND id=?', Date.now(), user, conversation)
    return one(`INSERT INTO module_revisions VALUES (?, 'chats', 1)
      ON CONFLICT(user_id,module) DO UPDATE SET revision=revision+1 RETURNING revision`, user).revision
  }
  const receipt = row => ({ runId: row.id, conversationId: row.conversation_id, messageId: row.user_message_id })
  function chat(user, id) {
    const record = one(`SELECT ${chatColumns} FROM conversations WHERE user_id=? AND id=?`, user, id)
    if (!record) missing()
    return { ...record, runId: one(`SELECT id FROM ai_runs WHERE user_id=? AND conversation_id=? AND status IN ${active}`, user, id)?.id ?? null }
  }
  function lookup(user, id) {
    const row = one('SELECT * FROM ai_runs WHERE user_id=? AND id=?', user, id)
    if (!row) missing()
    return row
  }
  function authorized(user, row, required = 0) {
    const preferences = workspace.preferences(user)
    if (row.authorization_version !== preferences.ai_version || (mask(preferences) & required) !== required) {
      throw new Fault(403, 'AI_PERMISSION_CHANGED', 'AI 数据访问权限已变更')
    }
    return preferences
  }
  function live(user, id, required = 0) {
    const row = lookup(user, id)
    if (row.status !== 'running') throw new Fault(409, 'AI_RUN_ENDED', '本次生成已结束')
    return { row, preferences: authorized(user, row, required) }
  }
  function limit(user, conversation, dailyLimit) {
    const count = one('SELECT COUNT(*) AS count FROM ai_runs WHERE user_id=? AND created_at>=?', user, Date.now() - 86_400_000).count
    if (count >= dailyLimit) throw new Fault(429, 'AI_DAILY_LIMIT', '已达到每日 AI 请求上限')
    const rows = all(`SELECT conversation_id FROM ai_runs WHERE user_id=? AND status IN ${active} LIMIT 2`, user)
    if (rows.length >= 2 || rows.some(row => row.conversation_id === conversation)) {
      throw new Fault(409, 'AI_RUNNING', '已有回复正在生成')
    }
  }
  function insertMessage(user, conversation, message, role, text, state, now) {
    run(`INSERT INTO messages (id,user_id,conversation_id,seq,role,text,state,created_at)
      SELECT ?,?,?,COALESCE(MAX(seq),0)+1,?,?,?,? FROM messages WHERE conversation_id=?`,
      message, user, conversation, role, text, state, now, conversation)
  }
  function createRun(user, conversation, message, attempt, requestKey, fingerprint, input, provider, preferences, previousAssistant) {
    const id = randomUUID()
    const assistant = previousAssistant ?? randomUUID()
    const now = Date.now()
    if (previousAssistant) {
      run("UPDATE messages SET text='', state='queued', domains=0, sources='[]' WHERE user_id=? AND id=?", user, assistant)
    } else {
      insertMessage(user, conversation, assistant, 'assistant', '', 'queued', now)
    }
    run(`INSERT INTO ai_runs
      (id,user_id,conversation_id,user_message_id,assistant_message_id,attempt,status,authorization_version,input,provider,request_key,fingerprint,created_at)
      VALUES (?,?,?,?,?,?,'queued',?,?,?,?,?,?)`,
      id, user, conversation, message, assistant, attempt, preferences.ai_version, input, provider, requestKey, fingerprint, now)
    return { ...receipt({ id, conversation_id: conversation, user_message_id: message }), created: true, revisions: { chats: touch(user, conversation) } }
  }
  function fingerprint(input) {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex')
  }
  function previous(user, key, hash) {
    const row = one('SELECT * FROM ai_runs WHERE user_id=? AND request_key=?', user, key)
    if (!row) return
    if (row.fingerprint !== hash) throw new Fault(409, 'IDEMPOTENCY_CONFLICT', '提交标识已用于其他内容')
    return { ...receipt(row), created: false }
  }
  function snapshot(user, id) {
    const row = lookup(user, id)
    const message = one('SELECT text,sources FROM messages WHERE user_id=? AND id=?', user, row.assistant_message_id)
    const latest = one('SELECT MAX(attempt) AS attempt FROM ai_runs WHERE user_message_id=?', row.user_message_id)
    return { ...receipt(row), status: row.status, text: latest.attempt === row.attempt ? message.text : '',
      sources: latest.attempt === row.attempt ? JSON.parse(message.sources) : [], errorCode: row.error_code,
      proposalId: one('SELECT id FROM ai_proposals WHERE run_id=?', id)?.id ?? null }
  }
  function finish(user, id, status, error, text, sources, domains) {
    const row = lookup(user, id)
    if (!['running', 'queued'].includes(row.status)) return snapshot(user, id)
    const proposal = one('SELECT id FROM ai_proposals WHERE run_id=?', id)
    if (workspace.preferences(user).ai_version !== row.authorization_version) {
      status = 'cancelled'
      error = 'AI_PERMISSION_CHANGED'
      text = ''
      sources = []
    }
    if (proposal && status !== 'completed') {
      run("UPDATE ai_proposals SET status='invalidated' WHERE id=? AND status='pending'", proposal.id)
    }
    run('UPDATE ai_runs SET status=?, error_code=?, domains=? WHERE user_id=? AND id=?', status, error, domains, user, id)
    run('UPDATE messages SET state=?, text=?, sources=?, domains=? WHERE user_id=? AND id=?',
      status, text, JSON.stringify(sources), domains, user, row.assistant_message_id)
    touch(user, row.conversation_id)
    return snapshot(user, id)
  }

  function recover() {
    transact(db, () => {
      const rows = all(`SELECT id,user_id FROM ai_runs WHERE status IN ${active}`)
      for (const row of rows) {
        const saved = snapshot(row.user_id, row.id)
        const proposal = saved.proposalId && one('SELECT status FROM ai_proposals WHERE id=?', saved.proposalId)
        const complete = proposal && proposal.status === 'pending'
        finish(row.user_id, row.id, complete ? 'completed' : 'interrupted', complete ? null : 'AI_INTERRUPTED',
          saved.text, saved.sources, lookup(row.user_id, row.id).domains)
      }
    })
  }

  function proposal(user, id) {
    const row = one('SELECT * FROM ai_proposals WHERE user_id=? AND id=?', user, id)
    if (!row) missing()
    const status = row.status === 'pending' && row.expires_at <= Date.now() ? 'expired' : row.status
    return { id, status, preview: JSON.parse(row.preview), expires_at: row.expires_at }
  }

  return {
    recover,
    chats: (user, options) => {
      let boundary = []
      if (options.cursor) {
        try {
          boundary = JSON.parse(Buffer.from(options.cursor, 'base64url').toString())
        } catch {
          throw new Fault(400, 'INVALID_CURSOR', '分页参数无效')
        }
        if (!Array.isArray(boundary) || boundary.length !== 2 || !Number.isSafeInteger(boundary[0]) || typeof boundary[1] !== 'string') {
          throw new Fault(400, 'INVALID_CURSOR', '分页参数无效')
        }
      }
      const rows = all(`SELECT ${chatColumns} FROM conversations WHERE user_id=?
        ${boundary.length ? 'AND (updated_at,id)<(?,?)' : ''} ORDER BY updated_at DESC,id DESC LIMIT ?`,
        user, ...boundary, options.limit + 1)
      const hasMore = rows.length > options.limit
      if (hasMore) rows.pop()
      const last = rows.at(-1)
      return { items: rows, nextCursor: hasMore ? Buffer.from(JSON.stringify([last.updated_at, last.id])).toString('base64url') : null }
    },
    chat,
    messages(user, id, limit, before) {
      const header = chat(user, id)
      const rows = all(`SELECT m.id,m.seq,m.role,m.text,m.state,m.created_at,m.sources,
        r.id AS runId,COALESCE(r.error_code, CASE WHEN m.state='failed' THEN 'AI_IMPORTED_FAILED' END) AS errorCode,p.id AS proposalId
        FROM messages m
        LEFT JOIN ai_runs r ON r.user_id=m.user_id AND r.assistant_message_id=m.id AND r.attempt=(
          SELECT MAX(latest.attempt) FROM ai_runs latest WHERE latest.user_id=m.user_id AND latest.assistant_message_id=m.id
        )
        LEFT JOIN ai_proposals p ON p.run_id=r.id WHERE m.user_id=? AND m.conversation_id=? AND m.seq<?
        ORDER BY m.seq DESC LIMIT ?`, user, id, before, limit + 1)
      const more = rows.length > limit
      if (more) rows.pop()
      return { chat: header, items: rows.reverse().map(row => ({ ...row, sources: JSON.parse(row.sources) })), before: more ? rows[0].seq : null }
    },
    deleteChat(user, id, version, key) {
      return transact(db, () => {
        const operation = 'chatDelete'
        const hash = fingerprint([id, version])
        const old = one('SELECT fingerprint, result FROM idempotency_keys WHERE user_id=? AND operation=? AND key=?', user, operation, key)
        if (old) {
          if (old.fingerprint !== hash) throw new Fault(409, 'IDEMPOTENCY_CONFLICT', '提交标识已用于其他内容')
          return JSON.parse(old.result)
        }
        const current = chat(user, id)
        if (current.version !== version) conflict(current)
        const revision = touch(user, id)
        run('DELETE FROM conversations WHERE user_id=? AND id=? AND version=?', user, id, version + 1)
        const result = { data: { id, runId: current.runId }, revisions: { chats: revision } }
        run('INSERT INTO idempotency_keys VALUES (?,?,?,?,?,?)', user, operation, key, hash, JSON.stringify(result), Date.now())
        return result
      })
    },
    startAi(user, key, input, provider, dailyLimit) {
      return transact(db, () => {
        const hash = fingerprint(input)
        const old = previous(user, key, hash)
        if (old) return old
        const duplicate = one('SELECT * FROM ai_runs WHERE user_id=? AND user_message_id=? AND attempt=1', user, input.clientMessageId)
        if (duplicate) {
          if (duplicate.fingerprint !== hash) throw new Fault(409, 'AI_MESSAGE_CONFLICT', '消息标识已使用')
          return { ...receipt(duplicate), created: false }
        }
        const preferences = workspace.preferences(user)
        for (const ref of input.attachments) {
          const flag = ref.kind === 'goal' ? 'ai_goals' : 'ai_notes'
          if (!preferences[flag]) throw new Fault(403, 'AI_PERMISSION_REQUIRED', '请先在设置中开启对应的 AI 数据访问')
          workspace[ref.kind](user, ref.id)
        }
        if (input.pageContext?.entityId) {
          if (input.pageContext.page === 'goals') workspace.goal(user, input.pageContext.entityId)
          else if (input.pageContext.page === 'notes') workspace.note(user, input.pageContext.entityId)
          else throw new Fault(422, 'INVALID_CONTEXT', '页面上下文无效')
        }
        const conversation = input.conversationId ?? randomUUID()
        limit(user, conversation, dailyLimit)
        const now = Date.now()
        if (input.conversationId) chat(user, conversation)
        else run('INSERT INTO conversations (id,user_id,title,updated_at) VALUES (?,?,?,?)',
          conversation, user, [...input.text.replace(/\s+/gu, ' ')].slice(0, 40).join(''), now)
        if (one('SELECT 1 FROM messages WHERE id=?', input.clientMessageId)) {
          throw new Fault(409, 'AI_MESSAGE_CONFLICT', '消息标识已使用')
        }
        insertMessage(user, conversation, input.clientMessageId, 'user', input.text, 'completed', now)
        return createRun(user, conversation, input.clientMessageId, 1, key, hash, JSON.stringify(input), provider, preferences)
      })
    },
    retryAi(user, id, key, provider, dailyLimit, modelRef) {
      return transact(db, () => {
        const hash = fingerprint(modelRef ? ['retry', id, modelRef] : ['retry', id])
        const old = previous(user, key, hash)
        if (old) return old
        const row = lookup(user, id)
        if (!['failed', 'cancelled', 'interrupted'].includes(row.status)) throw new Fault(409, 'AI_CANNOT_RETRY', '此回复无法重试')
        const latest = one('SELECT MAX(attempt) AS attempt FROM ai_runs WHERE user_message_id=?', row.user_message_id).attempt
        if (latest !== row.attempt) throw new Fault(409, 'AI_CANNOT_RETRY', '请重试最近一次回复')
        const newest = one("SELECT id FROM messages WHERE conversation_id=? AND role='user' ORDER BY seq DESC LIMIT 1", row.conversation_id)
        if (newest?.id !== row.user_message_id) throw new Fault(409, 'AI_CANNOT_RETRY', '仅可重试当前会话的最新一轮')
        limit(user, row.conversation_id, dailyLimit)
        return createRun(user, row.conversation_id, row.user_message_id, row.attempt + 1, key, hash, row.input, provider,
          workspace.preferences(user), row.assistant_message_id)
      })
    },
    runSnapshot: snapshot,
    claimAi(user, id) {
      return transact(db, () => {
        const row = lookup(user, id)
        if (row.status !== 'queued') return null
        const preferences = authorized(user, row)
        run("UPDATE ai_runs SET status='running' WHERE id=?", id)
        run("UPDATE messages SET state='running' WHERE id=?", row.assistant_message_id)
        const history = all(`SELECT role,text,domains FROM messages WHERE user_id=? AND conversation_id=?
          AND seq<(SELECT seq FROM messages WHERE id=?) AND state='completed' ORDER BY seq DESC LIMIT 24`,
          user, row.conversation_id, row.user_message_id).reverse().filter(message => (message.domains & ~mask(preferences)) === 0)
        return { input: JSON.parse(row.input), preferences, history }
      })
    },
    guardAi(user, id, domains) {
      const { row } = live(user, id, domains)
      if ((row.domains & domains) !== domains) run('UPDATE ai_runs SET domains=domains|? WHERE user_id=? AND id=?', domains, user, id)
      return true
    },
    flushAi(user, id, text, sources, domains) {
      return transact(db, () => {
        const { row } = live(user, id, domains)
        run('UPDATE messages SET text=?, sources=?, domains=? WHERE user_id=? AND id=?', text, JSON.stringify(sources), domains, user, row.assistant_message_id)
      })
    },
    finishAi(user, id, status, error, text, sources, domains) {
      if (!stable.has(status)) throw new Error('Invalid final AI status')
      return transact(db, () => finish(user, id, status, error, text, sources, domains))
    },
    cancelAi(user, id, key) {
      return transact(db, () => {
        const operation = 'aiCancel'
        const hash = fingerprint(id)
        const old = one('SELECT fingerprint, result FROM idempotency_keys WHERE user_id=? AND operation=? AND key=?', user, operation, key)
        if (old && old.fingerprint !== hash) throw new Fault(409, 'IDEMPOTENCY_CONFLICT', '提交标识已用于其他内容')
        if (old) return snapshot(user, id)
        const saved = snapshot(user, id)
        const final = finish(user, id, 'cancelled', 'AI_CANCELLED', saved.text, saved.sources, lookup(user, id).domains)
        run('INSERT INTO idempotency_keys VALUES (?,?,?,?,?,?)', user, operation, key, hash, '{}', Date.now())
        return final
      })
    },
    findAiGoals(user, id, keyword, status) {
      live(user, id, 1)
      const rows = all(`SELECT id,title,total_tasks,done_tasks FROM goals WHERE user_id=?
        AND instr(lower(title),lower(?))>0
        AND (?='all' OR (total_tasks>0 AND done_tasks=total_tasks)=(?='done'))
        ORDER BY updated_at DESC,id DESC LIMIT 21`, user, keyword, status)
      return { items: rows.slice(0, 20), truncated: rows.length > 20 }
    },
    aiGoal(user, runId, goalId) {
      live(user, runId, 1)
      const goal = workspace.goal(user, goalId)
      const tasks = all(`SELECT t.id,t.title,t.done,i.title AS item FROM goal_items i
        JOIN tasks t ON i.user_id=t.user_id AND i.id=t.item_id WHERE i.user_id=? AND i.goal_id=?
        ORDER BY i.created_at,i.id,t.created_at,t.id LIMIT 31`, user, goalId)
      return { id: goal.id, title: goal.title, description: goal.description, done: goal.done_tasks,
        total: goal.total_tasks, tasks: tasks.slice(0, 30), truncated: tasks.length > 30 }
    },
    findAiNotes(user, id, keyword, since) {
      live(user, id, 2)
      const rows = all(`SELECT id,title,summary,updated_at,created_at,version FROM notes WHERE user_id=? AND updated_at>=?
        AND (instr(lower(title),lower(?))>0 OR instr(lower(body),lower(?))>0)
        ORDER BY updated_at DESC,id DESC LIMIT 21`, user, since, keyword, keyword)
      return { items: rows.slice(0, 20), truncated: rows.length > 20 }
    },
    aiNote(user, runId, noteId) {
      live(user, runId, 2)
      return workspace.note(user, noteId)
    },
    aiFinance(user, runId, month) {
      live(user, runId, 4)
      const result = workspace.finance(user, { month, limit: 1 })
      return { month, totals: result.totals, savings: result.savings }
    },
    proposeTask(user, runId, taskId, done) {
      return transact(db, () => {
        live(user, runId, 1)
        if (one('SELECT id FROM ai_proposals WHERE run_id=?', runId)) throw new Fault(409, 'AI_PROPOSAL_EXISTS', '本轮已有操作方案')
        const task = one(`SELECT t.id,t.title,t.done,t.version,i.id AS item_id,i.version AS item_version,
          g.id AS goal_id,g.version AS goal_version FROM tasks t
          JOIN goal_items i ON t.user_id=i.user_id AND t.item_id=i.id
          JOIN goals g ON i.user_id=g.user_id AND i.goal_id=g.id WHERE t.user_id=? AND t.id=?`, user, taskId)
        if (!task) missing()
        if (Boolean(task.done) === done) return { unchanged: true }
        const id = randomUUID()
        const preview = { label: task.title, before: task.done ? '已完成' : '待完成', after: done ? '已完成' : '待完成', href: '/goals/' + task.goal_id }
        const expires = Date.now() + 900_000
        run("INSERT INTO ai_proposals VALUES (?,?,?,'pending',?,?,NULL,?)",
          id, user, runId, JSON.stringify({ task, done }), JSON.stringify(preview), expires)
        return { id, status: 'pending', preview, expires_at: expires }
      })
    },
    proposal,
    decideAi(user, id, decision, key) {
      return transact(db, () => {
        const current = proposal(user, id)
        const operation = 'aiDecision'
        const hash = fingerprint([id, decision])
        const old = one('SELECT fingerprint, result FROM idempotency_keys WHERE user_id=? AND operation=? AND key=?', user, operation, key)
        if (old && old.fingerprint !== hash) throw new Fault(409, 'IDEMPOTENCY_CONFLICT', '提交标识已用于其他内容')
        if (old) return JSON.parse(old.result)
        if (current.status !== 'pending') return { data: current }
        const stored = one('SELECT * FROM ai_proposals WHERE user_id=? AND id=?', user, id)
        const parent = lookup(user, stored.run_id)
        if (parent.status !== 'completed') throw new Fault(409, 'AI_RUNNING', '请等待本轮回复结束')
        let status = 'rejected'
        let revisions = {}
        if (decision === 'approve') {
          authorized(user, parent, 1)
          const { task, done } = JSON.parse(stored.payload)
          const valid = one(`SELECT 1 FROM tasks t JOIN goal_items i ON t.user_id=i.user_id AND t.item_id=i.id
            JOIN goals g ON i.user_id=g.user_id AND i.goal_id=g.id
            WHERE t.user_id=? AND t.id=? AND t.version=? AND i.version=? AND g.version=?`,
            user, task.id, task.version, task.item_version, task.goal_version)
          if (valid) {
            revisions = workspace.apply(user, 'taskUpdate', task.id, { version: task.version, done }).revisions
            status = 'applied'
          } else status = 'invalidated'
        }
        const { task } = JSON.parse(stored.payload)
        run('INSERT INTO operation_audit VALUES (?,?,?,?,?,?)', randomUUID(), user, 'task.setDone', task.id, status, Date.now())
        run('UPDATE ai_proposals SET status=?, result=? WHERE user_id=? AND id=?', status, status, user, id)
        const result = { data: { ...current, status }, revisions: { ...revisions, chats: touch(user, parent.conversation_id) } }
        run('INSERT INTO idempotency_keys VALUES (?,?,?,?,?,?)', user, operation, key, hash, JSON.stringify(result), Date.now())
        return result
      })
    }
  }
}
