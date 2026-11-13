import type { PageServerLoad } from './$types'
import { database } from '#lib/server/db'
import { pageOptions, readPage, requirePage, resourceId } from '#lib/server/http'

export const load: PageServerLoad = ({ locals, params, depends, url }) => {
  const user = requirePage(locals)
  depends('buxu:goals')
  return readPage((async () => database('goalPage', user, resourceId(params.id), pageOptions(url.searchParams)))())
}
