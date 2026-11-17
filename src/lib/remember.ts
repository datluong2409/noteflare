/**
 * "Keep me unlocked on this device": instead of asking for the passphrase at every start,
 * the vault key (a non-extractable CryptoKey — scripts can use it but never read its bytes)
 * is kept in IndexedDB until it expires. The passphrase itself is never stored.
 */
export type RememberFor = '7d' | '30d' | 'forever'

export const REMEMBER_OPTIONS: readonly RememberFor[] = ['7d', '30d', 'forever']

const DAY = 86_400_000
const LONGEST_MS = 30 * DAY

export interface RememberedKey {
  key: CryptoKey
  email: string
  /** Epoch ms, or null for "until I lock or sign out". */
  expiresAt: number | null
}

export const expiryFor = (choice: RememberFor, now = Date.now()) =>
  choice === 'forever' ? null : now + (choice === '7d' ? 7 : 30) * DAY

/** Usable for this account, and not past its date. */
export function stillValid(rec: RememberedKey | null, email: string, now = Date.now()) {
  if (!rec || rec.email !== email) return false
  if (rec.expiresAt === null) return true
  // An expiry further out than any option we offer means the clock was moved back: don't trust it.
  return rec.expiresAt > now && rec.expiresAt - now <= LONGEST_MS
}

/**
 * How the app can open from what this device kept, without waiting for the server:
 * straight into the notes with a kept key, at the lock screen with only the wrapped keys,
 * or not at all (nothing kept, so the server has to answer first).
 */
export function startFromDevice(
  meta: { email: string; hasVault: boolean } | null,
  hasLocalVault: boolean,
  rec: RememberedKey | null,
  now = Date.now(),
): 'unlocked' | 'locked' | null {
  if (!meta?.email || !meta.hasVault || !hasLocalVault) return null
  return stillValid(rec, meta.email, now) ? 'unlocked' : 'locked'
}
