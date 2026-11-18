import type { PageLoad } from './$types'
import { chats } from '#lib/local/store/chats'
import { pageOptions } from '#lib/local/store/workspace'

export const load: PageLoad = async ({ depends, url }) => {
  depends('buxu:chats')
  return { chats: await chats(pageOptions(url.searchParams)) }
}
