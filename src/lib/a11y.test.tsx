import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState, type KeyboardEvent } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { activateOnKey, navigateTree, useModalFocus } from './a11y'

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

describe('useModalFocus', () => {
  function Harness({ withHidden = false }: { withHidden?: boolean }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    return (
      <>
        <button onClick={() => setOpen(true)}>opener</button>
        {open && <Dialog hidden={withHidden} close={() => setOpen(false)} dialogRef={ref} />}
      </>
    )
  }
  function Dialog({
    hidden,
    close,
    dialogRef,
  }: {
    hidden: boolean
    close: () => void
    dialogRef: React.RefObject<HTMLDivElement | null>
  }) {
    useModalFocus(dialogRef)
    return (
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-label="d">
        <button>first</button>
        <button onClick={close}>last</button>
        <div hidden={hidden}>
          <button>ghost</button>
        </div>
      </div>
    )
  }

  afterEach(cleanup)

  it('moves focus in, wraps Tab at both ends, and returns focus to the opener', async () => {
    const user = userEvent.setup()
    render(<Harness withHidden />)
    const opener = screen.getByText('opener')
    opener.focus()
    await user.click(opener)
    expect(document.activeElement).toBe(screen.getByText('first'))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByText('last'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('first'))
    await user.click(screen.getByText('last'))
    expect(document.activeElement).toBe(opener)
  })

  it('treats the last visible control as the end when a hidden region follows it', async () => {
    const user = userEvent.setup()
    render(<Harness withHidden />)
    screen.getByText('opener').focus()
    await user.click(screen.getByText('opener'))
    screen.getByText('last').focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByText('first'))
  })
})

describe('navigateTree', () => {
  const tree = () =>
    render(
      <div role="tree">
        <div
          role="treeitem"
          aria-level={1}
          aria-expanded={true}
          tabIndex={0}
          data-k="a"
          onKeyDown={navigateTree}
        />
        <div role="treeitem" aria-level={2} tabIndex={0} data-k="b" onKeyDown={navigateTree} />
        <div
          role="treeitem"
          aria-level={1}
          aria-expanded={false}
          tabIndex={0}
          data-k="c"
          onKeyDown={navigateTree}
        />
      </div>,
    )
  const row = (k: string) => document.querySelector<HTMLElement>(`[data-k="${k}"]`)!

  afterEach(cleanup)

  it('moves with the arrows, Home and End', async () => {
    const user = userEvent.setup()
    tree()
    row('a').focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(row('b'))
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(row('c'))
    await user.keyboard('{ArrowUp}{Home}')
    expect(document.activeElement).toBe(row('a'))
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(row('a'))
  })

  it('goes into an open branch with Right and back up to the parent with Left', async () => {
    const user = userEvent.setup()
    tree()
    row('a').focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(row('b'))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(row('a'))
  })

  it('leaves Right on a collapsed branch to the caller', async () => {
    const user = userEvent.setup()
    tree()
    row('c').focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(row('c'))
  })
})
