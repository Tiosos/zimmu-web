import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part, PartId } from './types'

// Mock snapMath so tests don't depend on Three.js math correctness
vi.mock('./snapMath', () => ({
  computeSnapTransform: () => ({
    position: { x: 0, y: 0, z: 100 },
    rotation: { x: 0, y: 0, z: 0 },
  }),
  computeDowelSnapTransform: vi.fn((_src, _tgt, _dowel, coaxial: boolean) => ({
    position: { x: coaxial ? 1 : 2, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  })),
  isSnapFace: (part: Part, lfn: { z: number }) =>
    part.kind === 'board' ? true : Math.abs(lfn.z) > 0.9,
  computeFaceCorners: vi.fn(),
  computeLocalFaceCenter: vi.fn(),
}))

import { useSnap } from './useSnap'

const partA: Part = {
  kind: 'board',
  id: 'a',
  label: 'Board A',
  length: 100,
  width: 50,
  thickness: 25,
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
const partB: Part = {
  kind: 'board',
  id: 'b',
  label: 'Board B',
  length: 100,
  width: 50,
  thickness: 25,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 200 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
}

const dowelD: Part = {
  kind: 'cylinder',
  id: 'd',
  label: 'Dowel D',
  diameter: 10,
  length: 100,
  material: '',
  color: '#c19a6b',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
}

const capOnD: FaceHit = {
  partId: 'd',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 0, y: 0, z: 100 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 100 },
}

const lateralOnD: FaceHit = {
  partId: 'd',
  faceNormal: { x: 1, y: 0, z: 0 },
  faceCenter: { x: 5, y: 0, z: 50 },
  localFaceNormal: { x: 1, y: 0, z: 0 },
  localHitPoint: { x: 5, y: 0, z: 50 },
  hitPoint: { x: 5, y: 0, z: 50 },
}

// Source face on A pointing +Z, target face on B pointing -Z (anti-parallel)
const faceOnA: FaceHit = {
  partId: 'a',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 50, y: 25, z: 25 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 50, y: 25, z: 25 },
}
const faceOnB: FaceHit = {
  partId: 'b',
  faceNormal: { x: 0, y: 0, z: -1 },
  faceCenter: { x: 50, y: 25, z: 200 },
  localFaceNormal: { x: 0, y: 0, z: -1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 50, y: 25, z: 200 },
}

