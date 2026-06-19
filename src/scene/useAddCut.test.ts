import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAddCut } from './useAddCut'
import type { BoardPart, BoxCut, FaceHit, Part } from './types'

const mockPart: BoardPart = {
  kind: 'board',
  id: 'board_test',
  label: 'Board 1',
  length: 200,
  width: 100,
  thickness: 25,
  material: '',
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}

function makeHit(overrides: Partial<FaceHit> = {}): FaceHit {
  return {
    partId: 'board_test',
    faceNormal: { x: 0, y: 0, z: 1 },
    faceCenter: { x: 100, y: 50, z: 25 },
    localFaceNormal: { x: 0, y: 0, z: 1 },
    localHitPoint: { x: 100, y: 50, z: 25 },
    ...overrides,
  }
}

describe('useAddCut', () => {
  it('starts with cutActive false, lastPlacedCutId null', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    expect(result.current.cutActive).toBe(false)
    expect(result.current.lastPlacedCutId).toBeNull()
  })

  it('activateCut toggles cutActive on/off', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    act(() => {
      result.current.activateCut()
    })
    expect(result.current.cutActive).toBe(true)
    act(() => {
      result.current.activateCut()
    })
    expect(result.current.cutActive).toBe(false)
  })

  it('cancelCut sets cutActive false and clears lastPlacedCutId', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    act(() => {
      result.current.activateCut()
    })
    act(() => {
      result.current.cancelCut()
    })
    expect(result.current.cutActive).toBe(false)
    expect(result.current.lastPlacedCutId).toBeNull()
  })

  it('onFaceClick when inactive: no-op', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate, onSelect: vi.fn() }),
    )
    act(() => {
      result.current.onFaceClick(makeHit())
    })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('onFaceClick +Z face: correct position and size', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate, onSelect: vi.fn() }),
    )
    act(() => {
      result.current.activateCut()
    })
    act(() => {
      result.current.onFaceClick(
        makeHit({
          localFaceNormal: { x: 0, y: 0, z: 1 },
          localHitPoint: { x: 100, y: 50, z: 25 },
        }),
      )
    })
    expect(onUpdate).toHaveBeenCalledWith('board_test', expect.any(Function), 'Add cut')
    const updater = onUpdate.mock.calls[0][1] as (p: BoardPart) => BoardPart
    const updated = updater(mockPart)
    expect(updated.cuts).toHaveLength(1)
    const cut = updated.cuts[0] as BoxCut
    expect(cut.face).toBe('+Z')
    expect(cut.label).toBe('Cut 1')
    expect(cut.size).toEqual({ x: 20, y: 20, z: 10 })
    // depth corner: z = thickness - size.z = 25 - 10 = 15
    // u-centre: x = 100 - 10 = 90
    // v-centre: y = 50 - 10 = 40
    expect(cut.position).toEqual({ x: 90, y: 40, z: 15 })
  })

  it('onFaceClick -Z face: depth corner at z=0', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate, onSelect: vi.fn() }),
    )
    act(() => {
      result.current.activateCut()
    })
    act(() => {
      result.current.onFaceClick(
        makeHit({
          localFaceNormal: { x: 0, y: 0, z: -1 },
          localHitPoint: { x: 100, y: 50, z: 0 },
        }),
      )
    })
    const updater = onUpdate.mock.calls[0][1] as (p: Part) => BoardPart
    const cut = updater(mockPart).cuts[0] as BoxCut
    expect(cut.face).toBe('-Z')
    expect(cut.position.z).toBe(0)
  })

  it('onFaceClick +X face: correct face string', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate, onSelect: vi.fn() }),
    )
    act(() => {
      result.current.activateCut()
    })
    act(() => {
      result.current.onFaceClick(
        makeHit({
          localFaceNormal: { x: 1, y: 0, z: 0 },
          localHitPoint: { x: 200, y: 50, z: 12 },
        }),
      )
    })
    const updater = onUpdate.mock.calls[0][1] as (p: Part) => BoardPart
    expect((updater(mockPart).cuts[0] as BoxCut).face).toBe('+X')
  })

  it('onFaceClick calls onSelect with partId', () => {
    const onSelect = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect }),
    )
    act(() => {
      result.current.activateCut()
    })
    act(() => {
      result.current.onFaceClick(makeHit())
    })
    expect(onSelect).toHaveBeenCalledWith('board_test')
  })

  it('onFaceClick sets lastPlacedCutId; cutActive stays true for chaining', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    act(() => {
      result.current.activateCut()
    })
    act(() => {
      result.current.onFaceClick(makeHit())
    })
    expect(result.current.lastPlacedCutId).not.toBeNull()
    expect(result.current.cutActive).toBe(true)
  })

  it('cancelCut clears lastPlacedCutId', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    act(() => {
      result.current.activateCut()
    })
    act(() => {
      result.current.onFaceClick(makeHit())
    })
    act(() => {
      result.current.cancelCut()
    })
    expect(result.current.lastPlacedCutId).toBeNull()
  })

  it('label increments with existing cuts count', () => {
    const onUpdate = vi.fn()
    const partWithOneCut: BoardPart = {
      ...mockPart,
      cuts: [
        {
          id: 'existing',
          label: 'Cut 1',
          kind: 'box',
          face: '+Z',
          position: { x: 0, y: 0, z: 15 },
          size: { x: 20, y: 20, z: 10 },
        },
      ],
    }
    const { result } = renderHook(() =>
      useAddCut({ parts: [partWithOneCut], onUpdate, onSelect: vi.fn() }),
    )
    act(() => {
      result.current.activateCut()
    })
    act(() => {
      result.current.onFaceClick(makeHit())
    })
    const updater = onUpdate.mock.calls[0][1] as (p: BoardPart) => BoardPart
    const cut = updater(partWithOneCut).cuts[1]
    expect(cut.label).toBe('Cut 2')
  })
})
