import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { useDebouncedCallback } from './useDebouncedCallback'

function Probe({ onCommit, value }: { onCommit: (v: number) => void; value: number | null }) {
  const debounced = useDebouncedCallback(onCommit, 150)
  if (value !== null) debounced(value)
  return null
}

describe('useDebouncedCallback', () => {
  it('commits once after the delay, not once per call', async () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const { rerender } = render(<Probe onCommit={onCommit} value={1} />)
    rerender(<Probe onCommit={onCommit} value={2} />)
    rerender(<Probe onCommit={onCommit} value={3} />)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(onCommit.mock.calls).toEqual([[3]])
    vi.useRealTimers()
  })

  // The regression this exists for. CarcasePanel unmounts the moment a part is selected in the
  // tree, and it used to clear the timer without firing it — so typing a depth and immediately
  // clicking a part silently threw the depth away. An e2e caught it; no unit test could, because
  // none of them unmounted mid-edit.
  it('flushes a pending commit when the component unmounts', async () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const { unmount } = render(<Probe onCommit={onCommit} value={600} />)
    unmount()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(onCommit.mock.calls).toEqual([[600]])
    vi.useRealTimers()
  })

  it('flushes only the latest value, and only once', async () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const { rerender, unmount } = render(<Probe onCommit={onCommit} value={1} />)
    rerender(<Probe onCommit={onCommit} value={2} />)
    unmount()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(onCommit.mock.calls).toEqual([[2]])
    vi.useRealTimers()
  })

  it('does not commit on unmount when nothing was pending', async () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const { unmount } = render(<Probe onCommit={onCommit} value={null} />)
    unmount()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(onCommit).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not commit twice when the timer already fired before unmount', async () => {
    vi.useFakeTimers()
    const onCommit = vi.fn()
    const { unmount } = render(<Probe onCommit={onCommit} value={42} />)
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    unmount()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(onCommit.mock.calls).toEqual([[42]])
    vi.useRealTimers()
  })
})
