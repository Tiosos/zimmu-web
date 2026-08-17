import { test, expect } from 'vitest'
import type { BoardPart, CameraState, CylinderPart, Part, Vec3 } from './types'
import {
  worldBounds,
  fitDirection,
  fitCameraToParts,
  fitFarPlane,
  CANONICAL_DIR,
  FIT_MARGIN,
  MIN_FIT_DISTANCE,
} from './fitCamera'

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

const ISO: CameraState = {
  position: { x: 250, y: -200, z: 150 },
  target: { x: 0, y: 0, z: 0 },
}

function cornersOf(min: Vec3, max: Vec3): Vec3[] {
  const out: Vec3[] = []
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) out.push({ x, y, z })
    }
  }
  return out
}

// Largest |lateral| / (depth * tan(half-angle)) over every corner. <= 1 means everything is in frame.
function worstOverflow(cam: CameraState, parts: Part[], aspect: number, fovDeg: number): number {
  const b = worldBounds(parts)!
  const d = fitDirection(cam)
  const f = { x: -d.x, y: -d.y, z: -d.z }
  const xp = (a: Vec3, c: Vec3): Vec3 => ({
    x: a.y * c.z - a.z * c.y,
    y: a.z * c.x - a.x * c.z,
    z: a.x * c.y - a.y * c.x,
  })
  let r = xp(f, { x: 0, y: 0, z: 1 })
  if (Math.hypot(r.x, r.y, r.z) < 1e-9) r = xp(f, { x: 0, y: 1, z: 0 })
  const rl = Math.hypot(r.x, r.y, r.z)
  r = { x: r.x / rl, y: r.y / rl, z: r.z / rl }
  const u = xp(r, f)
  const tanV = Math.tan((fovDeg * Math.PI) / 180 / 2)
  const tanH = aspect * tanV
  let worst = 0
  for (const c of cornersOf(b.min, b.max)) {
    const v = { x: c.x - cam.position.x, y: c.y - cam.position.y, z: c.z - cam.position.z }
    const depth = v.x * f.x + v.y * f.y + v.z * f.z
    const lat = Math.abs(v.x * r.x + v.y * r.y + v.z * r.z)
    const vert = Math.abs(v.x * u.x + v.y * u.y + v.z * u.z)
    worst = Math.max(worst, lat / (depth * tanH), vert / (depth * tanV))
  }
  return worst
}

const distanceOf = (c: CameraState): number =>
  Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z)

test('returns null when there is nothing to frame', () => {
  expect(fitCameraToParts([], 1.5, 45, ISO)).toBeNull()
  expect(fitCameraToParts([board({ visible: false })], 1.5, 45, ISO)).toBeNull()
})

test('targets the centre of the bounds', () => {
  const parts = [board({ id: 'a' }), board({ id: 'b', position: { x: 500, y: 0, z: 0 } })]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  expect(cam.target).toEqual({ x: 350, y: 50, z: 12.5 })
})

test('keeps the current bearing', () => {
  const parts = [board()]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  const before = fitDirection(ISO)
  const after = fitDirection(cam)
  expect(after.x).toBeCloseTo(before.x, 10)
  expect(after.y).toBeCloseTo(before.y, 10)
  expect(after.z).toBeCloseTo(before.z, 10)
})

// The property that makes the result correct rather than merely plausible.
test('every corner is inside the frustum after fitting', () => {
  const parts = [board({ length: 2400, width: 100, thickness: 20 })]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  expect(worstOverflow(cam, parts, 1.5, 45)).toBeLessThanOrEqual(1)
})

// Without this, a distance of 1e6 would pass the previous test. Together they pin the fit as tight.
test('the fit is tight — pulling in past the margin overflows', () => {
  const parts = [board({ length: 2400, width: 100, thickness: 20 })]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  const d = fitDirection(cam)
  const closer = distanceOf(cam) / FIT_MARGIN - 1
  const pulled: CameraState = {
    position: {
      x: cam.target.x + d.x * closer,
      y: cam.target.y + d.y * closer,
      z: cam.target.z + d.z * closer,
    },
    target: cam.target,
  }
  expect(worstOverflow(pulled, parts, 1.5, 45)).toBeGreaterThan(1)
})

