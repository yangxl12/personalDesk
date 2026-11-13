import type { PageServerLoad } from './$types'
import { database } from '#lib/server/db'
import { readPage, requirePage } from '#lib/server/http'

export const load: PageServerLoad = async ({ locals, depends }) => {
  for (const module of ['goals', 'notes', 'finance', 'preferences']) depends('buxu:' + module)
  return { dashboard: await readPage(database('dashboard', requirePage(locals))) }
}
