import { z } from 'zod'
import { inputs, id as idSchema, type Revisions } from '#lib/contracts/workspace'
import { sendInput } from '#lib/contracts/ai'
import { toRequestError } from '#lib/errors'
import {
  deleteConfiguration, deleteModelInput, modelSettings, modelStatus, saveConfiguration, selectConfiguration,
  selectionInput, testConfiguration
} from './ai/model'
import { abortConversation } from './ai/runtime'
import { chat, chats, decide, deleteChat, messages as chatMessages, proposal } from './store/chats'
import {
  apply, dashboard, fault, finance, financeOptions, goalById, goalOptions, goalTasks, goals, notFound, note, notes,
  pageOptions, preferences, revisions, savings
} from './store/workspace'
import { backupNotice, dismissBackupNotice, exportBackup, importBackup, inspect } from './store/transfer'

type Result<T> = { data: T; revisions?: Revisions }

const ok = <T>(data: unknown): Result<T> => ({ data: data as T })
const applied = <T>(result: { data: unknown; revisions?: Revisions }): Result<T> =>
  ({ data: result.data as T, revisions: result.revisions })

const mutations: Record<string, keyof typeof inputs> = {
  'POST goals': 'goalCreate', 'PATCH goals/:id': 'goalUpdate', 'DELETE goals/:id': 'goalDelete',
  'POST goals/:id/tasks': 'taskCreate', 'PATCH tasks/:id': 'taskUpdate', 'DELETE tasks/:id': 'taskDelete',
  'POST notes': 'noteCreate', 'PATCH notes/:id': 'noteUpdate', 'DELETE notes/:id': 'noteDelete',
  'POST transactions': 'transactionCreate', 'PATCH transactions/:id': 'transactionUpdate',
  'DELETE transactions/:id': 'transactionDelete',
  'PATCH savings': 'savingsUpdate', 'PATCH preferences': 'preferencesUpdate'
}

function resourceId(value: string | undefined) {
  const parsed = idSchema.safeParse(value)
  if (!parsed.success) throw notFound()
  return parsed.data
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw fault(422, 'INVALID_FIELDS', '请检查填写的内容')
  return result.data
}

function fileOf(body: unknown) {
  const text = (body as { file?: unknown } | null)?.file
  if (typeof text !== 'string') throw fault(422, 'INVALID_IMPORT', '请选择有效的备份文件')
  return text
}

// 把原来的 REST 路径映射到本地仓储。界面层继续用同一套字符串，改动面为零。
export async function dispatch<T>(method: string, pathname: string, query: URLSearchParams, body: unknown): Promise<Result<T>> {
  try {
    return await route<T>(method, pathname.split('/').filter(Boolean), query, body)
  } catch (failure) {
    throw toRequestError(failure)
  }
}

