import type { PageServerLoad } from './$types'
import { database } from '#lib/server/db'
import { financeOptions, readPage, requirePage } from '#lib/server/http'

export const load: PageServerLoad = ({ locals, depends, url }) => {
  const user = requirePage(locals)
  depends('buxu:finance')
  depends('buxu:preferences')
  return readPage((async () => ({ finance: await database('finance', user, financeOptions(url.searchParams)) }))())
}
