import type { CarcaseParams, CutDef, Face, Grain, MitreCut, Vec3 } from './types'
import type { RoleSpec } from './carcaseParts'
import type { PanelSpec } from './carcaseLayout'
import type { RoleThickness } from './resolveThickness'
import { lowestRoof, slopeMetrics } from './slopedTopRecipe'
import { composeWorldMatrix } from '../geom/transform'
const axes = ['x', 'y', 'z'] as const
const round = (n: number) => Math.round(n * 1e8) / 1e8
export function slopedRoles(
  p: CarcaseParams,
  roles: RoleSpec[],
  thicknessOf: RoleThickness,
): RoleSpec[] {
  if (!p.slopedTop) return roles
  const s = p.slopedTop,
    m = slopeMetrics(p),
    T = thicknessOf('top'),
    under = (x: number, y: number) => m.roof(x, y) - T / m.c,
    angle = Math.abs(m.angle),
    ceiling = lowestRoof(p, T)
  return roles.map((r) => {
    const b = r.panel,
      sourcePanel = b,
      cuts: MitreCut[] = []
    const mitre = (end: MitreCut['end'], axis: MitreCut['axis'], flip: boolean) => {
      if (angle > 0.000001)
        cuts.push({
          kind: 'mitre',
          id: `slope_${r.role}_${end}`,
          label: `Sloped roof ${axis === 'Z' ? 'profile' : 'bevel'} ${end}${flip ? ' opposite long edge' : ''}`,
          end,
          axis,
          angle,
          ...(flip ? { flip: true } : {}),
        })
    }
    if (r.role === 'top') {
      const a = s.axis === 'width' ? -s.left : -s.front,
        z = s.axis === 'width' ? p.width + s.right : p.depth + s.back,
        sin = m.m * m.c,
        u = a + Math.min(0, sin * T),
        length = (z - a + Math.abs(sin * T)) / m.c
      const panel: PanelSpec = {
        length,
        width: s.axis === 'width' ? p.depth + s.front + s.back : p.width + s.left + s.right,
        thickness: T,
        position:
          s.axis === 'width'
            ? { x: u, y: -s.front, z: under(u, 0) }
            : { x: p.width + s.right, y: u, z: under(0, u) },
        rotation: s.axis === 'width' ? { x: 0, y: -m.angle, z: 0 } : { x: m.angle, y: 0, z: 90 },
        rotationOrder: 'XYZ',
      }
      mitre('-X', 'Y', sin < 0)
      mitre('+X', 'Y', sin > 0)
      return { ...r, panel, cuts, grain: 'length', sourcePanel }
    }
    const side = r.role === 'left-side' || r.role === 'right-side',
      divider =
        r.role.startsWith('division-') &&
        Math.abs(b.rotation.y - 90) < 0.00001 &&
        Math.abs(b.position.z + b.width - ceiling) < 0.00001,
      back = r.role === 'back'
    if (!side && !divider && !back) return r
    let panel: PanelSpec,
      grain: Grain = 'length'
    if (side || divider) {
      const x0 = b.position.x,
        x1 = x0 + b.thickness,
        y0 = b.position.y,
        y1 = y0 + b.length,
        z0 = b.position.z,
        top = Math.max(under(x0, y0), under(x0, y1), under(x1, y0), under(x1, y1))
      panel = {
        length: round(top - z0),
        width: b.length,
        thickness: b.thickness,
        position: { x: x1, y: y0, z: z0 },
        rotation: { x: 0, y: -90, z: 0 },
        rotationOrder: 'XYZ',
      }
      mitre('+X', s.axis === 'depth' ? 'Z' : 'Y', s.axis === 'depth' ? m.m > 0 : m.m < 0)
    } else {
      const x0 = b.position.x,
        x1 = x0 + b.width,
        y0 = b.position.y,
        y1 = y0 + b.thickness,
        z0 = b.position.z,
        top = Math.max(under(x0, y0), under(x0, y1), under(x1, y0), under(x1, y1))
      panel = { ...b, length: round(top - z0) }
      grain = r.grain
      mitre('+X', s.axis === 'width' ? 'Z' : 'Y', m.m > 0)
    }
    return { ...r, panel, cuts, sourcePanel, grain }
  })
}
function converter(from: PanelSpec, to: PanelSpec) {
  const a = composeWorldMatrix(from),
    b = composeWorldMatrix(to)
  const vector = (v: Vec3): Vec3 => {
    const w = [
      a[0] * v.x + a[4] * v.y + a[8] * v.z,
      a[1] * v.x + a[5] * v.y + a[9] * v.z,
      a[2] * v.x + a[6] * v.y + a[10] * v.z,
    ]
    return {
      x: round(b[0] * w[0] + b[1] * w[1] + b[2] * w[2]),
      y: round(b[4] * w[0] + b[5] * w[1] + b[6] * w[2]),
      z: round(b[8] * w[0] + b[9] * w[1] + b[10] * w[2]),
    }
  }
  const shift = vector({ x: 0, y: 0, z: 0 }),
    delta = { x: a[12] - b[12], y: a[13] - b[13], z: a[14] - b[14] }
  shift.x = b[0] * delta.x + b[1] * delta.y + b[2] * delta.z
  shift.y = b[4] * delta.x + b[5] * delta.y + b[6] * delta.z
  shift.z = b[8] * delta.x + b[9] * delta.y + b[10] * delta.z
  return {
    vector,
    point: (v: Vec3) => {
      const q = vector(v)
      return { x: round(q.x + shift.x), y: round(q.y + shift.y), z: round(q.z + shift.z) }
    },
  }
}
const faceAxes = (f: Face) =>
  f.endsWith('X')
    ? { u: 'y' as const, v: 'z' as const }
    : f.endsWith('Y')
      ? { u: 'x' as const, v: 'z' as const }
      : { u: 'x' as const, v: 'y' as const }
