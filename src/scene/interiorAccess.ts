import type { FrontGeometry } from './frontCells'
import type { LocalBox } from './carcaseLayout'
import type { Rect, SectionId } from './sectionTree'
import type { Vec3 } from './types'

export interface InteriorAccessAperture {
  id: string
  rect: Rect
}

export interface AccessObstacle {
  role: string
  box: LocalBox
}

export interface ShelfPose {
  center: Vec3
  // Degrees, applied as Rz * Ry * Rx. The shelf's local x is width, y is depth, z is thickness.
  rotation: Vec3
}

export interface ShelfInsertionPath {
  apertureId: string
  kind: 'straight' | 'rotated'
  poses: ShelfPose[]
}

export const ADJUSTABLE_SHELF_SIDE_CLEARANCE = 2

const DEG = Math.PI / 180
const AXES: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
]
const COLLISION_EPSILON = 1e-7

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (v: Vec3, n: number): Vec3 => ({ x: v.x * n, y: v.y * n, z: v.z * n })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const length = (v: Vec3): number => Math.sqrt(dot(v, v))
const unit = (v: Vec3): Vec3 | null => {
  const n = length(v)
  return n < 1e-9 ? null : scale(v, 1 / n)
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
})

function axesOf(rotation: Vec3): [Vec3, Vec3, Vec3] {
  const x = rotation.x * DEG
  const y = rotation.y * DEG
  const z = rotation.z * DEG
  const sx = Math.sin(x)
  const cx = Math.cos(x)
  const sy = Math.sin(y)
  const cy = Math.cos(y)
  const sz = Math.sin(z)
  const cz = Math.cos(z)

  // Rz * Ry * Rx, returned as the three world-space columns/local axes.
  return [
    { x: cz * cy, y: sz * cy, z: -sy },
    {
      x: cz * sy * sx - sz * cx,
      y: sz * sy * sx + cz * cx,
      z: cy * sx,
    },
    {
      x: cz * sy * cx + sz * sx,
      y: sz * sy * cx - cz * sx,
      z: cy * cx,
    },
  ]
}

interface OrientedShelf {
  center: Vec3
  half: [number, number, number]
  axes: [Vec3, Vec3, Vec3]
}

const centerOf = (box: LocalBox): Vec3 => ({
  x: (box.x0 + box.x1) / 2,
  y: (box.y0 + box.y1) / 2,
  z: (box.z0 + box.z1) / 2,
})

const shelfAt = (box: LocalBox, pose: ShelfPose): OrientedShelf => ({
  center: pose.center,
  half: [(box.x1 - box.x0) / 2, (box.y1 - box.y0) / 2, (box.z1 - box.z0) / 2],
  axes: axesOf(pose.rotation),
})

function intersectsAabb(shelf: OrientedShelf, box: LocalBox): boolean {
  const bCenter = centerOf(box)
  const bHalf: [number, number, number] = [
    (box.x1 - box.x0) / 2,
    (box.y1 - box.y0) / 2,
    (box.z1 - box.z0) / 2,
  ]
  const delta = sub(bCenter, shelf.center)
  const candidates: Vec3[] = [...shelf.axes, ...AXES]
  for (const a of shelf.axes) for (const b of AXES) candidates.push(cross(a, b))

  for (const candidate of candidates) {
    const axis = unit(candidate)
    if (axis === null) continue
    const shelfRadius =
      shelf.half[0] * Math.abs(dot(shelf.axes[0], axis)) +
      shelf.half[1] * Math.abs(dot(shelf.axes[1], axis)) +
      shelf.half[2] * Math.abs(dot(shelf.axes[2], axis))
    const boxRadius =
      bHalf[0] * Math.abs(axis.x) +
      bHalf[1] * Math.abs(axis.y) +
      bHalf[2] * Math.abs(axis.z)
    if (Math.abs(dot(delta, axis)) >= shelfRadius + boxRadius - COLLISION_EPSILON) {
      return false
    }
  }
  return true
}

function clearPose(box: LocalBox, pose: ShelfPose, obstacles: AccessObstacle[]): boolean {
  const shelf = shelfAt(box, pose)
  return obstacles.every((obstacle) => !intersectsAabb(shelf, obstacle.box))
}

function projectedRadiusY(box: LocalBox, rotation: Vec3): number {
  const shelf = shelfAt(box, { center: { x: 0, y: 0, z: 0 }, rotation })
  return (
    shelf.half[0] * Math.abs(shelf.axes[0].y) +
    shelf.half[1] * Math.abs(shelf.axes[1].y) +
    shelf.half[2] * Math.abs(shelf.axes[2].y)
  )
}

