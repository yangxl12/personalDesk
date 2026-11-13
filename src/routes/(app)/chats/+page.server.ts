import type { PageServerLoad } from './$types'
import { database } from '#lib/server/db'
import { pageOptions, readPage, requirePage } from '#lib/server/http'

export const load: PageServerLoad = ({ locals, url, depends }) => {
  const user = requirePage(locals)
  depends('buxu:chats')
  return readPage((async () => ({ chats: await database('chats', user, pageOptions(url.searchParams)) }))())
}
