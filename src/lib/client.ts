import { invalidate } from '$app/navigation'
import type { Revisions } from '#lib/contracts/workspace'

export class RequestError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: unknown) {
    super(message)
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<{ data: T; revisions?: Revisions }> {
  const response = await fetch('/api/v1' + path, options)
  let value
  try {
    value = await response.json()
  } catch {
    throw new RequestError(response.status, 'UNAVAILABLE', '服务暂不可用')
  }
  if (!response.ok) {
    throw new RequestError(response.status, value.error?.code, value.error?.message ?? '服务暂不可用', value.error?.fields)
  }
  return value
}

export async function refreshModules(revisions: Revisions) {
  await Promise.all(Object.keys(revisions).map(module => invalidate('buxu:' + module)))
}

export async function refreshModel(version: number) {
  await invalidate('buxu:model')
  window.dispatchEvent(new CustomEvent('buxu:revisions', { detail: { model: version } }))
}

export async function commit<T>(method: string, path: string, body: object, key: string) {
  const response = await request<T>(path, {
    method, headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body)
  })
  if (response.revisions) window.dispatchEvent(new CustomEvent('buxu:revisions', { detail: response.revisions }))
  return response
}

export function nextPage(url: Pick<URL, 'search'>, cursor: string) {
  const query = new URLSearchParams(url.search)
  query.set('cursor', cursor)
  return '?' + query
}