// A wide, short scene on a wide viewport is limited by the horizontal half-angle, not the vertical.
test('the horizontal FOV constrains a wide scene', () => {
  const parts = [board({ length: 2400, width: 100, thickness: 20 })]
  const wide = fitCameraToParts(parts, 3, 45, ISO)!
  const narrow = fitCameraToParts(parts, 0.5, 45, ISO)!
  expect(distanceOf(wide)).toBeLessThan(distanceOf(narrow))
  expect(worstOverflow(wide, parts, 3, 45)).toBeLessThanOrEqual(1)
  expect(worstOverflow(narrow, parts, 0.5, 45)).toBeLessThanOrEqual(1)
})

// Orbiting dead top-down makes f parallel to up, collapsing cross(f, up) to zero. This is a second,
// distinct degeneracy — the fitDirection guard does not cover it.
test('a top-down bearing still produces a finite camera', () => {
  const topDown: CameraState = { position: { x: 0, y: 0, z: 500 }, target: { x: 0, y: 0, z: 0 } }
  const parts = [board()]
  const cam = fitCameraToParts(parts, 1.5, 45, topDown)!
  expect(Number.isFinite(cam.position.x)).toBe(true)
  expect(Number.isFinite(cam.position.y)).toBe(true)
  expect(Number.isFinite(cam.position.z)).toBe(true)
  expect(worstOverflow(cam, parts, 1.5, 45)).toBeLessThanOrEqual(1)
})

// A part mid-edit at 0 mm gives a degenerate AABB; without a floor the camera would land on the
// target and leave OrbitControls with a zero-length offset.
test('zero-extent bounds floor at MIN_FIT_DISTANCE', () => {
  const cam = fitCameraToParts([board({ length: 0, width: 0, thickness: 0 })], 1.5, 45, ISO)!
  expect(distanceOf(cam)).toBeCloseTo(MIN_FIT_DISTANCE, 10)
})

test('a non-finite aspect is treated as 1', () => {
  const parts = [board()]
  const nan = fitCameraToParts(parts, Number.NaN, 45, ISO)!
  const one = fitCameraToParts(parts, 1, 45, ISO)!
  expect(nan.position.x).toBeCloseTo(one.position.x, 10)
})

// fitFarPlane must reach every corner of the scene, or the fitted frame renders it clipped. A large
// scene fits at a distance whose far corners sit past the viewport's default 10 000 mm far plane —
// this is the case that renders a wide cabinet gone when Home is pressed.
test('fitFarPlane covers every corner of a large scene', () => {
  const parts = [board({ length: 10000, width: 3000, thickness: 800 })]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  const far = fitFarPlane(parts, cam)
  const b = worldBounds(parts)!
  for (const c of cornersOf(b.min, b.max)) {
    const dist = Math.hypot(c.x - cam.position.x, c.y - cam.position.y, c.z - cam.position.z)
    expect(far).toBeGreaterThanOrEqual(dist)
  }
})

// The bug reproduction: the required far for a scene this size exceeds the default far plane, so a
// viewport that keeps the default would clip it.
test('fitFarPlane exceeds the default far plane for a scene wider than the frustum reaches', () => {
  const parts = [board({ length: 10000, width: 3000, thickness: 800 })]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  expect(fitFarPlane(parts, cam)).toBeGreaterThan(10000)
})

// A normal-sized scene needs nothing beyond the default, so the viewport keeps its default far
// plane and near-plane precision is unaffected in the common case.
test('fitFarPlane for a small scene stays well under the default far plane', () => {
  const parts = [board()]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  expect(fitFarPlane(parts, cam)).toBeLessThan(10000)
})

test('fitFarPlane returns null when there is nothing to frame', () => {
  expect(fitFarPlane([], ISO)).toBeNull()
  expect(fitFarPlane([board({ visible: false })], ISO)).toBeNull()
})
