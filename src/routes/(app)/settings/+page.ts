import type { PageLoad } from './$types'
import { modelSettings } from '#lib/local/ai/model'

export const load: PageLoad = async ({ depends }) => {
  depends('buxu:model')
  try {
    return { modelSettings: await modelSettings() }
  } catch {
    return { modelSettings: null }
  }
}
