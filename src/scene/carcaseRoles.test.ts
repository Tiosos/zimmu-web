import { describe, it, expect } from 'vitest'
import { orientedPanel, validateCarcaseParams } from './carcaseRoles'
import type { CarcaseParams } from './types'
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

const base: CarcaseParams = {
  width: 600,
  height: 720,
  depth: 560,
  material: '18mm Ply',
  thickness: 18,
  hasTop: true,
  backMode: 'captured',
  backThickness: 12,
  baseMode: 'toe-kick',
  toeKickHeight: 100,
  toeKickSetback: 60,
  fixedShelves: 1,
  adjustableShelves: { rows: 2, pitch: 32, setback: 37, startHeight: 200, count: 10 },
  jointMethod: 'dado-rabbet',
  dividers: [],
}

describe('validateCarcaseParams', () => {
  it('accepts a sane base cabinet', () => {
    expect(validateCarcaseParams(base)).toEqual([])
  })

  it('rejects a carcase narrower than two side panels', () => {
    expect(validateCarcaseParams({ ...base, width: 30 })).toContain(
      'width must exceed 2 × thickness',
    )
  })

  it('rejects a toe kick taller than the carcase', () => {
    expect(validateCarcaseParams({ ...base, toeKickHeight: 800 })).toContain(
      'toeKickHeight must be less than height',
    )
  })

  it('rejects negative shelf counts', () => {
    expect(validateCarcaseParams({ ...base, fixedShelves: -1 })).toContain(
      'fixedShelves must be 0 or more',
    )
  })

  it('rejects dividers outside 0..1 or out of order', () => {
    expect(validateCarcaseParams({ ...base, dividers: [1.5] })).toContain(
      'dividers must lie strictly between 0 and 1',
    )
    expect(validateCarcaseParams({ ...base, dividers: [0.6, 0.3] })).toContain(
      'dividers must be ascending',
    )
  })

  it('rejects a back thicker than the depth it sits in', () => {
    expect(validateCarcaseParams({ ...base, backThickness: 600 })).toContain(
      'backThickness must be less than depth',
    )
  })

  it('accumulates every problem rather than stopping at the first', () => {
    expect(validateCarcaseParams({ ...base, width: 10, fixedShelves: -2 }).length).toBeGreaterThan(
      1,
    )
  })

  // Reasons forward from what the generator needs rather than backward from the rules that exist:
  // every box it builds must be non-degenerate, and the interior bay (between the bottom panel
  // sitting on the toe kick and the top panel) is the one whose height three parameters conspire
  // to consume. `toeKickHeight < height` alone does not protect it.
  it('rejects a toe kick that leaves no interior bay', () => {
    const bay = (p: CarcaseParams) => p.height - p.toeKickHeight - 2 * p.thickness
    expect(bay(base)).toBeGreaterThan(0)

    const squashed: CarcaseParams = { ...base, height: 130, toeKickHeight: 100 }
    expect(bay(squashed)).toBeLessThanOrEqual(0)
    expect(validateCarcaseParams(squashed)).toContain(
      'toeKickHeight leaves no room between top and bottom',
    )
  })

  it('accepts every plausible real cabinet', () => {
    const cabinets: Record<string, CarcaseParams> = {
      '300 wall unit': { ...base, width: 300, height: 720, depth: 300, baseMode: 'none' },
      '900 base unit': {
        ...base,
        width: 900,
        height: 870,
        depth: 600,
        toeKickHeight: 150,
        toeKickSetback: 75,
        dividers: [0.5],
      },
      '2100 tall unit': {
        ...base,
        width: 600,
        height: 2100,
        depth: 600,
        fixedShelves: 3,
        dividers: [0.33, 0.66],
      },
      'open-backed': { ...base, backMode: 'none', depth: 300, backThickness: 12 },
      'on legs': { ...base, baseMode: 'legs', toeKickHeight: 120, hasTop: false },
    }
    for (const [name, params] of Object.entries(cabinets)) {
      expect(validateCarcaseParams(params), name).toEqual([])
    }
  })
})
