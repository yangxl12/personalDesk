import type { PageLoad } from './$types'
import { dashboard } from '#lib/local/store/workspace'

export const load: PageLoad = async ({ depends }) => {
  for (const module of ['goals', 'notes', 'finance', 'preferences'] as const) depends(`buxu:${module}`)
  return { dashboard: await dashboard() }
}
