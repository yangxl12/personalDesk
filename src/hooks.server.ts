import { randomUUID } from 'node:crypto'
import { json } from '@sveltejs/kit'
import type { Handle } from '@sveltejs/kit/hooks'
import { identify } from '#lib/server/auth/session'

export const handle: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname
  const health = path === '/health/live' || path === '/health/ready'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && event.request.headers.get('origin') !== event.url.origin) {
    return json({ error: { code: 'INVALID_ORIGIN', message: '请求来源无效', requestId: randomUUID() } },
      { status: 403, headers: { 'cache-control': 'private, no-store' } })
  }
  if (!health) {
    try {
      await identify(event)
    } catch {
      return path.startsWith('/api/')
        ? json({ error: { code: 'DATABASE_UNAVAILABLE', message: '数据服务暂不可用', requestId: randomUUID() } },
          { status: 503, headers: { 'cache-control': 'private, no-store' } })
        : new Response('数据服务暂不可用', { status: 503, headers: { 'cache-control': 'private, no-store' } })
    }
  }
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      if (!event.locals.user) return html
      return html.replace('<html lang="zh-CN" data-theme="system">', () => {
        const theme = event.locals.preferences?.theme ?? 'system'
        const language = event.locals.preferences?.language ?? 'zh-CN'
        return '<html lang="' + language + '" data-theme="' + theme + '">'
      })
    }
  })
  response.headers.set('cache-control', 'private, no-store')
  response.headers.set('referrer-policy', 'same-origin')
  response.headers.set('x-content-type-options', 'nosniff')
  if (event.url.protocol === 'https:') response.headers.set('strict-transport-security', 'max-age=31536000')
  return response
}
