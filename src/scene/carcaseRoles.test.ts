import { describe, it, expect } from 'vitest'
import { carcaseRoles, orientedPanel, validateCarcaseParams } from './carcaseRoles'
import type { RoleSpec } from './carcaseRoles'
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

  // Deferred from Task 4.2 until the shelf layout math existed. Height 160 clears every existing
  // rule (the toe kick leaves 160 - 100 - 36 = 24 mm), but three 18 mm shelves cannot occupy a
  // 24 mm bay: the table computes a negative bay and places shelf 0 at z=110.5, 7.5 mm inside the
  // bottom panel, with the shelves overlapping each other 10.5 mm apart.
  it('rejects fixed shelves that do not fit the internal height', () => {
    const squeezed: CarcaseParams = { ...base, height: 160, fixedShelves: 3 }
    expect(validateCarcaseParams(squeezed)).toEqual([
      'fixedShelves do not fit in the internal height',
    ])
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

function roleBox(roles: RoleSpec[], key: string) {
  const r = roles.find((x) => x.role === key)
  if (!r) throw new Error(`no role ${key} in [${roles.map((x) => x.role).join(', ')}]`)
  return aabb(r.panel)
}

type Aabb = ReturnType<typeof aabb>

// Shared faces are how a carcase is built, so touching is not overlap; only a shared volume is.
function interpenetrates(a: Aabb, b: Aabb): boolean {
  const eps = 1e-6
  const on = (axis: 'x' | 'y' | 'z') =>
    Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > eps
  return on('x') && on('y') && on('z')
}

const variations: Record<string, CarcaseParams> = {
  base,
  'no top': { ...base, hasTop: false },
  'no back': { ...base, backMode: 'none' },
  'applied back': { ...base, backMode: 'applied' },
  'no base': { ...base, baseMode: 'none' },
  ladder: { ...base, baseMode: 'ladder' },
  legs: { ...base, baseMode: 'legs' },
  'two shelves': { ...base, fixedShelves: 2 },
  'no shelves': { ...base, fixedShelves: 0 },
  divided: { ...base, dividers: [0.5] },
}

describe('carcaseRoles', () => {
  it('emits the Base 600 roles in build order', () => {
    expect(carcaseRoles(base).map((r) => r.role)).toEqual([
      'left-side',
      'right-side',
      'bottom',
      'top',
      'back',
      'toe-kick',
      'shelf-fixed-0',
    ])
  })

  it('stands the sides flush with the envelope, full height', () => {
    const roles = carcaseRoles(base)
    const left = roleBox(roles, 'left-side')
    expect(left.min.x).toBeCloseTo(0, 9)
    expect(left.min.y).toBeCloseTo(0, 9)
    expect(left.min.z).toBeCloseTo(0, 9)
    expect(left.max.x).toBeCloseTo(18, 9)
    expect(left.max.y).toBeCloseTo(560, 9)
    expect(left.max.z).toBeCloseTo(720, 9)

    const right = roleBox(roles, 'right-side')
    expect(right.min.x).toBeCloseTo(582, 9)
    expect(right.max.x).toBeCloseTo(600, 9)
    expect(right.min.z).toBeCloseTo(0, 9)
    expect(right.max.z).toBeCloseTo(720, 9)
  })

  it('seats the bottom on the toe kick, between the sides', () => {
    const roles = carcaseRoles(base)
    const bottom = roleBox(roles, 'bottom')
    const kick = roleBox(roles, 'toe-kick')
    expect(bottom.min.x).toBeCloseTo(18, 9)
    expect(bottom.max.x).toBeCloseTo(582, 9)
    expect(bottom.min.z).toBeCloseTo(100, 9)
    expect(bottom.max.z).toBeCloseTo(118, 9)
    expect(kick.max.z).toBeCloseTo(bottom.min.z, 9)
    expect(kick.min.y).toBeCloseTo(60, 9)
    expect(kick.max.y).toBeCloseTo(78, 9)
  })

  it('captures the back at the rear, spanning bay to inner top', () => {
    const back = roleBox(carcaseRoles(base), 'back')
    expect(back.min.y).toBeCloseTo(548, 9)
    expect(back.max.y).toBeCloseTo(560, 9)
    expect(back.min.z).toBeCloseTo(118, 9)
    expect(back.max.z).toBeCloseTo(702, 9)
  })

  it('stops shelves short of a captured back', () => {
    const roles = carcaseRoles(base)
    expect(roleBox(roles, 'shelf-fixed-0').max.y).toBeCloseTo(roleBox(roles, 'back').min.y, 9)
  })

  it('centres a single fixed shelf in the internal height', () => {
    const roles = carcaseRoles(base)
    const shelf = roleBox(roles, 'shelf-fixed-0')
    const below = shelf.min.z - roleBox(roles, 'bottom').max.z
    const above = roleBox(roles, 'top').min.z - shelf.max.z
    expect(below).toBeCloseTo(above, 9)
    expect(below).toBeGreaterThan(0)
  })

  it('splits the internal height into equal bays for two fixed shelves', () => {
    const roles = carcaseRoles({ ...base, fixedShelves: 2 })
    const lower = roleBox(roles, 'shelf-fixed-0')
    const upper = roleBox(roles, 'shelf-fixed-1')
    const bays = [
      lower.min.z - roleBox(roles, 'bottom').max.z,
      upper.min.z - lower.max.z,
      roleBox(roles, 'top').min.z - upper.max.z,
    ]
    expect(bays[1]).toBeCloseTo(bays[0], 9)
    expect(bays[2]).toBeCloseTo(bays[0], 9)
    expect(bays[0]).toBeGreaterThan(0)
  })

  it('omits the top when hasTop is false and runs the back to full height', () => {
    const roles = carcaseRoles({ ...base, hasTop: false })
    expect(roles.map((r) => r.role)).not.toContain('top')
    expect(roleBox(roles, 'back').max.z).toBeCloseTo(720, 9)
  })

  it('omits the back and runs shelves full depth when backMode is none', () => {
    const roles = carcaseRoles({ ...base, backMode: 'none' })
    expect(roles.map((r) => r.role)).not.toContain('back')
    expect(roleBox(roles, 'shelf-fixed-0').max.y).toBeCloseTo(560, 9)
  })

  it('drops the bottom to the floor when baseMode is none', () => {
    const roles = carcaseRoles({ ...base, baseMode: 'none' })
    expect(roles.map((r) => r.role)).not.toContain('toe-kick')
    const bottom = roleBox(roles, 'bottom')
    expect(bottom.min.z).toBeCloseTo(0, 9)
    expect(bottom.max.z).toBeCloseTo(18, 9)
  })

  it('emits four ladder rails under the carcase', () => {
    const roles = carcaseRoles({ ...base, baseMode: 'ladder' })
    for (const key of ['ladder-front', 'ladder-back', 'ladder-left', 'ladder-right']) {
      const b = roleBox(roles, key)
      expect(b.min.z).toBeCloseTo(0, 9)
      expect(b.max.z).toBeCloseTo(100, 9)
    }
    expect(roleBox(roles, 'ladder-front').min.y).toBeCloseTo(60, 9)
    expect(roleBox(roles, 'ladder-back').max.y).toBeCloseTo(560, 9)
    expect(roleBox(roles, 'ladder-left').max.x).toBeCloseTo(18, 9)
    expect(roleBox(roles, 'ladder-right').min.x).toBeCloseTo(582, 9)
  })

  it('centres a divider on its width fraction', () => {
    const roles = carcaseRoles({ ...base, dividers: [0.5] })
    const d = roleBox(roles, 'divider-0')
    expect(d.min.x).toBeCloseTo(291, 9)
    expect(d.max.x).toBeCloseTo(309, 9)
    expect(d.min.z).toBeCloseTo(118, 9)
    expect(d.max.z).toBeCloseTo(702, 9)
    expect(d.max.y).toBeCloseTo(548, 9)
  })

  it('emits nothing for invalid params', () => {
    expect(carcaseRoles({ ...base, width: 10 })).toEqual([])
  })

  it('returns a stable order across repeated calls', () => {
    const keys = () =>
      carcaseRoles({ ...base, dividers: [0.4], fixedShelves: 2 }).map((r) => r.role)
    expect(keys()).toEqual(keys())
  })

  // Checks the panels against each other rather than against numbers copied from the spec: an
  // arithmetic slip in one row of the table shows up as two boards occupying the same volume.
  // Two combinations are deliberately absent because the role table itself makes them cross, and
  // no arithmetic here can separate them: a divider spans the full internal height while a fixed
  // shelf spans the full internal width, and a ladder base occupies z 0..toeKickHeight while the
  // sides and bottom still start at z=0 (floor only rises for a toe kick). Both are gaps in the
  // table, recorded rather than papered over.
  it('never lets two panels share volume', () => {
    const cases: Record<string, CarcaseParams> = {
      base,
      divided: { ...base, dividers: [0.35, 0.7], fixedShelves: 0 },
      'two shelves': { ...base, fixedShelves: 2 },
      'open, topless': { ...base, backMode: 'none', hasTop: false, baseMode: 'none' },
    }
    for (const [name, params] of Object.entries(cases)) {
      const boxes = carcaseRoles(params).map((r) => ({ role: r.role, box: aabb(r.panel) }))
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(
            interpenetrates(boxes[i].box, boxes[j].box),
            `${name}: ${boxes[i].role} overlaps ${boxes[j].role}`,
          ).toBe(false)
        }
      }
    }
  })

  // A zero or negative extent reaches OCCT as a degenerate solid and fails in the kernel, far from
  // the arithmetic that produced it.
  it('emits no degenerate panel for any mode', () => {
    for (const [name, params] of Object.entries(variations)) {
      const roles = carcaseRoles(params)
      expect(roles.length, name).toBeGreaterThan(0)
      for (const r of roles) {
        expect(r.panel.length, `${name}/${r.role} length`).toBeGreaterThan(0)
        expect(r.panel.width, `${name}/${r.role} width`).toBeGreaterThan(0)
        expect(r.panel.thickness, `${name}/${r.role} thickness`).toBeGreaterThan(0)
      }
    }
  })
})
