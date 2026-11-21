import { db, openDb, type GoalRow, type ItemRow, type NoteRow, type TaskRow, type TombstoneRow, type TransactionRow } from '#lib/local/db'
import type { Preferences, Savings } from '#lib/contracts/workspace'
import { write } from '#lib/local/tx'
import { bump } from '#lib/local/store/workspace'
import { randomId } from '#lib/random-id'
import { mergePayloads, type SyncData, type SyncPayload } from './merge'

export type { SyncData, SyncPayload } from './merge'

// 同步只碰这几张表。AI 会话、消息、模型配置（明文 API Key）永久排除。
export type SyncConfig = {
  token: string
  owner: string
  repo: string
  path: string
}

export type SyncReport = {
  rev: number
  pushed: boolean
  conflicts: number
  at: number
}

export class SyncError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'SyncError'
  }
}

const ENDPOINT = 'https://api.github.com'
const CONFIG_KEY = 'buxu:sync:config'
const DEVICE_KEY = 'buxu:sync:device'
const REV_KEY = 'sync:rev'
const AT_KEY = 'sync:lastAt'
const CONFLICT_KEY = 'sync:conflicts'
const FORMAT = 'buxu-sync' as const
const MODULES = ['goals', 'notes', 'finance', 'preferences']

export function readConfig(): SyncConfig | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<SyncConfig>
    if (!value.token || !value.owner || !value.repo) return null
    return {
      token: value.token,
      owner: value.owner,
      repo: value.repo,
      path: value.path?.trim() || 'sync.json'
    }
  } catch {
    return null
  }
}

export function saveConfig(config: SyncConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    token: config.token.trim(),
    owner: config.owner.trim(),
    repo: config.repo.trim(),
    path: config.path.trim() || 'sync.json'
  }))
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY)
}

// 设备标识只在同步记录里标明来源，不参与冲突判定。
export function deviceId(): string {
  let value = localStorage.getItem(DEVICE_KEY)
  if (!value) {
    value = randomId()
    localStorage.setItem(DEVICE_KEY, value)
  }
  return value
}

async function snapshot(): Promise<SyncData & { tombstones: TombstoneRow[] }> {
  const [goals, items, tasks, notes, transactions, savings, preferences, tombstones] = await Promise.all([
    db.goals.toArray(), db.items.toArray(), db.tasks.toArray(), db.notes.toArray(),
    db.transactions.toArray(), db.savings.get('default'), db.preferences.get('default'), db.tombstones.toArray()
  ])
  return {
    goals, items, tasks, notes, transactions, tombstones,
    savings: savings
      ? {
        id: 'default', current_cents: savings.current_cents,
        target_cents: savings.target_cents, version: savings.version
      } satisfies Savings & { id: string }
      : null,
    preferences: preferences
      ? {
        id: 'default', theme: preferences.theme, language: preferences.language,
        timezone: preferences.timezone, ai_goals: preferences.ai_goals, ai_notes: preferences.ai_notes,
        ai_finance: preferences.ai_finance, ai_version: preferences.ai_version, version: preferences.version
      } satisfies Preferences & { id: string }
      : null
  }
}

function target(config: SyncConfig) {
  const path = config.path.split('/').map(encodeURIComponent).join('/')
  return `${ENDPOINT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`
}

function call(config: SyncConfig, init: RequestInit) {
  return fetch(target(config), {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'content-type': 'application/json' } : {})
    }
  })
}

function httpFault(response: Response): SyncError {
  if (response.status === 401) return new SyncError('TOKEN', 'Token 无效或没有访问该仓库的权限')
  if (response.status === 403) {
    // 403 不只代表限流：细粒度令牌没勾 Contents 读写、没勾选仓库，classic 令牌没勾 repo
    // 都走这里。用限流响应头区分，别让「权限配错了」的用户去等一个不存在的限流窗口。
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      return new SyncError('RATE', 'GitHub 拒绝了这次请求，触发了限流，稍等一分钟再试')
    }
    return new SyncError('SCOPE', 'Token 没有这个仓库或其内容的读写权限，检查令牌的仓库授权和 Contents 权限')
  }
  if (response.status === 404) return new SyncError('REPO', '找不到仓库或文件，检查用户名和仓库名，以及 Token 是否授权了这个仓库')
  if (response.status === 409 || response.status === 422) return new SyncError('CONFLICT', '另一端刚刚推送过相同文件')
  return new SyncError('HTTP', `GitHub 返回 ${response.status}`)
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function list<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return []
  // id 和 version 一起验：version 非数字的坏行进库后，合并比较会得到 NaN，
  // 把版本链整个污染掉，再也无法收敛。
  return value.filter(item => !!item && typeof item === 'object'
    && typeof (item as { id?: unknown }).id === 'string'
    && typeof (item as { version?: unknown }).version === 'number') as T[]
}

