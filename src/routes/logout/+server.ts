import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { signOut } from '#lib/server/auth/session'

export const POST: RequestHandler = async event => {
  await signOut(event)
  redirect(303, '/login')
}
