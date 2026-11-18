import { invalidate } from '$app/navigation'
import type { Revisions } from '#lib/contracts/workspace'
import { dispatch } from '#lib/local/transport'
import { RequestError } from '#lib/errors'

export { RequestError }

// 签名保持不变：调用点照旧传原接口路径，内部换成对 IndexedDB 仓储的分派。
export async function request<T>(path: string, options?: RequestInit): Promise<{ data: T; revisions?: Revisions }> {
  const url = new URL(path, 'http://buxu.local')
  const method = (options?.method ?? 'GET').toUpperCase()
  let body: unknown
  if (typeof options?.body === 'string') {
    try {
      body = JSON.parse(options.body)
    } catch {
      body = undefined
    }
  }
  return dispatch<T>(method, url.pathname, url.searchParams, body)
}

export async function refreshModules(revisions: Revisions) {
  await Promise.all(Object.keys(revisions).map(module => invalidate('buxu:' + module)))
}

export async function refreshModel(version: number) {
  await invalidate('buxu:model')
  window.dispatchEvent(new CustomEvent('buxu:revisions', { detail: { model: version } }))
}

export async function commit<T>(method: string, path: string, body: object, key: string) {
  // 本地单进程没有并发提交，幂等键只保留参数位置，不再落库。
  void key
  const response = await request<T>(path, { method, body: JSON.stringify(body) })
  if (response.revisions) window.dispatchEvent(new CustomEvent('buxu:revisions', { detail: response.revisions }))
  return response
}

export function nextPage(url: Pick<URL, 'search'>, cursor: string) {
  const query = new URLSearchParams(url.search)
  query.set('cursor', cursor)
  return '?' + query
}
