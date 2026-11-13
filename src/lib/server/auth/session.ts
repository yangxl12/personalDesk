import { createHash, randomBytes } from 'node:crypto'
import type { RequestEvent } from '@sveltejs/kit'
import { database, DatabaseError } from '#lib/server/db'
import { checkPassword } from './password.mjs'

const absolute = 30 * 86_400
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const cookieName = (secure: boolean) => secure ? '__Host-buxu_session' : 'buxu_session'

export async function identify(event: RequestEvent) {
  const token = event.cookies.get(cookieName(event.url.protocol === 'https:'))
  event.locals.sessionHash = null
  event.locals.user = null
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return
  const digest = hash(token)
  event.locals.user = await database('session', digest)
  if (event.locals.user) event.locals.sessionHash = digest
}

export async function signIn(event: RequestEvent, rawName: unknown, password: unknown) {
  const username = typeof rawName === 'string' ? rawName.trim().toLowerCase() : ''
  if (!/^[a-z0-9_.-]{1,64}$/.test(username) || typeof password !== 'string' ||
    !password || Buffer.byteLength(password) > 512) {
    throw new DatabaseError(422, 'INVALID_LOGIN', '请填写有效的账号和密码')
  }
  const { user, limited } = await database('loginAttempt', username, event.getClientAddress())
  if (limited) throw new DatabaseError(429, 'LOGIN_LIMIT', '尝试次数过多，请稍后再登录')
  const valid = await checkPassword(password, user?.password_hash)
  if (!user || !valid) throw new DatabaseError(401, 'LOGIN_FAILED', '账号或密码错误')
  const token = randomBytes(32).toString('base64url')
  if (!await database('createSession', user.id, user.password_hash, hash(token))) {
    throw new DatabaseError(401, 'LOGIN_FAILED', '账号或密码已更新，请重新登录')
  }
  if (event.locals.sessionHash) await database('revoke', event.locals.sessionHash)
  const secure = event.url.protocol === 'https:'
  event.cookies.set(cookieName(secure), token, { path: '/', secure, httpOnly: true, sameSite: 'lax', maxAge: absolute })
  return { id: user.id, username: user.username }
}

export async function signOut(event: RequestEvent) {
  if (event.locals.sessionHash) await database('revoke', event.locals.sessionHash)
  const secure = event.url.protocol === 'https:'
  event.cookies.delete(cookieName(secure), { path: '/', secure })
}
