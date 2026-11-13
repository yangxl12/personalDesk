import { lookup } from 'node:dns'
import { BlockList, type LookupFunction } from 'node:net'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { APICallError, streamText } from 'ai'
import { Agent, buildConnector, type Dispatcher } from 'undici'
import { DatabaseError } from '#lib/server/db'
import type { Configuration } from './config'

const nonPublic = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]
] as const) nonPublic.addSubnet(address, prefix)
for (const [address, prefix] of [
  ['::', 3], ['4000::', 2], ['8000::', 1], ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]
] as const) nonPublic.addSubnet(address, prefix, 'ipv6')

const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0)
    const allowed = addresses.filter(({ address, family }) => !nonPublic.check(address, family === 6 ? 'ipv6' : 'ipv4'))
    if (!allowed.length) return callback(new Error('Model provider must resolve to a public address'), '', 0)
    if (options.all) return callback(null, allowed)
    callback(null, allowed[0].address, allowed[0].family)
  })
}

// Use the checked addresses for the TLS connection itself so DNS changes cannot bypass the check.
const publicAgent = new Agent({ connect: buildConnector({ lookup: publicLookup }) })

export function dailyLimit() {
  const configured = Number(process.env.AI_DAILY_REQUESTS)
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 30
}

export function model({ provider, id, baseUrl, apiKey, managed }: Configuration) {
  const base = new URL(baseUrl)
  const restricted: typeof fetch = (input, init) => {
    const destination = new URL(input instanceof Request ? input.url : input)
    if (destination.origin !== base.origin) throw new Error('Unexpected provider destination')
    const options: RequestInit & { dispatcher?: Dispatcher } = { ...init, redirect: 'error' }
    if (managed && provider === 'openai-compatible') options.dispatcher = publicAgent
    return fetch(input, options)
  }
  const options = { baseURL: baseUrl, apiKey, fetch: restricted }
  if (provider === 'deepseek') {
    return { languageModel: createDeepSeek(options).chat(id), deepseek: true }
  }
  return {
    languageModel: createOpenAICompatible({ ...options, name: 'configured-model' }).chatModel(id),
    deepseek: false
  }
}

export async function testModel(settings: Configuration, signal: AbortSignal) {
  const provider = model(settings)
  const timeout = AbortSignal.timeout(15_000)
  try {
    const result = streamText({
      model: provider.languageModel, prompt: 'Reply with OK.', maxOutputTokens: 32, maxRetries: 0,
      abortSignal: AbortSignal.any([signal, timeout]),
      onError: () => {},
      providerOptions: provider.deepseek ? { deepseek: { thinking: { type: 'disabled' } } } : undefined
    })
    let hasText = false
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw part.error
      if (part.type === 'text-delta' && part.text.trim()) hasText = true
    }
    if (!hasText || timeout.aborted || signal.aborted) throw new Error('No model response')
  } catch (error) {
    if (timeout.aborted) throw new DatabaseError(504, 'AI_TIMEOUT', '模型响应超时')
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 401 || error.statusCode === 403) throw new DatabaseError(422, 'AI_PROVIDER_AUTH', '模型鉴权失败')
      if (error.statusCode === 429) throw new DatabaseError(429, 'AI_RATE_LIMITED', '模型请求过于频繁')
    }
    throw new DatabaseError(502, 'AI_PROVIDER_ERROR', '连接失败，请检查接口地址、模型名称和 API Key')
  }
}
