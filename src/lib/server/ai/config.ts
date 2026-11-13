import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { join } from 'node:path'
import { z } from 'zod'
import { deepseekBaseUrl, deepseekModel, deploymentModelRef, type ModelProfile, type ModelSettings, type ModelStatus } from '#lib/contracts/model'
import { DatabaseError } from '#lib/server/db'
import { dataDir } from '#lib/server/db/storage.mjs'

const configPath = join(dataDir, 'ai-model.json')
const localKeyPath = join(dataDir, 'ai-config.key')
const secret = z.string().trim().max(2048).regex(/^[\x21-\x7e]+$/)
const versionSchema = z.number().int().nonnegative()
const refSchema = z.union([z.uuid(), z.literal(deploymentModelRef)])
const fields = {
  provider: z.enum(['deepseek', 'openai-compatible']),
  id: z.string().trim().min(1).max(200),
  label: z.string().trim().max(100).optional(),
  baseUrl: z.string().trim().max(2048)
}
const inputSchema = z.strictObject({
  ...fields, ref: z.uuid().optional(), apiKey: z.union([z.literal(''), secret]), version: versionSchema
})
const legacySchema = inputSchema.omit({ ref: true })
const encryptedSchema = z.strictObject({ nonce: z.base64url(), tag: z.base64url(), ciphertext: z.base64url() })
const profileSchema = z.strictObject({ ...fields, ref: z.uuid(), credential: encryptedSchema })
const storeSchema = z.strictObject({
  format: z.literal(2), version: versionSchema, activeRef: refSchema.nullable(), models: z.array(profileSchema)
}).refine(store => {
  const refs = new Set(store.models.map(model => model.ref))
  return refs.size === store.models.length &&
    (store.activeRef === null || store.activeRef === deploymentModelRef || refs.has(store.activeRef))
})
export const selectionInput = z.strictObject({ ref: refSchema, version: versionSchema })
export const deleteModelInput = z.strictObject({ version: versionSchema })

type Store = z.infer<typeof storeSchema>
type StoredProfile = z.infer<typeof profileSchema>
export type Configuration = Omit<ModelProfile, 'ref'> & { apiKey: string; managed: boolean }

function readFailure() {
  return new DatabaseError(503, 'AI_CONFIG_READ_FAILED', '无法读取已保存的 AI 配置')
}

function keyFailure() {
  return new DatabaseError(503, 'AI_CONFIG_KEY_FAILED', '无法使用服务端 AI 配置加密密钥')
}

function writeStore(store: Store) {
  const temp = join(dataDir, 'ai-model-' + randomUUID() + '.tmp')
  try {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 })
    writeFileSync(temp, JSON.stringify(store), { mode: 0o600, flag: 'wx', flush: true })
    renameSync(temp, configPath)
  } catch {
    try { rmSync(temp, { force: true }) } catch { /* Preserve the original failure. */ }
    throw new DatabaseError(503, 'AI_CONFIG_WRITE_FAILED', '无法保存 AI 配置，请检查服务端的数据目录')
  }
}

function encryptionKey(create: boolean) {
  const configuredPath = process.env.AI_CONFIG_KEY_FILE
  const path = configuredPath || localKeyPath
  try {
    const encoded = readFileSync(path, 'utf8').trim()
    if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw keyFailure()
    return Buffer.from(encoded, 'base64url')
  } catch (error) {
    if (!create || configuredPath || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw keyFailure()
    try {
      const key = randomBytes(32)
      mkdirSync(dataDir, { recursive: true, mode: 0o700 })
      writeFileSync(path, key.toString('base64url'), { mode: 0o600, flag: 'wx', flush: true })
      return key
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code === 'EEXIST') return encryptionKey(false)
      throw keyFailure()
    }
  }
}

function credentialScope(profile: ModelProfile) {
  return Buffer.from(JSON.stringify([profile.ref, profile.provider, profile.baseUrl]))
}

function encrypt(profile: ModelProfile, apiKey: string, createKey: boolean) {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(createKey), nonce)
  cipher.setAAD(credentialScope(profile))
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  return { nonce: nonce.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') }
}

function decrypt(profile: StoredProfile) {
  const key = encryptionKey(false)
  try {
    const { nonce, tag, ciphertext } = profile.credential
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'), { authTagLength: 16 })
    decipher.setAAD(credentialScope(profile))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    throw keyFailure()
  }
}

function readStore(): Store {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { format: 2, version: 0, activeRef: null, models: [] }
    throw readFailure()
  }
  const stored = storeSchema.safeParse(raw)
  if (stored.success) return stored.data
  const legacy = legacySchema.safeParse(raw)
  if (!legacy.success) throw readFailure()
  const { provider, id, baseUrl, version, apiKey } = legacy.data
  const profile = { ref: randomUUID(), provider, id, baseUrl: providerUrl(provider, baseUrl) }
  const deployment = deploymentModel()
  const key = apiKey || (deployment && sameProvider(profile, deployment) ? deploymentKey() : '')
  if (!secret.safeParse(key).success) throw readFailure()
  const migrated: Store = {
    format: 2, version: version + 1, activeRef: profile.ref,
    models: [{ ...profile, credential: encrypt(profile, key, true) }]
  }
  writeStore(migrated)
  return migrated
}

function parseBaseUrl(value: string) {
  const url = URL.parse(value)
  if (url?.protocol === 'https:' && !url.username && !url.password && !url.href.includes('?') && !url.href.includes('#')) return url
  return null
}

