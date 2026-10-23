import { useEffect, type KeyboardEvent, type RefObject } from 'react'

// Enter and Space activate a non-<button> control. A key pressed in a descendant (a nested button
// or input) is that control's own, so only the element itself answers.
export function activateOnKey(activate: () => void) {
  return (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A tab panel hides its inactive content with `hidden` or `display: none` on an ancestor, which the
// control's own computed style does not report, so every ancestor up to the dialog is checked.
function reachable(el: HTMLElement, within: HTMLElement): boolean {
  if (getComputedStyle(el).visibility === 'hidden') return false
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (n.hidden || getComputedStyle(n).display === 'none') return false
    if (n === within) break
  }
  return true
}

// Open dialogs, oldest first. Only the newest one traps Tab: two document-level traps would pull
// focus back and forth on every keypress, leaving the top dialog unreachable by keyboard.
const openDialogs: object[] = []

type Focusable = HTMLElement | SVGElement

// Moves focus into the dialog, keeps Tab inside it, and gives focus back to whatever opened it. The
// panel needs tabIndex={-1} to take focus when it holds nothing focusable.
export function useModalFocus(panel: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const dialog = panel.current
    if (!active || !dialog) return
    const token = {}
    const at = document.activeElement
    const opener: Focusable | null =
      at instanceof HTMLElement || at instanceof SVGElement ? at : null
    openDialogs.push(token)
    const controls = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
        reachable(el, dialog),
      )
    if (!dialog.contains(document.activeElement)) (controls()[0] ?? dialog).focus()
    const trap = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab' || openDialogs.at(-1) !== token) return
      const list = controls()
      if (list.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const focused = document.activeElement
      if (!(focused instanceof HTMLElement) || !dialog.contains(focused)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (focused === first || focused === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && focused === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      const wasTop = openDialogs.at(-1) === token
      openDialogs.splice(openDialogs.indexOf(token), 1)
      if (wasTop && opener?.isConnected) opener.focus()
    }
  }, [panel, active])
}

// Arrow-key movement over a role="tree" of role="treeitem" rows, in document order. Left/Right on
// a branch are the caller's (it owns the collapsed state); this covers moving between rows, and
// Left on a leaf or a collapsed branch going up to its parent.
export function navigateTree(e: KeyboardEvent<HTMLElement>): boolean {
  if (e.target !== e.currentTarget) return false
  const tree = e.currentTarget.closest('[role="tree"]')
  if (!tree) return false
  const rows = Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'))
  const at = rows.indexOf(e.currentTarget)
  const level = Number(e.currentTarget.getAttribute('aria-level'))
  let target: HTMLElement | undefined
  if (e.key === 'ArrowDown') target = rows[at + 1]
  else if (e.key === 'ArrowUp') target = rows[at - 1]
  else if (e.key === 'Home') target = rows[0]
  else if (e.key === 'End') target = rows[rows.length - 1]
  else if (e.key === 'ArrowLeft') {
    for (let i = at - 1; i >= 0; i--)
      if (Number(rows[i].getAttribute('aria-level')) < level) {
        target = rows[i]
        break
      }
  } else if (e.key === 'ArrowRight' && e.currentTarget.getAttribute('aria-expanded') === 'true') {
    const next = rows[at + 1]
    if (next && Number(next.getAttribute('aria-level')) > level) target = next
  } else return false
  if (!target) return false
  // The app has window-level shortcuts (Home frames the view); a tree key is the tree's alone.
  e.preventDefault()
  e.stopPropagation()
  target.focus()
  return true
}

// Whether the last thing the user did was press a key rather than point. Selecting a part moves
// focus to its name field so a mouse user can rename it at once; for a keyboard user that same jump
// takes them out of the list they were moving through, so it is skipped. Defaults to pointer, which
// is what the app did unconditionally before.
let keyboardLast = false
export const usedKeyboardLast = () => keyboardLast
export const resetInputModality = () => {
  keyboardLast = false
}
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', () => (keyboardLast = true), true)
  document.addEventListener('pointerdown', () => (keyboardLast = false), true)
}
