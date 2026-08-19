import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAddCut } from './useAddCut'
import type { BoardPart, BoxCut, CylinderPart, FaceHit, Part } from './types'

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
  parentId: null,
  driven: false,
}

function makeHit(overrides: Partial<FaceHit> = {}): FaceHit {
  return {
    partId: 'board_test',
    faceNormal: { x: 0, y: 0, z: 1 },
    faceCenter: { x: 100, y: 50, z: 25 },
    localFaceNormal: { x: 0, y: 0, z: 1 },
    localHitPoint: { x: 100, y: 50, z: 25 },
    hitPoint: { x: 100, y: 50, z: 25 },
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

function dowel(): CylinderPart {
  return {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 8,
    length: 100,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
  }
}
function capHit(): FaceHit {
  return {
    partId: 'd1',
    faceNormal: { x: 0, y: 0, z: 1 },
    faceCenter: { x: 0, y: 0, z: 100 },
    localFaceNormal: { x: 0, y: 0, z: 1 },
    localHitPoint: { x: 2, y: 0, z: 100 },
    hitPoint: { x: 0, y: 0, z: 100 },
  }
}
function lateralHit(): FaceHit {
  return {
    partId: 'd1',
    faceNormal: { x: 1, y: 0, z: 0 },
    faceCenter: { x: 4, y: 0, z: 50 },
    localFaceNormal: { x: 1, y: 0, z: 0 },
    localHitPoint: { x: 4, y: 0, z: 50 },
    hitPoint: { x: 4, y: 0, z: 50 },
  }
}

describe('useAddCut — dowel end tool', () => {
  it('adds an end cut when the End tool is armed and a cap is clicked', () => {
    let parts: Part[] = [dowel()]
    const onUpdate = vi.fn((id, updater) => {
      parts = parts.map((p) => (p.id === id ? updater(p) : p))
    })
    const { result } = renderHook(() => useAddCut({ parts, onUpdate, onSelect: vi.fn() }))
    act(() => result.current.armDowelTool('end'))
    act(() => result.current.onFaceClick(capHit()))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    const updated = parts[0] as CylinderPart
    expect(updated.cuts).toHaveLength(1)
    expect(updated.cuts[0]).toMatchObject({ kind: 'end', end: '+Z' })
  })

  it('ignores a lateral click when the End tool is armed (surface mismatch)', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [dowel()], onUpdate, onSelect: vi.fn() }),
    )
    act(() => result.current.armDowelTool('end'))
    act(() => result.current.onFaceClick(lateralHit()))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when no dowel tool is armed', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [dowel()], onUpdate, onSelect: vi.fn() }),
    )
    act(() => result.current.onFaceClick(capHit()))
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('useAddCut — dowel bore tools', () => {
  it('Axial bore on a cap seeds a bore', () => {
    let parts: Part[] = [dowel()]
    const onUpdate = vi.fn((id, updater) => {
      parts = parts.map((p) => (p.id === id ? updater(p) : p))
    })
    const { result } = renderHook(() => useAddCut({ parts, onUpdate, onSelect: vi.fn() }))
    act(() => result.current.armDowelTool('bore-axial'))
    act(() => result.current.onFaceClick(capHit()))
    const cut = (parts[0] as CylinderPart).cuts[0]
    expect(cut).toMatchObject({ kind: 'bore-axial', end: '+Z' })
  })

  it('Transverse bore on the lateral surface uses the hit azimuth + height', () => {
    let parts: Part[] = [dowel()]
    const onUpdate = vi.fn((id, updater) => {
      parts = parts.map((p) => (p.id === id ? updater(p) : p))
    })
    const { result } = renderHook(() => useAddCut({ parts, onUpdate, onSelect: vi.fn() }))
    act(() => result.current.armDowelTool('bore-transverse'))
    act(() => result.current.onFaceClick(lateralHit()))
    const cut = (parts[0] as CylinderPart).cuts[0]
    expect(cut).toMatchObject({ kind: 'bore-transverse', position: 50, azimuth: 0 })
  })
})

describe('useAddCut — dowel notch tool', () => {
  it('Notch tool on the lateral surface seeds a notch at the hit', () => {
    let parts: Part[] = [dowel()]
    const onUpdate = vi.fn((id, updater) => {
      parts = parts.map((p) => (p.id === id ? updater(p) : p))
    })
    const { result } = renderHook(() => useAddCut({ parts, onUpdate, onSelect: vi.fn() }))
    act(() => result.current.armDowelTool('notch'))
    act(() => result.current.onFaceClick(lateralHit()))
    const cut = (parts[0] as CylinderPart).cuts[0]
    expect(cut).toMatchObject({ kind: 'notch', position: 50, azimuth: 0, depth: 2, width: 20 })
  })

  it('Notch tool ignores a cap click', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [dowel()], onUpdate, onSelect: vi.fn() }),
    )
    act(() => result.current.armDowelTool('notch'))
    act(() => result.current.onFaceClick(capHit()))
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
