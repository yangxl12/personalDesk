import { randomUUID } from 'node:crypto'
import { error, json, redirect, type RequestEvent } from '@sveltejs/kit'
import { z } from 'zod'
import { id, month } from '#lib/contracts/workspace'
import { DatabaseError, type GoalOptions } from '#lib/server/db'

export function requirePage(locals: App.Locals) {
  if (!locals.user) redirect(303, '/login')
  return locals.user.id
}

export async function readPage<T>(request: Promise<T>) {
  try {
    return await request
  } catch (failure) {
    if (failure instanceof DatabaseError && failure.status === 404) error(404, failure.message)
    if (failure instanceof DatabaseError && failure.status === 400) error(400, failure.message)
    error(503, '数据服务暂不可用')
  }
}

export function pageOptions(params: URLSearchParams) {
  const cursor = params.get('cursor') ?? undefined
  const raw = params.get('limit')
  const limit = raw === null ? 30 : Number(raw)
  if ((cursor && (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 512)) ||
    !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DatabaseError(400, 'INVALID_QUERY', '分页参数无效')
  }
  return { cursor, limit }
}

export function goalOptions(params: URLSearchParams): GoalOptions {
  const status = params.get('status') ?? 'all'
  if (status !== 'all' && status !== 'active' && status !== 'done') throw new DatabaseError(400, 'INVALID_QUERY', '目标状态无效')
  return { ...pageOptions(params), status }
}

export function financeOptions(params: URLSearchParams) {
  const selected = params.get('month') ?? undefined
  if (selected !== undefined && !month.safeParse(selected).success) throw new DatabaseError(400, 'INVALID_QUERY', '月份格式无效')
  return { ...pageOptions(params), month: selected }
}

export function resourceId(value: unknown) {
  const result = id.safeParse(value)
  if (!result.success) throw new DatabaseError(404, 'NOT_FOUND', '记录不存在或已删除')
  return result.data
}

export function key(request: Request) {
  const result = z.uuid().safeParse(request.headers.get('idempotency-key'))
  if (!result.success) throw new DatabaseError(400, 'INVALID_KEY', '缺少有效的提交标识')
  return result.data
}

export async function readJson(request: Request, maxBytes = 262_144) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !request.body) {
    throw new DatabaseError(400, 'INVALID_BODY', '需要 JSON 请求')
  }
  const chunks: Uint8Array[] = []
  const reader = request.body.getReader()
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > maxBytes) {
        await reader.cancel()
        throw new DatabaseError(413, 'BODY_TOO_LARGE', '内容过长')
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks, length).toString('utf8')) as unknown
  } catch (failure) {
    if (failure instanceof DatabaseError) throw failure
    throw new DatabaseError(400, 'INVALID_JSON', 'JSON 格式无效')
  } finally {
    reader.releaseLock()
  }
}

export function api(handler: (event: RequestEvent) => Promise<Response>) {
  return async (event: RequestEvent) => {
    try {
      return await handler(event)
    } catch (failure) {
      const requestId = randomUUID()
      if (failure instanceof DatabaseError) {
        const { status, code, message, fields } = failure
        return json({ error: { code, message, fields, requestId } }, { status })
      }
      console.error('API request failed', requestId, failure instanceof Error ? failure.name : 'UnknownError')
      return json({ error: { code: 'UNAVAILABLE', message: '服务暂不可用', requestId } }, { status: 503 })
    }
  }
}