export function remapSlopeCuts(cuts: CutDef[], from: PanelSpec, to: PanelSpec): CutDef[] {
  const { point, vector } = converter(from, to)
  return cuts.map((c) => {
    if (c.kind === 'mitre') return c
    const normal: Vec3 = { x: 0, y: 0, z: 0 }
    normal[c.face[1].toLowerCase() as 'x' | 'y' | 'z'] = c.face[0] === '+' ? 1 : -1
    const n = vector(normal),
      k = axes.reduce((a, b) => (Math.abs(n[a]) >= Math.abs(n[b]) ? a : b)),
      face = `${n[k] > 0 ? '+' : '-'}${k.toUpperCase()}` as Face
    if (c.kind === 'box') {
      const corners = [0, 1].flatMap((i) =>
        [0, 1].flatMap((j) =>
          [0, 1].map((k) =>
            point({
              x: c.position.x + i * c.size.x,
              y: c.position.y + j * c.size.y,
              z: c.position.z + k * c.size.z,
            }),
          ),
        ),
      )
      const lo = {
          x: Math.min(...corners.map((p) => p.x)),
          y: Math.min(...corners.map((p) => p.y)),
          z: Math.min(...corners.map((p) => p.z)),
        },
        hi = {
          x: Math.max(...corners.map((p) => p.x)),
          y: Math.max(...corners.map((p) => p.y)),
          z: Math.max(...corners.map((p) => p.z)),
        }
      return {
        ...c,
        face,
        position: lo,
        size: { x: round(hi.x - lo.x), y: round(hi.y - lo.y), z: round(hi.z - lo.z) },
      }
    }
    const old = faceAxes(c.face),
      next = faceAxes(face),
      step: Vec3 = { x: 0, y: 0, z: 0 }
    step[c.axis === 'U' ? old.u : old.v] = 1
    const d = vector(step),
      axis = Math.abs(d[next.u]) > 0.5 ? 'U' : 'V',
      sign = d[axis === 'U' ? next.u : next.v],
      start = point(c.start)
    if (sign < 0) for (const k of axes) start[k] = round(start[k] + d[k] * c.pitch * (c.count - 1))
    return { ...c, face, axis: axis as 'U' | 'V', start }
  })
}
export function remapSlopeGrain(grain: Grain, from: PanelSpec, to: PanelSpec): Grain {
  if (grain === 'free') return grain
  const v = converter(from, to).vector(
    grain === 'length' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 },
  )
  return Math.abs(v.x) >= Math.abs(v.y) ? 'length' : 'width'
}