function single<T extends { version: number }>(value: unknown): T | null {
  if (!value || typeof value !== 'object') return null
  return typeof (value as { version?: unknown }).version === 'number' ? value as T : null
}

// 实体行的主键是 id，墓碑的主键是 key，两者不能共用同一个过滤器。
// 这里曾经复用 list()，结果墓碑因为「没有 id」被整批丢掉，删除就传不到另一端。
function graves(value: unknown): TombstoneRow[] {
  if (!Array.isArray(value)) return []
  return value.filter(item => {
    if (!item || typeof item !== 'object') return false
    const row = item as Record<string, unknown>
    return typeof row.key === 'string' && typeof row.table === 'string'
      && typeof row.record_id === 'string' && typeof row.deleted_at === 'number'
  }) as TombstoneRow[]
}

function parse(raw: unknown): SyncPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.format !== FORMAT) return null
  const data = (value.data ?? {}) as Record<string, unknown>
  return {
    format: FORMAT,
    rev: Number(value.rev) || 0,
    deviceId: typeof value.deviceId === 'string' ? value.deviceId : '',
    updatedAt: Number(value.updatedAt) || 0,
    data: {
      goals: list<GoalRow>(data.goals),
      items: list<ItemRow>(data.items),
      tasks: list<TaskRow>(data.tasks),
      notes: list<NoteRow>(data.notes),
      transactions: list<TransactionRow>(data.transactions),
      savings: single<Savings & { id: string }>(data.savings),
      preferences: single<Preferences & { id: string }>(data.preferences)
    },
    tombstones: graves(value.tombstones)
  }
}

async function pull(config: SyncConfig): Promise<{ payload: SyncPayload | null; sha: string | null }> {
  const response = await call(config, { method: 'GET' })
  if (response.status === 404) return { payload: null, sha: null }
  if (!response.ok) throw httpFault(response)
  const body = await response.json() as { content?: string; encoding?: string; sha: string; size?: number }
  if (!body.content || body.encoding !== 'base64') {
    if (!body.size) return { payload: null, sha: body.sha }
    // Contents API 对超过 1 MB 的文件不再内联返回，个人数据正常到不了这个量级。
    throw new SyncError('TOO_LARGE', '同步文件超过 1 MB，GitHub 无法内联传输')
  }
  let parsed: SyncPayload | null = null
  try {
    parsed = parse(JSON.parse(decodeBase64(body.content)))
  } catch {
    parsed = null
  }
  if (!parsed) throw new SyncError('FORMAT', '同步文件内容无法识别，请检查仓库里的记录')
  return { payload: parsed, sha: body.sha }
}

async function push(config: SyncConfig, payload: SyncPayload, sha: string | null) {
  const response = await call(config, {
    method: 'PUT',
    body: JSON.stringify({
      message: `sync rev ${payload.rev} · ${new Date(payload.updatedAt).toISOString().slice(0, 16).replace('T', ' ')}`,
      content: encodeBase64(JSON.stringify(payload)),
      ...(sha ? { sha } : {})
    })
  })
  if (!response.ok) throw httpFault(response)
}

// 调用点必须已在 write() 事务里：persist 自己不开事务，
// 快照、合并、落库同属一个事务才能消灭写入丢失窗口。
async function persist(data: SyncData, tombstones: TombstoneRow[]) {
  await db.goals.clear()
  await db.goals.bulkPut(data.goals)
  await db.items.clear()
  await db.items.bulkPut(data.items)
  await db.tasks.clear()
  await db.tasks.bulkPut(data.tasks)
  await db.notes.clear()
  await db.notes.bulkPut(data.notes)
  await db.transactions.clear()
  await db.transactions.bulkPut(data.transactions)
  if (data.savings) await db.savings.put({ ...data.savings, id: 'default' })
  if (data.preferences) await db.preferences.put({ ...data.preferences, id: 'default' })
  await db.tombstones.clear()
  await db.tombstones.bulkPut(tombstones)
}

async function recordSuccess(rev: number, conflicts: number, at: number) {
  await db.meta.bulkPut([
    { key: REV_KEY, value: rev }, { key: AT_KEY, value: at }, { key: CONFLICT_KEY, value: conflicts }
  ])
}

