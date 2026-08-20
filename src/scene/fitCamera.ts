import type { CameraState, Component, ComponentId, Part, Vec3 } from './types'
import { resolveWorldMatrix, applyMatrixToPoint } from '../geom/transform'
import { isNodeVisible } from './componentTree'

// The app's opening view direction (viewport.tsx:200). Used only when the current camera has no
// bearing to preserve.
export const CANONICAL_DIR: Vec3 = { x: 250, y: -200, z: 150 }

// Breathing room so the design is not flush against the viewport edge.
export const FIT_MARGIN = 1.05

// Floor on the camera-to-target distance. A part mid-edit at 0 mm gives a degenerate AABB, and a
// zero distance would put the camera on the target, leaving OrbitControls with a zero-length offset.
export const MIN_FIT_DISTANCE = 1

const DEG2RAD = Math.PI / 180

const EPS = 1e-9

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const length = (a: Vec3): number => Math.sqrt(dot(a, a))
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

export interface Bounds {
  min: Vec3
  max: Vec3
}

// The local axis-aligned box of a part, in its own coordinates. The two kinds genuinely differ:
// a board is corner-origin on all three axes (BRepPrimAPI_MakeBox_1 spans 0..d, per snapMath.ts:43-48),
// while a cylinder's local origin lies on the axis at the base circle, so it is centred in x/y but
// corner-origin in z.
function localBox(part: Part): Bounds {
  switch (part.kind) {
    case 'board':
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: part.length, y: part.width, z: part.thickness },
      }
    case 'cylinder': {
      const r = part.diameter / 2
      return { min: { x: -r, y: -r, z: 0 }, max: { x: r, y: r, z: part.length } }
    }
    default: {
      const _exhaustive: never = part
      throw new Error(`unhandled part kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

export function worldBounds(parts: Part[], byId: Map<ComponentId, Component>): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  let found = false

  for (const part of parts) {
    if (!isNodeVisible(part, byId)) continue
    found = true
    const m = resolveWorldMatrix(part, byId)
    const { min, max } = localBox(part)
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          const [wx, wy, wz] = applyMatrixToPoint(m, x, y, z)
          if (wx < minX) minX = wx
          if (wy < minY) minY = wy
          if (wz < minZ) minZ = wz
          if (wx > maxX) maxX = wx
          if (wy > maxY) maxY = wy
          if (wz > maxZ) maxZ = wz
        }
      }
    }
  }

  if (!found) return null
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}

// The unit vector pointing from the target toward the camera — the bearing a fit preserves.
export function fitDirection(current: CameraState): Vec3 {
  const raw = sub(current.position, current.target)
  const l = length(raw)
  if (l > EPS) return scale(raw, 1 / l)
  return scale(CANONICAL_DIR, 1 / length(CANONICAL_DIR))
}

// The right vector for a view direction. cross(f, +Z) collapses when the camera looks straight down
// or straight up, which is reachable by orbiting; +Y is a valid substitute there because f is then
// parallel to Z.
function rightVector(f: Vec3): Vec3 {
  const primary = cross(f, { x: 0, y: 0, z: 1 })
  const l = length(primary)
  if (l > EPS) return scale(primary, 1 / l)
  const fallback = cross(f, { x: 0, y: 1, z: 0 })
  return scale(fallback, 1 / length(fallback))
}

export function fitCameraToParts(
  parts: Part[],
  aspect: number,
  fovDeg: number,
  current: CameraState,
  byId: Map<ComponentId, Component>,
): CameraState | null {
  const bounds = worldBounds(parts, byId)
  if (bounds === null) return null

  const centre: Vec3 = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }

  const d = fitDirection(current)
  const f = scale(d, -1)
  const r = rightVector(f)
  const u = cross(r, f)

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const tanV = Math.tan((fovDeg * DEG2RAD) / 2)
  const tanH = safeAspect * tanV

  // For a corner offset e from the centre, a camera at centre + d·t sees it at depth (t - e·d) with
  // lateral offset e·r. Keeping |e·r| <= depth·tanH rearranges to the bound below; same for e·u.
  let t = 0
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const e = sub({ x, y, z }, centre)
        const along = dot(e, d)
        t = Math.max(t, Math.abs(dot(e, r)) / tanH + along, Math.abs(dot(e, u)) / tanV + along)
      }
    }
  }

  const distance = Math.max(t * FIT_MARGIN, MIN_FIT_DISTANCE)
  return { position: add(centre, scale(d, distance)), target: centre }
}

// The minimum far clip plane that keeps the whole scene visible from `camera`, or null when there
// is nothing to frame. The perspective camera clips by view-direction depth, but the Euclidean
// distance to a corner is never smaller than its depth, so reaching the farthest corner by straight
// distance guarantees no corner is clipped — without needing the camera's basis here. The viewport's
// default far plane is a fixed 10 000 mm (viewport.tsx), which a scene wider than ~7 m overruns.
export function fitFarPlane(
  parts: Part[],
  camera: CameraState,
  byId: Map<ComponentId, Component>,
): number | null {
  const bounds = worldBounds(parts, byId)
  if (bounds === null) return null
  let far = 0
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        far = Math.max(far, length(sub({ x, y, z }, camera.position)))
      }
    }
  }
  return far
}

// The near plane to pair with a raised far plane. Depth-buffer precision degrades with the far/near
// ratio, so when fitFarPlane pushes far out for a large scene, near must rise in step to hold the
// ratio at the app's default (defaultFar/defaultNear) — otherwise a big scene invites z-fighting on
// coplanar faces. Floored at defaultNear so an ordinary scene (far ≤ defaultFar) is unchanged.
export function nearPlaneForFar(far: number, defaultNear: number, defaultFar: number): number {
  return Math.max(defaultNear, (far * defaultNear) / defaultFar)
}
