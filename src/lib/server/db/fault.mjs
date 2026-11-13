export class Fault extends Error {
  constructor(status, code, message, fields) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export function missing() {
  throw new Fault(404, 'NOT_FOUND', '记录不存在或已删除')
}

export function conflict(current) {
  throw new Fault(409, 'VERSION_CONFLICT', '记录已在其他位置更新，请核对当前数据后重试', { current })
}