// 定时拉取时绝大多数情况两边完全一致，那就什么都不写。
// 判定用 id + version（墓碑用 key + deleted_at），比逐字段深比较便宜，也够用：
// 同版本的内容冲突由 mergePayloads 单独计入 conflicts。
function sameAsLocal(data: SyncData, tombstones: TombstoneRow[], local: SyncData & { tombstones: TombstoneRow[] }) {
  const rows = (left: { id: string; version: number }[], right: { id: string; version: number }[]) => {
    if (left.length !== right.length) return false
    const index = new Map(right.map(row => [row.id, row.version]))
    return left.every(row => index.get(row.id) === row.version)
  }
  const graves = (left: TombstoneRow[], right: TombstoneRow[]) => {
    if (left.length !== right.length) return false
    const index = new Map(right.map(row => [row.key, row.deleted_at]))
    return left.every(row => index.get(row.key) === row.deleted_at)
  }
  return rows(data.goals, local.goals) && rows(data.items, local.items)
    && rows(data.tasks, local.tasks) && rows(data.notes, local.notes)
    && rows(data.transactions, local.transactions)
    && graves(tombstones, local.tombstones)
    && (data.savings?.version ?? 0) === (local.savings?.version ?? 0)
    && (data.preferences?.version ?? 0) === (local.preferences?.version ?? 0)
}

async function refresh() {
  const revisions: Record<string, number> = {}
  // 四个模块的 bump 收进一个事务：省三次事务开销，也保证四份修订号原子地一起生效。
  await write(async () => {
    for (const module of MODULES) revisions[module] = await bump(module)
  })
  // 用独立事件名，既避开同步自己写库又触发一次「有本地改动」的调度，
  // 也让 engine 不必依赖 SvelteKit 的导航层，纯逻辑可以单测。
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('buxu:sync-applied', { detail: revisions }))
  }
}

// 墓碑在 push 成功后再清：远端确认收到这批墓碑，本地就不必永远背着。
// 窗口给一年——更久没同步过的设备重新上线时可能把已删的行带回来，
// 但个人双设备一年不同步再上线的概率，比墓碑表无限膨胀的代价小得多。
const GRAVE_MS = 365 * 86_400_000

async function gcTombstones(cutoff: number) {
  await db.tombstones.where('deleted_at').below(cutoff).delete()
}

async function execute(): Promise<SyncReport> {
  const config = readConfig()
  if (!config) throw new SyncError('CONFIG', '还没有配置同步')
  await openDb()

  let last: SyncError | null = null
  let refreshed = false
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await pull(config)
      const at = Date.now()
      // 快照、合并、落库包在同一个 write() 事务里，两个网络交互（pull/push）都在事务外。
      // 事务内只剩毫秒级的本地读写：同步进行中的用户写入要么被事务挡在外面（等它完成），
      // 要么就包含在快照里随合并一起算账，不会再被 persist 的 clear() 误删。
      const outcome = await write(async () => {
        const local = await snapshot()
        const plan = mergePayloads(remote.payload, local)
        const changed = plan.conflicts > 0 || !sameAsLocal(plan.data, plan.tombstones, local)
        if (changed) await persist(plan.data, plan.tombstones)
        const rev = (remote.payload?.rev ?? 0) + (plan.adopted > 0 ? 1 : 0)
        if (plan.adopted === 0) await recordSuccess(rev, plan.conflicts, at)
        return { plan, rev, changed }
      })
      refreshed ||= outcome.changed
      if (outcome.plan.adopted === 0) {
        return { rev: outcome.rev, pushed: false, conflicts: outcome.plan.conflicts, at }
      }

      const cutoff = at - GRAVE_MS
      const payload: SyncPayload = {
        format: FORMAT, rev: outcome.rev, deviceId: deviceId(),
        updatedAt: at, data: outcome.plan.data,
        tombstones: outcome.plan.tombstones.filter(row => row.deleted_at >= cutoff)
      }
      try {
        await push(config, payload, remote.sha)
        await recordSuccess(outcome.rev, outcome.plan.conflicts, at)
        await gcTombstones(cutoff)
        return { rev: outcome.rev, pushed: true, conflicts: outcome.plan.conflicts, at }
      } catch (failure) {
        // sha 对不上说明另一端在这几秒里推过，重新拉一次再合并，最多三轮。
        if (failure instanceof SyncError && failure.code === 'CONFLICT' && attempt < 2) {
          last = failure
          continue
        }
        throw failure
      }
    }
    throw last ?? new SyncError('CONFLICT', '另一端持续在写，稍后再试')
  } finally {
    if (refreshed) await refresh()
  }
}

let inflight: Promise<SyncReport> | null = null

// 并发的自动/手动触发合并成一次，避免两个请求拿同一个 sha 去推。
export function runSync(): Promise<SyncReport> {
  inflight ??= execute().finally(() => { inflight = null })
  return inflight
}

export async function syncStatus() {
  await openDb()
  const [at, conflicts, rev] = await Promise.all([
    db.meta.get(AT_KEY), db.meta.get(CONFLICT_KEY), db.meta.get(REV_KEY)
  ])
  return {
    configured: !!readConfig(),
    lastAt: Number(at?.value ?? 0),
    conflicts: Number(conflicts?.value ?? 0),
    rev: Number(rev?.value ?? 0)
  }
}
