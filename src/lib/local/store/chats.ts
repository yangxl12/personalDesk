import { db, openDb, type MessageRow, type ProposalRow } from '../db'
import { randomId } from '#lib/random-id'
import { write } from '../tx'
import {
  apply, bump, descByTime, fault, goalById, note, notFound, preferencesRow, slicePage, type PageOptions
} from './workspace'
import type { Chat, Message, Proposal, RunReceipt, RunSnapshot, SendInput, Source } from '#lib/contracts/ai'
import { runOf } from '../ai/runtime'

const maskOf = (settings: { ai_goals: number; ai_notes: number; ai_finance: number }) =>
  settings.ai_goals + 2 * settings.ai_notes + 4 * settings.ai_finance

const sources = (value: string): Source[] => {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as Source[] : []
  } catch {
    return []
  }
}

function chatOf(row: { id: string; title: string; updated_at: number; version: number }): Chat {
  return { ...row, runId: runOf(row.id) }
}

async function chatRow(id: string) {
  const row = await db.chats.get(id)
  if (!row) throw notFound()
  return row
}

async function proposalIdOf(runId: string | null) {
  if (!runId) return null
  return (await db.proposals.where('run_id').equals(runId).first())?.id ?? null
}

export async function chats(options: PageOptions) {
  await openDb()
  const rows = (await db.chats.toArray()).sort(descByTime(row => row.updated_at))
  const page = slicePage(rows, row => row.updated_at, false, 'chats', options)
  return { items: page.items.map(chatOf), nextCursor: page.nextCursor }
}

export async function chat(id: string): Promise<Chat> {
  return chatOf(await chatRow(id))
}

export async function messages(id: string, limit: number, before: number) {
  await openDb()
  const header = await chat(id)
  const rows = (await db.messages.where('conversation_id').equals(id).toArray())
    .filter(message => message.seq < before)
    .sort((left, right) => right.seq - left.seq)
  const page = rows.slice(0, limit)
  const more = rows.length > limit
  const proposals = await db.proposals.filter(proposal => proposal.conversation_id === id).toArray()
  const byRun = new Map(proposals.map(proposal => [proposal.run_id, proposal.id]))
  const items: Message[] = page.reverse().map(row => ({
    id: row.id, role: row.role, text: row.text, state: row.state, created_at: row.created_at,
    runId: row.run_id, errorCode: row.error_code, sources: sources(row.sources),
    proposalId: row.run_id ? byRun.get(row.run_id) ?? null : null
  }))
  return { chat: header, items, before: more ? page[0]?.seq ?? null : null }
}

async function nextSeq(conversationId: string) {
  const rows = await db.messages.where('conversation_id').equals(conversationId).toArray()
  return rows.reduce((max, row) => Math.max(max, row.seq), 0) + 1
}

async function latestAssistant(conversationId: string) {
  const rows = (await db.messages.where('conversation_id').equals(conversationId).toArray())
    .filter(row => row.role === 'assistant')
    .sort((left, right) => right.seq - left.seq)
  return rows[0]
}

export async function deleteChat(id: string) {
  return write(async () => {
    const row = await chatRow(id)
    await db.messages.where('conversation_id').equals(id).delete()
    await db.proposals.filter(proposal => proposal.conversation_id === id).delete()
    await db.chats.delete(id)
    return { data: { id: row.id, runId: runOf(id) }, revisions: { chats: await bump('chats') } }
  })
}

export type StartedRun = RunReceipt & { created: boolean; revisions?: Record<string, number>; input?: SendInput }

