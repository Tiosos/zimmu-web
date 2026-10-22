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

// Moves focus into the dialog, keeps Tab inside it, and gives focus back to whatever opened it. The
// panel needs tabIndex={-1} to take focus when it holds nothing focusable.
export function useModalFocus(panel: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const dialog = panel.current
    if (!active || !dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const controls = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) =>
        reachable(el, dialog),
      )
    if (!dialog.contains(document.activeElement)) (controls()[0] ?? dialog).focus()
    const trap = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = controls()
      if (list.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const at = document.activeElement
      if (!(at instanceof HTMLElement) || !dialog.contains(at)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && (at === first || at === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && at === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      if (opener?.isConnected) opener.focus()
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
  e.preventDefault()
  target.focus()
  return true
}
