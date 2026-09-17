import type { Anchor, Vec3 } from './types'
import type { Bounds3 } from './carcaseBounds'
import { rotateVector } from '../geom/transform'

type Axis = 'x' | 'y' | 'z'

// Which axis a face's outward normal runs along, and which way it points.
const FACE_NORMAL: Record<Anchor['face'], { axis: Axis; positive: boolean }> = {
  left: { axis: 'x', positive: false },
  right: { axis: 'x', positive: true },
  front: { axis: 'y', positive: false },
  back: { axis: 'y', positive: true },
}

// The two axes of a face's plane, in x < y < z order — the order `Anchor.offset` is stated in.
const IN_PLANE: Record<Axis, [Axis, Axis]> = {
  x: ['y', 'z'],
  y: ['x', 'z'],
  z: ['x', 'y'],
}

const lo = (b: Bounds3, a: Axis): number => (a === 'x' ? b.x0 : a === 'y' ? b.y0 : b.z0)
const hi = (b: Bounds3, a: Axis): number => (a === 'x' ? b.x1 : a === 'y' ? b.y1 : b.z1)

// The axis-aligned envelope of a box after rotation about the origin, before any translation. Built
// from the eight corners rather than from the rotation angles, the way hiddenLine.ts asks its
// corners whether a part is a box: it is exact for the quarter turns a cabinet actually uses and
// merely conservative for anything else.
export function rotatedBounds(b: Bounds3, rotation: Vec3): Bounds3 {
  const corners: [number, number, number][] = []
  for (const x of [b.x0, b.x1])
    for (const y of [b.y0, b.y1])
      for (const z of [b.z0, b.z1]) corners.push(rotateVector(rotation, x, y, z))
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  const zs = corners.map((c) => c[2])
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  }
}

export function translatedBounds(b: Bounds3, p: Vec3): Bounds3 {
  return {
    x0: b.x0 + p.x,
    x1: b.x1 + p.x,
    y0: b.y0 + p.y,
    y1: b.y1 + p.y,
    z0: b.z0 + p.z,
    z1: b.z1 + p.z,
  }
}

// Where an anchored cabinet's origin goes.
//
// `target` is the target's bounds already rotated and translated into the shared parent frame;
// `own` is the anchored cabinet's bounds rotated but NOT translated, so its world envelope is
// exactly `own + position` and the position falls straight out.
//
// On the normal axis the anchored box sits outside the named face, `gap` clear of it — which edge
// of it lands there follows from the face's direction alone. That is what lets a cabinet turned 90°
// meet a corner with its side without any special case: its envelope simply presents a different
// edge on that axis.
export function anchoredPosition(anchor: Anchor, target: Bounds3, own: Bounds3): Vec3 {
  const { axis, positive } = FACE_NORMAL[anchor.face]
  const [u, v] = IN_PLANE[axis]

  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[axis] = positive
    ? hi(target, axis) + anchor.gap - lo(own, axis)
    : lo(target, axis) - anchor.gap - hi(own, axis)
  position[u] = lo(target, u) + anchor.offset.u - lo(own, u)
  position[v] = lo(target, v) + anchor.offset.v - lo(own, v)
  return position
}
