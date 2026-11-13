import { APICallError, stepCountIs, streamText, tool, type ModelMessage, type ToolSet } from 'ai'
import { z } from 'zod'
import { domains, type RunReceipt, type RunSnapshot, type RunStatus, type Source } from '#lib/contracts/ai'
import { id, month, today, decimal } from '#lib/contracts/workspace'
import { database, DatabaseError } from '#lib/server/db'
import { model } from './provider'
import type { Configuration } from './config'
import { systemPrompt } from './prompts/v1'

type Listener = (event: string, payload: RunSnapshot | { delta: string; offset: number }, sequence: number) => void
type Runtime = { user: string; snapshot: RunSnapshot; sequence: number; abort: AbortController; listeners: Set<Listener> }
const active = new Map<string, Runtime>()

function publish(runtime: Runtime, event: string, payload: RunSnapshot | { delta: string; offset: number } = runtime.snapshot) {
  runtime.sequence++
  for (const listener of runtime.listeners) listener(event, payload, runtime.sequence)
}

export function interrupt(runId: string | null) {
  if (runId) active.get(runId)?.abort.abort()
}

export function permissionsChanged(user: string) {
  for (const runtime of active.values()) if (runtime.user === user) runtime.abort.abort()
}

export async function snapshot(user: string, runId: string) {
  const runtime = active.get(runId)
  if (runtime?.user === user) return runtime.snapshot
  return database('runSnapshot', user, runId)
}

export async function events(user: string, runId: string, signal: AbortSignal) {
  const saved = await snapshot(user, runId)
  let cleanup = () => {}
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const runtime = active.get(runId)
      const send: Listener = (event, payload, sequence) => {
        controller.enqueue(encoder.encode('event: ' + event + '\ndata: ' + JSON.stringify({ ...payload, runId, sequence }) + '\n\n'))
        if (event === 'done' || event === 'error') close()
      }
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(': heartbeat\n\n')), 15_000)
      let closed = false
      function close() {
        cleanup()
        controller.close()
      }
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        runtime?.listeners.delete(send)
        signal.removeEventListener('abort', close)
      }
      if (signal.aborted) { close(); return }
      signal.addEventListener('abort', close, { once: true })
      if (runtime?.user === user) runtime.listeners.add(send)
      const state = runtime?.user === user ? runtime.snapshot : saved
      send('snapshot', state, runtime?.sequence ?? 0)
      if (!['queued', 'running'].includes(state.status) || !runtime) close()
    },
    cancel() { cleanup() }
  })
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'x-accel-buffering': 'no' } })
}

export function launch(user: string, receipt: RunReceipt, settings: Configuration | DatabaseError) {
  if (active.has(receipt.runId)) return
  const runtime: Runtime = {
    user, snapshot: { ...receipt, status: 'queued', text: '', errorCode: null, sources: [], proposalId: null },
    sequence: 0, abort: new AbortController(), listeners: new Set()
  }
  active.set(receipt.runId, runtime)
  void generate(runtime, settings)
}

