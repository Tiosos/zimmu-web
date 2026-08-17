import type { BoardPart, Vec3 } from './types'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'

// Matches boardsTouch, so a pair a hair apart still counts as overlapping. Applied to the radius sum
// on every candidate axis; on the face axes (unit length) it is an exact millimetre, on the nine
// edge-cross axes (sub-unit length) it errs slightly permissive — which is the safe direction here,
// since a false "overlap" only leaves a pair where the AABB already put it.
const TOUCH_TOL = 1

// Added to |R| so two near-parallel edges do not manufacture a false separating axis out of a
// near-zero cross product (Ericson, Real-Time Collision Detection §4.4.1).
const EPS = 1e-6

interface Obb {
  c: Vec3
  u: [Vec3, Vec3, Vec3] // orthonormal axes (rigid transform ⇒ the matrix columns are unit vectors)
  e: [number, number, number] // half-extents along u
}

function boardObb(b: BoardPart): Obb {
  const m = composeWorldMatrix(b)
  // A board's local box is corner-origin [0,L]×[0,W]×[0,T], so its centre is the half-extent point.
  const [cx, cy, cz] = applyMatrixToPoint(m, b.length / 2, b.width / 2, b.thickness / 2)
  return {
    c: { x: cx, y: cy, z: cz },
    u: [
      { x: m[0], y: m[1], z: m[2] },
      { x: m[4], y: m[5], z: m[6] },
      { x: m[8], y: m[9], z: m[10] },
    ],
    e: [b.length / 2, b.width / 2, b.thickness / 2],
  }
}

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

// Do the two boards' oriented boxes overlap (within TOUCH_TOL)? The separating-axis test, exact for
// oriented boxes where the world-AABB test over-reports — a diagonal corner-kiss, or a rotated board
// whose axis-aligned bounds balloon well past its actual footprint. Ericson RTCD §4.4.1.
export function obbOverlap(ba: BoardPart, bb: BoardPart): boolean {
  const a = boardObb(ba)
  const b = boardObb(bb)

  const R = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const AbsR = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      R[i][j] = dot(a.u[i], b.u[j])
      AbsR[i][j] = Math.abs(R[i][j]) + EPS
    }
  }

  // Centre offset expressed in A's frame.
  const d: Vec3 = { x: b.c.x - a.c.x, y: b.c.y - a.c.y, z: b.c.z - a.c.z }
  const t = [dot(d, a.u[0]), dot(d, a.u[1]), dot(d, a.u[2])]

  // Face axes of A.
  for (let i = 0; i < 3; i++) {
    const ra = a.e[i]
    const rb = b.e[0] * AbsR[i][0] + b.e[1] * AbsR[i][1] + b.e[2] * AbsR[i][2]
    if (Math.abs(t[i]) > ra + rb + TOUCH_TOL) return false
  }
  // Face axes of B.
  for (let j = 0; j < 3; j++) {
    const ra = a.e[0] * AbsR[0][j] + a.e[1] * AbsR[1][j] + a.e[2] * AbsR[2][j]
    const rb = b.e[j]
    const tj = t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]
    if (Math.abs(tj) > ra + rb + TOUCH_TOL) return false
  }

  // Nine edge-edge axes a.u[i] × b.u[j], in the closed form that avoids normalising the cross.
  let ra: number
  let rb: number
  // A0 × B0
  ra = a.e[1] * AbsR[2][0] + a.e[2] * AbsR[1][0]
  rb = b.e[1] * AbsR[0][2] + b.e[2] * AbsR[0][1]
  if (Math.abs(t[2] * R[1][0] - t[1] * R[2][0]) > ra + rb + TOUCH_TOL) return false
  // A0 × B1
  ra = a.e[1] * AbsR[2][1] + a.e[2] * AbsR[1][1]
  rb = b.e[0] * AbsR[0][2] + b.e[2] * AbsR[0][0]
  if (Math.abs(t[2] * R[1][1] - t[1] * R[2][1]) > ra + rb + TOUCH_TOL) return false
  // A0 × B2
  ra = a.e[1] * AbsR[2][2] + a.e[2] * AbsR[1][2]
  rb = b.e[0] * AbsR[0][1] + b.e[1] * AbsR[0][0]
  if (Math.abs(t[2] * R[1][2] - t[1] * R[2][2]) > ra + rb + TOUCH_TOL) return false
  // A1 × B0
  ra = a.e[0] * AbsR[2][0] + a.e[2] * AbsR[0][0]
  rb = b.e[1] * AbsR[1][2] + b.e[2] * AbsR[1][1]
  if (Math.abs(t[0] * R[2][0] - t[2] * R[0][0]) > ra + rb + TOUCH_TOL) return false
  // A1 × B1
  ra = a.e[0] * AbsR[2][1] + a.e[2] * AbsR[0][1]
  rb = b.e[0] * AbsR[1][2] + b.e[2] * AbsR[1][0]
  if (Math.abs(t[0] * R[2][1] - t[2] * R[0][1]) > ra + rb + TOUCH_TOL) return false
  // A1 × B2
  ra = a.e[0] * AbsR[2][2] + a.e[2] * AbsR[0][2]
  rb = b.e[0] * AbsR[1][1] + b.e[1] * AbsR[1][0]
  if (Math.abs(t[0] * R[2][2] - t[2] * R[0][2]) > ra + rb + TOUCH_TOL) return false
  // A2 × B0
  ra = a.e[0] * AbsR[1][0] + a.e[1] * AbsR[0][0]
  rb = b.e[1] * AbsR[2][2] + b.e[2] * AbsR[2][1]
  if (Math.abs(t[1] * R[0][0] - t[0] * R[1][0]) > ra + rb + TOUCH_TOL) return false
  // A2 × B1
  ra = a.e[0] * AbsR[1][1] + a.e[1] * AbsR[0][1]
  rb = b.e[0] * AbsR[2][2] + b.e[2] * AbsR[2][0]
  if (Math.abs(t[1] * R[0][1] - t[0] * R[1][1]) > ra + rb + TOUCH_TOL) return false
  // A2 × B2
  ra = a.e[0] * AbsR[1][2] + a.e[1] * AbsR[0][2]
  rb = b.e[0] * AbsR[2][1] + b.e[1] * AbsR[2][0]
  if (Math.abs(t[1] * R[0][2] - t[0] * R[1][2]) > ra + rb + TOUCH_TOL) return false

  return true
}
