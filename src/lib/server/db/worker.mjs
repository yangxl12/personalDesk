import { parentPort } from 'node:worker_threads'
import { openDatabase } from './storage.mjs'
import { authQueries } from './auth-queries.mjs'
import { workspaceQueries } from './workspace-queries.mjs'
import { aiQueries } from './ai-queries.mjs'
import { dataQueries } from './data-queries.mjs'
import { Fault } from './fault.mjs'

const db = openDatabase()
const workspace = workspaceQueries(db)
const ai = aiQueries(db, workspace)
ai.recover()
const { apply, ...workspaceCommands } = workspace
const { recover, ...aiCommands } = ai
const queries = { ...authQueries(db), ...workspaceCommands, ...aiCommands, ...dataQueries(db, workspace), ready: () => true }

parentPort.on('message', ({ id, method, args }) => {
  try {
    if (!Object.hasOwn(queries, method)) throw new Error('Unknown database command')
    parentPort.postMessage({ id, data: queries[method](...args) })
  } catch (error) {
    if (error instanceof Fault) {
      parentPort.postMessage({ id, fault: { status: error.status, code: error.code, message: error.message, fields: error.fields } })
      return
    }
    console.error('Database operation failed', method, error.code ?? error.name)
    parentPort.postMessage({ id, fault: { status: 503, code: 'DATABASE_ERROR', message: '数据服务暂不可用' } })
  }
})
