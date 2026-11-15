import { afterEach, expect, it, vi } from 'vitest'
import { randomId } from '../../src/lib/random-id'

afterEach(() => vi.unstubAllGlobals())

it('creates distinct UUID v4 values on LAN HTTP without crypto.randomUUID', () => {
  const nativeCrypto = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto) })
  const ids = Array.from({ length: 100 }, () => randomId())
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(new Set(ids).size).toBe(ids.length)
})

it('uses the browser UUID implementation when available', () => {
  const uuid = '88df4b4c-0c68-42f2-b73e-933c57ae5f52'
  vi.stubGlobal('crypto', { randomUUID: () => uuid })
  expect(randomId()).toBe(uuid)
})
