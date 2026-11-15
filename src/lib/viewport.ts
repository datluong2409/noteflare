/**
 * Keeps the app usable while an on-screen keyboard is open.
 *
 * On iOS the keyboard doesn't shrink the layout viewport: `100dvh` and `position: fixed`
 * still reach behind it, so a full-screen editor's toolbar, or a dialog's input, would
 * sit under the keyboard. The visual viewport does shrink, so we mirror it into CSS:
 *
 *   --vvh  visible height     --vvt  visible top (when iOS scrolls the page up)
 *   html[data-keyboard="open"] while a keyboard covers part of the screen
 *
 * Android Chrome resizes the page itself (viewport meta `interactive-widget=resizes-content`),
 * and these variables then simply match the window.
 */
const KEYBOARD_MIN_PX = 120

export function setupViewport() {
  const vv = window.visualViewport
  if (!vv) return
  const root = document.documentElement
  let frame = 0
  let wasOpen = false
  // Android shrinks the whole window for the keyboard, so compare with the tallest
  // height seen at this width (reset when the width changes, e.g. on rotation).
  let width = window.innerWidth
  let fullHeight = window.innerHeight

  const update = () => {
    frame = 0
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
    root.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
    if (window.innerWidth !== width) {
      width = window.innerWidth
      fullHeight = window.innerHeight
    }
    fullHeight = Math.max(fullHeight, window.innerHeight)
    const open = fullHeight - vv.height > KEYBOARD_MIN_PX && isTyping()
    if (open !== wasOpen) {
      wasOpen = open
      if (open) root.dataset.keyboard = 'open'
      else delete root.dataset.keyboard
      // The space just changed: bring the field being typed in back into view.
      if (open) requestAnimationFrame(revealFocused)
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }

  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  // Some keyboards open without a resize event arriving first.
  document.addEventListener('focusin', () => setTimeout(schedule, 350))
  document.addEventListener('focusout', () => setTimeout(schedule, 50))
  update()
}

function isTyping() {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|range|color)$/.test((el as HTMLInputElement).type)
}

function revealFocused() {
  const el = document.activeElement as HTMLElement | null
  if (!el || !isTyping()) return
  // Long textareas manage their own caret position; only nudge small fields into view.
  if (el.tagName === 'TEXTAREA' && el.offsetHeight > window.visualViewport!.height / 2) return
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

let keyboardPrimer: HTMLInputElement | null = null

/**
 * iOS only raises the keyboard for a `focus()` that runs synchronously inside the tap's own
 * event. Our editor mounts later (inside a View Transition callback, or a requestAnimationFrame),
 * so focusing the textarea there leaves it focused but keyboard-less.
 *
 * Call this synchronously from the tap handler: it focuses an invisible input right away, which
 * opens the keyboard. When the real field is focused a moment later the keyboard stays up.
 * If nothing takes over, the primer is blurred so the keyboard doesn't hang around.
 */
export function primeKeyboard() {
  if (typeof document === 'undefined' || !isCoarsePointer()) return
  const el = document.activeElement
  if (el && el !== document.body && isTypingTarget(el as HTMLElement)) return // keyboard is already up
  if (!keyboardPrimer) {
    const input = document.createElement('input')
    input.setAttribute('aria-hidden', 'true')
    input.tabIndex = -1
    input.autocomplete = 'off'
    // 16px stops iOS zooming in; fixed at the top-left so focusing it never scrolls the page.
    input.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none'
    document.body.appendChild(input)
    keyboardPrimer = input
  }
  const primer = keyboardPrimer
  primer.focus({ preventScroll: true })
  setTimeout(() => {
    if (document.activeElement === primer) primer.blur()
  }, 1000)
}

const isTypingTarget = (el: HTMLElement) =>
  el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el !== keyboardPrimer)

export const isCoarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