export function startRun(input: SendInput): Promise<StartedRun> {
  return write(async () => {
    const settings = await preferencesRow()
    for (const ref of input.attachments) {
      const flag = ref.kind === 'goal' ? 'ai_goals' : 'ai_notes'
      if (!settings[flag]) throw fault(403, 'AI_PERMISSION_REQUIRED', '请先在设置中开启对应的 AI 数据访问')
      if (ref.kind === 'goal') await goalById(ref.id)
      else await note(ref.id)
    }
    if (input.pageContext?.entityId) {
      throw fault(422, 'INVALID_CONTEXT', '页面上下文无效')
    }
    const conversationId = input.conversationId ?? randomId()
    const now = Date.now()
    if (input.conversationId) await chatRow(conversationId)
    else {
      await db.chats.put({
        id: conversationId,
        title: [...input.text.replace(/\s+/gu, ' ')].slice(0, 40).join(''),
        updated_at: now,
        version: 1
      })
      await bump('chats')
    }
    if (await db.messages.get(input.clientMessageId)) throw fault(409, 'AI_MESSAGE_CONFLICT', '消息标识已使用')
    const seq = await nextSeq(conversationId)
    const runId = randomId()
    await db.messages.put({
      id: input.clientMessageId, conversation_id: conversationId, seq, role: 'user',
      text: input.text, state: 'completed', domains: 0, sources: '[]', created_at: now,
      run_id: null, error_code: null, input: JSON.stringify(input)
    })
    await db.messages.put({
      id: randomId(), conversation_id: conversationId, seq: seq + 1, role: 'assistant',
      text: '', state: 'queued', domains: 0, sources: '[]', created_at: now,
      run_id: runId, error_code: null
    })
    return {
      runId, conversationId, messageId: input.clientMessageId, created: true,
      revisions: { chats: await bump('chats') }
    }
  })
}

export function retryRun(runId: string): Promise<StartedRun> {
  return write(async () => {
    const assistant = (await db.messages.filter(message => message.run_id === runId).toArray())[0]
    if (!assistant) throw notFound()
    if (!['failed', 'cancelled', 'interrupted'].includes(assistant.state)) {
      throw fault(409, 'AI_CANNOT_RETRY', '此回复无法重试')
    }
    const latest = await latestAssistant(assistant.conversation_id)
    if (latest?.id !== assistant.id) throw fault(409, 'AI_CANNOT_RETRY', '仅可重试当前会话的最新一轮')
    const previous = (await db.messages.where('conversation_id').equals(assistant.conversation_id).toArray())
      .filter(message => message.role === 'user' && message.seq < assistant.seq)
      .sort((left, right) => right.seq - left.seq)[0]
    if (!previous) throw notFound()
    const next = randomId()
    await db.messages.put({
      ...assistant, run_id: next, state: 'queued', text: '', sources: '[]', domains: 0, error_code: null
    })
    return {
      runId: next, conversationId: assistant.conversation_id, messageId: previous.id, created: true,
      revisions: { chats: await bump('chats') },
      input: previous.input ? JSON.parse(previous.input) as SendInput : undefined
    }
  })
}

export function markRunning(runId: string) {
  return write(async () => {
    const message = await runMessage(runId)
    if (message.state === 'queued') await db.messages.put({ ...message, state: 'running' })
  })
}

export async function runMessage(runId: string): Promise<MessageRow> {
  const rows = await db.messages.filter(message => message.run_id === runId).toArray()
  if (!rows.length) throw notFound()
  return rows[0]
}

export async function snapshotOf(runId: string): Promise<RunSnapshot> {
  await openDb()
  const message = await runMessage(runId)
  const previous = (await db.messages.where('conversation_id').equals(message.conversation_id).toArray())
    .filter(row => row.role === 'user' && row.seq < message.seq)
    .sort((left, right) => right.seq - left.seq)[0]
  return {
    runId, conversationId: message.conversation_id, messageId: previous?.id ?? message.id,
    status: message.state, text: message.text, sources: sources(message.sources),
    errorCode: message.error_code, proposalId: await proposalIdOf(runId)
  }
}

export function finishRun(runId: string, status: RunSnapshot['status'], errorCode: string | null,
  text: string, list: Source[], domains: number): Promise<RunSnapshot> {
  return write(async () => {
    const message = await runMessage(runId)
    if (status !== 'completed') {
      await db.proposals.where('run_id').equals(runId)
        .modify(proposal => { if (proposal.status === 'pending') proposal.status = 'invalidated' })
    }
    const previous = (await db.messages.where('conversation_id').equals(message.conversation_id).toArray())
      .filter(row => row.role === 'user' && row.seq < message.seq)
      .sort((left, right) => right.seq - left.seq)[0]
    await db.messages.put({
      ...message, state: status, text, sources: JSON.stringify(list), domains, error_code: errorCode
    })
    await db.chats.update(message.conversation_id, { updated_at: Date.now() })
    await bump('chats')
    return {
      runId, conversationId: message.conversation_id, messageId: previous?.id ?? message.id,
      status, text, sources: list, errorCode, proposalId: await proposalIdOf(runId)
    }
  })
}

