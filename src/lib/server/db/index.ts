import { Worker } from 'node:worker_threads'
import { resolve } from 'node:path'
import type { Chat, Message, Proposal, RunReceipt, RunSnapshot, RunStatus, SendInput, Source } from '#lib/contracts/ai'
import type { Dashboard, Finance, Goal, GoalTask, List, Note, NoteSummary, Preferences, Revisions, Savings } from '#lib/contracts/workspace'

export type PageOptions = { cursor?: string; limit?: number }
export type GoalOptions = PageOptions & { status?: 'all' | 'active' | 'done' }
export type Mutation = { data: Record<string, unknown>; revisions: Revisions; replayed?: boolean }
type Started = RunReceipt & { created: boolean; revisions?: Revisions }
type AiGoal = { id: string; title: string; description: string; done: number; total: number;
  tasks: { id: string; title: string; done: number }[]; truncated: boolean }
type Account = { id: string; username: string }
type Methods = {
  ready: [[], true]
  hasAccount: [[], boolean]
  register: [[string, string], Account | null]
  loginAttempt: [[string, string], { limited: boolean; user?: Account & { password_hash: string } }]
  createSession: [[string, string, string], boolean]
  session: [[string], Account | null]
  revoke: [[string], void]
  preferences: [[string], Preferences]
  revisions: [[string], Revisions]
  dashboard: [[string], Dashboard]
  goals: [[string, GoalOptions], List<Goal>]
  goal: [[string, string], Goal]
  goalPage: [[string, string], { goal: Goal; tasks: GoalTask[] }]
  goalTasks: [[string, string], GoalTask[]]
  notes: [[string, PageOptions], List<NoteSummary>]
  note: [[string, string], Note]
  finance: [[string, PageOptions & { month?: string }], Finance]
  savings: [[string], Savings]
  mutate: [[string, string, string, string | null, object], Mutation]
  chats: [[string, PageOptions], List<Chat>]
  chat: [[string, string], Chat]
  messages: [[string, string, number, number], { chat: Chat; items: Message[]; before: number | null }]
  deleteChat: [[string, string, number, string], { data: { id: string; runId: string | null }; revisions: Revisions }]
  startAi: [[string, string, SendInput, string, number], Started]
  retryAi: [[string, string, string, string, number, string?], Started]
  runSnapshot: [[string, string], RunSnapshot]
  claimAi: [[string, string], { input: SendInput; preferences: Preferences; history: { role: 'user' | 'assistant'; text: string; domains: number }[] } | null]
  guardAi: [[string, string, number], true]
  flushAi: [[string, string, string, Source[], number], void]
  finishAi: [[string, string, RunStatus, string | null, string, Source[], number], RunSnapshot]
  cancelAi: [[string, string, string], RunSnapshot]
  findAiGoals: [[string, string, string, 'all' | 'active' | 'done'], { items: { id: string; title: string; total_tasks: number; done_tasks: number }[]; truncated: boolean }]
  aiGoal: [[string, string, string], AiGoal]
  findAiNotes: [[string, string, string, number], { items: NoteSummary[]; truncated: boolean }]
  aiNote: [[string, string, string], Note]
  aiFinance: [[string, string, string], Pick<Finance, 'month' | 'totals' | 'savings'>]
  proposeTask: [[string, string, string, boolean], Proposal | { unchanged: true }]
  proposal: [[string, string], Proposal]
  importStatus: [[string, string], { duplicate: boolean; populated: boolean }]
  importDemo: [[string, string, Record<string, number>, object], { data: { counts: Record<string, number>; duplicate: boolean }; revisions?: Revisions }]
  exportData: [[string], object]
  decideAi: [[string, string, 'approve' | 'reject', string], { data: Proposal; revisions?: Revisions }]
}

export class DatabaseError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: unknown) {
    super(message)
  }
}

type Pending = { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
type Reply = { id: number; data?: unknown; fault?: { status: number; code: string; message: string; fields?: unknown } }
let worker: Worker | undefined
let sequence = 0
const pending = new Map<number, Pending>()

function unavailable() {
  return new DatabaseError(503, 'DATABASE_UNAVAILABLE', '数据服务暂不可用')
}

function start() {
  const current = new Worker(resolve('src/lib/server/db/worker.mjs'))
  const stop = () => {
    if (worker !== current) return
    worker = undefined
    for (const request of pending.values()) request.reject(unavailable())
    pending.clear()
  }
  current.on('error', (error: Error) => {
    console.error('Database worker failed', error.message)
    stop()
  })
  current.on('exit', stop)
  current.on('message', ({ id, data, fault }: Reply) => {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    if (fault) request.reject(new DatabaseError(fault.status, fault.code, fault.message, fault.fields))
    else request.resolve(data)
    if (pending.size === 0) current.unref()
  })
  return current
}

export function database<K extends keyof Methods>(method: K, ...args: Methods[K][0]): Promise<Methods[K][1]> {
  if (pending.size >= 250) return Promise.reject(unavailable())
  const active = worker ??= start()
  const id = ++sequence
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: value => resolve(value as Methods[K][1]), reject })
    active.ref()
    try {
      active.postMessage({ id, method, args })
    } catch (error) {
      pending.delete(id)
      if (pending.size === 0) active.unref()
      reject(error)
    }
  })
}
