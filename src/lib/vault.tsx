import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { VaultRecord } from '../../shared/types'
import { api, ApiError } from './api'
import { localStore } from './sync/localStore'
import { keepOfflineCopy } from './pwa'
import { transition } from './motion'
import { watchIdle } from './idleLock'
import { createVault, rewrapVault, unlockWithPassphrase, unlockWithRecovery } from './crypto'
import { expiryFor, startFromDevice, stillValid, type RememberFor } from './remember'
import { loadNotebook } from './lazy'

const IDLE_LOCK_MS = 15 * 60 * 1000
const SIGN_OUT_CHANNEL = 'noteflare:sign-out'

/**
 * Remove everything NoteFlare keeps on this device: the encrypted notes, the
 * unsynced changes and the wrapped keys (IndexedDB), settings (localStorage),
 * the saved app (Cache Storage and the service worker). Other open tabs are told
 * to sign out. Each step is best-effort so sign-out always finishes.
 */
async function wipeDevice() {
  const steps: Promise<unknown>[] = [localStore.destroy()]
  try {
    const channel = new BroadcastChannel(SIGN_OUT_CHANNEL)
    channel.postMessage('sign-out')
    channel.close()
  } catch {
    /* no BroadcastChannel */
  }
  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch {
    /* storage blocked */
  }
  if ('caches' in self) steps.push(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))))
  if ('serviceWorker' in navigator)
    steps.push(navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((r) => r.unregister()))))
  await Promise.allSettled(steps)
}

type Status = 'loading' | 'unauthorized' | 'access-missing' | 'error' | 'offline-empty' | 'setup' | 'locked' | 'unlocked'

interface VaultState {
  status: Status
  email: string | null
  /** Started without reaching the server; running from the copy on this device. */
  offline: boolean
  /** This deployment can store encrypted image attachments. Unknown (false) while offline. */
  attachments: boolean
  dek: CryptoKey | null
  /** The key is kept on this device ("stay unlocked"), so there is no idle auto-lock. */
  remembered: boolean
  /** This session opened with the kept key, without the user unlocking (no unlock animation). */
  resumed: boolean
  /** Create a vault and return the recovery code for the user to store. */
  setup(passphrase: string): Promise<string>
  /** Call once the user confirms they saved the recovery code. */
  finishSetup(): void
  /** `remember`: keep the vault key on this device for that long, so the next start skips the passphrase. */
  unlock(passphrase: string, remember?: RememberFor | null): Promise<void>
  recover(code: string, newPassphrase: string, remember?: RememberFor | null): Promise<void>
  changePassphrase(current: string, next: string): Promise<void>
  lock(): void
  /** Sign out of Cloudflare Access and remove everything NoteFlare stored on this device. */
  signOut(): Promise<void>
}

