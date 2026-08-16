import { test, expect } from 'vitest'
import type { BoardPart } from './types'
import { worldBounds } from './fitCamera'

const board = (over: Partial<BoardPart> = {}): BoardPart => ({
  kind: 'board',
  id: 'p1',
  label: 'Board',
  length: 200,
  width: 100,
  thickness: 25,
  material: '',
  color: '#ffffff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  ...over,
})

// The local box runs (0,0,0)..(length,width,thickness) because geometry is built by
// BRepPrimAPI_MakeBox_1. A centred-box assumption puts this at ±half and fails here.
test('a board at the origin spans [0..length] x [0..width] x [0..thickness]', () => {
  const b = worldBounds([board()])
  expect(b).not.toBeNull()
  expect(b!.min).toEqual({ x: 0, y: 0, z: 0 })
  expect(b!.max).toEqual({ x: 200, y: 100, z: 25 })
})

test('bounds cover every part', () => {
  const b = worldBounds([board({ id: 'a' }), board({ id: 'b', position: { x: 500, y: 0, z: 0 } })])
  expect(b!.min.x).toBe(0)
  expect(b!.max.x).toBe(700)
})

test('hidden parts are excluded', () => {
  const b = worldBounds([
    board({ id: 'a' }),
    board({ id: 'b', position: { x: 500, y: 0, z: 0 }, visible: false }),
  ])
  expect(b!.max.x).toBe(200)
})

test('returns null when there is nothing visible', () => {
  expect(worldBounds([])).toBeNull()
  expect(worldBounds([board({ visible: false })])).toBeNull()
})

// Rotation must go through composeWorldMatrix, not be ignored. A 45° yaw widens the footprint.
test('rotation is honoured', () => {
  const b = worldBounds([board({ rotation: { x: 0, y: 0, z: 45 } })])
  expect(b!.max.x).toBeGreaterThan(200)
})
