import { z } from 'zod'
import { deepseekBaseUrl, deepseekModel, type ModelProfile, type ModelSettings, type ModelStatus } from '#lib/contracts/model'
import { db, openDb, type ModelRow } from '../db'
import { randomId } from '#lib/random-id'
import { fault } from '../store/workspace'

const VERSION_KEY = 'model:version'
const ACTIVE_KEY = 'model:active'

const secret = z.string().trim().max(2048).regex(/^[\x21-\x7e]+$/)
const versionSchema = z.number().int().nonnegative()
const fields = {
  provider: z.enum(['deepseek', 'openai-compatible']),
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().max(100).optional(),
  baseUrl: z.string().trim().max(2048)
}
const inputSchema = z.strictObject({
  ...fields, ref: z.uuid().optional(), apiKey: z.union([z.literal(''), secret]), version: versionSchema
})
export const selectionInput = z.strictObject({ ref: z.uuid(), version: versionSchema })
export const deleteModelInput = z.strictObject({ version: versionSchema })

export type Configuration = ModelProfile & { apiKey: string }

function parseBaseUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url : null
  } catch {
    return null
  }
}

// 浏览器里没有 DNS 可查，只挡掉明显不合规的地址：必须是公网 HTTPS，不能是 IP 或 localhost。
function providerUrl(provider: ModelProfile['provider'], value: string) {
  const url = parseBaseUrl(provider === 'deepseek' ? deepseekBaseUrl : value)
  const host = url?.hostname ?? ''
  if (!url || (provider === 'openai-compatible' &&
    (!host.includes('.') || /^[\d.]+$/.test(host) || /^\[/.test(host) || host.endsWith('.localhost')))) {
    throw fault(422, 'AI_INVALID_PROVIDER', '请输入供应商的公网 HTTPS 接口地址')
  }
  return url.href.replace(/\/+$/, '')
}

async function stored() {
  await openDb()
  const [models, version, active] = await Promise.all([
    db.models.toArray(), db.meta.get(VERSION_KEY), db.meta.get(ACTIVE_KEY)
  ])
  return { models, version: Number(version?.value ?? 0), active: typeof active?.value === 'string' ? active.value : null }
}

async function write(work: (state: Awaited<ReturnType<typeof stored>>) => Promise<void>) {
  await db.transaction('rw', [db.models, db.meta], async () => {
    await work(await stored())
  })
}

function settingsOf(models: ModelRow[], active: string | null, version: number): ModelSettings {
  const profiles = models.map(({ ref, provider, id, baseUrl, label }) => ({ ref, provider, id, baseUrl, label }))
  const activeRef = profiles.some(profile => profile.ref === active) ? active : profiles[0]?.ref ?? null
  return { models: profiles, activeRef, version }
}

export async function modelSettings(): Promise<ModelSettings> {
  const { models, active, version } = await stored()
  return settingsOf(models, active, version)
}

export async function modelStatus(): Promise<ModelStatus> {
  try {
    const { models, activeRef, version } = await modelSettings()
    return { models: models.map(({ ref, provider, id, label }) => ({ ref, provider, id, label })), activeRef, version }
  } catch {
    return { models: [], activeRef: null, version: 0 }
  }
}

function prepare(value: unknown, models: ModelRow[], version: number) {
  const result = inputSchema.safeParse(value)
  if (!result.success) throw fault(422, 'INVALID_FIELDS', '请检查模型名称和 API Key')
  if (version !== result.data.version) throw fault(409, 'VERSION_CONFLICT', 'AI 配置已更新，请重新载入')
  const { ref, provider, id, label, baseUrl, apiKey } = result.data
  const existing = ref ? models.find(model => model.ref === ref) : undefined
  if (ref && !existing) throw fault(404, 'AI_MODEL_NOT_FOUND', '该模型配置已删除或不可用')
  const profile = { ref: ref ?? randomId(), provider, id, label: label || undefined, baseUrl: providerUrl(provider, baseUrl) }
  // 接口地址没变时允许留空 API Key，沿用已保存的那一份。
  const key = apiKey || (existing && existing.provider === provider && existing.baseUrl === profile.baseUrl ? existing.apiKey : '')
  if (!secret.safeParse(key).success) throw fault(422, 'AI_KEY_REQUIRED', '请输入有效的 API Key。')
  return { existing, row: { ...profile, apiKey: key } as ModelRow, version }
}

export async function saveConfiguration(value: unknown): Promise<ModelSettings> {
  let next: ModelSettings = { models: [], activeRef: null, version: 0 }
  await write(async state => {
    const { existing, row, version } = prepare(value, state.models, state.version)
    await db.models.put(row)
    const models = existing ? state.models.map(model => model.ref === existing.ref ? row : model) : [...state.models, row]
    const active = state.models.length ? state.active ?? row.ref : row.ref
    await db.meta.put({ key: ACTIVE_KEY, value: active })
    await db.meta.put({ key: VERSION_KEY, value: version + 1 })
    next = settingsOf(models, active, version + 1)
  })
  return next
}

export async function selectConfiguration(value: unknown): Promise<ModelSettings> {
  const parsed = selectionInput.safeParse(value)
  if (!parsed.success) throw fault(422, 'INVALID_FIELDS', '请检查填写的内容')
  let next: ModelSettings = { models: [], activeRef: null, version: 0 }
  await write(async state => {
    if (parsed.data.version !== state.version) throw fault(409, 'VERSION_CONFLICT', 'AI 配置已更新，请重新载入')
    if (!state.models.some(model => model.ref === parsed.data.ref)) {
      throw fault(404, 'AI_MODEL_NOT_FOUND', '该模型配置已删除或不可用')
    }
    const version = state.active === parsed.data.ref ? state.version : state.version + 1
    await db.meta.put({ key: ACTIVE_KEY, value: parsed.data.ref })
    await db.meta.put({ key: VERSION_KEY, value: version })
    next = settingsOf(state.models, parsed.data.ref, version)
  })
  return next
}

export async function deleteConfiguration(ref: string, version: number): Promise<ModelSettings> {
  let next: ModelSettings = { models: [], activeRef: null, version: 0 }
  await write(async state => {
    if (version !== state.version) throw fault(409, 'VERSION_CONFLICT', 'AI 配置已更新，请重新载入')
    if (!state.models.some(model => model.ref === ref)) throw fault(404, 'AI_MODEL_NOT_FOUND', '该模型配置已删除或不可用')
    await db.models.delete(ref)
    const models = state.models.filter(model => model.ref !== ref)
    const active = state.active === ref ? null : state.active
    await db.meta.put({ key: ACTIVE_KEY, value: active ?? '' })
    await db.meta.put({ key: VERSION_KEY, value: version + 1 })
    next = settingsOf(models, active, version + 1)
  })
  return next
}

export async function activeConfiguration(): Promise<Configuration> {
  const { models, active } = await stored()
  const profile = models.find(model => model.ref === active) ?? models[0]
  if (!profile?.apiKey) throw fault(403, 'AI_NOT_CONFIGURED', 'AI 模型尚未配置')
  const { ref, provider, id, baseUrl, label, apiKey } = profile
  return { ref, provider, id, baseUrl, label, apiKey }
}

export async function testConfiguration(value: unknown): Promise<Configuration> {
  const { models, version } = await stored()
  return prepare(value, models, version).row
}
