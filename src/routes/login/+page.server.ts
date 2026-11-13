import { fail, redirect } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { signIn } from '#lib/server/auth/session'
import { DatabaseError } from '#lib/server/db'

export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) redirect(303, '/')
}

export const actions: Actions = {
  default: async event => {
    const form = await event.request.formData()
    const username = form.get('username')
    try {
      await signIn(event, username, form.get('password'))
    } catch (failure) {
      if (failure instanceof DatabaseError) {
        return fail(failure.status, { message: failure.message, username: typeof username === 'string' ? username.slice(0, 64) : '' })
      }
      throw failure
    }
    redirect(303, '/')
  }
}
