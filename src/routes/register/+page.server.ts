import { fail, redirect } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { createAccount } from '#lib/server/auth/session'
import { database, DatabaseError } from '#lib/server/db'

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(303, '/')
  if (await database('hasAccount')) redirect(303, '/login')
}

export const actions: Actions = {
  default: async event => {
    if (event.locals.user) redirect(303, '/')
    const form = await event.request.formData()
    const username = form.get('username')
    try {
      await createAccount(event, username, form.get('password'), form.get('confirmation'))
    } catch (failure) {
      if (failure instanceof DatabaseError) {
        return fail(failure.status, { message: failure.message, username: typeof username === 'string' ? username.slice(0, 64) : '' })
      }
      throw failure
    }
    redirect(303, '/')
  }
}
