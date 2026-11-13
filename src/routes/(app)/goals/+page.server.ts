import type { PageServerLoad } from './$types'
import { database } from '#lib/server/db'
import { goalOptions, readPage, requirePage } from '#lib/server/http'

export const load: PageServerLoad = ({ locals, depends, url }) => {
  const user = requirePage(locals)
  depends('buxu:goals')
  return readPage((async () => {
    const options = goalOptions(url.searchParams)
    return { list: await database('goals', user, options), status: options.status }
  })())
}
