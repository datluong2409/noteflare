import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { expiryFor, stillValid, type RememberedKey } from '../src/lib/remember'
import { createLocalStore } from '../src/lib/sync/localStore'

const DAY = 86_400_000
let dbCount = 0
const newKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

describe('expiryFor', () => {
  it('counts 7 and 30 days from now, and never for "forever"', () => {
    expect(expiryFor('7d', 1000)).toBe(1000 + 7 * DAY)
    expect(expiryFor('30d', 1000)).toBe(1000 + 30 * DAY)
    expect(expiryFor('forever', 1000)).toBeNull()
  })
})

describe('stillValid', () => {
  const rec = (patch: Partial<RememberedKey>): RememberedKey => ({ key: {} as CryptoKey, email: 'a@x.com', expiresAt: null, ...patch })

  it('accepts a key that has not expired for the same account', () => {
    expect(stillValid(rec({ expiresAt: 2000 }), 'a@x.com', 1000)).toBe(true)
    expect(stillValid(rec({ expiresAt: null }), 'a@x.com', 1000)).toBe(true)
  })
  it('rejects nothing stored, an expired key and another account', () => {
    expect(stillValid(null, 'a@x.com', 1000)).toBe(false)
    expect(stillValid(rec({ expiresAt: 1000 }), 'a@x.com', 1000)).toBe(false)
    expect(stillValid(rec({ expiresAt: 5000 }), 'b@x.com', 1000)).toBe(false)
  })
  it('rejects an expiry further out than the longest option (clock set back)', () => {
    expect(stillValid(rec({ expiresAt: 1000 + 31 * DAY }), 'a@x.com', 1000)).toBe(false)
  })
})

describe('remembered key storage', () => {
  it('keeps a non-extractable key usable across a reload of the store', async () => {
    const name = `remember-${++dbCount}`
    const key = await newKey()
    await createLocalStore(name).setRemembered({ key, email: 'a@x.com', expiresAt: null })

    const back = await createLocalStore(name).getRemembered()
    expect(back?.email).toBe('a@x.com')
    expect(back!.key.extractable).toBe(false)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('hi'))
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, back!.key, sealed)
    expect(new TextDecoder().decode(plain)).toBe('hi')
  })

  it('forgets the key on clearRemembered, clear and destroy', async () => {
    const store = createLocalStore(`remember-${++dbCount}`)
    const save = async () => store.setRemembered({ key: await newKey(), email: 'a@x.com', expiresAt: null })

    await save()
    await store.clearRemembered()
    expect(await store.getRemembered()).toBeNull()

    await save()
    await store.clear()
    expect(await store.getRemembered()).toBeNull()

    await save()
    await store.destroy()
    expect(await store.getRemembered()).toBeNull()
  })
})
