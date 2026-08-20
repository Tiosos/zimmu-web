import { describe, it, expect } from 'vitest'
import { orientedPanel } from './carcaseRoles'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'

// World AABB of a panel spec, in carcase-local space. This is the assertion surface: it pins
// position and rotation together and is indifferent to which equivalent Euler triple the
// implementation chooses.
function aabb(p: ReturnType<typeof orientedPanel>) {
  const m = composeWorldMatrix({
    ...p,
    kind: 'board',
    id: 'x',
    label: 'x',
    material: '',
    color: '#fff',
    cuts: [],
    visible: true,
    parentId: null,
    driven: true,
  })
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const cx of [0, p.length])
    for (const cy of [0, p.width])
      for (const cz of [0, p.thickness]) {
        const [wx, wy, wz] = applyMatrixToPoint(m, cx, cy, cz)
        min.x = Math.min(min.x, wx)
        max.x = Math.max(max.x, wx)
        min.y = Math.min(min.y, wy)
        max.y = Math.max(max.y, wy)
        min.z = Math.min(min.z, wz)
        max.z = Math.max(max.z, wz)
      }
  return { min, max }
}

const box = { x0: 10, x1: 28, y0: 100, y1: 660, z0: 0, z1: 720 }

// `box` is thin on X only, so it is a legitimate input for thicknessAxis 'x' alone: asking it for
// 'y' correctly yields a 560 mm thickness. A per-axis panel box is needed wherever a test loops
// over all three orientations and asserts something about thickness being the small dimension.
const thinBox = {
  x: box, // side panel
  y: { x0: 18, x1: 582, y0: 548, y1: 560, z0: 100, z1: 700 }, // back panel
  z: { x0: 0, x1: 600, y0: 0, y1: 560, z0: 100, z1: 118 }, // shelf
}

describe('orientedPanel', () => {
  it('fills the box exactly with thickness on Z', () => {
    const p = orientedPanel({ x0: 0, x1: 600, y0: 0, y1: 560, z0: 100, z1: 118 }, 'z')
    expect(p.thickness).toBeCloseTo(18, 9)
    const b = aabb(p)
    expect(b.min.x).toBeCloseTo(0, 9)
    expect(b.max.x).toBeCloseTo(600, 9)
    expect(b.min.y).toBeCloseTo(0, 9)
    expect(b.max.y).toBeCloseTo(560, 9)
    expect(b.min.z).toBeCloseTo(100, 9)
    expect(b.max.z).toBeCloseTo(118, 9)
  })

  it('fills the box exactly with thickness on X — a side panel', () => {
    const p = orientedPanel(box, 'x')
    expect(p.thickness).toBeCloseTo(18, 9)
    const b = aabb(p)
    expect(b.min.x).toBeCloseTo(10, 9)
    expect(b.max.x).toBeCloseTo(28, 9)
    expect(b.min.y).toBeCloseTo(100, 9)
    expect(b.max.y).toBeCloseTo(660, 9)
    expect(b.min.z).toBeCloseTo(0, 9)
    expect(b.max.z).toBeCloseTo(720, 9)
  })

  it('fills the box exactly with thickness on Y — a back panel', () => {
    const p = orientedPanel({ x0: 18, x1: 582, y0: 548, y1: 560, z0: 100, z1: 700 }, 'y')
    expect(p.thickness).toBeCloseTo(12, 9)
    const b = aabb(p)
    expect(b.min.x).toBeCloseTo(18, 9)
    expect(b.max.x).toBeCloseTo(582, 9)
    expect(b.min.y).toBeCloseTo(548, 9)
    expect(b.max.y).toBeCloseTo(560, 9)
    expect(b.min.z).toBeCloseTo(100, 9)
    expect(b.max.z).toBeCloseTo(700, 9)
  })

  it('never reports a panel whose thickness is a face dimension', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const p = orientedPanel(thinBox[axis], axis)
      expect(p.thickness).toBeLessThan(p.length)
      expect(p.thickness).toBeLessThan(p.width)
    }
  })

  // The AABB tests above would still pass if an orientation mapped a board axis onto a *negative*
  // carcase axis and compensated by shifting `position` off the min corner. That is the shape of
  // orientation a fourth row would most plausibly take, and it is the shape that silently breaks
  // callers: the generator computes boxes and hands their min corners around (for dado offsets,
  // shelf pitch, joint placement), so "position is the min corner" must hold as a property of the
  // table, not as a coincidence of the three rows that happen to exist today.
  it('places the board origin on the box min corner for every orientation', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const b = thinBox[axis]
      const p = orientedPanel(b, axis)
      expect(p.position).toEqual({ x: b.x0, y: b.y0, z: b.z0 })
    }
  })
})
