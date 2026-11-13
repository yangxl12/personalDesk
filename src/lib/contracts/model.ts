export const deepseekModel = 'deepseek-flash'
export const deepseekBaseUrl = 'https://api.deepseek.com'

export type ModelProvider = 'deepseek' | 'openai-compatible'

export type ModelChoice = {
  ref: string
  provider: ModelProvider
  id: string
  label?: string
}

export const deploymentModelRef = 'deployment'

export type ModelProfile = ModelChoice & { baseUrl: string }

export type ModelStatus = {
  activeRef: string | null
  version: number
  models: ModelChoice[]
}

export type ModelSettings = Omit<ModelStatus, 'models'> & { models: ModelProfile[] }
