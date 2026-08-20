import { describe, it, expect } from 'vitest'
import { carcaseCuts, carcaseRoles, orientedPanel, validateCarcaseParams } from './carcaseRoles'
import type { RoleSpec } from './carcaseRoles'
import type { BoxCut, CarcaseParams } from './types'
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

  // Defect 3: the side rails run y:[KS+T, D-T], so they invert one thickness before the front
  // rail alone would run out of depth — 70 + 18 = 88 clears a 100 deep cabinet, 70 + 36 does not.
  it('rejects a ladder setback that inverts the side rails', () => {
    const shallow: CarcaseParams = { ...base, baseMode: 'ladder', depth: 100, toeKickSetback: 70 }
    expect(shallow.toeKickSetback + shallow.thickness).toBeLessThan(shallow.depth)
    expect(validateCarcaseParams(shallow)).toEqual([
      'toeKickSetback leaves no room for the ladder side rails',
    ])
    expect(carcaseRoles(shallow)).toEqual([])

    // Scoped to ladder mode: a toe kick is a single panel and the old rule already covers it.
    expect(validateCarcaseParams({ ...base, depth: 100, toeKickSetback: 70 })).toEqual([])
  })

  // Follows from defect 2: a ladder base now lifts the whole carcase, so toeKickHeight spends the
  // same height budget it spends under a toe kick and needs the same rules.
  it('charges a ladder base against the height budget', () => {
    expect(validateCarcaseParams({ ...base, baseMode: 'ladder', height: 130 })).toContain(
      'toeKickHeight leaves no room between top and bottom',
    )
    expect(validateCarcaseParams({ ...base, baseMode: 'ladder', height: 90 })).toContain(
      'toeKickHeight must be less than height',
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
  'ladder, divided, shelved': { ...base, baseMode: 'ladder', dividers: [0.5], fixedShelves: 2 },
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
      'shelf-0-0',
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
    expect(roleBox(roles, 'shelf-0-0').max.y).toBeCloseTo(roleBox(roles, 'back').min.y, 9)
  })

  it('centres a single fixed shelf in the internal height', () => {
    const roles = carcaseRoles(base)
    const shelf = roleBox(roles, 'shelf-0-0')
    const below = shelf.min.z - roleBox(roles, 'bottom').max.z
    const above = roleBox(roles, 'top').min.z - shelf.max.z
    expect(below).toBeCloseTo(above, 9)
    expect(below).toBeGreaterThan(0)
  })

  it('splits the internal height into equal bays for two fixed shelves', () => {
    const roles = carcaseRoles({ ...base, fixedShelves: 2 })
    const lower = roleBox(roles, 'shelf-0-0')
    const upper = roleBox(roles, 'shelf-0-1')
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
    expect(roleBox(roles, 'shelf-0-0').max.y).toBeCloseTo(560, 9)
  })

  it('drops the bottom to the floor when baseMode is none', () => {
    const roles = carcaseRoles({ ...base, baseMode: 'none' })
    expect(roles.map((r) => r.role)).not.toContain('toe-kick')
    const bottom = roleBox(roles, 'bottom')
    expect(bottom.min.z).toBeCloseTo(0, 9)
    expect(bottom.max.z).toBeCloseTo(18, 9)
  })

  it('emits four ladder rails and stands the carcase on top of them', () => {
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

    // Defect 2: the sides used to start at z=0 in every mode, so they ran through the rails.
    // Height is total height from the ground, so the carcase is 620 tall on a 100 mm frame.
    expect(roleBox(roles, 'left-side').min.z).toBeCloseTo(100, 9)
    expect(roleBox(roles, 'right-side').min.z).toBeCloseTo(100, 9)
    expect(roleBox(roles, 'left-side').max.z).toBeCloseTo(720, 9)
    expect(roleBox(roles, 'bottom').min.z).toBeCloseTo(100, 9)
    expect(roleBox(roles, 'bottom').max.z).toBeCloseTo(118, 9)
  })

  // Defect 1: a divider spans the full internal height and a shelf used to span the full internal
  // width, so the two rows shared volume by construction. Shelves belong to a bay.
  it('emits fixed shelves per bay, each stopping at the divider', () => {
    const roles = carcaseRoles({ ...base, dividers: [0.5], fixedShelves: 2 })
    expect(roles.filter((r) => r.role.startsWith('shelf-')).map((r) => r.role)).toEqual([
      'shelf-0-0',
      'shelf-0-1',
      'shelf-1-0',
      'shelf-1-1',
    ])
    const divider = roleBox(roles, 'divider-0')
    const left = roleBox(roles, 'shelf-0-0')
    const right = roleBox(roles, 'shelf-1-0')
    expect(left.min.x).toBeCloseTo(18, 9)
    expect(left.max.x).toBeCloseTo(divider.min.x, 9)
    expect(right.min.x).toBeCloseTo(divider.max.x, 9)
    expect(right.max.x).toBeCloseTo(582, 9)
    expect(right.min.z).toBeCloseTo(left.min.z, 9)
  })

  // `fixedShelves` counts shelves per bay, so two dividers triple the shelf count and the carcase
  // stays symmetrical.
  it('repeats the shelf count in every bay', () => {
    const roles = carcaseRoles({ ...base, dividers: [0.33, 0.66], fixedShelves: 2 })
    expect(roles.filter((r) => r.role.startsWith('shelf-')).length).toBe(6)
  })

  it('names shelves by bay only when the carcase has more than one bay', () => {
    expect(carcaseRoles(base).find((r) => r.role === 'shelf-0-0')?.label).toBe('Shelf 1')
    const divided = carcaseRoles({ ...base, dividers: [0.5] })
    expect(divided.filter((r) => r.role.startsWith('shelf-')).map((r) => r.label)).toEqual([
      'Bay 1 Shelf 1',
      'Bay 2 Shelf 1',
    ])
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
  // arithmetic slip in one row of the table shows up as two boards occupying the same volume. It
  // is what caught all three of the geometry defects the table used to carry.
  it('never lets two panels share volume', () => {
    const cases: Record<string, CarcaseParams> = {
      base,
      divided: { ...base, dividers: [0.5] },
      'divided, two shelves': { ...base, dividers: [0.35, 0.7], fixedShelves: 2 },
      ladder: { ...base, baseMode: 'ladder' },
      'ladder, divided, shelved': { ...base, baseMode: 'ladder', dividers: [0.5], fixedShelves: 2 },
      'open, topless, on legs': { ...base, hasTop: false, backMode: 'none', baseMode: 'legs' },
      'no shelves': { ...base, fixedShelves: 0 },
    }
    for (const [name, params] of Object.entries(cases)) {
      const boxes = carcaseRoles(params).map((r) => ({ role: r.role, box: aabb(r.panel) }))
      expect(boxes.length, name).toBeGreaterThan(0)
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

describe('dividers must clear the side panels and each other', () => {
  it('rejects a divider that overlaps the left side', () => {
    // W*0.02 - T/2 = 3, so the divider spans x[3,21] and the left side spans x[0,18].
    // `0 < d < 1` passes this, which is why the pairwise-overlap test never saw it — no
    // fixture used a divider that close to an edge.
    expect(validateCarcaseParams({ ...base, dividers: [0.02] })).toContain(
      'dividers must clear the side panels',
    )
  })

  it('rejects a divider that overlaps the right side', () => {
    expect(validateCarcaseParams({ ...base, dividers: [0.98] })).toContain(
      'dividers must clear the side panels',
    )
  })

  it('rejects two dividers too close to leave a bay between them', () => {
    // Ascending, both in range, but only 6mm apart on an 18mm stock.
    expect(validateCarcaseParams({ ...base, dividers: [0.5, 0.51] })).toContain(
      'dividers must leave a bay between them',
    )
  })

  it('accepts dividers that clear the sides and each other', () => {
    expect(validateCarcaseParams({ ...base, dividers: [0.34, 0.67] })).toEqual([])
    expect(validateCarcaseParams({ ...base, dividers: [0.5] })).toEqual([])
  })

  it('produces no overlapping panels for every divider set it accepts', () => {
    for (const dividers of [[0.05], [0.5], [0.34, 0.67], [0.25, 0.5, 0.75]]) {
      const params = { ...base, dividers }
      expect(validateCarcaseParams(params)).toEqual([])
      const roles = carcaseRoles(params)
      for (let i = 0; i < roles.length; i++) {
        for (let j = i + 1; j < roles.length; j++) {
          const a = aabb(roles[i].panel)
          const b = aabb(roles[j].panel)
          const shares = (ax: 'x' | 'y' | 'z') =>
            Math.min(a.max[ax], b.max[ax]) - Math.max(a.min[ax], b.min[ax]) > 1e-6
          expect(
            shares('x') && shares('y') && shares('z'),
            `${roles[i].role} overlaps ${roles[j].role} with dividers ${JSON.stringify(dividers)}`,
          ).toBe(false)
        }
      }
    }
  })
})

describe('carcaseCuts', () => {
  const panelOf = (p: CarcaseParams, role: string) =>
    carcaseRoles(p).find((r) => r.role === role)!.panel

  // World AABB of a board-local box carried by a panel, expressed in carcase space. The notch is
  // stated in board-local coordinates, so this is the only assertion that pins it to the physical
  // toe recess rather than to a claim about which local axis is which.
  function cutAabb(panel: ReturnType<typeof orientedPanel>, cut: BoxCut) {
    const m = composeWorldMatrix({
      ...panel,
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
    for (const cx of [cut.position.x, cut.position.x + cut.size.x])
      for (const cy of [cut.position.y, cut.position.y + cut.size.y])
        for (const cz of [cut.position.z, cut.position.z + cut.size.z]) {
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

  it('notches both side panels when the base is a toe kick', () => {
    expect(carcaseCuts(base, 'left-side')).toHaveLength(1)
    expect(carcaseCuts(base, 'right-side')).toHaveLength(1)
  })

  it('sizes the notch to the setback by the kick height at the panel origin', () => {
    const [notch] = carcaseCuts(base, 'left-side')
    expect(notch.size.x).toBeCloseTo(base.toeKickSetback, 9)
    expect(notch.size.y).toBeCloseTo(base.toeKickHeight, 9)
    expect(notch.position.x).toBeCloseTo(0, 9)
    expect(notch.position.y).toBeCloseTo(0, 9)
  })

  // A tool face coplanar with the face it subtracts from is resolved unreliably by OCCT, so the
  // notch overshoots both thickness faces instead of ending on them.
  it('cuts through the full thickness rather than pocketing it', () => {
    const panel = panelOf(base, 'left-side')
    const [notch] = carcaseCuts(base, 'left-side')
    expect(notch.size.z).toBeGreaterThanOrEqual(panel.thickness)
    expect(notch.position.z).toBeLessThan(0)
    expect(notch.position.z + notch.size.z).toBeGreaterThan(panel.thickness)
  })

  it('removes exactly the toe recess from each side panel in carcase space', () => {
    const { width: W, thickness: T, toeKickSetback: KS, toeKickHeight: KH } = base
    for (const [role, x0, x1] of [
      ['left-side', 0, T],
      ['right-side', W - T, W],
    ] as const) {
      const b = cutAabb(panelOf(base, role), carcaseCuts(base, role)[0])
      // Depth: from the front face back to the toe-kick rail, which stands at y:[KS, KS+T].
      expect(b.min.y, role).toBeCloseTo(0, 9)
      expect(b.max.y, role).toBeCloseTo(KS, 9)
      // Height: from the floor up to the underside of the bottom panel, which sits at z:[KH, KH+T].
      expect(b.min.z, role).toBeCloseTo(0, 9)
      expect(b.max.z, role).toBeCloseTo(KH, 9)
      // Thickness: clear through the panel, overshooting both faces.
      expect(b.min.x, role).toBeLessThan(x0)
      expect(b.max.x, role).toBeGreaterThan(x1)
    }
  })

  it('emits no notch for a base mode that does not recess the sides', () => {
    for (const baseMode of ['none', 'legs', 'ladder'] as const) {
      const p = { ...base, baseMode }
      expect(validateCarcaseParams(p), baseMode).toEqual([])
      expect(carcaseCuts(p, 'left-side'), baseMode).toEqual([])
      expect(carcaseCuts(p, 'right-side'), baseMode).toEqual([])
    }
  })

  it('emits no notch for a role that is not a side panel', () => {
    for (const role of ['bottom', 'top', 'back', 'toe-kick', 'shelf-0-0']) {
      expect(
        carcaseRoles(base).some((r) => r.role === role),
        role,
      ).toBe(true)
      expect(carcaseCuts(base, role), role).toEqual([])
    }
  })

  // carcaseCuts is not told which component it is generating for; regenerateComponents stamps the
  // owner. Leaving a placeholder here would make an unowned cut look component-owned.
  it('leaves the owner unset', () => {
    expect(carcaseCuts(base, 'left-side')[0].sourceComponentId).toBeUndefined()
    expect(carcaseCuts(base, 'left-side')[0].sourceJointId).toBeUndefined()
  })
})