function providerUrl(provider: ModelProfile['provider'], value: string) {
  const url = parseBaseUrl(provider === 'deepseek' ? deepseekBaseUrl : value)
  if (!url || (provider === 'openai-compatible' &&
    (!url.hostname.includes('.') || isIP(url.hostname) || url.hostname.endsWith('.localhost')))) {
    throw new DatabaseError(422, 'AI_INVALID_PROVIDER', '请输入供应商的公网 HTTPS 接口地址')
  }
  return url.href.replace(/\/+$/, '')
}

function deploymentModel(): ModelProfile | null {
  const provider = process.env.AI_PROVIDER || 'deepseek'
  if (provider !== 'deepseek' && provider !== 'openai-compatible') return null
  const id = process.env.AI_MODEL || (provider === 'deepseek' ? deepseekModel : '')
  const base = parseBaseUrl(provider === 'deepseek' ? deepseekBaseUrl : process.env.AI_BASE_URL ?? '')
  if (!id || !base || !process.env.AI_API_KEY_FILE) return null
  return { ref: deploymentModelRef, provider, id, baseUrl: base.href.replace(/\/+$/, '') }
}

function deploymentKey() {
  try { return readFileSync(process.env.AI_API_KEY_FILE ?? '', 'utf8').trim() } catch { return '' }
}

function publicSettings(store: Store): ModelSettings {
  const deployment = deploymentModel()
  const models = store.models.map(({ ref, provider, id, baseUrl, label }): ModelProfile => ({ ref, provider, id, baseUrl, label }))
  if (deployment) models.push(deployment)
  const activeRef = models.find(model => model.ref === store.activeRef)?.ref ?? models[0]?.ref ?? null
  return { models, activeRef, version: store.version }
}

export function modelSettings() {
  return publicSettings(readStore())
}

export function modelStatus(): ModelStatus {
  try {
    const { models, activeRef, version } = modelSettings()
    return { models: models.map(({ ref, provider, id, label }) => ({ ref, provider, id, label })), activeRef, version }
  } catch {
    return { models: [], activeRef: null, version: 0 }
  }
}

function current(version: number) {
  const store = readStore()
  if (store.version !== version) throw new DatabaseError(409, 'VERSION_CONFLICT', 'AI 配置已更新，请重新载入')
  return store
}

function sameProvider(left: ModelProfile, right: ModelProfile) {
  return left.provider === right.provider && URL.parse(left.baseUrl)?.origin === URL.parse(right.baseUrl)?.origin
}

function missingModel() {
  return new DatabaseError(404, 'AI_MODEL_NOT_FOUND', '该模型配置已删除或不可用')
}

function prepareConfiguration(value: unknown) {
  const result = inputSchema.safeParse(value)
  if (!result.success) throw new DatabaseError(422, 'INVALID_FIELDS', '请检查模型名称和 API Key')
  const { version, ref, provider, id, label, baseUrl, apiKey } = result.data
  const store = current(version)
  const existing = store.models.find(model => model.ref === ref)
  if (ref && !existing) throw missingModel()
  const profile = { ref: ref ?? randomUUID(), provider, id, label: label || undefined, baseUrl: providerUrl(provider, baseUrl) }
  const key = apiKey || (existing && sameProvider(profile, existing) ? decrypt(existing) : '')
  if (!secret.safeParse(key).success) throw new DatabaseError(422, 'AI_KEY_REQUIRED', '请输入有效的 API Key。')
  return { store, existing, profile, key }
}

export function testConfiguration(value: unknown): Configuration {
  const { profile, key } = prepareConfiguration(value)
  return { ...profile, apiKey: key, managed: true }
}

export function saveConfiguration(value: unknown) {
  const { store, existing, profile, key } = prepareConfiguration(value)
  const saved = { ...profile, credential: encrypt(profile, key, store.models.length === 0) }
  const models = existing ? store.models.map(model => model.ref === existing.ref ? saved : model) : [...store.models, saved]
  const activeRef = store.models.length ? publicSettings(store).activeRef : profile.ref
  const next = { ...store, models, activeRef, version: store.version + 1 }
  writeStore(next)
  return publicSettings(next)
}

export function selectConfiguration({ ref, version }: z.infer<typeof selectionInput>) {
  const store = current(version)
  const settings = publicSettings(store)
  if (!settings.models.some(model => model.ref === ref)) throw missingModel()
  if (settings.activeRef === ref) return settings
  const next = { ...store, activeRef: ref, version: version + 1 }
  writeStore(next)
  return publicSettings(next)
}

export function deleteConfiguration(ref: string, version: number) {
  const store = current(version)
  if (!store.models.some(model => model.ref === ref)) throw missingModel()
  const models = store.models.filter(model => model.ref !== ref)
  const activeRef = store.activeRef === ref ? null : store.activeRef
  const next = { ...store, models, activeRef, version: version + 1 }
  writeStore(next)
  return publicSettings(next)
}

export function activeConfiguration(ref?: string): Configuration {
  const store = readStore()
  const settings = publicSettings(store)
  const profile = settings.models.find(model => model.ref === (ref ?? settings.activeRef))
  if (!profile && ref) throw missingModel()
  const saved = store.models.find(model => model.ref === profile?.ref)
  const apiKey = saved ? decrypt(saved) : profile ? deploymentKey() : ''
  if (!profile || !secret.safeParse(apiKey).success) throw new DatabaseError(403, 'AI_NOT_CONFIGURED', 'AI 模型尚未配置')
  return { ...profile, apiKey, managed: !!saved }
}

export function configurationForRun(ref?: string): Configuration | DatabaseError {
  try {
    return activeConfiguration(ref)
  } catch (error) {
    if (error instanceof DatabaseError) return error
    throw error
  }
}