const VaultContext = createContext<VaultState | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [email, setEmail] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [attachments, setAttachments] = useState(false)
  const [dek, setDek] = useState<CryptoKey | null>(null)
  const [remembered, setRemembered] = useState(false)
  const [resumed, setResumed] = useState(false)
  const record = useRef<VaultRecord | null>(null)
  /** `record` came from the server in this session, not only from this device's copy. */
  const vaultChecked = useRef(false)
  const pendingDek = useRef<CryptoKey | null>(null)

  /** Start unlocked when this device was told to keep the key and it hasn't expired. */
  const restoreRemembered = async (accountEmail: string) => {
    const rec = await localStore.getRemembered()
    if (!rec) return false
    if (!stillValid(rec, accountEmail)) {
      await localStore.clearRemembered()
      return false
    }
    keepOfflineCopy()
    setDek(rec.key)
    setRemembered(true)
    setResumed(true)
    setStatus('unlocked')
    return true
  }

  useEffect(() => {
    ;(async () => {
      const [cached, localVault, kept] = await Promise.all([
        localStore.getMeta(),
        localStore.getVault(),
        localStore.getRemembered(),
      ])
      // Open from what this device kept right away (notes, or the lock screen); the server is asked
      // in the background, and the notes sync once it answers.
      const local = startFromDevice(cached, !!localVault, kept)
      if (local && cached && localVault) {
        record.current = localVault
        setEmail(cached.email)
        if (local === 'unlocked' && kept) {
          void loadNotebook().catch(() => {})
          keepOfflineCopy()
          setDek(kept.key)
          setRemembered(true)
          setResumed(true)
        } else if (kept) {
          void localStore.clearRemembered() // expired, or another account's
        }
        setStatus(local)
      }
      try {
        const me = await api.me()
        // Another account signed in on this browser: its cache must not mix with ours.
        if (cached?.email && cached.email !== me.email) {
          await localStore.clear()
          if (local) return location.reload() // start again with nothing of the other account's on screen
        }
        await localStore.setMeta({ email: me.email, hasVault: me.hasVault })
        setEmail(me.email)
        setOffline(false)
        setAttachments(!!me.attachments)
        if (!me.hasVault) {
          // The server has no vault (any more): what this device kept can't be used.
          if (local) {
            await localStore.clearRemembered()
            setDek(null)
            setRemembered(false)
            setResumed(false)
          }
          return setStatus('setup')
        }
        record.current = await api.getVault()
        vaultChecked.current = true
        await localStore.setVault(record.current)
        if (local) return
        if (await restoreRemembered(me.email)) return
        setStatus('locked')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          // Already in the notes: stay; sync shows that the session needs signing in again.
          if (local === 'unlocked') return
          const reason = (e.body as { reason?: string } | null)?.reason
          return setStatus(reason === 'access_not_set_up' ? 'access-missing' : 'unauthorized')
        }
        // No connection (or the server failed): keep going from this device; sync catches up later.
        if (local) return setOffline(true)
        setStatus(e instanceof ApiError ? 'error' : 'offline-empty')
      }
    })()
  }, [])

  const lock = useCallback(() => {
    void localStore.clearRemembered() // locking by hand also forgets the key kept on this device
    setRemembered(false)
    setResumed(false)
    setDek(null)
    pendingDek.current = null
    setStatus((s) => (s === 'unlocked' ? 'locked' : s))
  }, [])

  // Auto-lock when idle.
  useEffect(() => {
    // A key kept on this device is the user's choice to stay unlocked: only locking by hand ends it.
    if (status !== 'unlocked' || remembered) return
    return watchIdle(IDLE_LOCK_MS, lock)
  }, [status, remembered, lock])

  const setup = useCallback(async (passphrase: string) => {
    const created = await createVault(passphrase)
    const { version } = await api.putVault(created.record)
    record.current = { ...created.record, version }
    await localStore.setVault(record.current)
    await localStore.setMeta({ hasVault: true })
    keepOfflineCopy()
    pendingDek.current = created.dek
    return created.recoveryCode
  }, [])

  const finishSetup = useCallback(() => {
    if (!pendingDek.current) return
    const key = pendingDek.current
    pendingDek.current = null
    transition(() => {
      setDek(key)
      setStatus('unlocked')
    })
  }, [])

  /** Keep (or stop keeping) the key on this device. Resolves to whether it is now kept. */
  const keepKey = async (key: CryptoKey, choice?: RememberFor | null) => {
    if (!choice) {
      await localStore.clearRemembered()
      return false
    }
    const email = (await localStore.getMeta())?.email
    if (!email) return false
    await localStore.setRemembered({ key, email, expiresAt: expiryFor(choice) })
    return !!(await localStore.getRemembered()) // storage can be unavailable: don't claim what didn't stick
  }

  const unlock = useCallback(async (passphrase: string, remember?: RememberFor | null) => {
    if (!record.current) record.current = await api.getVault()
    const key = await unlockWithPassphrase(record.current, passphrase).catch(async (err) => {
      // This device's copy may predate a passphrase change made elsewhere: try the server's.
      if (vaultChecked.current) throw err
      const fresh = await api.getVault().catch(() => null)
      if (!fresh || fresh.version === record.current?.version) throw err
      record.current = fresh
      vaultChecked.current = true
      await localStore.setVault(fresh)
      return unlockWithPassphrase(fresh, passphrase)
    })
    keepOfflineCopy()
    const kept = await keepKey(key, remember)
    transition(() => {
      setResumed(false)
      setRemembered(kept)
      setDek(key)
      setStatus('unlocked')
    })
  }, [])

  const saveRewrap = useCallback(
    async (secret: { passphrase: string } | { recoveryCode: string }, next: string) => {
      record.current = await api.getVault() // always start from the latest copy before overwriting
      vaultChecked.current = true
      const res = await rewrapVault(record.current, secret, next)
      const { version } = await api.putVault(res.record)
      record.current = { ...res.record, version }
      await localStore.setVault(record.current)
      return res.dek
    },
    [],
  )

  const recover = useCallback(
    async (code: string, newPassphrase: string, remember?: RememberFor | null) => {
      if (!record.current) record.current = await api.getVault()
      await unlockWithRecovery(record.current, code) // check the code first
      const key = await saveRewrap({ recoveryCode: code }, newPassphrase)
      const kept = await keepKey(key, remember)
      transition(() => {
        setResumed(false)
        setRemembered(kept)
        setDek(key)
        setStatus('unlocked')
      })
    },
    [saveRewrap],
  )

  const changePassphrase = useCallback(
    async (current: string, next: string) => {
      setDek(await saveRewrap({ passphrase: current }, next))
    },
    [saveRewrap],
  )

  // Another tab signed out: drop the key and leave too.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(SIGN_OUT_CHANNEL)
    channel.onmessage = () => {
      setDek(null)
      pendingDek.current = null
      record.current = null
      location.replace('/cdn-cgi/access/logout')
    }
    return () => channel.close()
  }, [])

  const signOut = useCallback(async () => {
    setDek(null)
    pendingDek.current = null
    record.current = null
    await wipeDevice()
    location.replace('/cdn-cgi/access/logout')
  }, [])

  return (
    <VaultContext.Provider
      value={{ status, email, offline, attachments, dek, remembered, resumed, setup, finishSetup, unlock, recover, changePassphrase, lock, signOut }}
    >
      {children}
    </VaultContext.Provider>
  )
}

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>')
  return ctx
}