export async function historyOf(conversationId: string, beforeSeq: number, limit: number,
  settings: { ai_goals: number; ai_notes: number; ai_finance: number }) {
  const mask = maskOf(settings)
  const rows = (await db.messages.where('conversation_id').equals(conversationId).toArray())
    .filter(message => message.seq < beforeSeq && message.state === 'completed' && (message.domains & ~mask) === 0)
    .sort((left, right) => right.seq - left.seq)
    .slice(0, limit)
  return rows.reverse().map(message => ({ role: message.role, text: message.text, domains: message.domains }))
}

export async function proposal(id: string): Promise<Proposal> {
  const row = await proposalRow(id)
  const status = row.status === 'pending' && row.expires_at <= Date.now() ? 'expired' : row.status
  return { id: row.id, status, preview: JSON.parse(row.preview), expires_at: row.expires_at }
}

export async function proposalRow(id: string): Promise<ProposalRow> {
  const row = await db.proposals.get(id)
  if (!row) throw notFound()
  return row
}

export function proposeTask(runId: string, taskId: string, done: boolean): Promise<Proposal | { unchanged: true }> {
  return write(async () => {
    if (await db.proposals.where('run_id').equals(runId).first()) {
      throw fault(409, 'AI_PROPOSAL_EXISTS', '本轮已有操作方案')
    }
    const task = await db.tasks.get(taskId)
    if (!task) throw notFound()
    const item = await db.items.get(task.item_id)
    const goal = item ? await db.goals.get(item.goal_id) : undefined
    if (!item || !goal) throw notFound()
    if (Boolean(task.done) === done) return { unchanged: true as const }
    const id = randomId()
    const preview = {
      label: task.title,
      before: task.done ? '已完成' : '待完成',
      after: done ? '已完成' : '待完成',
      href: '#goal-' + goal.id
    }
    const expires = Date.now() + 900_000
    await db.proposals.put({
      id, run_id: runId, conversation_id: (await runMessage(runId)).conversation_id,
      status: 'pending',
      payload: JSON.stringify({
        task: { id: task.id, version: task.version, item_version: item.version, goal_version: goal.version },
        done
      }),
      preview: JSON.stringify(preview),
      result: null,
      expires_at: expires
    })
    return { id, status: 'pending', preview, expires_at: expires }
  })
}

export async function decide(id: string, decision: 'approve' | 'reject') {
  const current = await proposal(id)
  const row = await proposalRow(id)
  if (current.status !== 'pending') return { data: current, revisions: {} as Record<string, number> }
  const run = await runMessage(row.run_id)
  if (run.state !== 'completed') throw fault(409, 'AI_RUNNING', '请等待本轮回复结束')
  let status: Proposal['status'] = 'rejected'
  let revisions: Record<string, number> = {}
  if (decision === 'approve') {
    const settings = await preferencesRow()
    if (!settings.ai_goals) throw fault(403, 'AI_PERMISSION_CHANGED', 'AI 数据访问权限已变更')
    const payload = JSON.parse(row.payload) as {
      task: { id: string; version: number; item_version: number; goal_version: number }; done: boolean
    }
    const task = await db.tasks.get(payload.task.id)
    const item = task ? await db.items.get(task.item_id) : undefined
    const goal = item ? await db.goals.get(item.goal_id) : undefined
    // 方案生成到确认之间数据可能已变，版本不一致就作废，不做二次猜测。
    if (task && item && goal && task.version === payload.task.version &&
      item.version === payload.task.item_version && goal.version === payload.task.goal_version) {
      revisions = (await apply('taskUpdate', task.id, { version: task.version, done: payload.done })).revisions
      status = 'applied'
    } else {
      status = 'invalidated'
    }
  }
  await db.proposals.put({ ...row, status, result: status })
  return {
    data: { id, status, preview: current.preview, expires_at: current.expires_at },
    revisions: { ...revisions, chats: await bump('chats') }
  }
}
