import { test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { BoardPart, FaceHit } from './types'

let mockValid = true
vi.mock('../geom/dado', () => ({ isValidDadoSeat: () => mockValid }))
import { useAddJoint } from './useAddJoint'
import { componentsById } from './componentTree'

const NO_COMPONENTS = componentsById([])

const board = (id: string): BoardPart => ({
  kind: 'board',
  id,
  label: id,
  length: 100,
  width: 50,
  thickness: 20,
  grain: 'free' as const,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
})
const hit = (partId: string): FaceHit => ({
  partId,
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 0 },
})
const parts = [board('A'), board('B')]

beforeEach(() => {
  mockValid = true
})

test('first click stores the housing; second valid click calls onAddJoint', () => {
  const onAddJoint = vi.fn()
  const { result } = renderHook(() => useAddJoint({ parts, byId: NO_COMPONENTS, onAddJoint }))
  act(() => result.current.activateJoint())
  act(() => result.current.onFaceClick(hit('A')))
  expect(result.current.pendingHousing?.partId).toBe('A')
  expect(onAddJoint).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('B')))
  expect(onAddJoint).toHaveBeenCalledTimes(1)
  expect(result.current.pendingHousing).toBeNull()
})

test('clicking the same part twice is rejected with a message', () => {
  const onAddJoint = vi.fn()
  const { result } = renderHook(() => useAddJoint({ parts, byId: NO_COMPONENTS, onAddJoint }))
  act(() => result.current.activateJoint())
  act(() => result.current.onFaceClick(hit('A')))
  act(() => result.current.onFaceClick(hit('A')))
  expect(onAddJoint).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/different part/i)
  expect(result.current.pendingHousing).toBeNull()
})

test('an invalid seat is rejected with a message', () => {
  mockValid = false
  const onAddJoint = vi.fn()
  const { result } = renderHook(() => useAddJoint({ parts, byId: NO_COMPONENTS, onAddJoint }))
  act(() => result.current.activateJoint())
  act(() => result.current.onFaceClick(hit('A')))
  act(() => result.current.onFaceClick(hit('B')))
  expect(onAddJoint).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/perpendicular/i)
})
