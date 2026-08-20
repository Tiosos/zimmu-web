import type { BoardPart, BoxCut, Component, ComponentId, Vec3 } from './types'
import { faceAxes } from './snapMath'
import { resolveWorldMatrix, applyMatrixToPoint } from '../geom/transform'

type Axis = 'x' | 'y' | 'z'

// Private copy, matching the per-file convention in geom/{dado,halflap,mortisetenon,…}.ts.
function boardDims(b: BoardPart): Record<Axis, number> {
  return { x: b.length, y: b.width, z: b.thickness }
}

// World-space corners of the rectangle a BoxCut removes from one face of a board — the cut's
// footprint as seen looking at that face.
//
// Deliberately not built on computeFaceCorners: that derives its in-plane basis from a cross
// product with an arbitrary fallback vector, which is fine for a full face (symmetric about its
// centre either way) but meaningless for an off-centre sub-rectangle. BoxCut.position/size are
// expressed along the board's own local axes, so the corners are built directly in those axes
// and transformed once, the way suggestJoints.ts does it.
//
// Board-local space runs 0..length, 0..width, 0..thickness (see computeLocalFaceCenter), which is
// the same origin convention BoxCut.position uses — no rebasing needed.
export function cutFootprintCorners(
  part: BoardPart,
  cut: BoxCut,
  byId: Map<ComponentId, Component>,
): [Vec3, Vec3, Vec3, Vec3] {
  const { depth: dAx, u, v } = faceAxes(cut.face)
  const dims = boardDims(part)

  // Sit the outline on the board's own face plane rather than the cut's far plane: it marks where
  // material leaves the surface being looked at, and updateHighlight lifts it clear from there.
  const d = cut.face.startsWith('+') ? dims[dAx] : 0

  const u0 = cut.position[u]
  const u1 = u0 + cut.size[u]
  const v0 = cut.position[v]
  const v1 = v0 + cut.size[v]

  const m = resolveWorldMatrix(part, byId)
  const corner = (uu: number, vv: number): Vec3 => {
    const local: Vec3 = { x: 0, y: 0, z: 0 }
    local[dAx] = d
    local[u] = uu
    local[v] = vv
    const [x, y, z] = applyMatrixToPoint(m, local.x, local.y, local.z)
    return { x, y, z }
  }

  // Wound around the perimeter so a LineLoop traces the rectangle rather than a bow tie.
  return [corner(u0, v0), corner(u1, v0), corner(u1, v1), corner(u0, v1)]
}