function segment(
  box: LocalBox,
  from: ShelfPose,
  to: ShelfPose,
  obstacles: AccessObstacle[],
  steps: number,
  rotationProgress: (t: number) => number = (t) => t,
): ShelfPose[] | null {
  const poses: ShelfPose[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const rt = rotationProgress(t)
    const pose = {
      center: lerpVec(from.center, to.center, t),
      rotation: lerpVec(from.rotation, to.rotation, rt),
    }
    if (!clearPose(box, pose, obstacles)) return null
    poses.push(pose)
  }
  return poses
}

function uniqueOrientations(): Vec3[] {
  const out: Vec3[] = [{ x: 0, y: 0, z: 0 }]
  const seen = new Set(['0|0|0'])
  const push = (x: number, y: number, z: number): void => {
    const key = `${x}|${y}|${z}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ x, y, z })
  }

  // First search the common cabinet-shop maneuver: rotate a shelf around its depth axis.
  for (let y = 5; y <= 85; y += 5) {
    push(0, y, 0)
    push(0, -y, 0)
  }

  // Then allow the two other axes, including compound poses. Coarse compound angles keep the
  // search bounded and deterministic; the 5° depth-axis pass above preserves useful precision for
  // the most common shelf-through-stile maneuver.
  const coarse = [-60, -30, 0, 30, 60]
  const tilt = [-80, -60, -40, -20, 0, 20, 40, 60, 80]
  for (const x of coarse) for (const y of tilt) for (const z of coarse) push(x, y, z)
  return out
}

const ORIENTATIONS = uniqueOrientations()

export function accessAperturesForSection(
  sectionId: SectionId,
  sectionRect: Rect,
  fronts: FrontGeometry,
): InteriorAccessAperture[] {
  const framed = [...(fronts.frameAccessOpenings?.values() ?? [])]
    .filter((opening) => opening.sectionId === sectionId)
    .map((opening) => ({ id: opening.id, rect: opening.rect }))
  return framed.length > 0 ? framed : [{ id: sectionId, rect: sectionRect }]
}

export function frameAccessObstacles(
  fronts: FrontGeometry,
  frameDepth: number,
): AccessObstacle[] {
  if (frameDepth <= 0) return []
  return (fronts.frameMembers ?? []).map((member) => ({
    role: member.role,
    box: {
      x0: member.rect.x0,
      x1: member.rect.x1,
      y0: -frameDepth,
      y1: 0,
      z0: member.rect.z0,
      z1: member.rect.z1,
    },
  }))
}

export function findShelfInsertionPath(
  shelfBox: LocalBox,
  apertures: InteriorAccessAperture[],
  obstacles: AccessObstacle[],
  frameDepth: number,
): ShelfInsertionPath | null {
  const target: ShelfPose = { center: centerOf(shelfBox), rotation: { x: 0, y: 0, z: 0 } }
  if (!clearPose(shelfBox, target, obstacles)) return null

  for (const aperture of apertures) {
    const throatCenter = {
      x: (aperture.rect.x0 + aperture.rect.x1) / 2,
      y: frameDepth > 0 ? -frameDepth / 2 : 0,
      z: (aperture.rect.z0 + aperture.rect.z1) / 2,
    }

    for (const rotation of ORIENTATIONS) {
      const throat: ShelfPose = { center: throatCenter, rotation }
      if (!clearPose(shelfBox, throat, obstacles)) continue

      const start: ShelfPose = {
        center: {
          ...throatCenter,
          y: -frameDepth - projectedRadiusY(shelfBox, rotation) - 5,
        },
        rotation,
      }
      const outside = segment(shelfBox, start, throat, obstacles, 12)
      if (outside === null) continue

      // Different rotation schedules model turning early, continuously, or late while translating
      // from the aperture to the exact installed pose. Every returned pose has been collision
      // tested; the schedules are search strategies, never geometric shortcuts.
      for (const gamma of [0.5, 1, 2]) {
        const inside = segment(
          shelfBox,
          throat,
          target,
          obstacles,
          32,
          (t) => 1 - Math.pow(1 - t, gamma),
        )
        if (inside === null) continue
        return {
          apertureId: aperture.id,
          kind:
            Math.abs(rotation.x) < 1e-9 &&
            Math.abs(rotation.y) < 1e-9 &&
            Math.abs(rotation.z) < 1e-9
              ? 'straight'
              : 'rotated',
          poses: [...outside, ...inside.slice(1)],
        }
      }
    }
  }
  return null
}
