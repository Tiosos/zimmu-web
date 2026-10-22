import type { KeyboardEvent } from 'react'

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
