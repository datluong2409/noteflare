import { useSyncExternalStore } from 'react'

/** Same width as Tailwind's `max-sm:` — phones get the iPhone Notes–style list and editor. */
const QUERY = '(max-width: 639px)'

export const isPhone = () => typeof matchMedia === 'function' && matchMedia(QUERY).matches

function subscribe(onChange: () => void) {
  if (typeof matchMedia !== 'function') return () => {}
  const mq = matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function useIsPhone() {
  return useSyncExternalStore(subscribe, isPhone, () => false)
}
