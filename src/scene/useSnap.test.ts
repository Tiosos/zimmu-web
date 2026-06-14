import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part, PartId } from './types'

// Mock snapMath so tests don't depend on Three.js math correctness
vi.mock('./snapMath', () => ({
  computeSnapTransform: () => ({
    position: { x: 0, y: 0, z: 100 },
    rotation: { x: 0, y: 0, z: 0 },
  }),
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
}

// Source face on A pointing +Z, target face on B pointing -Z (anti-parallel)
const faceOnA: FaceHit = {
  partId: 'a',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 50, y: 25, z: 25 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
}
const faceOnB: FaceHit = {
  partId: 'b',
  faceNormal: { x: 0, y: 0, z: -1 },
  faceCenter: { x: 50, y: 25, z: 200 },
  localFaceNormal: { x: 0, y: 0, z: -1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
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
})
