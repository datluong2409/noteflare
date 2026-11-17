import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { VaultProvider, useVault } from '@/lib/vault'
import { I18nProvider, useI18n } from '@/i18n'
import { UnlockScreen } from '@/components/UnlockScreen'

import { loadNotebook } from '@/lib/lazy'

const Notebook = lazy(() => loadNotebook().then((m) => ({ default: m.Notebook })))

function Gate() {
  const { t } = useI18n()
  const { status, dek } = useVault()

  // Usually over in a blink (the copy on this device): only say so if the server has to answer first.
  if (status === 'loading') return <Delayed>{t('common.loading')}</Delayed>
  if (status === 'unauthorized')
    return (
      <Centered>
        {t('gate.sessionExpired')}{' '}
        <a className="text-link underline" href="/">
          {t('gate.signInAgain')}
        </a>
      </Centered>
    )
  if (status === 'access-missing')
    return (
      <Centered>
        {t('gate.accessMissing')}{' '}
        <a className="text-link underline" href={t('gate.accessGuideUrl')} target="_blank" rel="noopener">
          {t('gate.accessGuide')}
        </a>
      </Centered>
    )
  if (status === 'error') return <Centered>{t('gate.serverError')}</Centered>
  if (status === 'offline-empty') return <Centered>{t('gate.offlineEmpty')}</Centered>
  if (status === 'unlocked' && dek)
    return (
      <Suspense fallback={<Delayed>{t('common.loading')}</Delayed>}>
        <Notebook dek={dek} />
      </Suspense>
    )
  return <UnlockScreen />
}

/** A blank page that only shows its text if the wait gets noticeable. */
function Delayed({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), 600)
    return () => window.clearTimeout(timer)
  }, [])
  return <Centered>{show ? children : null}</Centered>
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center text-muted-foreground">
      <p className="max-w-md">{children}</p>
    </main>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <VaultProvider>
        <Gate />
      </VaultProvider>
      <Toaster />
    </I18nProvider>
  )
}
