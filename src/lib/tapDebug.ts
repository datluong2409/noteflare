/**
 * TEMPORARY diagnostics for "tapping an input does nothing" on iOS home-screen apps.
 * Only bundled when built with VITE_TAP_DEBUG=1. Logs element names and event flags,
 * never what is typed. Remove once the cause is found.
 */
const lines: string[] = []
let panel: HTMLPreElement | null = null

const name = (n: EventTarget | Element | null | undefined): string => {
  if (!n || !(n instanceof Element)) return n === document ? 'document' : n === window ? 'window' : String(n)
  const el = n as HTMLElement
  const type = el instanceof HTMLInputElement ? `[${el.type}]` : ''
  const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 2).join('.') : ''
  return `${el.tagName.toLowerCase()}${type}${el.id ? '#' + el.id.slice(0, 6) : ''}${cls ? '.' + cls.slice(0, 30) : ''}`
}

function log(msg: string) {
  const t = (performance.now() / 1000).toFixed(2)
  lines.push(`${t} ${msg}`)
  if (lines.length > 40) lines.shift()
  if (panel) panel.textContent = lines.join('\n')
}

/** Why the first text input might not take a tap: its styles and those of its ancestors. */
function probeInput() {
  const input = document.querySelector<HTMLInputElement>('input:not([aria-hidden]):not([type=checkbox])')
  if (!input) return log('probe: no input')
  const r = input.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  log(`probe: ${name(input)} rect=${Math.round(r.top)},${Math.round(r.left)} ${Math.round(r.width)}x${Math.round(r.height)} hitAtCenter=${name(hit)} disabled=${input.disabled} ro=${input.readOnly}`)
  for (let el: HTMLElement | null = input; el; el = el.parentElement) {
    const s = getComputedStyle(el)
    const us = s.getPropertyValue('-webkit-user-select') || s.userSelect
    const odd =
      s.pointerEvents !== 'auto' || us === 'none' || s.visibility !== 'visible' || el.inert || el.hasAttribute('aria-hidden') || s.transform !== 'none' || (s.touchAction !== 'auto' && s.touchAction !== 'manipulation')
    if (odd) log(`  ${name(el)} pe=${s.pointerEvents} us=${us} vis=${s.visibility} inert=${el.inert} tf=${s.transform !== 'none'} ta=${s.touchAction}`)
  }
}

export function setupTapDebug() {
  panel = document.createElement('pre')
  panel.setAttribute('aria-hidden', 'true')
  panel.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:hidden;margin:0;padding:4px 6px;z-index:2147483647;pointer-events:none;font:10px/1.25 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,.78);color:#7f7'
  document.body.appendChild(panel)

  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  log(`boot standalone=${standalone} coarse=${matchMedia('(pointer: coarse)').matches} inner=${innerWidth}x${innerHeight} vv=${visualViewport?.width}x${visualViewport?.height} vis=${document.visibilityState} focus=${document.hasFocus()} sw=${!!navigator.serviceWorker?.controller}`)
  log(`ua ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 110)}`)

  for (const type of ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click'] as const) {
    // Capture on window: runs first. Bubble on window: runs last, so defaultPrevented shows what the app did.
    window.addEventListener(
      type,
      (e) => {
        const p = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0] : (e as MouseEvent)
        const at = p ? document.elementFromPoint(p.clientX, p.clientY) : null
        log(`${type} target=${name(e.target)} at=${name(at)} xy=${p ? Math.round(p.clientX) + ',' + Math.round(p.clientY) : '-'}`)
      },
      { capture: true, passive: true },
    )
    window.addEventListener(type, (e) => e.defaultPrevented && log(`  ${type} defaultPrevented!`), { passive: true })
  }
  document.addEventListener('focusin', (e) => log(`focusin ${name(e.target)} vvh=${visualViewport?.height}`))
  document.addEventListener('focusout', (e) => log(`focusout ${name(e.target)} -> ${name((e as FocusEvent).relatedTarget)}`))
  document.addEventListener('visibilitychange', () => log(`visibility ${document.visibilityState}`))
  window.addEventListener('pageshow', (e) => log(`pageshow persisted=${(e as PageTransitionEvent).persisted}`))
  visualViewport?.addEventListener('resize', () => log(`vv resize ${visualViewport!.width}x${visualViewport!.height}`))

  // Probe once the lock screen is up, and again after its entry animation.
  let tries = 0
  const probeWhenReady = () => (document.querySelector('form input') ? probeInput() : ++tries < 40 && setTimeout(probeWhenReady, 300))
  setTimeout(probeWhenReady, 300)
  setTimeout(probeInput, 3000)
}
