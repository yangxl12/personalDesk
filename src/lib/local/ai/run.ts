import { APICallError, stepCountIs, streamText, tool, type ModelMessage, type ToolSet } from 'ai'
import { z } from 'zod'
import { resolve } from '$app/paths'
import { domains, type RunSnapshot, type SendInput, type Source, type RunStatus } from '#lib/contracts/ai'
import { decimal, id, month, today } from '#lib/contracts/workspace'
import { systemPrompt } from '#lib/ai/prompts/v1'
import { db } from '../db'
import { activeConfiguration, model, type Configuration } from './model'
import * as registry from './runtime'
import type { EventPayload, Listener } from './runtime'
import {
  finishRun, historyOf, markRunning, proposeTask, retryRun, runMessage, snapshotOf, startRun, type StartedRun
} from '../store/chats'
import { fault, finance, goalById, goalTasks, isDone, note, preferencesRow } from '../store/workspace'

const TOOL_LIMIT = 6
const INPUT_BUDGET = 31_000
const HARD_TIMEOUT = 45_000
const OUTLINE_ATTACHMENT = 10

const maskOf = (settings: { ai_goals: number; ai_notes: number; ai_finance: number }) =>
  settings.ai_goals + 2 * settings.ai_notes + 4 * settings.ai_finance

const codeOf = (error: unknown) =>
  typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''

function cite(runtime: registry.Runtime, source: Source) {
  if (!runtime.snapshot.sources.some(item => item.href === source.href)) {
    runtime.snapshot.sources = [...runtime.snapshot.sources, source].slice(0, 24)
    registry.publish(runtime, 'sources')
  }
  return source
}

const goalSource = (goal: { id: string; title: string }): Source =>
  ({ kind: 'goal', label: goal.title, href: resolve('') + '#goal-' + goal.id })
const noteSource = (item: { id: string; title: string; summary: string }): Source =>
  ({ kind: 'note', label: item.title || item.summary, href: resolve('') + '#note-' + item.id })

async function findGoals(keyword: string, status: 'all' | 'active' | 'done') {
  const needle = keyword.toLowerCase()
  const rows = (await db.goals.toArray())
    .filter(goal => goal.title.toLowerCase().includes(needle) && (status === 'all' || isDone(goal) === (status === 'done')))
    .sort((left, right) => right.updated_at - left.updated_at || (left.id < right.id ? 1 : -1))
  return {
    items: rows.slice(0, 20).map(({ id: goalId, title, total_tasks, done_tasks }) =>
      ({ id: goalId, title, total_tasks, done_tasks })),
    truncated: rows.length > 20
  }
}

async function readGoal(goalId: string) {
  const goal = await goalById(goalId)
  const tasks = await goalTasks(goalId)
  return {
    id: goal.id, title: goal.title, description: goal.description,
    done: goal.done_tasks, total: goal.total_tasks,
    tasks: tasks.slice(0, 30), truncated: tasks.length > 30
  }
}

async function findNotes(keyword: string, since: number) {
  const needle = keyword.toLowerCase()
  const rows = (await db.notes.where('updated_at').aboveOrEqual(since).toArray())
    .filter(item => item.title.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle))
    .sort((left, right) => right.updated_at - left.updated_at || (left.id < right.id ? 1 : -1))
  return {
    items: rows.slice(0, 20).map(({ id: noteId, title, summary, updated_at, created_at, version }) =>
      ({ id: noteId, title, summary, updated_at, created_at, version })),
    truncated: rows.length > 20
  }
}

export async function start(input: SendInput): Promise<StartedRun> {
  const settings = await activeConfiguration()
  const receipt = await startRun(input)
  launch(input, receipt, settings)
  return receipt
}

export async function retry(runId: string): Promise<StartedRun> {
  const settings = await activeConfiguration()
  const receipt = await retryRun(runId)
  const input: SendInput = receipt.input ?? {
    clientMessageId: receipt.messageId, conversationId: receipt.conversationId, text: '', attachments: []
  }
  launch(input, receipt, settings)
  return receipt
}

function launch(input: SendInput, receipt: StartedRun, settings: Configuration) {
  if (registry.get(receipt.runId)) return
  let settle = () => {}
  const settled = new Promise<void>(done => { settle = done })
  const runtime: registry.Runtime = {
    runId: receipt.runId,
    conversationId: receipt.conversationId,
    messageId: receipt.messageId,
    snapshot: {
      runId: receipt.runId, conversationId: receipt.conversationId, messageId: receipt.messageId,
      status: 'queued', text: '', sources: [], errorCode: null, proposalId: null
    },
    sequence: 0,
    abort: new AbortController(),
    listeners: new Set(),
    settled
  }
  registry.register(runtime)
  registry.publish(runtime, 'snapshot')
  void generate(runtime, settings, input).finally(() => {
    registry.drop(runtime.runId)
    settle()
  })
}

