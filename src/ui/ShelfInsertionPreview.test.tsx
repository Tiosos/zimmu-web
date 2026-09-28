import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ShelfInsertionPreview } from './ShelfInsertionPreview'
import { adjustableShelfAccessResults } from '../scene/carcaseParts'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { roleThicknessFor } from '../scene/resolveThickness'

vi.mock('./ShelfInsertionCanvas', () => ({
  ShelfInsertionCanvas: ({ progress }: { progress: number }) => (
    <div data-testid="preview-progress">{progress}</div>
  ),
}))
const params = CARCASE_PRESETS[0].params
const result = () =>
  adjustableShelfAccessResults(params, roleThicknessFor(params, PRESET_MATERIALS, new Map()))[0]
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Preview shelf insertion' }))
const button = (name: string) => screen.getByRole('button', { name })
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute('open')
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('shelf insertion playback', () => {
  it('steps, scrubs, plays, pauses, stops at the end and replays', () => {
    vi.useFakeTimers()
    render(<ShelfInsertionPreview results={[result()]} label="Base 600" />)
    open()
    expect(screen.getByRole('status').textContent).toBe('Straight insertion')
    fireEvent.click(button('Next step'))
    expect(screen.getByTestId('preview-progress').textContent).toBe('1')
    fireEvent.click(button('Previous step'))
    expect(screen.getByTestId('preview-progress').textContent).toBe('0')
    fireEvent.click(button('Play'))
    act(() => vi.advanceTimersByTime(400))
    fireEvent.click(button('Pause'))
    const paused = screen.getByTestId('preview-progress').textContent
    act(() => vi.advanceTimersByTime(400))
    expect(screen.getByTestId('preview-progress').textContent).toBe(paused)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '10' } })
    expect(screen.getByTestId('preview-progress').textContent).toBe('10')
    fireEvent.click(button('Play'))
    act(() => vi.advanceTimersByTime(6500))
    expect(button('Next step').hasAttribute('disabled')).toBe(true)
    fireEvent.click(button('Replay'))
    expect(screen.getByTestId('preview-progress').textContent).toBe('0')
    fireEvent.click(button('Restart'))
    expect(button('Play')).toBeTruthy()
    fireEvent.click(button('Close preview'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resets playback on changed geometry and on requested-shelf selection', () => {
    vi.useFakeTimers()
    const a = result()
    const b = { ...a, role: 'adj-shelf-other-0', path: { ...a.path!, kind: 'rotated' as const } }
    const view = render(<ShelfInsertionPreview results={[a, b]} label="Base 600" />)
    open()
    fireEvent.click(button('Play'))
    act(() => vi.advanceTimersByTime(400))
    view.rerender(
      <ShelfInsertionPreview
        results={[{ ...a, shelfBox: { ...a.shelfBox, x0: a.shelfBox.x0 + 1 } }, b]}
        label="Base 600"
      />,
    )
    expect(screen.getByTestId('preview-progress').textContent).toBe('0')
    expect(vi.getTimerCount()).toBe(0)
    fireEvent.click(button('Next step'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Requested shelf' }), {
      target: { value: b.role },
    })
    expect(screen.getByRole('status').textContent).toBe('Angled insertion')
    expect(screen.getByTestId('preview-progress').textContent).toBe('0')
    fireEvent.click(button('Play'))
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('explains declined shelves without inventing playback and supports Escape cancellation', () => {
    render(<ShelfInsertionPreview results={[{ ...result(), path: null }]} label="Base 600" />)
    open()
    expect(screen.getByRole('status').textContent).toBe('No verified route found')
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
