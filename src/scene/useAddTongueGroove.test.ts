import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useAddTongueGroove } from './useAddTongueGroove'

const groove: Part = {
  kind: 'board',
  id: 'G',
  label: 'G',
  length: 800,
  width: 150,
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
const tongue: Part = { ...groove, id: 'T', position: { x: 0, y: 160, z: 0 } }
const hit = (partId: string, n: { x: number; y: number; z: number }): FaceHit => ({
  partId,
  faceNormal: n,
  faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: n,
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 0 },
})

test('two facing long edges create a tongue & groove joint', () => {
  const onAddTongueGroove = vi.fn()
  const { result } = renderHook(() =>
    useAddTongueGroove({ parts: [groove, tongue], onAddTongueGroove }),
  )
  act(() => result.current.activateTongueGroove())
  act(() => result.current.onFaceClick(hit('G', { x: 0, y: 1, z: 0 })))
  expect(onAddTongueGroove).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('T', { x: 0, y: -1, z: 0 })))
  expect(onAddTongueGroove).toHaveBeenCalledTimes(1)
})

test('a second click on the same board does not create a joint', () => {
  const onAddTongueGroove = vi.fn()
  const { result } = renderHook(() =>
    useAddTongueGroove({ parts: [groove, tongue], onAddTongueGroove }),
  )
  act(() => result.current.activateTongueGroove())
  act(() => result.current.onFaceClick(hit('G', { x: 0, y: 1, z: 0 })))
  act(() => result.current.onFaceClick(hit('G', { x: 0, y: 1, z: 0 })))
  expect(onAddTongueGroove).not.toHaveBeenCalled()
  expect(result.current.pendingA).toBeNull()
  expect(result.current.statusMessage).toMatch(/different board/i)
})

test('a non-facing second edge (parallel end) does not create a joint', () => {
  const onAddTongueGroove = vi.fn()
  const { result } = renderHook(() =>
    useAddTongueGroove({ parts: [groove, tongue], onAddTongueGroove }),
  )
  act(() => result.current.activateTongueGroove())
  act(() => result.current.onFaceClick(hit('G', { x: 0, y: 1, z: 0 })))
  act(() => result.current.onFaceClick(hit('T', { x: 1, y: 0, z: 0 }))) // +X end, not a facing edge
  expect(onAddTongueGroove).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/edge/i)
})
