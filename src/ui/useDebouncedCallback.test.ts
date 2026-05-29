import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedCallback } from './useDebouncedCallback'

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call the callback immediately', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 150))
    act(() => {
      result.current('hello')
    })
    expect(cb).not.toHaveBeenCalled()
  })

  it('calls the callback after the delay', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 150))
    act(() => {
      result.current('hello')
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(cb).toHaveBeenCalledWith('hello')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('cancels earlier call on rapid re-calls', () => {
    const cb = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(cb, 150))
    act(() => {
      result.current('first')
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    act(() => {
      result.current('second')
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('second')
  })
})
