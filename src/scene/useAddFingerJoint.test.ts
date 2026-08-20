import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useAddFingerJoint } from './useAddFingerJoint'
import { componentsById } from './componentTree'

const NO_COMPONENTS = componentsById([])

const a: Part = {
  kind: 'board',
  id: 'A',
  label: 'A',
  length: 200,
  width: 80,
  thickness: 18,
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
const b: Part = { ...a, id: 'B', rotation: { x: 0, y: 90, z: 0 } }
const hit = (partId: string, n: { x: number; y: number; z: number }): FaceHit => ({
  partId,
  faceNormal: n,
  faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: n,
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 0 },
})

test('two perpendicular equal-width ends create a finger joint', () => {
  const onAddFingerJoint = vi.fn()
  const { result } = renderHook(() =>
    useAddFingerJoint({ parts: [a, b], byId: NO_COMPONENTS, onAddFingerJoint }),
  )
  act(() => result.current.activateFingerJoint())
  act(() => result.current.onFaceClick(hit('A', { x: 1, y: 0, z: 0 })))
  expect(onAddFingerJoint).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('B', { x: 1, y: 0, z: 0 })))
  expect(onAddFingerJoint).toHaveBeenCalledTimes(1)
})

test('a second click on the same board does not create a joint', () => {
  const onAddFingerJoint = vi.fn()
  const { result } = renderHook(() =>
    useAddFingerJoint({ parts: [a, b], byId: NO_COMPONENTS, onAddFingerJoint }),
  )
  act(() => result.current.activateFingerJoint())
  act(() => result.current.onFaceClick(hit('A', { x: 1, y: 0, z: 0 })))
  act(() => result.current.onFaceClick(hit('A', { x: 1, y: 0, z: 0 })))
  expect(onAddFingerJoint).not.toHaveBeenCalled()
  expect(result.current.pendingA).toBeNull()
  expect(result.current.statusMessage).toMatch(/different board/i)
})

test('a non-corner second hit (parallel ends) does not create a joint', () => {
  const onAddFingerJoint = vi.fn()
  const flat: Part = { ...b, rotation: { x: 0, y: 0, z: 0 } } // +X end now world +X, not a corner
  const { result } = renderHook(() =>
    useAddFingerJoint({ parts: [a, flat], byId: NO_COMPONENTS, onAddFingerJoint }),
  )
  act(() => result.current.activateFingerJoint())
  act(() => result.current.onFaceClick(hit('A', { x: 1, y: 0, z: 0 })))
  act(() => result.current.onFaceClick(hit('B', { x: 1, y: 0, z: 0 })))
  expect(onAddFingerJoint).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/corner/i)
})