export function subscribeRun(runId: string, handler: Listener) {
  const runtime = registry.get(runId)
  if (runtime) {
    runtime.listeners.add(handler)
    handler('snapshot', { ...runtime.snapshot, sequence: runtime.sequence } as EventPayload)
    return { close: () => { runtime.listeners.delete(handler) } }
  }
  let closed = false
  void snapshotOf(runId).then(value => {
    if (!closed) handler('snapshot', { ...value, sequence: 0 } as EventPayload)
  }).catch(() => {})
  return { close: () => { closed = true } }
}

export async function cancel(runId: string): Promise<RunSnapshot> {
  const runtime = registry.get(runId)
  if (runtime) {
    runtime.abort.abort()
    await runtime.settled
  }
  return snapshotOf(runId)
}

export function snapshot(runId: string): Promise<RunSnapshot> {
  const runtime = registry.get(runId)
  return runtime ? Promise.resolve(runtime.snapshot) : snapshotOf(runId)
}

async function generate(runtime: registry.Runtime, settings: Configuration, input: SendInput) {
  const { abort } = runtime
  const { runId } = runtime
  const started = await preferencesRow()
  let usedDomains = 0
  let toolCalls = 0
  let timeout = false
  const deadline = setTimeout(() => { timeout = true; abort.abort() }, HARD_TIMEOUT)

  const guard = async (mask = 0) => {
    if (abort.signal.aborted) throw new Error('aborted')
    const latest = await preferencesRow()
    if (latest.ai_version !== started.ai_version || (maskOf(latest) & mask) !== mask) {
      throw fault(403, 'AI_PERMISSION_CHANGED', 'AI 数据访问权限已变更')
    }
    usedDomains |= mask
  }
  const enter = async (mask = 0) => {
    if (++toolCalls > TOOL_LIMIT) throw fault(503, 'AI_TOOL_LIMIT', '工具调用次数已用尽')
    await guard(mask)
  }

  let status: RunStatus = 'completed'
  let errorCode: string | null = null
  try {
    const message = await runMessage(runId)
    const history = await historyOf(message.conversation_id, message.seq, 24, started)
    runtime.snapshot.status = 'running'
    registry.publish(runtime, 'status')
    await markRunning(runId)

    const provider = model(settings)
    const tools: ToolSet = {}
    const currentDate = today(started.timezone)
    const monthDefault = input.pageContext?.selectedMonth

    if (started.ai_goals) {
      tools.find_goals = tool({
        description: '按关键词查找目标和进度',
        inputSchema: z.object({ keyword: z.string().max(120).default(''), status: z.enum(['all', 'active', 'done']).default('all') }),
        execute: async ({ keyword, status: filter }) => {
          await enter(domains.goals)
          const result = await findGoals(keyword, filter)
          return { ...result, items: result.items.map(goal => ({ ...goal, source: goalSource(goal) })) }
        }
      })
      tools.get_goal = tool({
        description: '读取指定目标和下属任务',
        inputSchema: z.object({ goalId: id }),
        execute: async ({ goalId }) => {
          await enter(domains.goals)
          const result = await readGoal(goalId)
          return { ...result, source: goalSource(result) }
        }
      })
      tools.propose_changes = tool({
        description: '预览单个已有任务的完成状态变更，提交须由用户确认',
        inputSchema: z.object({
          commands: z.array(z.object({ type: z.literal('task.setDone'), taskId: id, done: z.boolean() })).length(1)
        }),
        execute: async ({ commands }) => {
          if (runtime.snapshot.proposalId) return { existing: runtime.snapshot.proposalId }
          await enter(domains.goals)
          const [command] = commands
          const result = await proposeTask(runId, command.taskId, command.done)
          if ('id' in result) {
            runtime.snapshot.proposalId = result.id
            registry.publish(runtime, 'proposal')
          }
          return result
        }
      })
    }
    if (started.ai_notes) {
      tools.find_notes = tool({
        description: '按关键词和最近修改天数查询思考摘要。空关键词列出最近记录。',
        inputSchema: z.object({ keyword: z.string().max(120).default(''), days: z.number().int().min(1).max(365).default(7) }),
        execute: async ({ keyword, days }) => {
          await enter(domains.notes)
          const since = Date.now() - days * 86_400_000
          const result = await findNotes(keyword, since)
          return {
            ...result, since: new Date(since).toISOString(),
            items: result.items.map(item => ({ ...item, source: noteSource(item) }))
          }
        }
      })
      tools.get_note = tool({
        description: '读取一条思考及正文',
        inputSchema: z.object({ noteId: id }),
        execute: async ({ noteId }) => {
          await enter(domains.notes)
          const item = await note(noteId)
          return {
            title: item.title, text: [...item.body].slice(0, 3000).join(''),
            truncated: [...item.body].length > 3000, source: noteSource(item)
          }
        }
      })
    }
    if (started.ai_finance) {
      tools.get_finance_summary = tool({
        description: '获取指定月份的收支汇总和存款；月份省略时使用工作台选中月或账号本月',
        inputSchema: z.object({ month: month.optional() }),
        execute: async ({ month: selected }) => {
          await enter(domains.finance)
          const selectedMonth = selected ?? monthDefault ?? currentDate.slice(0, 7)
          const result = await finance({ month: selectedMonth, limit: 1 })
          return {
            month: selectedMonth, totals: {
              income: decimal(result.totals.income), expense: decimal(result.totals.expense), balance: decimal(result.totals.balance)
            },
            savings: result.savings, units: 'CNY',
            source: cite(runtime, { kind: 'finance', label: selectedMonth, href: resolve('') + '?month=' + selectedMonth })
          }
        }
      })
    }
    tools.suggest_navigation = tool({
      description: '显示可点击的站内页面入口',
      inputSchema: z.object({ page: z.enum(['dashboard', 'finance', 'chats', 'settings']), month: month.optional() }),
      execute: async ({ page, month: selected }) => {
        await enter()
        const target = { dashboard: resolve(''), finance: resolve(''), chats: resolve('chats'), settings: resolve('settings') }[page]
        return cite(runtime, {
          kind: 'page', label: { dashboard: '工作台', finance: '财务概览', chats: 'AI 对话历史', settings: '设置' }[page],
          href: target + (page === 'finance' && selected ? '?month=' + selected : '')
        })
      }
    })

    const attachments = []
    for (const ref of input.attachments ?? []) {
      if (ref.kind === 'goal') {
        await guard(domains.goals)
        const goal = await readGoal(ref.id)
        attachments.push({
          ...goal, description: [...goal.description].slice(0, 1200).join(''),
          tasks: goal.tasks.slice(0, OUTLINE_ATTACHMENT), source: goalSource(goal)
        })
      } else {
        await guard(domains.notes)
        const item = await note(ref.id)
        attachments.push({
          title: item.title, body: [...item.body].slice(0, 2500).join(''), source: noteSource(item)
        })
      }
    }

    const selectedHistory: ModelMessage[] = []
    let characters = 0
    for (const message of [...history].reverse()) {
      if (characters + message.text.length > 9000) break
      characters += message.text.length
      usedDomains |= message.domains
      selectedHistory.unshift({ role: message.role, content: message.text })
    }
    const messages: ModelMessage[] = [...selectedHistory, {
      role: 'user', content: JSON.stringify({ text: input.text, context: input.pageContext, attachments })
    }]

    const streaming = streamText({
      model: provider.languageModel,
      system: systemPrompt + '\n账号日期 ' + currentDate + '，时区 ' + started.timezone + '，语言 ' + started.language,
      messages, tools, abortSignal: abort.signal, maxRetries: 0, maxOutputTokens: 1000,
      onError: () => {},
      stopWhen: [stepCountIs(4), () => Boolean(runtime.snapshot.proposalId)],
      prepareStep: async ({ messages: stepMessages }) => {
        if (JSON.stringify(stepMessages).length > INPUT_BUDGET) throw fault(503, 'AI_INPUT_BUDGET', '输入内容超出预算')
        await guard(usedDomains)
      },
      providerOptions: provider.deepseek ? { deepseek: { thinking: { type: 'disabled' } } } : undefined
    })

    let buffer = ''
    let lastEvent = 0
    for await (const part of streaming.fullStream) {
      if (part.type === 'error' || part.type === 'tool-error') throw part.error
      if (part.type !== 'text-delta') continue
      await guard(usedDomains)
      buffer += part.text
      runtime.snapshot.text += part.text
      const now = Date.now()
      if (now - lastEvent > 55) {
        registry.publish(runtime, 'text_delta', { delta: buffer, offset: runtime.snapshot.text.length - buffer.length })
        buffer = ''
        lastEvent = now
      }
    }
    if (abort.signal.aborted) throw new Error('aborted')
    if (!runtime.snapshot.text && !runtime.snapshot.proposalId && runtime.snapshot.sources.length === 0) {
      throw fault(503, 'AI_EMPTY', '模型未返回内容')
    }
  } catch (error) {
    status = abort.signal.aborted && !timeout ? 'cancelled' : 'failed'
    errorCode = timeout ? 'AI_TIMEOUT' : codeOf(error) ||
      (APICallError.isInstance(error)
        ? error.statusCode === 429 ? 'AI_RATE_LIMITED'
          : error.statusCode === 401 || error.statusCode === 403 ? 'AI_PROVIDER_AUTH' : 'AI_PROVIDER_ERROR'
        : status === 'cancelled' ? 'AI_CANCELLED' : 'AI_PROVIDER_ERROR')
  } finally {
    clearTimeout(deadline)
    try {
      runtime.snapshot = await finishRun(runId, status, errorCode,
        runtime.snapshot.text, runtime.snapshot.sources, usedDomains)
    } catch {
      runtime.snapshot = { ...runtime.snapshot, status: 'interrupted', errorCode: 'AI_INTERRUPTED' }
    }
    registry.publish(runtime, runtime.snapshot.status === 'completed' ? 'done' : 'error')
  }
}
