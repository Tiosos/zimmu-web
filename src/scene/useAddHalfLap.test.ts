import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useAddHalfLap } from './useAddHalfLap'

const board = (id: string): Part => ({
  kind: 'board',
  id,
  label: id,
  length: 100,
  width: 100,
  thickness: 20,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
})
const hit = (partId: string): FaceHit => ({
  partId,
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 0 },
})

test('two clicks on different boards create a half-lap', () => {
  const onAddHalfLap = vi.fn()
  const parts = [board('A'), board('B')]
  const { result } = renderHook(() => useAddHalfLap({ parts, onAddHalfLap }))
  act(() => result.current.activateHalfLap())
  act(() => result.current.onFaceClick(hit('A')))
  expect(onAddHalfLap).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('B')))
  expect(onAddHalfLap).toHaveBeenCalledWith('A', 'B')
  expect(result.current.pendingA).toBeNull()
  expect(result.current.halfLapActive).toBe(false)
})

test('a second click on the same board does not create a half-lap', () => {
  const onAddHalfLap = vi.fn()
  const parts = [board('A'), board('B')]
  const { result } = renderHook(() => useAddHalfLap({ parts, onAddHalfLap }))
  act(() => result.current.activateHalfLap())
  act(() => result.current.onFaceClick(hit('A')))
  act(() => result.current.onFaceClick(hit('A')))
  expect(onAddHalfLap).not.toHaveBeenCalled()
  expect(result.current.pendingA).toBeNull()
  expect(result.current.statusMessage).toMatch(/different board/i)
})