describe('useSnap', () => {
  let onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void

  beforeEach(() => {
    onUpdate = vi.fn()
  })

  it('initial state: inactive, idle phase, no faces', () => {
    const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
    expect(result.current.snapActive).toBe(false)
    expect(result.current.snapPhase).toBe('idle')
    expect(result.current.sourceFace).toBeNull()
    expect(result.current.hoveredFace).toBeNull()
  })

  describe('activateSnap', () => {
    it('activates snap and sets phase to idle', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      expect(result.current.snapActive).toBe(true)
      expect(result.current.snapPhase).toBe('idle')
    })

    it('toggles off when called while active (button toggle)', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.activateSnap()
      })
      expect(result.current.snapActive).toBe(false)
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
    })
  })

  describe('cancelSnap', () => {
    it('from idle-active: resets all four fields to initial values', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.cancelSnap()
      })
      expect(result.current.snapActive).toBe(false)
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
    })

    it('from source-picked: resets all four fields', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      expect(result.current.snapPhase).toBe('source-picked')
      act(() => {
        result.current.cancelSnap()
      })
      expect(result.current.snapActive).toBe(false)
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
    })
  })

  describe('onFaceHover in idle phase', () => {
    it('is a no-op — hoveredFace stays null', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceHover(faceOnA)
      })
      expect(result.current.hoveredFace).toBeNull()
    })
  })

  describe('onFaceClick in idle phase', () => {
    it('records source face and transitions to source-picked', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      expect(result.current.sourceFace).toEqual(faceOnA)
      expect(result.current.snapPhase).toBe('source-picked')
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('is a no-op when snap is inactive', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.snapPhase).toBe('idle')
    })
  })

  describe('onFaceClick in source-picked phase', () => {
    it('valid target: calls onUpdate once, resets to active-idle', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      act(() => {
        result.current.onFaceClick(faceOnB)
      })

      expect(onUpdate).toHaveBeenCalledTimes(1)
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
      expect(result.current.snapActive).toBe(true) // stays active for chaining
    })

    it('onUpdate receives correct updater: applies position and rotation from computeSnapTransform', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      act(() => {
        result.current.onFaceClick(faceOnB)
      })

      const [, updater] = (onUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [
        PartId,
        (p: Part) => Part,
        string,
      ]
      const result2 = updater(partA)
      // mock computeSnapTransform returns { position: { x:0, y:0, z:100 }, rotation: { x:0, y:0, z:0 } }
      expect(result2.position).toEqual({ x: 0, y: 0, z: 100 })
      expect(result2.rotation).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('onUpdate receives history label "Snap Board A to Board B"', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      act(() => {
        result.current.onFaceClick(faceOnB)
      })

      const [, , label] = (onUpdate as ReturnType<typeof vi.fn>).mock.calls[0] as [
        PartId,
        (p: Part) => Part,
        string,
      ]
      expect(label).toBe('Snap Board A to Board B')
    })

    it('same-part guard: ignores click on same part as source', () => {
      const anotherFaceOnA: FaceHit = {
        ...faceOnA,
        faceNormal: { x: 0, y: 0, z: -1 },
        localFaceNormal: { x: 0, y: 0, z: -1 },
      }
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      act(() => {
        result.current.onFaceClick(anotherFaceOnA)
      })
      expect(onUpdate).not.toHaveBeenCalled()
      expect(result.current.snapPhase).toBe('source-picked')
    })
  })

  describe('onFaceHover in source-picked phase', () => {
    it('sets hoveredFace for valid target', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      act(() => {
        result.current.onFaceHover(faceOnB)
      })
      expect(result.current.hoveredFace).toEqual(faceOnB)
    })

    it('same-part guard: hoveredFace stays null when hovering source part', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      act(() => {
        result.current.onFaceHover(faceOnA)
      })
      expect(result.current.hoveredFace).toBeNull()
    })

    it('null hit clears hoveredFace', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, partB], onUpdate }))
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      act(() => {
        result.current.onFaceHover(faceOnB)
      })
      act(() => {
        result.current.onFaceHover(null)
      })
      expect(result.current.hoveredFace).toBeNull()
    })
  })

  describe('source part deletion', () => {
    it('cancels snap when source part is removed from parts', () => {
      const { result, rerender } = renderHook(
        ({ parts }: { parts: Part[] }) => useSnap({ parts, onUpdate }),
        { initialProps: { parts: [partA, partB] } },
      )
      act(() => {
        result.current.activateSnap()
      })
      act(() => {
        result.current.onFaceClick(faceOnA)
      })
      expect(result.current.snapPhase).toBe('source-picked')

      rerender({ parts: [partB] }) // partA removed
      expect(result.current.snapActive).toBe(false)
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
      expect(result.current.snapPhase).toBe('idle')
    })
  })

  describe('dowel snap routing', () => {
    it('dowel source cap → board face: routes to computeDowelSnapTransform with coaxial=false', () => {
      const { result } = renderHook(() => useSnap({ parts: [dowelD, partB], onUpdate }))
      act(() => result.current.activateSnap())
      act(() => result.current.onFaceClick(capOnD)) // source = dowel cap
      act(() => result.current.onFaceClick(faceOnB)) // target = board face (not a cap)
      expect(onUpdate).toHaveBeenCalledTimes(1)
      const updater = (onUpdate as ReturnType<typeof vi.fn>).mock.calls[0][1] as (p: Part) => Part
      expect(updater(dowelD).position).toEqual({ x: 2, y: 0, z: 0 }) // coaxial=false branch
    })

    it('dowel source cap → dowel cap: routes with coaxial=true', () => {
      const dowelE: Part = { ...dowelD, id: 'e', position: { x: 0, y: 0, z: 300 } }
      const capOnE: FaceHit = {
        ...capOnD,
        partId: 'e',
        faceNormal: { x: 0, y: 0, z: -1 },
        localFaceNormal: { x: 0, y: 0, z: -1 },
      }
      const { result } = renderHook(() => useSnap({ parts: [dowelD, dowelE], onUpdate }))
      act(() => result.current.activateSnap())
      act(() => result.current.onFaceClick(capOnD))
      act(() => result.current.onFaceClick(capOnE))
      expect(onUpdate).toHaveBeenCalledTimes(1)
      const updater = (onUpdate as ReturnType<typeof vi.fn>).mock.calls[0][1] as (p: Part) => Part
      expect(updater(dowelD).position).toEqual({ x: 1, y: 0, z: 0 }) // coaxial=true branch
    })

    it('board source → dowel cap: bidirectional, uses board transform', () => {
      const { result } = renderHook(() => useSnap({ parts: [partA, dowelD], onUpdate }))
      act(() => result.current.activateSnap())
      act(() => result.current.onFaceClick(faceOnA)) // source = board face
      act(() => result.current.onFaceClick(capOnD)) // target = dowel cap
      expect(onUpdate).toHaveBeenCalledTimes(1)
      const updater = (onUpdate as ReturnType<typeof vi.fn>).mock.calls[0][1] as (p: Part) => Part
      expect(updater(partA).position).toEqual({ x: 0, y: 0, z: 100 }) // computeSnapTransform mock
    })

    it('dowel lateral face is rejected as a source (no source set)', () => {
      const { result } = renderHook(() => useSnap({ parts: [dowelD, partB], onUpdate }))
      act(() => result.current.activateSnap())
      act(() => result.current.onFaceClick(lateralOnD)) // lateral → not a snap face
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
    })

    it('dowel lateral face is rejected as a target (no snap applied)', () => {
      const { result } = renderHook(() => useSnap({ parts: [dowelD, partB], onUpdate }))
      act(() => result.current.activateSnap())
      act(() => result.current.onFaceClick(faceOnB)) // source = board face (valid)
      act(() => result.current.onFaceClick(lateralOnD)) // target lateral → rejected
      expect(onUpdate).not.toHaveBeenCalled()
    })
  })
})
