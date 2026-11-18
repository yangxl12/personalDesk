import type { RunSnapshot } from '#lib/contracts/ai'

export type RunEvent = 'snapshot' | 'status' | 'text_delta' | 'sources' | 'proposal' | 'done' | 'error'
export type EventPayload = RunSnapshot & { sequence: number; delta?: string; offset?: number }
export type Listener = (event: RunEvent, payload: EventPayload) => void

export type Runtime = {
  runId: string
  conversationId: string
  messageId: string
  snapshot: RunSnapshot
  sequence: number
  abort: AbortController
  listeners: Set<Listener>
  settled: Promise<void>
}

// 单浏览器单进程，运行态放内存即可。刷新页面等于放弃这次生成。
const active = new Map<string, Runtime>()

export const register = (runtime: Runtime) => active.set(runtime.runId, runtime)
export const drop = (runId: string) => active.delete(runId)
export const get = (runId: string) => active.get(runId)
export const running = () => [...active.values()]
export const runOf = (conversationId: string) =>
  running().find(runtime => runtime.conversationId === conversationId)?.runId ?? null

export function publish(runtime: Runtime, event: RunEvent, payload?: Partial<EventPayload>) {
  runtime.sequence += 1
  const value = { ...runtime.snapshot, ...payload, sequence: runtime.sequence } as EventPayload
  for (const listener of runtime.listeners) listener(event, value)
}

export function abortConversation(conversationId: string) {
  for (const runtime of running()) {
    if (runtime.conversationId === conversationId) runtime.abort.abort()
  }
}
