import { createHash } from 'node:crypto'
import { json, type RequestEvent } from '@sveltejs/kit'
import { demoCounts, demoImport } from '#lib/contracts/demo'
import { database, DatabaseError } from '#lib/server/db'
import { key, readJson } from '#lib/server/http'

export async function dataApi(event: RequestEvent, user: string, path: string) {
  if (path === 'data/export' && event.request.method === 'GET') {
    return json(await database('exportData', user), {
      headers: { 'content-disposition': 'attachment; filename="buxu-export.json"' }
    })
  }
  const preview = path === 'imports/demo/preview'
  if (event.request.method !== 'POST' || !(preview || path === 'imports/demo')) {
    throw new DatabaseError(404, 'NOT_FOUND', '接口不存在')
  }
  const submitted = await readJson(event.request, 8 * 1024 * 1024) as { file?: unknown; fingerprint?: string } | null
  if (typeof submitted?.file !== 'string') throw new DatabaseError(422, 'INVALID_IMPORT', '请选择有效的 Demo 导出文件')
  const fingerprint = createHash('sha256').update(submitted.file).digest('hex')
  let contents: unknown
  try {
    contents = JSON.parse(submitted.file)
  } catch {
    throw new DatabaseError(422, 'INVALID_IMPORT', 'Demo 文件的 JSON 格式无效')
  }
  const result = demoImport.safeParse(contents)
  if (!result.success) throw new DatabaseError(422, 'INVALID_IMPORT', 'Demo 文件内容校验失败',
    result.error.issues.slice(0, 10).map(issue => ({ path: issue.path.join('.'), message: issue.message })))
  const counts = demoCounts(result.data)
  if (preview) return json({ data: { fingerprint, counts, ...await database('importStatus', user, fingerprint) } })
  key(event.request)
  if (submitted.fingerprint !== fingerprint) throw new DatabaseError(409, 'IMPORT_FILE_CHANGED', '文件内容已变化，请重新预览')
  return json(await database('importDemo', user, fingerprint, counts, result.data))
}
