import type { PageServerLoad } from './$types'
import { modelSettings } from '#lib/server/ai/config'
import { requirePage } from '#lib/server/http'

export const load: PageServerLoad = ({ depends, locals }) => {
  requirePage(locals)
  depends('buxu:model')
  try {
    return { modelSettings: modelSettings() }
  } catch {
    return { modelSettings: null }
  }
}
