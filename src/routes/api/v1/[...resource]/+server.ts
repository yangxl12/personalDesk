import { json, type RequestEvent } from '@sveltejs/kit'
import { dataApi } from '#lib/server/data'
import { chatApi } from '#lib/server/ai/http'
import { modelStatus } from '#lib/server/ai/config'
import { permissionsChanged } from '#lib/server/ai/runs'
import { inputs } from '#lib/contracts/workspace'
import { database, DatabaseError } from '#lib/server/db'
import { signIn, signOut } from '#lib/server/auth/session'
import { api, financeOptions, goalOptions, key, pageOptions, readJson, resourceId } from '#lib/server/http'

type Operation = keyof typeof inputs
const mutations: Record<string, Operation> = {
  'POST goals': 'goalCreate', 'PATCH goals/:id': 'goalUpdate', 'DELETE goals/:id': 'goalDelete',
  'POST goals/:id/items': 'itemCreate', 'PATCH items/:id': 'itemUpdate', 'DELETE items/:id': 'itemDelete',
  'POST items/:id/tasks': 'taskCreate', 'PATCH tasks/:id': 'taskUpdate', 'DELETE tasks/:id': 'taskDelete',
  'POST notes': 'noteCreate', 'PATCH notes/:id': 'noteUpdate', 'DELETE notes/:id': 'noteDelete',
  'POST transactions': 'transactionCreate', 'PATCH transactions/:id': 'transactionUpdate', 'DELETE transactions/:id': 'transactionDelete',
  'PATCH savings': 'savingsUpdate', 'PATCH preferences': 'preferencesUpdate'
}

const handler = api(async (event: RequestEvent) => {
  const segments = (event.params.resource ?? '').split('/')
  const [resource, id, child, ...rest] = segments
  const { method } = event.request
  const { searchParams } = event.url
  const send = (data: unknown, status = 200) => json({ data }, { status })
  if (resource === 'session' && !id) {
    if (method === 'POST') {
      const body = await readJson(event.request) as { username?: unknown; password?: unknown } | null
      return send(await signIn(event, body?.username, body?.password), 201)
    }
    if (method === 'DELETE') {
      await signOut(event)
      return send(null)
    }
  }
  const user = event.locals.user?.id
  if (!user) throw new DatabaseError(401, 'AUTH_REQUIRED', '请先登录')
  if (resource === 'data' || resource === 'imports') return dataApi(event, user, segments.join('/'))
  if (resource === 'ai' || resource === 'conversations') {
    if (segments.length > 4 || segments.some(part => !part)) throw new DatabaseError(404, 'NOT_FOUND', '接口不存在')
    return chatApi(event, user, segments)
  }
  if (rest.length) throw new DatabaseError(404, 'NOT_FOUND', '接口不存在')
  const route = [resource, id ? ':id' : '', child].filter(Boolean).join('/')
  if (method === 'GET') {
    switch (route) {
      case 'dashboard': return send(await database('dashboard', user))
      case 'revisions': return send({ ...await database('revisions', user), model: modelStatus().version })
      case 'goals': return send(await database('goals', user, goalOptions(searchParams)))
      case 'goals/:id': return send(await database('goal', user, resourceId(id)))
      case 'goals/:id/items': return send(await database('items', user, resourceId(id), pageOptions(searchParams)))
      case 'items/:id/tasks': return send(await database('tasks', user, resourceId(id), pageOptions(searchParams)))
      case 'notes': return send(await database('notes', user, pageOptions(searchParams)))
      case 'notes/:id': return send(await database('note', user, resourceId(id)))
      case 'transactions': return send(await database('finance', user, financeOptions(searchParams)))
      case 'savings': return send(await database('savings', user))
      case 'preferences': return send(await database('preferences', user))
    }
  }
  const operation = mutations[method + ' ' + route]
  if (!operation) throw new DatabaseError(404, 'NOT_FOUND', '接口不存在')
  const requestKey = key(event.request)
  const ref = id ? resourceId(id) : null
  const input = inputs[operation].safeParse(await readJson(event.request))
  if (!input.success) {
    const fields = Object.fromEntries(input.error.issues.map(issue => [issue.path.join('.'), issue.message]))
    throw new DatabaseError(422, 'INVALID_FIELDS', '请检查填写的内容', fields)
  }
  const previous = operation === 'preferencesUpdate' ? await database('preferences', user) : undefined
  const result = await database('mutate', user, operation, requestKey, ref, input.data)
  if (!result.replayed && previous && previous.ai_version !== result.data.ai_version) permissionsChanged(user)
  return json(result, { status: method === 'POST' ? 201 : 200 })
})

export const GET = handler
export const POST = handler
export const PATCH = handler
export const DELETE = handler
