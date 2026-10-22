import { describe, expect, it, vi } from 'vitest'
import type { KeyboardEvent } from 'react'
import { activateOnKey } from './a11y'

const press = (key: string, own = true) => {
  const el = {}
  const preventDefault = vi.fn()
  return {
    preventDefault,
    event: {
      key,
      target: own ? el : {},
      currentTarget: el,
      preventDefault,
    } as unknown as KeyboardEvent,
  }
}

describe('activateOnKey', () => {
  it.each(['Enter', ' '])('activates on %j and suppresses the default scroll', (key) => {
    const activate = vi.fn()
    const { event, preventDefault } = press(key)
    activateOnKey(activate)(event)
    expect(activate).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('ignores other keys', () => {
    const activate = vi.fn()
    activateOnKey(activate)(press('a').event)
    expect(activate).not.toHaveBeenCalled()
  })

  it('leaves a key pressed in a descendant to that descendant', () => {
    const activate = vi.fn()
    activateOnKey(activate)(press('Enter', false).event)
    expect(activate).not.toHaveBeenCalled()
  })
})
