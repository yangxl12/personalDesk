import { APICallError, streamText } from 'ai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { Configuration } from './model'
import { fault } from '../store/workspace'

export function model(settings: Configuration) {
  const options = { baseURL: settings.baseUrl, apiKey: settings.apiKey }
  if (settings.provider === 'deepseek') {
    return { languageModel: createDeepSeek(options).chat(settings.id), deepseek: true }
  }
  return {
    languageModel: createOpenAICompatible({ ...options, name: 'configured-model' }).chatModel(settings.id),
    deepseek: false
  }
}

// 保存前实测：直接发一次极短的流式请求。跨域被拦会表现为普通网络错误，这里翻译成可执行的提示。
export async function testModel(settings: Configuration, signal?: AbortSignal): Promise<void> {
  const provider = model(settings)
  const timeout = AbortSignal.timeout(15_000)
  try {
    const result = streamText({
      model: provider.languageModel, prompt: 'Reply with OK.', maxOutputTokens: 32, maxRetries: 0,
      abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      onError: () => {},
      providerOptions: provider.deepseek ? { deepseek: { thinking: { type: 'disabled' } } } : undefined
    })
    let hasText = false
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw part.error
      if (part.type === 'text-delta' && part.text.trim()) hasText = true
    }
    if (!hasText || timeout.aborted) throw new Error('No model response')
  } catch (error) {
    if (timeout.aborted) throw fault(504, 'AI_TIMEOUT', '模型响应超时')
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 401 || error.statusCode === 403) throw fault(422, 'AI_PROVIDER_AUTH', '模型鉴权失败')
      if (error.statusCode === 429) throw fault(429, 'AI_RATE_LIMITED', '模型请求过于频繁')
    }
    throw fault(502, 'AI_PROVIDER_ERROR', '连接失败，请检查接口地址、模型名称和 API Key')
  }
}
