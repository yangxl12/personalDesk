import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const digest = await derive(password, salt, 64, parameters)
  return ['scrypt-v1', salt, digest.toString('hex')].join('$')
}

export async function checkPassword(password, encoded) {
  const [version, salt, hex] = encoded?.split('$') ?? []
  const valid = version === 'scrypt-v1' && /^[0-9a-f]{32}$/.test(salt) && /^[0-9a-f]{128}$/.test(hex)
  const digest = await derive(password, valid ? salt : '0'.repeat(32), 64, parameters)
  return valid && timingSafeEqual(digest, Buffer.from(hex, 'hex'))
}
