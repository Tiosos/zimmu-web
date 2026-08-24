import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useInteractionMode } from './useInteractionMode'
import { componentsById } from './componentTree'

const NO_COMPONENTS = componentsById([])

const boardA: Part = {
  kind: 'board',
  id: 'A',
  label: 'A',
  length: 200,
  width: 100,
  thickness: 25,
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
}
const boardB: Part = { ...boardA, id: 'B', rotation: { x: 0, y: 90, z: 0 } }
const hit = (partId: string, n: { x: number; y: number; z: number }): FaceHit => ({
  partId,
  faceNormal: n,
  faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: n,
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 0 },
})

const setup = (parts: Part[] = [boardA, boardB]) => {
  const onAddJoint = vi.fn()
  const r = renderHook(() =>
    useInteractionMode({
      parts,
      byId: NO_COMPONENTS,
      onUpdate: vi.fn(),
      onSelect: vi.fn(),
      onRotationSnap: vi.fn(),
      onAddJoint,
      onAddHalfLap: vi.fn(),
      onAddMortiseTenon: vi.fn(),
      onAddFingerJoint: vi.fn(),
      onAddTongueGroove: vi.fn(),
    }),
  )
  return { ...r, onAddJoint }
}

test('initial mode is none and inactive', () => {
  const { result } = setup()
  expect(result.current.activeMode).toBe('none')
  expect(result.current.interactionActive).toBe(false)
})

test('setMode activates one mode exclusively', () => {
  const { result } = setup()
  act(() => result.current.setMode('snap'))
  expect(result.current.activeMode).toBe('snap')
  expect(result.current.interactionActive).toBe(true)
  act(() => result.current.setMode('cut'))
  expect(result.current.activeMode).toBe('cut') // snap cancelled
})

test('setMode(X) while X active toggles off to none', () => {
  const { result } = setup()
  act(() => result.current.setMode('finger'))
  expect(result.current.activeMode).toBe('finger')
  act(() => result.current.setMode('finger'))
  expect(result.current.activeMode).toBe('none')
})

test("setMode('none') cancels the active mode", () => {
  const { result } = setup()
  act(() => result.current.setMode('mortiseTenon'))
  act(() => result.current.setMode('none'))
  expect(result.current.activeMode).toBe('none')
})

test('onFaceClick routes to the active mode; a two-click dado creates a joint', () => {
  const { result, onAddJoint } = setup()
  act(() => result.current.setMode('dado'))
  act(() => result.current.onFaceClick(hit('A', { x: 0, y: 0, z: 1 }))) // housing +Z
  expect(onAddJoint).not.toHaveBeenCalled()
  expect(result.current.sourceFace).not.toBeNull() // pendingHousing tracked via sourceFace
  act(() => result.current.onFaceClick(hit('B', { x: 1, y: 0, z: 0 }))) // housed +X end (perpendicular)
  expect(onAddJoint).toHaveBeenCalledTimes(1)
  expect(result.current.activeMode).toBe('none')
})

test('sourceFace maps to the active mode (snap, second mapping)', () => {
  const { result } = setup()
  act(() => result.current.setMode('snap'))
  act(() => result.current.onFaceClick(hit('A', { x: 0, y: 0, z: 1 })))
  expect(result.current.sourceFace).not.toBeNull() // snap.sourceFace after the first pick
})

test('click is a no-op when no mode is active', () => {
  const { result, onAddJoint } = setup()
  act(() => result.current.onFaceClick(hit('A', { x: 0, y: 0, z: 1 })))
  expect(onAddJoint).not.toHaveBeenCalled()
  expect(result.current.sourceFace).toBeNull()
})

test('setMode activates tongue-groove exclusively and toggles off', () => {
  const { result } = setup()
  act(() => result.current.setMode('mortiseTenon'))
  act(() => result.current.setMode('tongueGroove'))
  expect(result.current.activeMode).toBe('tongueGroove') // mortiseTenon cancelled
  act(() => result.current.setMode('tongueGroove'))
  expect(result.current.activeMode).toBe('none')
})
