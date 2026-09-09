import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from './types'

const mockBuildPart = vi.fn()

vi.mock('comlink', () => ({
  wrap: () => ({ buildPart: mockBuildPart, exportStep: vi.fn() }),
  expose: vi.fn(),
  transfer: vi.fn((data: unknown) => data),
}))

vi.stubGlobal(
  'Worker',
  vi.fn(function MockWorker() {}),
)

const { useScene } = await import('./useScene')

const GEOMETRY = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
}

const EMPTY_SCENE: Scene = {
  parts: [],
  materials: {},
  hardware: [],
  joints: [],
  components: [],
}

describe('useScene geometry lifecycle', () => {
  beforeEach(() => {
    mockBuildPart.mockReset()
  })

  it('removes pending state when a part is deleted before its first build completes', async () => {
    let release: (value: typeof GEOMETRY) => void = () => {}
    mockBuildPart.mockImplementationOnce(
      () => new Promise<typeof GEOMETRY>((resolve) => (release = resolve)),
    )

    const { result } = renderHook(() => useScene())
    const id = result.current.scene.parts[0].id

    await waitFor(() => expect(result.current.pendingIds.has(id)).toBe(true))

    act(() => result.current.onRemove(id))

    expect(result.current.scene.parts.some((p) => p.id === id)).toBe(false)
    expect(result.current.pendingIds.has(id)).toBe(false)
    expect(result.current.errors.has(id)).toBe(false)
    expect(result.current.geometries.has(id)).toBe(false)

    await act(async () => release(GEOMETRY))

    // The worker completion captured the old sequence. Deletion removes that sequence, so the
    // completion is stale and cannot resurrect any geometry or bookkeeping for the dead part.
    expect(result.current.pendingIds.has(id)).toBe(false)
    expect(result.current.errors.has(id)).toBe(false)
    expect(result.current.geometries.has(id)).toBe(false)
  })

  it('removes a build error when the failed part is deleted', async () => {
    mockBuildPart.mockRejectedValueOnce(new Error('bad solid'))

    const { result } = renderHook(() => useScene())
    const id = result.current.scene.parts[0].id

    await waitFor(() => expect(result.current.errors.get(id)).toBe('bad solid'))
    act(() => result.current.onRemove(id))

    expect(result.current.errors.has(id)).toBe(false)
    expect(result.current.pendingIds.has(id)).toBe(false)
  })

  it('replaceScene clears geometry errors and invalidates in-flight builds', async () => {
    let release: (value: typeof GEOMETRY) => void = () => {}
    mockBuildPart.mockImplementationOnce(
      () => new Promise<typeof GEOMETRY>((resolve) => (release = resolve)),
    )

    const { result } = renderHook(() => useScene())
    const id = result.current.scene.parts[0].id
    await waitFor(() => expect(result.current.pendingIds.has(id)).toBe(true))

    act(() => result.current.replaceScene(EMPTY_SCENE))
    expect(result.current.pendingIds.size).toBe(0)
    expect(result.current.errors.size).toBe(0)
    expect(result.current.geometries.size).toBe(0)

    await act(async () => release(GEOMETRY))
    expect(result.current.geometries.has(id)).toBe(false)
    expect(result.current.pendingIds.has(id)).toBe(false)
  })
})
