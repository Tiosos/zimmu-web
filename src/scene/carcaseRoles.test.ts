import { describe, it, expect } from 'vitest'
import {
  carcaseBoxes,
  carcaseContactPairs,
  carcaseCuts,
  carcaseJoints,
  carcaseRoles,
  orientedPanel,
  validateCarcaseParams,
  parameterForRole,
} from './carcaseRoles'
import type { JointDescriptor, PanelSpec, RoleSpec } from './carcaseRoles'
import { dadoDepthFor } from '../geom/dado'
import { reconcileJoints } from './reconcileJoints'
import type { BoardPart, BoxCut, CarcaseComponent, CarcaseParams, Face, Scene, Vec3 } from './types'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'
import { componentsById } from './componentTree'
import { regenerateComponents } from './regenerateComponents'
import { boardsTouch } from './suggestJoints'
import { CARCASE_PRESETS } from './carcasePresets'

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
    // Not 18..582: each end runs the dado depth past the side's inner face, into its groove.
    expect(bottom.min.x).toBeCloseTo(18 - dadoDepthFor(base.thickness), 9)
    expect(bottom.max.x).toBeCloseTo(582 + dadoDepthFor(base.thickness), 9)
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
    // Not 118..702: the bay ends are dado floors inside the bottom and the top.
    expect(back.min.z).toBeCloseTo(118 - dadoDepthFor(base.thickness), 9)
    expect(back.max.z).toBeCloseTo(702 + dadoDepthFor(base.thickness), 9)
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

  it('emits a bare perimeter frame at 600 and a mid rail at 1200', () => {
    const railsOf = (width: number) =>
      carcaseRoles({ ...base, baseMode: 'ladder', width })
        .filter((r) => r.role.startsWith('ladder-'))
        .map((r) => r.role)
    expect(railsOf(600)).toEqual(['ladder-front', 'ladder-back', 'ladder-left', 'ladder-right'])
    expect(railsOf(1200)).toEqual([
      'ladder-front',
      'ladder-back',
      'ladder-left',
      'ladder-right',
      'ladder-mid-0',
    ])
  })

  it('shapes a mid rail exactly like a side rail, centred between them', () => {
    const roles = carcaseRoles({ ...base, baseMode: 'ladder', width: 1200 })
    const left = roleBox(roles, 'ladder-left')
    const mid = roleBox(roles, 'ladder-mid-0')
    expect(mid.min.y).toBeCloseTo(left.min.y, 9)
    expect(mid.max.y).toBeCloseTo(left.max.y, 9)
    expect(mid.min.z).toBeCloseTo(left.min.z, 9)
    expect(mid.max.z).toBeCloseTo(left.max.z, 9)
    expect(mid.max.x - mid.min.x).toBeCloseTo(base.thickness, 9)
    expect((mid.min.x + mid.max.x) / 2).toBeCloseTo(600, 9)
  })

  // A property over the whole width range rather than a few hand-picked cabinets: the rule is
  // "no clear span exceeds the limit, using as few rails as achieves that", and both halves are
  // measured from the boxes the generator actually emits.
  it('keeps every clear span within the limit, with no rail to spare', () => {
    for (let width = 600; width <= 2400; width += 100) {
      const p: CarcaseParams = { ...base, baseMode: 'ladder', width }
      expect(validateCarcaseParams(p), `${width}`).toEqual([])
      const roles = carcaseRoles(p)
      const uprights = roles
        .filter((r) => /^ladder-(left|right|mid-\d+)$/.test(r.role))
        .map((r) => aabb(r.panel))
        .sort((a, b) => a.min.x - b.min.x)
      const spans: number[] = []
      for (let i = 1; i < uprights.length; i++) {
        spans.push(uprights[i].min.x - uprights[i - 1].max.x)
      }
      expect(spans.length, `${width}`).toBe(uprights.length - 1)
      for (const span of spans) {
        expect(span, `${width}mm: span ${span}`).toBeGreaterThan(0)
        expect(span, `${width}mm: span ${span}`).toBeLessThanOrEqual(600)
      }
      // One fewer rail would have to overrun, or the frame is carrying a rail it does not need.
      const mids = uprights.length - 2
      if (mids > 0) {
        expect(
          (width - 2 * base.thickness - (mids - 1) * base.thickness) / mids,
          `${width}mm uses ${mids} mid rails where ${mids - 1} would do`,
        ).toBeGreaterThan(600)
      }
    }
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
    // Each shelf end stops a dado depth *inside* the panel that houses it, not on its face.
    const depth = dadoDepthFor(base.thickness)
    expect(left.min.x).toBeCloseTo(18 - depth, 9)
    expect(left.max.x).toBeCloseTo(divider.min.x + depth, 9)
    expect(right.min.x).toBeCloseTo(divider.max.x - depth, 9)
    expect(right.max.x).toBeCloseTo(582 + depth, 9)
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
    // Housed in the bottom and the top, so it runs a dado depth into each.
    expect(d.min.z).toBeCloseTo(118 - dadoDepthFor(base.thickness), 9)
    expect(d.max.z).toBeCloseTo(702 + dadoDepthFor(base.thickness), 9)
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
  //
  // Measured on a fastener method, which is the table face-to-face: a dado or a finger corner
  // deliberately runs one panel into another, and 'shares volume only where a joint houses one
  // panel in the other' is what holds that case to exactly the joinery.
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
      const boxes = carcaseRoles({ ...params, jointMethod: 'dowel' }).map((r) => ({
        role: r.role,
        box: aabb(r.panel),
      }))
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
      // Face-to-face, as above: joinery extensions are checked against the joint table instead.
      const params: CarcaseParams = { ...base, dividers, jointMethod: 'dowel' }
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

describe('parameterForRole', () => {
  it('maps a side panel length to depth and thickness to thickness', () => {
    expect(parameterForRole('left-side', 'length', base)).toBe('depth')
    expect(parameterForRole('left-side', 'thickness', base)).toBe('thickness')
    expect(parameterForRole('right-side', 'length', base)).toBe('depth')
  })

  it('maps a side panel width to height only when the carcase starts on the ground', () => {
    expect(parameterForRole('left-side', 'width', base)).toBe('height')
    // Under a ladder base the side spans height - toeKickHeight, so its width is not the height
    // parameter and pushing an edit there would silently change the wrong thing.
    expect(parameterForRole('left-side', 'width', { ...base, baseMode: 'ladder' })).toBeNull()
  })

  it('maps a back panel thickness to backThickness, not thickness', () => {
    expect(parameterForRole('back', 'thickness', base)).toBe('backThickness')
  })

  it('maps top and bottom width to depth', () => {
    expect(parameterForRole('bottom', 'width', base)).toBe('depth')
    expect(parameterForRole('top', 'width', base)).toBe('depth')
  })

  it('returns null for a dimension no single parameter controls', () => {
    // A bottom panel's length is width - 2*thickness: two parameters, so there is nothing to push.
    expect(parameterForRole('bottom', 'length', base)).toBeNull()
  })

  it('maps every shelf and divider thickness to thickness, whatever their bay', () => {
    expect(parameterForRole('shelf-0-0', 'thickness', base)).toBe('thickness')
    expect(parameterForRole('shelf-2-1', 'thickness', base)).toBe('thickness')
    expect(parameterForRole('divider-0', 'thickness', base)).toBe('thickness')
    expect(parameterForRole('shelf-0-0', 'width', base)).toBeNull()
  })

  it('returns null for an unknown or absent role', () => {
    expect(parameterForRole(undefined, 'length', base)).toBeNull()
    expect(parameterForRole('not-a-role', 'length', base)).toBeNull()
  })
})

// A board built from a panel spec, so a panel's rotation can be pushed through the same matrix the
// app uses. Face directions come out of that matrix rather than out of a table, which is the whole
// point: a face-mapping table restated here could only ever agree with itself.
function boardOf(p: PanelSpec) {
  return {
    ...p,
    kind: 'board' as const,
    id: 'x',
    label: 'x',
    material: '',
    color: '#fff',
    cuts: [],
    visible: true,
    parentId: null,
    driven: true,
  }
}

function centreOf(p: PanelSpec): Vec3 {
  const b = aabb(p)
  return {
    x: (b.min.x + b.max.x) / 2,
    y: (b.min.y + b.max.y) / 2,
    z: (b.min.z + b.max.z) / 2,
  }
}

function faceDirInCarcase(p: PanelSpec, face: Face): Vec3 {
  const m = composeWorldMatrix(boardOf(p))
  const sign = face[0] === '+' ? 1 : -1
  const unit = {
    X: [sign, 0, 0],
    Y: [0, sign, 0],
    Z: [0, 0, sign],
  }[face[1] as 'X' | 'Y' | 'Z']
  const o = applyMatrixToPoint(m, 0, 0, 0)
  const q = applyMatrixToPoint(m, unit[0], unit[1], unit[2])
  return { x: q[0] - o[0], y: q[1] - o[1], z: q[2] - o[2] }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|')

function sceneFor(params: CarcaseParams): Scene {
  const cabinet: CarcaseComponent = {
    kind: 'carcase',
    id: 'cmp_1',
    label: 'Cabinet',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params,
  }
  return regenerateComponents({
    parts: [],
    materials: {},
    hardware: [],
    joints: [],
    components: [cabinet],
  })
}

// The denominator the joint checklist uses: every board pair the suggestion engine calls touching.
function touchingPairs(params: CarcaseParams): string[] {
  const scene = sceneFor(params)
  const byId = componentsById(scene.components)
  const boards = scene.parts.filter(
    (p): p is BoardPart & { role: string } => p.kind === 'board' && p.role !== undefined,
  )
  const out: string[] = []
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      if (boardsTouch(boards[i], boards[j], byId)) out.push(pairKey(boards[i].role, boards[j].role))
    }
  }
  return out.sort()
}

describe('carcaseJoints', () => {
  // Self-checking: a housing face must point *at* the part it houses, and the housed end must point
  // back at the housing. Asserting the letters from the plan's table would only prove the table
  // matches itself.
  it('points every joint face at the part it joins', () => {
    const cases: Record<string, CarcaseParams> = {
      base,
      'base, fingered': { ...base, jointMethod: 'finger' },
      wall: { ...base, baseMode: 'none' },
      'wall, fingered': { ...base, baseMode: 'none', jointMethod: 'finger' },
      ladder: { ...base, baseMode: 'ladder' },
      'ladder, fingered': { ...base, baseMode: 'ladder', jointMethod: 'finger' },
      divided: { ...base, dividers: [0.5] },
      'two dividers, two shelves': { ...base, dividers: [0.34, 0.67], fixedShelves: 2 },
      'no top, no back': { ...base, hasTop: false, backMode: 'none' },
      'applied back': { ...base, backMode: 'applied' },
      'applied back on a ladder base': { ...base, backMode: 'applied', baseMode: 'ladder' },
      'wide ladder': { ...base, baseMode: 'ladder', width: 1200 },
    }
    for (const [name, p] of Object.entries(cases)) {
      const panels = new Map(carcaseRoles(p).map((r) => [r.role, r.panel]))
      const joints = carcaseJoints(p, 'cmp_1')
      expect(joints.length, name).toBeGreaterThan(0)
      for (const d of joints) {
        const housing = panels.get(d.housingRole)
        const housed = panels.get(d.housedRole)
        const where = `${name}: ${d.housingRole} houses ${d.housedRole}`
        expect(housing, where).toBeDefined()
        expect(housed, where).toBeDefined()
        if (housing === undefined || housed === undefined) continue
        const a = centreOf(housing)
        const b = centreOf(housed)
        const toHoused = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
        expect(dot(faceDirInCarcase(housing, d.housingFace), toHoused), where).toBeGreaterThan(0)
        expect(dot(faceDirInCarcase(housed, d.housedEnd), toHoused), where).toBeLessThan(0)
      }
    }
  })

  it('emits twelve joints and two contact pairs for a base cabinet', () => {
    expect(carcaseJoints(base, 'cmp_1')).toHaveLength(12)
    expect(carcaseContactPairs(base)).toHaveLength(2)
  })

  // The completeness check: every pair the engine calls touching is accounted for exactly once,
  // and nothing is claimed for panels that do not meet.
  it('covers every touching pair exactly once, as either a joint or a contact pair', () => {
    const cases: [string, CarcaseParams, number, number][] = [
      ['Base 600', CARCASE_PRESETS[0].params, 12, 2],
      ['Wall 600', CARCASE_PRESETS[1].params, 10, 1],
      ['Base 600 + divider', { ...CARCASE_PRESETS[0].params, dividers: [0.5] }, 16, 4],
      ['Ladder 600', { ...CARCASE_PRESETS[0].params, baseMode: 'ladder' }, 14, 11],
      [
        'Ladder 600 + divider',
        { ...CARCASE_PRESETS[0].params, baseMode: 'ladder', dividers: [0.5] },
        18,
        13,
      ],
      [
        'Ladder 600 + divider + two shelves per bay',
        { ...CARCASE_PRESETS[0].params, baseMode: 'ladder', dividers: [0.5], fixedShelves: 2 },
        22,
        15,
      ],
      // An applied back is screwed onto the back of the shell instead of being let into it, so
      // its four panel pairs move from the joint column to the contact column without changing
      // the total.
      ['Applied back', { ...CARCASE_PRESETS[0].params, backMode: 'applied' }, 8, 6],
      [
        'Applied back on a ladder base',
        { ...CARCASE_PRESETS[0].params, backMode: 'applied', baseMode: 'ladder' },
        10,
        15,
      ],
      ['Ladder 1200', { ...CARCASE_PRESETS[0].params, baseMode: 'ladder', width: 1200 }, 16, 12],
    ]
    for (const [name, p, jointCount, contactCount] of cases) {
      const joints = carcaseJoints(p, 'cmp_1')
      const contacts = carcaseContactPairs(p)
      expect(joints, name).toHaveLength(jointCount)
      expect(contacts, name).toHaveLength(contactCount)

      const covered = [
        ...joints.map((d) => pairKey(d.housingRole, d.housedRole)),
        ...contacts.map(([a, b]) => pairKey(a, b)),
      ]
      expect(new Set(covered).size, `${name}: no pair covered twice`).toBe(covered.length)
      expect(covered.sort(), name).toEqual(touchingPairs(p))
    }
  })

  it('joins the ladder frame at its own four corners and nowhere else', () => {
    const rails = carcaseJoints({ ...base, baseMode: 'ladder' }, 'cmp_1').filter(
      (d) => d.housingRole.startsWith('ladder-') || d.housedRole.startsWith('ladder-'),
    )
    expect(rails.map((d) => pairKey(d.housingRole, d.housedRole)).sort()).toEqual([
      'ladder-back|ladder-left',
      'ladder-back|ladder-right',
      'ladder-front|ladder-left',
      'ladder-front|ladder-right',
    ])
    // The full-width rails house the side rails, not the reverse: a side rail's end stops at the
    // crossing rail's face.
    expect(
      rails.every((d) => d.housedRole.endsWith('-left') || d.housedRole.endsWith('-right')),
    ).toBe(true)
  })

  it('does not house an applied back — it is screwed on, not cut in', () => {
    const applied = carcaseJoints({ ...base, backMode: 'applied' }, 'cmp_1')
    expect(applied.some((d) => d.housedRole === 'back' || d.housingRole === 'back')).toBe(false)
    // Captured is unchanged: both sides, the bottom and the top still house it.
    expect(carcaseJoints(base, 'cmp_1').filter((d) => d.housedRole === 'back')).toHaveLength(4)
  })

  it('houses every mid rail in the front and back rails, exactly as it houses a side rail', () => {
    const js = carcaseJoints({ ...base, baseMode: 'ladder', width: 1200 }, 'cmp_1')
    const facesOf = (role: string) =>
      js
        .filter((d) => d.housedRole === role)
        .map((d) => `${d.kind} ${d.housingRole} ${d.housingFace} ${d.housedEnd}`)
        .sort()
    expect(facesOf('ladder-mid-0')).toEqual(facesOf('ladder-left'))
    expect(facesOf('ladder-mid-0')).toEqual(['dado ladder-back -Z +X', 'dado ladder-front +Z -X'])
  })

  it('houses dividers in the bottom and top, never in a side', () => {
    const withDivider = { ...base, dividers: [0.5] }
    const ds = carcaseJoints(withDivider, 'cmp_1').filter((d) =>
      d.housedRole.startsWith('divider-'),
    )
    expect(ds.map((d) => d.housingRole).sort()).toEqual(['bottom', 'top'])
    expect(
      carcaseJoints(withDivider, 'cmp_1').some((d) => d.housingRole.startsWith('divider-')),
    ).toBe(true)
  })

  it('houses each shelf in its own bay edges, not in both sides', () => {
    const withDivider = { ...base, dividers: [0.5] }
    const js = carcaseJoints(withDivider, 'cmp_1')
    const housingsOf = (role: string) =>
      js
        .filter((d) => d.housedRole === role)
        .map((d) => d.housingRole)
        .sort()
    expect(housingsOf('shelf-0-0')).toEqual(['divider-0', 'left-side'])
    expect(housingsOf('shelf-1-0')).toEqual(['divider-0', 'right-side'])
  })

  it('houses a middle bay shelf in the two dividers that bound it', () => {
    const p = { ...base, dividers: [0.34, 0.67] }
    const js = carcaseJoints(p, 'cmp_1')
    const housingsOf = (role: string) =>
      js
        .filter((d) => d.housedRole === role)
        .map((d) => d.housingRole)
        .sort()
    expect(housingsOf('shelf-1-0')).toEqual(['divider-0', 'divider-1'])
  })

  it('tags every joint with the owning component and marks it driven', () => {
    const joints = carcaseJoints(base, 'cmp_2')
    expect(joints.every((j) => j.sourceComponentId === 'cmp_2')).toBe(true)
    expect(joints.every((j) => j.driven)).toBe(true)
  })

  it('fingers only the flush corners: two on a toe-kick base, four on a wall unit', () => {
    const kick = carcaseJoints({ ...base, jointMethod: 'finger' }, 'cmp_1')
    expect(kick.filter((j) => j.kind === 'finger')).toHaveLength(2)
    expect(kick.filter((j) => j.kind === 'finger').map((j) => j.housedRole)).toEqual(['top', 'top'])
    const wall = carcaseJoints({ ...CARCASE_PRESETS[1].params, jointMethod: 'finger' }, 'cmp_1')
    expect(wall.filter((j) => j.kind === 'finger')).toHaveLength(4)
    // Same pair set either way: finger replaces the dado at a flush corner, it does not add a pair.
    expect(carcaseJoints({ ...base, jointMethod: 'finger' }, 'cmp_1')).toHaveLength(
      carcaseJoints(base, 'cmp_1').length,
    )
  })

  it('emits nothing for fastener methods', () => {
    for (const m of ['dowel', 'butt-screw', 'confirmat'] as const) {
      expect(carcaseJoints({ ...base, jointMethod: m }, 'cmp_1'), m).toEqual([])
    }
  })

  it('emits nothing for invalid parameters', () => {
    expect(carcaseJoints({ ...base, width: 10 }, 'cmp_1')).toEqual([])
  })

  it('scales with shelf count', () => {
    const one = carcaseJoints(base, 'cmp_1').length
    const three = carcaseJoints({ ...base, fixedShelves: 3 }, 'cmp_1').length
    expect(three - one).toBe(4)
  })
})

describe('carcaseContactPairs', () => {
  it('declares the kick against the bottom and every shelf against the back', () => {
    expect(
      carcaseContactPairs(base)
        .map(([a, b]) => pairKey(a, b))
        .sort(),
    ).toEqual(['back|shelf-0-0', 'bottom|toe-kick'])
  })

  it('declares dividers against the back too', () => {
    const pairs = carcaseContactPairs({ ...base, dividers: [0.5] }).map(([a, b]) => pairKey(a, b))
    expect(pairs).toContain('back|divider-0')
  })

  it('declares the same pairs whatever fastens the cabinet', () => {
    for (const m of ['dowel', 'butt-screw', 'confirmat', 'finger'] as const) {
      expect(carcaseContactPairs({ ...base, jointMethod: m }), m).toEqual(carcaseContactPairs(base))
    }
  })

  it('declares the whole set-down plane of a ladder base, and nothing across the carcase', () => {
    const pairs = carcaseContactPairs({ ...base, baseMode: 'ladder', fixedShelves: 0 })
      .map(([a, b]) => pairKey(a, b))
      .sort()
    expect(pairs).toEqual([
      'bottom|ladder-back',
      'bottom|ladder-front',
      'bottom|ladder-left',
      'bottom|ladder-right',
      'ladder-back|left-side',
      'ladder-back|right-side',
      'ladder-front|left-side',
      'ladder-front|right-side',
      'ladder-left|left-side',
      'ladder-right|right-side',
    ])
  })

  it('declares an applied back against every panel it is screwed to', () => {
    const pairs = carcaseContactPairs({ ...base, backMode: 'applied' })
      .map(([a, b]) => pairKey(a, b))
      .sort()
    expect(pairs).toEqual([
      'back|bottom',
      'back|left-side',
      'back|right-side',
      'back|shelf-0-0',
      'back|top',
      'bottom|toe-kick',
    ])
  })

  it('carries the bottom on the mid rails too', () => {
    const pairs = carcaseContactPairs({ ...base, baseMode: 'ladder', width: 1200 }).map(([a, b]) =>
      pairKey(a, b),
    )
    expect(pairs).toContain('bottom|ladder-mid-0')
  })

  it('declares nothing against a back that does not exist', () => {
    expect(carcaseContactPairs({ ...base, backMode: 'none' })).toEqual([['bottom', 'toe-kick']])
  })

  it('emits nothing for invalid parameters', () => {
    expect(carcaseContactPairs({ ...base, width: 10 })).toEqual([])
  })
})

type Axis = 'x' | 'y' | 'z'

const jointedCases: Record<string, CarcaseParams> = {
  'toe-kick base': base,
  'base on the floor': { ...base, baseMode: 'none' },
  'ladder base': { ...base, baseMode: 'ladder' },
  'wide ladder base': { ...base, baseMode: 'ladder', width: 1200 },
  'fingered ladder base': { ...base, baseMode: 'ladder', jointMethod: 'finger' },
  // Excluded until Task 7.6: an applied back was dado'd into the sides as if it were captured,
  // and its seat was the one part in the generator that still moved through the pipeline.
  'applied back': { ...base, backMode: 'applied' },
  legs: { ...base, baseMode: 'legs' },
  'divided, two shelves': { ...base, dividers: [0.5], fixedShelves: 2 },
  'two dividers': { ...base, dividers: [0.34, 0.67], fixedShelves: 2 },
  'no top': { ...base, hasTop: false },
  'fingered wall': { ...CARCASE_PRESETS[1].params, jointMethod: 'finger' },
  'fingered base': { ...base, jointMethod: 'finger' },
  'fingered on the floor': { ...base, baseMode: 'none', jointMethod: 'finger' },
}

function panelsByRole(p: CarcaseParams): Map<string, Aabb> {
  return new Map(carcaseRoles(p).map((r) => [r.role, aabb(r.panel)]))
}

// Everything a joint descriptor implies about the two panels, read off the boxes rather than off
// the plan's table: a housing houses along its own thickness axis, and the panel it houses meets
// it end-on from whichever side it sits.
function edgeOf(p: CarcaseParams, d: JointDescriptor) {
  const thicknessAxis = new Map(carcaseBoxes(p).map((b) => [b.role, b.thicknessAxis]))
  const panels = panelsByRole(p)
  const ax = thicknessAxis.get(d.housingRole) as Axis
  const housing = panels.get(d.housingRole) as Aabb
  const housed = panels.get(d.housedRole) as Aabb
  const mid = (b: Aabb) => (b.min[ax] + b.max[ax]) / 2
  const low = mid(housing) < mid(housed)
  return {
    where: `${p.jointMethod}: ${d.housingRole} houses ${d.housedRole} on ${ax}`,
    housingThickness: housing.max[ax] - housing.min[ax],
    innerFace: low ? housing.max[ax] : housing.min[ax],
    outerFace: low ? housing.min[ax] : housing.max[ax],
    housedEnd: low ? housed.min[ax] : housed.max[ax],
    sign: low ? -1 : 1,
  }
}

describe('panel extents follow the joinery', () => {
  it('seats every dado-housed end at the groove floor', () => {
    for (const [name, p] of Object.entries(jointedCases)) {
      const dados = carcaseJoints(p, 'cmp_1').filter((d) => d.kind === 'dado')
      expect(dados.length, name).toBeGreaterThan(0)
      for (const d of dados) {
        const e = edgeOf(p, d)
        const depth = dadoDepthFor(e.housingThickness)
        expect(depth, `${name} — ${e.where}`).toBeGreaterThan(0)
        expect(e.housedEnd, `${name} — ${e.where}`).toBeCloseTo(e.innerFace + e.sign * depth, 9)
      }
    }
  })

  it('runs every finger-jointed end to the housing outer face', () => {
    for (const [name, p] of Object.entries(jointedCases)) {
      for (const d of carcaseJoints(p, 'cmp_1').filter((x) => x.kind === 'finger')) {
        const e = edgeOf(p, d)
        expect(e.housedEnd, `${name} — ${e.where}`).toBeCloseTo(e.outerFace, 9)
        expect(Math.abs(e.innerFace - e.housedEnd), `${name} — ${e.where}`).toBeCloseTo(
          e.housingThickness,
          9,
        )
      }
    }
  })

  // The two-axis case: the back is housed on all four of its in-plane edges.
  it('grows the back on every edge that houses it', () => {
    const back = roleBox(carcaseRoles(base), 'back')
    expect(back.min.x).toBeCloseTo(12, 9)
    expect(back.max.x).toBeCloseTo(588, 9)
    expect(back.min.z).toBeCloseTo(112, 9)
    expect(back.max.z).toBeCloseTo(708, 9)
    // Nothing houses the back on its thickness axis, so the depth it sits at is untouched.
    expect(back.min.y).toBeCloseTo(548, 9)
    expect(back.max.y).toBeCloseTo(560, 9)
  })

  // The other half of the same rule: an applied back is housed by nothing, so it stays the size
  // of the opening it overlays instead of growing a dado depth at each edge.
  it('leaves an applied back at butt size', () => {
    const back = roleBox(carcaseRoles({ ...base, backMode: 'applied' }), 'back')
    expect(back.min.x).toBeCloseTo(18, 9)
    expect(back.max.x).toBeCloseTo(582, 9)
    expect(back.min.z).toBeCloseTo(118, 9)
    expect(back.max.z).toBeCloseTo(702, 9)
    // Applied means behind the carcase, not let into it.
    expect(back.min.y).toBeCloseTo(560, 9)
    expect(back.max.y).toBeCloseTo(572, 9)
  })

  it('leaves panels butt-sized when no joint is emitted', () => {
    for (const method of ['dowel', 'butt-screw', 'confirmat'] as const) {
      for (const [name, p] of Object.entries(variations)) {
        const params = { ...p, jointMethod: method }
        expect(carcaseJoints(params, 'cmp_1'), `${name}/${method}`).toEqual([])
        expect(carcaseRoles(params), `${name}/${method}`).toEqual(
          carcaseBoxes(params).map((b) => ({
            role: b.role,
            label: b.label,
            panel: orientedPanel(b.box, b.thicknessAxis),
          })),
        )
      }
    }
    // The face-to-face numbers themselves, so "butt" is pinned to the cabinet and not to the
    // box table agreeing with itself.
    const bottom = roleBox(carcaseRoles({ ...base, jointMethod: 'dowel' }), 'bottom')
    expect(bottom.min.x).toBeCloseTo(18, 9)
    expect(bottom.max.x).toBeCloseTo(582, 9)
  })

  it('gives finger corners real overlapping material', () => {
    const p: CarcaseParams = { ...CARCASE_PRESETS[1].params, jointMethod: 'finger' }
    const roles = carcaseRoles(p)
    const fingers = carcaseJoints(p, 'cmp_1').filter((d) => d.kind === 'finger')
    expect(fingers.length).toBe(4)
    for (const d of fingers) {
      const e = edgeOf(p, d)
      expect(
        interpenetrates(roleBox(roles, d.housingRole), roleBox(roles, d.housedRole)),
        e.where,
      ).toBe(true)
    }
    // The top runs the full carcase width — side outer face to side outer face.
    const top = roleBox(roles, 'top')
    expect(top.min.x).toBeCloseTo(0, 9)
    expect(top.max.x).toBeCloseTo(p.width, 9)
  })

  it('shares volume only where a joint houses one panel in the other', () => {
    for (const [name, p] of Object.entries(jointedCases)) {
      const jointed = new Set(
        carcaseJoints(p, 'cmp_1').map((d) => pairKey(d.housingRole, d.housedRole)),
      )
      const boxes = carcaseRoles(p).map((r) => ({ role: r.role, box: aabb(r.panel) }))
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (!interpenetrates(boxes[i].box, boxes[j].box)) continue
          expect(
            jointed.has(pairKey(boxes[i].role, boxes[j].role)),
            `${name}: ${boxes[i].role} overlaps ${boxes[j].role} with no joint between them`,
          ).toBe(true)
        }
      }
    }
  })

  it('makes every seat a no-op through the full pipeline', () => {
    for (const [name, p] of Object.entries(jointedCases)) {
      const generated = sceneFor(p)
      const seated = reconcileJoints(generated)
      expect(generated.parts.length, name).toBeGreaterThan(0)
      for (const before of generated.parts) {
        const after = seated.parts.find((q) => q.id === before.id) as BoardPart
        expect(after.position.x, `${name}/${before.role} x`).toBeCloseTo(before.position.x, 6)
        expect(after.position.y, `${name}/${before.role} y`).toBeCloseTo(before.position.y, 6)
        expect(after.position.z, `${name}/${before.role} z`).toBeCloseTo(before.position.z, 6)
      }
    }
  })
})
