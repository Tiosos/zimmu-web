import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockBuildPart = vi.fn()

vi.mock('comlink', () => ({
  wrap: () => ({ buildPart: mockBuildPart, buildBox: vi.fn() }),
  expose: vi.fn(),
  transfer: vi.fn((data: unknown) => data),
}))

vi.stubGlobal(
  'Worker',
  vi.fn(function MockWorker() {}),
)

import { useScene } from './useScene'

describe('useScene', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBuildPart.mockResolvedValue({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    })
  })

  it('starts with one default board labelled "Board 1"', () => {
    const { result } = renderHook(() => useScene())
    expect(result.current.scene.parts).toHaveLength(1)
    expect(result.current.scene.parts[0].label).toBe('Board 1')
    expect(result.current.scene.parts[0].kind).toBe('board')
  })

  it('starts with occtReady false', () => {
    const { result } = renderHook(() => useScene())
    expect(result.current.occtReady).toBe(false)
  })

  it('sets occtReady true after first buildPart resolves', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
  })

  it('onAdd is a no-op when occtReady is false', () => {
    const { result } = renderHook(() => useScene())
    act(() => {
      result.current.onAdd()
    })
    expect(result.current.scene.parts).toHaveLength(1)
  })

  it('onAdd appends a new board when occtReady is true', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd()
    })
    expect(result.current.scene.parts).toHaveLength(2)
    expect(result.current.scene.parts[1].label).toBe('Board 2')
  })

  it('onAdd auto-selects the new part', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd()
    })
    const newId = result.current.scene.parts[1].id
    expect(result.current.selectedId).toBe(newId)
  })

  it('onRemove removes the part and clears selectedId when matched', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd()
    })
    const id = result.current.scene.parts[1].id
    act(() => {
      result.current.onRemove(id)
    })
    expect(result.current.scene.parts).toHaveLength(1)
    expect(result.current.selectedId).toBeNull()
  })

  it('onUpdate replaces the matching part', () => {
    const { result } = renderHook(() => useScene())
    const original = result.current.scene.parts[0]
    act(() => {
      result.current.onUpdate(original.id, (p) => ({ ...p, label: 'Updated' }))
    })
    expect(result.current.scene.parts[0].label).toBe('Updated')
  })

  it('onDuplicate appends a clone after the original', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const id = result.current.scene.parts[0].id
    act(() => {
      result.current.onDuplicate(id)
    })
    expect(result.current.scene.parts).toHaveLength(2)
    expect(result.current.scene.parts[1].id).not.toBe(id)
  })

  it('onDuplicate resets rotation to zero', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    const original = result.current.scene.parts[0]
    act(() => {
      result.current.onUpdate(original.id, (p) => ({ ...p, rotation: { x: 45, y: 0, z: 0 } }))
    })
    act(() => {
      result.current.onDuplicate(original.id)
    })
    expect(result.current.scene.parts[1].rotation).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('nextLabel increments with each add', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    expect(result.current.nextLabel).toBe('Board 2')
    act(() => {
      result.current.onAdd()
    })
    expect(result.current.nextLabel).toBe('Board 3')
  })

  it('replaceScene replaces parts, clears selectedId, resets labelCounter', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => {
      result.current.onAdd()
    })
    act(() => {
      result.current.onSelect(result.current.scene.parts[1].id)
    })

    const replacement = {
      parts: [
        {
          kind: 'board' as const,
          id: 'board_test',
          label: 'Board 5',
          length: 300,
          width: 150,
          thickness: 30,
          color: '#d4a373',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ' as const,
        },
      ],
    }
    act(() => {
      result.current.replaceScene(replacement)
    })

    expect(result.current.scene.parts).toHaveLength(1)
    expect(result.current.scene.parts[0].id).toBe('board_test')
    expect(result.current.selectedId).toBeNull()
    expect(result.current.nextLabel).toBe('Board 6')
  })

  it('replaceScene with empty parts resets labelCounter to 1', () => {
    const { result } = renderHook(() => useScene())
    act(() => {
      result.current.replaceScene({ parts: [] })
    })
    expect(result.current.scene.parts).toHaveLength(0)
    expect(result.current.nextLabel).toBe('Board 1')
  })
})
