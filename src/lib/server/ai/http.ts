import { json, type RequestEvent } from '@sveltejs/kit'
import { z } from 'zod'
import { modelRef, sendInput } from '#lib/contracts/ai'
import { version } from '#lib/contracts/workspace'
import { database, DatabaseError } from '#lib/server/db'
import { key, pageOptions, readJson, resourceId } from '#lib/server/http'
import { configurationForRun, deleteConfiguration, deleteModelInput, modelSettings, saveConfiguration, selectConfiguration, selectionInput, testConfiguration } from './config'
import { dailyLimit, testModel } from './provider'
import { events, interrupt, launch, snapshot } from './runs'

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new DatabaseError(422, 'INVALID_FIELDS', '请检查填写的内容')
  return result.data
}

export async function chatApi(event: RequestEvent, user: string, segments: string[]) {
  const [resource, first, second, action] = segments
  const method = event.request.method
  const query = event.url.searchParams
  const send = (data: unknown, status = 200) => json({ data }, { status })
  if (resource === 'ai' && first === 'settings') {
    if (method === 'GET' && !second) return send(modelSettings())
    if (method === 'PATCH' && !second) return send(saveConfiguration(await readJson(event.request, 12_000)))
    if (method === 'PATCH' && second === 'active' && !action) {
      return send(selectConfiguration(parse(selectionInput, await readJson(event.request))))
    }
    if (method === 'DELETE' && second && !action) {
      const { version } = parse(deleteModelInput, await readJson(event.request))
      return send(deleteConfiguration(resourceId(second), version))
    }
    if (method === 'POST' && second === 'test' && !action) {
      const settings = testConfiguration(await readJson(event.request, 12_000))
      await testModel(settings, event.request.signal)
      return send(null)
    }
  }
  if (resource === 'conversations') {
    if (method === 'GET' && !first) return send(await database('chats', user, pageOptions(query)))
    const conversation = resourceId(first)
    if (!second && method === 'GET') return send(await database('chat', user, conversation))
    if (second === 'messages' && method === 'GET' && !action) {
      const { limit } = pageOptions(query)
      const before = query.has('before') ? Number(query.get('before')) : Number.MAX_SAFE_INTEGER
      if (!Number.isSafeInteger(before) || before < 1) throw new DatabaseError(400, 'INVALID_QUERY', '分页参数无效')
      return send(await database('messages', user, conversation, limit, before))
    }
    if (!second && method === 'DELETE') {
      const requestKey = key(event.request)
      const body = parse(z.strictObject({ version }), await readJson(event.request))
      const result = await database('deleteChat', user, conversation, body.version, requestKey)
      interrupt(result.data.runId)
      return json(result)
    }
  }
  if (resource === 'ai' && first === 'runs') {
    if (method === 'POST' && !second) {
      const requestKey = key(event.request)
      const input = parse(sendInput, await readJson(event.request))
      const settings = configurationForRun(input.modelRef)
      const { created, revisions, ...receipt } = await database('startAi', user, requestKey, input, settings instanceof DatabaseError ? '' : settings.provider, dailyLimit())
      if (created) launch(user, receipt, settings)
      return json({ data: receipt, revisions }, { status: 202 })
    }
    const run = resourceId(second)
    if (method === 'GET' && !action) return send(await snapshot(user, run))
    if (method === 'GET' && action === 'events') return events(user, run, event.request.signal)
    if (method === 'POST' && (action === 'retry' || action === 'cancel')) {
      const requestKey = key(event.request)
      const body = await readJson(event.request)
      if (action === 'cancel') {
        parse(z.strictObject({}), body)
        const result = await database('cancelAi', user, run, requestKey)
        interrupt(run)
        return send(result)
      }
      const { modelRef: ref } = parse(z.strictObject({ modelRef: modelRef.optional() }), body)
      const settings = configurationForRun(ref)
      const { created, revisions, ...receipt } = await database('retryAi', user, run, requestKey, settings instanceof DatabaseError ? '' : settings.provider, dailyLimit(), ref)
      if (created) launch(user, receipt, settings)
      return json({ data: receipt, revisions }, { status: 202 })
    }
  }
  if (resource === 'ai' && first === 'proposals') {
    const proposal = resourceId(second)
    if (method === 'GET' && !action) return send(await database('proposal', user, proposal))
    if (method === 'POST' && action === 'decision') {
      const requestKey = key(event.request)
      const body = parse(z.strictObject({ decision: z.enum(['approve', 'reject']) }), await readJson(event.request))
      return json(await database('decideAi', user, proposal, body.decision, requestKey))
    }
  }
  throw new DatabaseError(404, 'NOT_FOUND', '接口不存在')
}
