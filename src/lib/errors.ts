export class RequestError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: unknown) {
    super(message)
  }
}

type Faultish = { status?: unknown; code?: unknown; message?: unknown; fields?: unknown }

// 仓储层抛的是带 status/code 的普通 Error，这里统一翻译成界面认识的形状。
export function toRequestError(failure: unknown): RequestError {
  if (failure instanceof RequestError) return failure
  const value = (failure ?? {}) as Faultish
  const status = typeof value.status === 'number' ? value.status : 0
  const code = typeof value.code === 'string' ? value.code : ''
  if (status && code) {
    return new RequestError(status, code, typeof value.message === 'string' ? value.message : '请求失败', value.fields)
  }
  return new RequestError(503, 'UNAVAILABLE', '服务暂不可用')
}