async function route<T>(method: string, segments: string[], query: URLSearchParams, body: unknown): Promise<Result<T>> {
  const [resource, first, second, action] = segments
  if (!resource) throw notFound()

  if (resource === 'dashboard' && method === 'GET' && !first) return ok<T>(await dashboard())
  if (resource === 'revisions' && method === 'GET' && !first) {
    return ok<T>({ ...await revisions(), model: (await modelStatus()).version })
  }
  if (resource === 'savings' && method === 'GET' && !first) return ok<T>(await savings())
  if (resource === 'preferences' && method === 'GET' && !first) return ok<T>(await preferences())
  if (resource === 'transactions' && method === 'GET' && !first) return ok<T>(await finance(financeOptions(query)))
  if (resource === 'notes' && method === 'GET' && !first) return ok<T>(await notes(pageOptions(query)))
  if (resource === 'notes' && method === 'GET' && first && !second) return ok<T>(await note(resourceId(first)))
  if (resource === 'goals' && method === 'GET' && !first) return ok<T>(await goals(goalOptions(query)))
  if (resource === 'goals' && method === 'GET' && first && !second) return ok<T>(await goalById(resourceId(first)))
  if (resource === 'goals' && method === 'GET' && first && second === 'tasks' && !action) {
    return ok<T>(await goalTasks(resourceId(first)))
  }

  if (resource === 'backup' && first === 'status' && method === 'GET') return ok<T>(await backupNotice())
  if (resource === 'backup' && first === 'dismiss' && method === 'POST') return ok<T>(await dismissBackupNotice())

  if (resource === 'data' && first === 'export' && method === 'GET') return ok<T>(await exportBackup())
  if (resource === 'data' && first === 'import' && method === 'POST' && !second) {
    return ok<T>(inspect(fileOf(body)))
  }
  if (resource === 'data' && first === 'import' && method === 'POST' && second === 'apply') {
    const mode = (body as { mode?: unknown } | null)?.mode === 'merge' ? 'merge' : 'replace'
    const { data } = inspect(fileOf(body))
    return applied<T>(await importBackup(data, mode))
  }

  if (resource === 'conversations' && method === 'GET' && !first) return ok<T>(await chats(pageOptions(query)))
  if (resource === 'conversations' && method === 'GET' && first && !second) return ok<T>(await chat(resourceId(first)))
  if (resource === 'conversations' && method === 'GET' && first && second === 'messages' && !action) {
    const { limit } = pageOptions(query)
    const before = query.has('before') ? Number(query.get('before')) : Number.MAX_SAFE_INTEGER
    if (!Number.isSafeInteger(before) || before < 1) throw fault(400, 'INVALID_QUERY', '分页参数无效')
    return ok<T>(await chatMessages(resourceId(first), limit, before))
  }
  if (resource === 'conversations' && method === 'DELETE' && first && !second) {
    const conversationId = resourceId(first)
    const result = await deleteChat(conversationId)
    abortConversation(conversationId)
    return applied<T>(result)
  }

  if (resource === 'ai') {
    if (first === 'settings') {
      if (!second && method === 'GET') return ok<T>(await modelSettings())
      if (!second && method === 'PATCH') return ok<T>(await saveConfiguration(body))
      if (second === 'active' && method === 'PATCH') return ok<T>(await selectConfiguration(parse(selectionInput, body)))
      if (second === 'test' && method === 'POST') {
        const { testModel } = await import('./ai/provider')
        await testModel(await testConfiguration(body))
        return ok<T>(null)
      }
      if (second && method === 'DELETE') {
        const { version } = parse(deleteModelInput, body)
        return ok<T>(await deleteConfiguration(resourceId(second), version))
      }
      throw notFound()
    }
    if (first === 'runs') {
      const ai = await import('./ai/run')
      if (!second && method === 'POST') {
        const { revisions: changed, created: _created, ...receipt } = await ai.start(parse(sendInput, body))
        return { data: receipt as T, revisions: changed }
      }
      if (second && method === 'GET' && !action) return ok<T>(await ai.snapshot(resourceId(second)))
      if (second && method === 'POST' && action === 'retry') {
        const { revisions: changed, created: _created, ...receipt } = await ai.retry(resourceId(second))
        return { data: receipt as T, revisions: changed }
      }
      if (second && method === 'POST' && action === 'cancel') {
        return ok<T>(await ai.cancel(resourceId(second)))
      }
      throw notFound()
    }
    if (first === 'proposals' && second) {
      if (method === 'GET' && !action) return ok<T>(await proposal(resourceId(second)))
      if (method === 'POST' && action === 'decision') {
        const { decision } = parse(z.strictObject({ decision: z.enum(['approve', 'reject']) }), body)
        return applied<T>(await decide(resourceId(second), decision))
      }
      throw notFound()
    }
    throw notFound()
  }

  const route = [resource, first ? ':id' : '', second].filter(Boolean).join('/')
  const operation = mutations[method + ' ' + route]
  if (!operation) throw notFound()
  const input = inputs[operation].safeParse(body)
  if (!input.success) {
    throw fault(422, 'INVALID_FIELDS', '请检查填写的内容',
      Object.fromEntries(input.error.issues.map(issue => [issue.path.join('.'), issue.message])))
  }
  return applied<T>(await apply(operation, first ? resourceId(first) : null, input.data))
}