async function generate(runtime: Runtime, settings: Configuration | DatabaseError) {
  const { user, abort } = runtime
  const { runId } = runtime.snapshot
  let usedDomains = 0
  let toolCalls = 0
  let timeout = false
  const deadline = setTimeout(() => { timeout = true; abort.abort() }, 45_000)
  const guard = async (mask = 0) => {
    if (abort.signal.aborted) throw new Error('aborted')
    await database('guardAi', user, runId, mask)
    usedDomains |= mask
  }
  const enter = async (mask = 0) => {
    if (++toolCalls > 6) throw new Error('Tool limit reached')
    await guard(mask)
  }
  const cite = (source: Source) => {
    if (!runtime.snapshot.sources.some(item => item.href === source.href)) {
      runtime.snapshot.sources = [...runtime.snapshot.sources, source].slice(0, 24)
      publish(runtime, 'sources')
    }
    return source
  }
  const goalSource = (goal: { id: string; title: string }) =>
    cite({ kind: 'goal', label: goal.title, href: '/goals/' + goal.id })
  const noteSource = (note: { id: string; title: string; summary: string }) =>
    cite({ kind: 'note', label: note.title || note.summary, href: '/notes/' + note.id })
  let status: RunStatus = 'completed'
  let errorCode: string | null = null
  try {
    const run = await database('claimAi', user, runId)
    if (!run) {
      runtime.snapshot = await database('runSnapshot', user, runId)
      return
    }
    runtime.snapshot.status = 'running'
    publish(runtime, 'status')
    const { input, preferences } = run
    if (settings instanceof DatabaseError) throw settings
    const provider = model(settings)
    const tools: ToolSet = {}
    const currentDate = today(preferences.timezone)
    const monthDefault = input.pageContext?.page === 'finance' ? input.pageContext.selectedMonth : undefined
    if (preferences.ai_goals) {
      tools.find_goals = tool({
        description: '按关键词查找目标和进度',
        inputSchema: z.object({ keyword: z.string().max(120).default(''), status: z.enum(['all', 'active', 'done']).default('all') }),
        execute: async ({ keyword, status }) => {
          await enter(domains.goals)
          const result = await database('findAiGoals', user, runId, keyword, status)
          return { ...result, items: result.items.map(goal => ({ ...goal, source: goalSource(goal) })) }
        }
      })
      tools.get_goal = tool({
        description: '读取指定目标和下属任务',
        inputSchema: z.object({ goalId: id }),
        execute: async ({ goalId }) => {
          await enter(domains.goals)
          const result = await database('aiGoal', user, runId, goalId)
          return { ...result, source: goalSource(result) }
        }
      })
      tools.propose_changes = tool({
        description: '预览单个已有任务的完成状态变更，提交须由用户确认',
        inputSchema: z.object({ commands: z.array(z.object({ type: z.literal('task.setDone'), taskId: id, done: z.boolean() })).length(1) }),
        execute: async ({ commands }) => {
          if (runtime.snapshot.proposalId) return { existing: runtime.snapshot.proposalId }
          await enter(domains.goals)
          const [command] = commands
          const result = await database('proposeTask', user, runId, command.taskId, command.done)
          if ('id' in result) {
            runtime.snapshot.proposalId = result.id
            publish(runtime, 'proposal')
          }
          return result
        }
      })
    }
    if (preferences.ai_notes) {
      tools.find_notes = tool({
        description: '按关键词和最近修改天数查询思考摘要。空关键词列出最近记录。',
        inputSchema: z.object({ keyword: z.string().max(120).default(''), days: z.number().int().min(1).max(365).default(7) }),
        execute: async ({ keyword, days }) => {
          await enter(domains.notes)
          const since = Date.now() - days * 86_400_000
          const result = await database('findAiNotes', user, runId, keyword, since)
          return { ...result, since: new Date(since).toISOString(), items: result.items.map(note => ({ ...note, source: noteSource(note) })) }
        }
      })
      tools.get_note = tool({
        description: '读取一条思考及正文',
        inputSchema: z.object({ noteId: id }),
        execute: async ({ noteId }) => {
          await enter(domains.notes)
          const note = await database('aiNote', user, runId, noteId)
          return { title: note.title, text: [...note.body].slice(0, 3000).join(''), truncated: [...note.body].length > 3000, source: noteSource(note) }
        }
      })
    }
    if (preferences.ai_finance) {
      tools.get_finance_summary = tool({
        description: '获取指定月份的收支汇总和存款；月份省略时使用当前财务页或账号本月',
        inputSchema: z.object({ month: month.optional() }),
        execute: async ({ month: selected }) => {
          await enter(domains.finance)
          const selectedMonth = selected ?? monthDefault ?? currentDate.slice(0, 7)
          const result = await database('aiFinance', user, runId, selectedMonth)
          return { ...result, units: 'CNY', totals: Object.fromEntries(Object.entries(result.totals).map(([key, value]) => [key, decimal(value)])),
            source: cite({ kind: 'finance', label: selectedMonth, href: '/finance?month=' + selectedMonth }) }
        }
      })
    }
    tools.suggest_navigation = tool({
      description: '显示可点击的站内页面入口',
      inputSchema: z.object({ page: z.enum(['dashboard', 'goals', 'finance', 'notes', 'chats', 'settings']), month: month.optional() }),
      execute: async ({ page, month: selected }) => {
        await enter()
        const href = page === 'dashboard' ? '/' : '/' + page
        return cite({ kind: 'page', label: { dashboard: '工作台', goals: '目标管理', finance: '财务概览', notes: '思考记录', chats: 'AI 对话历史', settings: '设置' }[page],
          href: href + (page === 'finance' && selected ? '?month=' + selected : '') })
      }
    })
    const attachments = []
    for (const ref of input.attachments) {
      if (ref.kind === 'goal') {
        await guard(domains.goals)
        const goal = await database('aiGoal', user, runId, ref.id)
        attachments.push({ ...goal, description: [...goal.description].slice(0, 1200).join(''), tasks: goal.tasks.slice(0, 10), source: goalSource(goal) })
      } else {
        await guard(domains.notes)
        const note = await database('aiNote', user, runId, ref.id)
        attachments.push({ title: note.title, body: [...note.body].slice(0, 2500).join(''), source: noteSource(note) })
      }
    }
    const selectedHistory: ModelMessage[] = []
    let characters = 0
    for (const message of [...run.history].reverse()) {
      if (characters + message.text.length > 9000) break
      characters += message.text.length
      usedDomains |= message.domains
      selectedHistory.unshift({ role: message.role, content: message.text })
    }
    const messages: ModelMessage[] = [...selectedHistory, {
      role: 'user',
      content: JSON.stringify({ text: input.text, context: input.pageContext, attachments })
    }]
    const streaming = streamText({
      model: provider.languageModel,
      system: systemPrompt + '\n账号日期 ' + currentDate + '，时区 ' + preferences.timezone + '，语言 ' + preferences.language,
      messages, tools, abortSignal: abort.signal, maxRetries: 0, maxOutputTokens: 1000,
      onError: () => {},
      stopWhen: [stepCountIs(4), () => Boolean(runtime.snapshot.proposalId)],
      prepareStep: async ({ messages: stepMessages }) => {
        if (JSON.stringify(stepMessages).length > 31_000) throw new Error('Input budget exceeded')
        await guard(usedDomains)
      },
      providerOptions: provider.deepseek ? { deepseek: { thinking: { type: 'disabled' } } } : undefined
    })
    let buffer = ''
    let lastEvent = 0
    let lastSave = Date.now()
    for await (const part of streaming.fullStream) {
      if (part.type === 'error' || part.type === 'tool-error') throw part.error
      if (part.type !== 'text-delta') continue
      await guard(usedDomains)
      buffer += part.text
      runtime.snapshot.text += part.text
      const now = Date.now()
      if (now - lastEvent > 55) {
        publish(runtime, 'text_delta', { delta: buffer, offset: runtime.snapshot.text.length - buffer.length })
        buffer = ''
        lastEvent = now
      }
      if (now - lastSave >= 2000) {
        await database('flushAi', user, runId, runtime.snapshot.text, runtime.snapshot.sources, usedDomains)
        lastSave = now
      }
    }
    if (abort.signal.aborted) throw new Error('aborted')
    if (!runtime.snapshot.text && !runtime.snapshot.proposalId && runtime.snapshot.sources.length === 0) {
      throw new DatabaseError(503, 'AI_EMPTY', '模型未返回内容')
    }
  } catch (error) {
    status = abort.signal.aborted && !timeout ? 'cancelled' : 'failed'
    errorCode = timeout ? 'AI_TIMEOUT' : error instanceof DatabaseError ? error.code :
      APICallError.isInstance(error) ? (error.statusCode === 429 ? 'AI_RATE_LIMITED' : error.statusCode === 401 || error.statusCode === 403 ? 'AI_PROVIDER_AUTH' : 'AI_PROVIDER_ERROR')
        : status === 'cancelled' ? 'AI_CANCELLED' : 'AI_PROVIDER_ERROR'
  } finally {
    clearTimeout(deadline)
    try {
      runtime.snapshot = await database('finishAi', user, runId, status, errorCode,
        runtime.snapshot.text, runtime.snapshot.sources, usedDomains)
    } catch {
      runtime.snapshot = { ...runtime.snapshot, status: 'interrupted', errorCode: 'AI_INTERRUPTED' }
    }
    publish(runtime, runtime.snapshot.status === 'completed' ? 'done' : 'error')
    active.delete(runId)
  }
}
