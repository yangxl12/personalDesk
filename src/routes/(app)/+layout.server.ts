import type { LayoutServerLoad } from './$types'
import { modelStatus } from '#lib/server/ai/config'
import { database } from '#lib/server/db'
import { readPage, requirePage } from '#lib/server/http'

export const load: LayoutServerLoad = async ({ locals, depends }) => {
  const user = requirePage(locals)
  depends('buxu:preferences')
  depends('buxu:model')
  const [preferences, revisions] = await readPage(Promise.all([
    database('preferences', user), database('revisions', user)
  ]))
  locals.preferences = preferences
  const model = modelStatus()
  return { user: locals.user!, preferences, revisions: { ...revisions, model: model.version }, model }
}
