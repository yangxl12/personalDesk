import type { PageServerLoad } from './$types'
import { database } from '#lib/server/db'
import { readPage, requirePage, resourceId } from '#lib/server/http'

export const load: PageServerLoad = ({ locals, params, depends }) => {
  const user = requirePage(locals)
  depends('buxu:notes')
  return readPage((async () => ({ note: await database('note', user, resourceId(params.id)) }))())
}
