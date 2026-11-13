import type { PageServerLoad } from './$types'
import { database } from '#lib/server/db'
import { pageOptions, readPage, requirePage } from '#lib/server/http'

export const load: PageServerLoad = ({ locals, depends, url }) => {
  const user = requirePage(locals)
  depends('buxu:notes')
  return readPage((async () => ({ list: await database('notes', user, pageOptions(url.searchParams)) }))())
}
