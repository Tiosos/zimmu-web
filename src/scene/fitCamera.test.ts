import { test, expect } from 'vitest'
import type { BoardPart, CylinderPart, Part } from './types'
import { worldBounds, fitDirection, CANONICAL_DIR } from './fitCamera'

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

// Rotation must go through composeWorldMatrix, not be ignored. A 45° yaw about Z sends the far corner
// of the 200×100 footprint to y ≈ 212; ignoring rotation would leave max.y at 100. (max.x actually
// shrinks to ≈141 under this rotation, so it is the wrong axis to assert on.)
test('rotation is honoured', () => {
  const b = worldBounds([board({ rotation: { x: 0, y: 0, z: 45 } })])
  expect(b!.max.y).toBeGreaterThan(200)
})

const cylinder = (over: Partial<CylinderPart> = {}): CylinderPart => ({
  kind: 'cylinder',
  id: 'd1',
  label: 'Dowel',
  diameter: 8,
  length: 40,
  material: '',
  color: '#ffffff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  ...over,
})

// A dowel's local origin lies on its axis at the base circle: centred in x/y, corner-origin in z.
test('a cylinder is centred in x/y and corner-origin in z', () => {
  const b = worldBounds([cylinder()])
  expect(b!.min).toEqual({ x: -4, y: -4, z: 0 })
  expect(b!.max).toEqual({ x: 4, y: 4, z: 40 })
})

// The never guard is what forces a future part kind to be classified deliberately instead of being
// silently measured with board fields. Reaching it requires defeating the type system, which is the point.
test('an unknown part kind throws rather than being silently mismeasured', () => {
  const bogus = { ...board(), kind: 'sphere' } as unknown as Part
  expect(() => worldBounds([bogus])).toThrow(/unhandled part kind/)
})

test('preserves the current bearing as a unit vector', () => {
  const d = fitDirection({ position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 } })
  expect(d).toEqual({ x: 0, y: 0, z: 1 })
})

test('the bearing is measured from target to position, not from the origin', () => {
  const d = fitDirection({ position: { x: 100, y: 0, z: 0 }, target: { x: 90, y: 0, z: 0 } })
  expect(d).toEqual({ x: 1, y: 0, z: 0 })
})

// useFile restores camera position and target verbatim from the .zimmu file, so a file carrying
// equal position and target is reachable input. There is no bearing to preserve; use the canonical one.
test('falls back to the canonical bearing when position equals target', () => {
  const d = fitDirection({ position: { x: 5, y: 5, z: 5 }, target: { x: 5, y: 5, z: 5 } })
  const len = Math.hypot(CANONICAL_DIR.x, CANONICAL_DIR.y, CANONICAL_DIR.z)
  expect(d.x).toBeCloseTo(CANONICAL_DIR.x / len, 10)
  expect(d.y).toBeCloseTo(CANONICAL_DIR.y / len, 10)
  expect(d.z).toBeCloseTo(CANONICAL_DIR.z / len, 10)
})

test('the returned bearing is always unit length', () => {
  const d = fitDirection({ position: { x: 3, y: 4, z: 12 }, target: { x: 0, y: 0, z: 0 } })
  expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10)
})
