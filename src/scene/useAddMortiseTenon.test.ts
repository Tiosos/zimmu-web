import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useAddMortiseTenon } from './useAddMortiseTenon'

const mortise: Part = {
  kind: 'board',
  id: 'M',
  label: 'M',
  length: 200,
  width: 100,
  thickness: 40,
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
const tenon: Part = {
  ...mortise,
  id: 'T',
  length: 120,
  width: 60,
  thickness: 30,
  rotation: { x: 0, y: 90, z: 0 },
}
const hit = (partId: string, n: { x: number; y: number; z: number }): FaceHit => ({
  partId,
  faceNormal: n,
  faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: n,
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 0 },
})

test('mortise face + perpendicular tenon end create a mortise & tenon', () => {
  const onAddMortiseTenon = vi.fn()
  const { result } = renderHook(() =>
    useAddMortiseTenon({ parts: [mortise, tenon], onAddMortiseTenon }),
  )
  act(() => result.current.activateMortiseTenon())
  act(() => result.current.onFaceClick(hit('M', { x: 0, y: 0, z: 1 }))) // +Z mortise face
  expect(onAddMortiseTenon).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('T', { x: 1, y: 0, z: 0 }))) // +X tenon end
  expect(onAddMortiseTenon).toHaveBeenCalledTimes(1)
})

test('a non-perpendicular second hit does not create a joint', () => {
  const onAddMortiseTenon = vi.fn()
  const flat: Part = { ...tenon, rotation: { x: 0, y: 0, z: 0 } } // +X end now points world +X, not −Z
  const { result } = renderHook(() =>
    useAddMortiseTenon({ parts: [mortise, flat], onAddMortiseTenon }),
  )
  act(() => result.current.activateMortiseTenon())
  act(() => result.current.onFaceClick(hit('M', { x: 0, y: 0, z: 1 })))
  act(() => result.current.onFaceClick(hit('T', { x: 1, y: 0, z: 0 })))
  expect(onAddMortiseTenon).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/perpendicular/i)
})

test('a thickness-face tenon end (a face, not a board end) does not create a joint', () => {
  const onAddMortiseTenon = vi.fn()
  // Flat board: its −Z face is anti-parallel to the +Z mortise face (so a bare perpendicular
  // check passes) but it is a thickness face, not a length/width end — an invalid tenon.
  const flat: Part = { ...tenon, rotation: { x: 0, y: 0, z: 0 } }
  const { result } = renderHook(() =>
    useAddMortiseTenon({ parts: [mortise, flat], onAddMortiseTenon }),
  )
  act(() => result.current.activateMortiseTenon())
  act(() => result.current.onFaceClick(hit('M', { x: 0, y: 0, z: 1 })))
  act(() => result.current.onFaceClick(hit('T', { x: 0, y: 0, z: -1 })))
  expect(onAddMortiseTenon).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/board end/i)
})

test('a second click on the same board does not create a joint', () => {
  const onAddMortiseTenon = vi.fn()
  const { result } = renderHook(() =>
    useAddMortiseTenon({ parts: [mortise, tenon], onAddMortiseTenon }),
  )
  act(() => result.current.activateMortiseTenon())
  act(() => result.current.onFaceClick(hit('M', { x: 0, y: 0, z: 1 })))
  act(() => result.current.onFaceClick(hit('M', { x: 0, y: 0, z: 1 })))
  expect(onAddMortiseTenon).not.toHaveBeenCalled()
  expect(result.current.pendingMortise).toBeNull()
  expect(result.current.statusMessage).toMatch(/different board/i)
})
