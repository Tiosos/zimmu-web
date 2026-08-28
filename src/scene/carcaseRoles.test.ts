import { describe, it, expect } from 'vitest'
import {
  carcaseBoxes as boxesOf,
  carcaseContactPairs as contactPairsOf,
  carcaseCuts as cutsOf,
  carcaseHoleArrays as holeArraysOf,
  carcaseJoints as jointsOf,
  carcaseRoles as rolesOf,
  orientedPanel,
  validateCarcaseParams as validateOf,
  parameterForRole,
} from './carcaseRoles'
import { roleThicknessFor } from './resolveThickness'
import { jointKindFor } from './resolveJointKind'
import type { JointDescriptor, PanelSpec, RoleSpec } from './carcaseRoles'
import { dadoDepthFor } from '../geom/dado'
import { legacyToSection } from './migrateSections'
import { seedInteriors } from './sectionInterior'
import type { Section } from './sectionTree'
import { reconcileJoints } from './reconcileJoints'
import type {
  BoardPart,
  BoxCut,
  CarcaseComponent,
  CarcaseParams,
  Face,
  HoleArrayCut,
  MaterialDef,
  Scene,
  Vec3,
} from './types'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'
import { componentsById } from './componentTree'
import { regenerateComponents } from './regenerateComponents'
import { boardsTouch } from './suggestJoints'
import { CARCASE_PRESETS } from './carcasePresets'
import { SWEEP } from './__fixtures__/sweep'

// World AABB of a panel spec, in carcase-local space. This is the assertion surface: it pins
// position and rotation together and is indifferent to which equivalent Euler triple the
// implementation chooses.
function aabb(p: ReturnType<typeof orientedPanel>) {
  const m = composeWorldMatrix({
    ...p,
    kind: 'board',
    grain: 'free' as const,
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

// The two materials every cabinet below is built from. `base` used to carry `thickness: 18` and
// `backThickness: 12` in its own parameters; the same two numbers now live on the materials it
// names, so every panel these tests measure is the panel it always was.
const MATERIALS: Record<string, MaterialDef> = {
  '18mm Ply': { thickness: 18 },
  '12mm MDF': { thickness: 12 },
  '25mm Ply': { thickness: 25 },
  // Named only where a rule has to reject it: a back cannot be thicker than the cabinet is deep.
  'Absurd 600': { thickness: 600 },
}

// What `base` resolves to. Spelled out because the assertions below are about a cabinet built from
// 18 mm stock, and reading the number back out of the resolver would let both sides move together.
const T = 18

const tOf = (p: CarcaseParams) => roleThicknessFor(p, MATERIALS, new Map())

// The generator resolves a thickness per panel now, so every entry point takes a resolver. These
// tests are about the layout rather than about resolution, so each wrapper binds the one the
// cabinet's own materials imply; the tests that are about resolution build their own.
const carcaseBoxes = (p: CarcaseParams) => boxesOf(p, tOf(p))
const carcaseRoles = (p: CarcaseParams) => rolesOf(p, tOf(p), jointKindFor([], ''))
const validateCarcaseParams = (p: CarcaseParams) => validateOf(p, tOf(p))
const carcaseContactPairs = (p: CarcaseParams) => contactPairsOf(p, tOf(p))
const carcaseJoints = (p: CarcaseParams, componentId: string) =>
  jointsOf(p, tOf(p), jointKindFor([], componentId), componentId)
const carcaseCuts = (p: CarcaseParams, role: string) => cutsOf(p, tOf(p), role)
const carcaseHoleArrays = (p: CarcaseParams, role: string) =>
  holeArraysOf(p, tOf(p), jointKindFor([], ''), role)

// The shelving `base` and its variants carry. A pin row now belongs to the section that needs it,
// so a cabinet states its shelving by seeding it onto the openings rather than holding one bundle.
const ADJ = {
  shelves: 0,
  count: 10,
  rows: 2 as 1 | 2,
  pitch: 32 as const,
  setback: 37,
  backSetback: 37,
}
const shelved = (s: Section, over: Partial<typeof ADJ> = {}): Section =>
  seedInteriors(s, { adjustable: { ...ADJ, ...over } })

// These tests describe cabinets the way the parameters used to: n bays across, m fixed shelves in
// each. `legacyToSection` is the conversion the app itself uses, so a fixture and a migrated file
// describe the same tree. Width and thickness are arguments because a section percentage is a share
// of the clear span, not of the gross width. Every opening gets `ADJ`, because a cabinet-wide
// `adjustableShelves` is what these fixtures used to carry.
const sec = (dividers: number[], fixedShelves: number, width = 600, thickness = 18) =>
  shelved(legacyToSection(dividers, fixedShelves, width, thickness))

// A division role carries the uuid of the section it splits, so the tests below name divisions by
// what they are and look the key up. `carcaseBoxes` emits them in tree order — each bay's shelves
// bottom-up, then the partition to that bay's right — which is exactly the order `shelf-{b}-{i}`
// and `divider-{i}` were numbered in, so these read the same way the old names did.
function divisionRoles(p: CarcaseParams, thicknessAxis: 'x' | 'z'): string[] {
  return carcaseBoxes(p)
    .filter((b) => b.role.startsWith('division-') && b.thicknessAxis === thicknessAxis)
    .map((b) => b.role)
}

const partitionRole = (p: CarcaseParams, i = 0): string => divisionRoles(p, 'x')[i]

function shelfRole(p: CarcaseParams, bay: number, i: number): string {
  const all = divisionRoles(p, 'z')
  const bays = divisionRoles(p, 'x').length + 1
  return all[bay * (all.length / bays) + i]
}

const base: CarcaseParams = {
  width: 600,
  height: 720,
  depth: 560,
  carcaseMaterial: '18mm Ply',
  backMaterial: '12mm MDF',
  hasTop: true,
  backMode: 'captured',
  baseMode: 'toe-kick',
  toeKickHeight: 100,
  toeKickSetback: 60,
  section: sec([], 1),
  jointMethod: 'dado-rabbet',
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

  // The v12 rules about divider fractions — in range, ascending, clear of the sides — described a
  // representation that no longer exists. What guards the same mistakes now is the tree's own
  // validator, whose messages the carcase validator folds in.
  it('reports the problems the section tree itself reports', () => {
    const broken: CarcaseParams = {
      ...base,
      section: {
        id: 'sec_root',
        size: { kind: 'equal' },
        content: { kind: 'split', axis: 'vertical', division: 'panel', children: [] },
      },
    }
    expect(validateCarcaseParams(broken)).toContain('a split needs at least two sections')
  })

  it('rejects a back thicker than the depth it sits in', () => {
    expect(validateCarcaseParams({ ...base, backMaterial: 'Absurd 600' })).toContain(
      'the back material is thicker than the cabinet is deep',
    )
  })

  it('accumulates every problem rather than stopping at the first', () => {
    expect(validateCarcaseParams({ ...base, width: 10, depth: 5 }).length).toBeGreaterThan(1)
  })

  // Reasons forward from what the generator needs rather than backward from the rules that exist:
  // every box it builds must be non-degenerate, and the interior bay (between the bottom panel
  // sitting on the toe kick and the top panel) is the one whose height three parameters conspire
  // to consume. `toeKickHeight < height` alone does not protect it.
  it('rejects a toe kick that leaves no interior bay', () => {
    const bay = (p: CarcaseParams) => p.height - p.toeKickHeight - 2 * T
    expect(bay(base)).toBeGreaterThan(0)

    const squashed: CarcaseParams = { ...base, height: 130, toeKickHeight: 100 }
    expect(bay(squashed)).toBeLessThanOrEqual(0)
    expect(validateCarcaseParams(squashed)).toContain(
      'toeKickHeight leaves no room between top and bottom',
    )
  })

  // Height 160 clears every other rule (the toe kick leaves 160 - 100 - 36 = 24 mm), but three
  // 18 mm shelves cannot occupy a 24 mm bay: the sections between them resolve to a negative
  // height, which is not a thin shelf but shelves passing through the bottom panel and each other.
  it('rejects fixed shelves that do not fit the internal height', () => {
    const squeezed: CarcaseParams = { ...base, height: 160, section: sec([], 3) }
    expect(validateCarcaseParams(squeezed)).toEqual(['the sections do not fit in the carcase'])
  })

  // Defect 3: the side rails run y:[KS+T, D-T], so they invert one thickness before the front
  // rail alone would run out of depth — 70 + 18 = 88 clears a 100 deep cabinet, 70 + 36 does not.
  it('rejects a ladder setback that inverts the side rails', () => {
    const shallow: CarcaseParams = { ...base, baseMode: 'ladder', depth: 100, toeKickSetback: 70 }
    expect(shallow.toeKickSetback + T).toBeLessThan(shallow.depth)
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
        section: sec([0.5], 1, 900),
      },
      '2100 tall unit': {
        ...base,
        width: 600,
        height: 2100,
        depth: 600,
        section: sec([0.33, 0.66], 3),
      },
      'open-backed': { ...base, backMode: 'none', depth: 300 },
      'on legs': { ...base, baseMode: 'legs', toeKickHeight: 120, hasTop: false },
    }
    for (const [name, params] of Object.entries(cabinets)) {
      expect(validateCarcaseParams(params), name).toEqual([])
    }
  })
})

function panelOf(roles: RoleSpec[], key: string): PanelSpec {
  const r = roles.find((x) => x.role === key)
  if (!r) throw new Error(`no role ${key} in [${roles.map((x) => x.role).join(', ')}]`)
  return r.panel
}

function roleBox(roles: RoleSpec[], key: string) {
  return aabb(panelOf(roles, key))
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
  'ladder, divided, shelved': { ...base, baseMode: 'ladder', section: sec([0.5], 2) },
  legs: { ...base, baseMode: 'legs' },
  'two shelves': { ...base, section: sec([], 2) },
  'no shelves': { ...base, section: sec([], 0) },
  divided: { ...base, section: sec([0.5], 1) },
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
      shelfRole(base, 0, 0),
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
    expect(bottom.min.x).toBeCloseTo(18 - dadoDepthFor(T), 9)
    expect(bottom.max.x).toBeCloseTo(582 + dadoDepthFor(T), 9)
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
    expect(back.min.z).toBeCloseTo(118 - dadoDepthFor(T), 9)
    expect(back.max.z).toBeCloseTo(702 + dadoDepthFor(T), 9)
  })

  it('stops shelves short of a captured back', () => {
    const roles = carcaseRoles(base)
    expect(roleBox(roles, shelfRole(base, 0, 0)).max.y).toBeCloseTo(roleBox(roles, 'back').min.y, 9)
  })

  it('centres a single fixed shelf in the internal height', () => {
    const roles = carcaseRoles(base)
    const shelf = roleBox(roles, shelfRole(base, 0, 0))
    const below = shelf.min.z - roleBox(roles, 'bottom').max.z
    const above = roleBox(roles, 'top').min.z - shelf.max.z
    expect(below).toBeCloseTo(above, 9)
    expect(below).toBeGreaterThan(0)
  })

  it('splits the internal height into equal bays for two fixed shelves', () => {
    const twoShelves = { ...base, section: sec([], 2) }
    const roles = carcaseRoles(twoShelves)
    const lower = roleBox(roles, shelfRole(twoShelves, 0, 0))
    const upper = roleBox(roles, shelfRole(twoShelves, 0, 1))
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
    const openBacked = { ...base, backMode: 'none' as const }
    const roles = carcaseRoles(openBacked)
    expect(roles.map((r) => r.role)).not.toContain('back')
    expect(roleBox(roles, shelfRole(openBacked, 0, 0)).max.y).toBeCloseTo(560, 9)
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
    expect(mid.max.x - mid.min.x).toBeCloseTo(T, 9)
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
          (width - 2 * T - (mids - 1) * T) / mids,
          `${width}mm uses ${mids} mid rails where ${mids - 1} would do`,
        ).toBeGreaterThan(600)
      }
    }
  })

  // Defect 1: a divider spans the full internal height and a shelf used to span the full internal
  // width, so the two rows shared volume by construction. Shelves belong to a bay.
  it('emits fixed shelves per bay, each stopping at the divider', () => {
    const p = { ...base, section: sec([0.5], 2) }
    const roles = carcaseRoles(p)
    expect(divisionRoles(p, 'z')).toHaveLength(4)
    const divider = roleBox(roles, partitionRole(p))
    const left = roleBox(roles, shelfRole(p, 0, 0))
    const right = roleBox(roles, shelfRole(p, 1, 0))
    // Each shelf end stops a dado depth *inside* the panel that houses it, not on its face.
    const depth = dadoDepthFor(T)
    expect(left.min.x).toBeCloseTo(18 - depth, 9)
    expect(left.max.x).toBeCloseTo(divider.min.x + depth, 9)
    expect(right.min.x).toBeCloseTo(divider.max.x - depth, 9)
    expect(right.max.x).toBeCloseTo(582 + depth, 9)
    expect(right.min.z).toBeCloseTo(left.min.z, 9)
  })

  // A shelf lives in a bay, so two partitions across a cabinet that carries two shelves per bay
  // triple the shelf count and the carcase stays symmetrical.
  it('repeats the shelf count in every bay', () => {
    expect(divisionRoles({ ...base, section: sec([0.33, 0.66], 2) }, 'z')).toHaveLength(6)
  })

  // Labels are user-facing — the scene tree, the cutting list and the BOM all print them — so a
  // division carries an ordinal, and a shelf names its bay wherever there is more than one. An
  // earlier version of this test asserted the bare words 'Partition' and 'Shelf' and passed, because
  // it was rewritten by the same change that dropped the ordinals; only the e2e, which asserts text
  // a user actually reads, caught it. Hence all three shapes are pinned here.
  it('numbers a division, and names the bay when there is more than one', () => {
    const divided = { ...base, section: sec([0.5], 2) }
    const byRole = new Map(carcaseRoles(divided).map((r) => [r.role, r.label]))
    expect(byRole.get(partitionRole(divided))).toBe('Partition 1')
    expect(byRole.get(shelfRole(divided, 0, 0))).toBe('Bay 1 Shelf 1')
    expect(byRole.get(shelfRole(divided, 0, 1))).toBe('Bay 1 Shelf 2')
    expect(byRole.get(shelfRole(divided, 1, 0))).toBe('Bay 2 Shelf 1')
  })

  it('omits the bay from a shelf label in an undivided cabinet', () => {
    const plain = { ...base, section: sec([], 2) }
    const byRole = new Map(carcaseRoles(plain).map((r) => [r.role, r.label]))
    expect(byRole.get(shelfRole(plain, 0, 0))).toBe('Shelf 1')
    expect(byRole.get(shelfRole(plain, 0, 1))).toBe('Shelf 2')
  })

  it('numbers each partition of a multi-bay cabinet', () => {
    const three = { ...base, width: 1800, section: sec([1 / 3, 2 / 3], 0, 1800) }
    const byRole = new Map(carcaseRoles(three).map((r) => [r.role, r.label]))
    expect(byRole.get(partitionRole(three, 0))).toBe('Partition 1')
    expect(byRole.get(partitionRole(three, 1))).toBe('Partition 2')
  })

  it('centres a divider on its width fraction', () => {
    const divided = { ...base, section: sec([0.5], 1) }
    const roles = carcaseRoles(divided)
    const d = roleBox(roles, partitionRole(divided))
    expect(d.min.x).toBeCloseTo(291, 9)
    expect(d.max.x).toBeCloseTo(309, 9)
    // Housed in the bottom and the top, so it runs a dado depth into each.
    expect(d.min.z).toBeCloseTo(118 - dadoDepthFor(T), 9)
    expect(d.max.z).toBeCloseTo(702 + dadoDepthFor(T), 9)
    expect(d.max.y).toBeCloseTo(548, 9)
  })

  it('emits nothing for invalid params', () => {
    expect(carcaseRoles({ ...base, width: 10 })).toEqual([])
  })

  it('returns a stable order across repeated calls', () => {
    // One params object, called twice: a division role is keyed by its section's id, so building a
    // second tree from the same legacy numbers is a different cabinet as far as the keys go.
    const p = { ...base, section: sec([0.4], 2) }
    const keys = () => carcaseRoles(p).map((r) => r.role)
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
      divided: { ...base, section: sec([0.5], 1) },
      'divided, two shelves': { ...base, section: sec([0.35, 0.7], 2) },
      ladder: { ...base, baseMode: 'ladder' },
      'ladder, divided, shelved': { ...base, baseMode: 'ladder', section: sec([0.5], 2) },
      'open, topless, on legs': { ...base, hasTop: false, backMode: 'none', baseMode: 'legs' },
      'no shelves': { ...base, section: sec([], 0) },
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

// Three separate v12 rules — a divider in range, clear of each side, and leaving a bay beside its
// neighbour — were three ways of saying one thing, which the tree says once: the section the
// partition would stand beside has no width left.
describe('partitions must clear the side panels and each other', () => {
  it('rejects a partition that overlaps the left side', () => {
    // W*0.02 - T/2 = 3, so the partition spans x[3,21] and the left side spans x[0,18].
    expect(validateCarcaseParams({ ...base, section: sec([0.02], 1) })).toContain(
      'the sections do not fit in the carcase',
    )
  })

  it('rejects a partition that overlaps the right side', () => {
    expect(validateCarcaseParams({ ...base, section: sec([0.98], 1) })).toContain(
      'the sections do not fit in the carcase',
    )
  })

  it('rejects two partitions too close to leave a bay between them', () => {
    // Ascending, both in range, but only 6mm apart on an 18mm stock.
    expect(validateCarcaseParams({ ...base, section: sec([0.5, 0.51], 1) })).toContain(
      'the sections do not fit in the carcase',
    )
  })

  it('accepts partitions that clear the sides and each other', () => {
    expect(validateCarcaseParams({ ...base, section: sec([0.34, 0.67], 1) })).toEqual([])
    expect(validateCarcaseParams({ ...base, section: sec([0.5], 1) })).toEqual([])
  })

  it('produces no overlapping panels for every divider set it accepts', () => {
    for (const dividers of [[0.05], [0.5], [0.34, 0.67], [0.25, 0.5, 0.75]]) {
      // Face-to-face, as above: joinery extensions are checked against the joint table instead.
      const params: CarcaseParams = { ...base, section: sec(dividers, 1), jointMethod: 'dowel' }
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
      grain: 'free' as const,
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
    const { width: W, toeKickSetback: KS, toeKickHeight: KH } = base
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
    for (const role of ['bottom', 'top', 'back', 'toe-kick', shelfRole(base, 0, 0)]) {
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
  it('maps a side panel length to depth', () => {
    expect(parameterForRole('left-side', 'length', base)).toBe('depth')
    expect(parameterForRole('right-side', 'length', base)).toBe('depth')
  })

  it('maps a side panel width to height only when the carcase starts on the ground', () => {
    expect(parameterForRole('left-side', 'width', base)).toBe('height')
    // Under a ladder base the side spans height - toeKickHeight, so its width is not the height
    // parameter and pushing an edit there would silently change the wrong thing.
    expect(parameterForRole('left-side', 'width', { ...base, baseMode: 'ladder' })).toBeNull()
  })

  // Was: a back panel's thickness maps to `backThickness`, a side's to `thickness`. Neither
  // parameter exists any more — thickness comes from the panel's material — so there is nothing
  // for an edit to be pushed into, on any role. The route for that edit is a material choice or a
  // per-part override, not a cabinet parameter.
  it('maps no dimension of any role to a thickness parameter', () => {
    const divided = { ...base, section: sec([0.5], 1) }
    for (const role of [
      'left-side',
      'right-side',
      'bottom',
      'top',
      'back',
      'toe-kick',
      partitionRole(divided),
      shelfRole(divided, 0, 0),
      shelfRole(divided, 1, 0),
    ]) {
      expect(parameterForRole(role, 'thickness', base), role).toBeNull()
    }
  })

  it('maps top and bottom width to depth', () => {
    expect(parameterForRole('bottom', 'width', base)).toBe('depth')
    expect(parameterForRole('top', 'width', base)).toBe('depth')
  })

  it('returns null for a dimension no single parameter controls', () => {
    // A bottom panel's length is width - 2*thickness: two parameters, so there is nothing to push.
    expect(parameterForRole('bottom', 'length', base)).toBeNull()
  })

  it('maps no division dimension to a parameter: the tree decides what a division spans', () => {
    const divided = { ...base, section: sec([0.5], 1) }
    expect(parameterForRole(shelfRole(divided, 0, 0), 'width', base)).toBeNull()
    expect(parameterForRole(shelfRole(divided, 0, 0), 'length', base)).toBeNull()
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
    grain: 'free' as const,
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
    materials: MATERIALS,
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
      divided: { ...base, section: sec([0.5], 1) },
      'two dividers, two shelves': { ...base, section: sec([0.34, 0.67], 2) },
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
      ['Base 600 + divider', { ...CARCASE_PRESETS[0].params, section: sec([0.5], 1) }, 16, 4],
      ['Ladder 600', { ...CARCASE_PRESETS[0].params, baseMode: 'ladder' }, 14, 11],
      [
        'Ladder 600 + divider',
        { ...CARCASE_PRESETS[0].params, baseMode: 'ladder', section: sec([0.5], 1) },
        18,
        13,
      ],
      [
        'Ladder 600 + divider + two shelves per bay',
        { ...CARCASE_PRESETS[0].params, baseMode: 'ladder', section: sec([0.5], 2) },
        22,
        15,
      ],
      // An applied back is screwed onto the back of the shell instead of being let into it, so
      // its four panel pairs move from the joint column to the contact column without changing
      // the total.
      ['Applied back', { ...CARCASE_PRESETS[0].params, backMode: 'applied' }, 8, 6],
      // One more contact pair than a captured back on the same frame: covering the shell, the
      // applied back reaches the top of the frame and lands on the back rail.
      [
        'Applied back on a ladder base',
        { ...CARCASE_PRESETS[0].params, backMode: 'applied', baseMode: 'ladder' },
        10,
        16,
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

  it('houses partitions in the bottom and top, never in a side', () => {
    const withDivider = { ...base, section: sec([0.5], 1) }
    const partition = partitionRole(withDivider)
    const ds = carcaseJoints(withDivider, 'cmp_1').filter((d) => d.housedRole === partition)
    expect(ds.map((d) => d.housingRole).sort()).toEqual(['bottom', 'top'])
    // And the partition houses the shelves either side of it.
    expect(carcaseJoints(withDivider, 'cmp_1').some((d) => d.housingRole === partition)).toBe(true)
  })

  it('houses each shelf in its own bay edges, not in both sides', () => {
    const withDivider = { ...base, section: sec([0.5], 1) }
    const js = carcaseJoints(withDivider, 'cmp_1')
    const housingsOf = (role: string) =>
      js
        .filter((d) => d.housedRole === role)
        .map((d) => d.housingRole)
        .sort()
    expect(housingsOf(shelfRole(withDivider, 0, 0))).toEqual(
      [partitionRole(withDivider), 'left-side'].sort(),
    )
    expect(housingsOf(shelfRole(withDivider, 1, 0))).toEqual(
      [partitionRole(withDivider), 'right-side'].sort(),
    )
  })

  it('houses a middle bay shelf in the two partitions that bound it', () => {
    const p = { ...base, section: sec([0.34, 0.67], 1) }
    const js = carcaseJoints(p, 'cmp_1')
    const housingsOf = (role: string) =>
      js
        .filter((d) => d.housedRole === role)
        .map((d) => d.housingRole)
        .sort()
    expect(housingsOf(shelfRole(p, 1, 0))).toEqual(
      [partitionRole(p, 0), partitionRole(p, 1)].sort(),
    )
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

  // butt-screw left this list: a ScrewJoint derives its own geometry, so a screwed cabinet emits
  // joints. Dowel and confirmat still have no kind in the Joint union to emit.
  it('emits nothing for dowel or confirmat', () => {
    for (const m of ['dowel', 'confirmat'] as const) {
      expect(carcaseJoints({ ...base, jointMethod: m }, 'cmp_1'), m).toEqual([])
    }
  })

  // Pair for pair, face for face, in the same order: screwing a carcase changes what happens at
  // each edge, not which edges there are.
  it('screws every pair the dado path houses, with the same two faces', () => {
    const screws = carcaseJoints({ ...base, jointMethod: 'butt-screw' }, 'cmp_1')
    expect(screws.length).toBeGreaterThan(0)
    expect(screws.every((d) => d.kind === 'screw')).toBe(true)
    expect(screws.map((d) => ({ ...d, kind: 'dado' as const }))).toEqual(
      carcaseJoints(base, 'cmp_1'),
    )
  })

  it('emits nothing for invalid parameters', () => {
    expect(carcaseJoints({ ...base, width: 10 }, 'cmp_1')).toEqual([])
  })

  it('scales with shelf count', () => {
    const one = carcaseJoints(base, 'cmp_1').length
    const three = carcaseJoints({ ...base, section: sec([], 3) }, 'cmp_1').length
    expect(three - one).toBe(4)
  })
})

describe('carcaseContactPairs', () => {
  it('declares the kick against the bottom and every shelf against the back', () => {
    expect(
      carcaseContactPairs(base)
        .map(([a, b]) => pairKey(a, b))
        .sort(),
    ).toEqual([pairKey('back', shelfRole(base, 0, 0)), 'bottom|toe-kick'].sort())
  })

  it('declares partitions against the back too', () => {
    const divided = { ...base, section: sec([0.5], 1) }
    const pairs = carcaseContactPairs(divided).map(([a, b]) => pairKey(a, b))
    expect(pairs).toContain(pairKey('back', partitionRole(divided)))
  })

  it('declares the same pairs whatever fastens the cabinet', () => {
    for (const m of ['dowel', 'butt-screw', 'confirmat', 'finger'] as const) {
      expect(carcaseContactPairs({ ...base, jointMethod: m }), m).toEqual(carcaseContactPairs(base))
    }
  })

  it('declares the whole set-down plane of a ladder base, and nothing across the carcase', () => {
    const pairs = carcaseContactPairs({ ...base, baseMode: 'ladder', section: sec([], 0) })
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
    expect(pairs).toEqual(
      [
        'back|bottom',
        'back|left-side',
        'back|right-side',
        pairKey('back', shelfRole(base, 0, 0)),
        'back|top',
        'bottom|toe-kick',
      ].sort(),
    )
  })

  it('declares an applied back against the ladder rail it comes down on', () => {
    const pairs = carcaseContactPairs({ ...base, backMode: 'applied', baseMode: 'ladder' }).map(
      ([a, b]) => pairKey(a, b),
    )
    expect(pairs).toContain('back|ladder-back')
    // Only that rail: the side and front rails stand clear of the plane the back is screwed to.
    expect(pairs.filter((k) => k.startsWith('back|ladder'))).toEqual(['back|ladder-back'])
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

// How much of an axis two boxes have in common: negative is a gap, zero is a line or a plane.
function shared(a: Aabb, b: Aabb, ax: Axis): number {
  return Math.min(a.max[ax], b.max[ax]) - Math.max(a.min[ax], b.min[ax])
}

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
  'divided, two shelves': { ...base, section: sec([0.5], 2) },
  'two dividers': { ...base, section: sec([0.34, 0.67], 2) },
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

  // The other half of the same rule: an applied back is housed by nothing, so no edge of it grows
  // a dado depth. It covers the shell rather than filling the opening — screwed to the rear edges,
  // it has to land on them.
  it('sizes an applied back to the carcase envelope', () => {
    const back = roleBox(carcaseRoles({ ...base, backMode: 'applied' }), 'back')
    expect(back.min.x).toBeCloseTo(0, 9)
    expect(back.max.x).toBeCloseTo(600, 9)
    expect(back.min.z).toBeCloseTo(0, 9)
    expect(back.max.z).toBeCloseTo(720, 9)
    // Applied means behind the carcase, not let into it.
    expect(back.min.y).toBeCloseTo(560, 9)
    expect(back.max.y).toBeCloseTo(572, 9)
  })

  // A ladder base is a frame *under* the carcase, so the envelope the back covers starts on top of
  // it — the back is screwed to the shell, not to the frame.
  it('starts an applied back at the top of a ladder base', () => {
    const back = roleBox(carcaseRoles({ ...base, backMode: 'applied', baseMode: 'ladder' }), 'back')
    expect(back.min.z).toBeCloseTo(100, 9)
    expect(back.max.z).toBeCloseTo(720, 9)
  })

  // Face contact, not merely touching: sized to the opening, the back met each side along a line —
  // dy = 0 and dx = 0 — which the adjacency test still calls touching because it is an AABB with a
  // millimetre of tolerance. Every panel it is screwed to must share real area on the y = D plane.
  it('lands an applied back on the rear edges with area, not along a line', () => {
    const cases: Record<string, CarcaseParams> = {
      'toe-kick base': { ...base, backMode: 'applied' },
      'ladder base': { ...base, backMode: 'applied', baseMode: 'ladder' },
      'on the floor': { ...base, backMode: 'applied', baseMode: 'none' },
      'no top': { ...base, backMode: 'applied', hasTop: false },
    }
    for (const [name, p] of Object.entries(cases)) {
      const roles = carcaseRoles(p)
      const back = roleBox(roles, 'back')
      const screwedTo = ['left-side', 'right-side', 'bottom', ...(p.hasTop ? ['top'] : [])]
      for (const role of screwedTo) {
        const panel = roleBox(roles, role)
        const where = `${name}: back on ${role}`
        expect(panel.max.y, where).toBeCloseTo(back.min.y, 9)
        expect(shared(back, panel, 'x') * shared(back, panel, 'z'), where).toBeGreaterThan(0)
      }
    }
  })

  it('leaves panels butt-sized when no joint is emitted', () => {
    for (const method of ['dowel', 'confirmat'] as const) {
      for (const [name, p] of Object.entries(variations)) {
        const params = { ...p, jointMethod: method }
        expect(carcaseJoints(params, 'cmp_1'), `${name}/${method}`).toEqual([])
        // Grain is dropped rather than reconstructed: this test is about extents, and rebuilding
        // grain here would only assert the production line against a copy of itself. `grain.test.ts`
        // owns it.
        expect(
          carcaseRoles(params).map((r) => ({ role: r.role, label: r.label, panel: r.panel })),
          `${name}/${method}`,
        ).toEqual(
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

  // The highest-risk line in the screw work: a screwed butt joint has no groove, so the extension
  // pass must move nothing — and unlike dowel and confirmat above, this cabinet does emit a joint
  // at every pair, so it reaches the pass rather than skipping it. Both edges come from the same
  // resolver the generator reads, one call per side: a literal 564 would still pass if the
  // generator and the fixture ever drifted together.
  it('screws a cabinet together without extending a single panel', () => {
    const p: CarcaseParams = { ...base, jointMethod: 'butt-screw' }
    const t = tOf(p)
    expect(carcaseJoints(p, 'cmp_1').length).toBeGreaterThan(0)

    const bottom = panelOf(carcaseRoles(p), 'bottom')
    expect(bottom.length).toBeCloseTo(p.width - t('left-side') - t('right-side'), 9)
    expect(bottom.width).toBeCloseTo(p.depth, 9)

    // The dadoed cabinet it replaces is longer by one groove at each end, so the numbers above are
    // measuring the extension pass rather than an arithmetic identity that holds either way.
    const dadoed = panelOf(carcaseRoles({ ...base, jointMethod: 'dado-rabbet' }), 'bottom')
    expect(dadoed.length).toBeCloseTo(
      bottom.length + dadoDepthFor(t('left-side')) + dadoDepthFor(t('right-side')),
      9,
    )
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

// A pin hole is placed by four numbers that no rendering test can separate: which face it is bored
// into, which in-face axis the row marches along, where the first centre sits and how deep it goes.
// These assert against the panel the row lands on, so a row that leaves the panel or faces the
// wrong way fails here rather than in the kernel.
describe('carcaseHoleArrays', () => {
  const PIN_RADIUS = 2.5

  const panelsOf = (p: CarcaseParams) => new Map(carcaseRoles(p).map((r) => [r.role, r.panel]))

  // The kernel's reading of a HoleArrayCut, restated: the normal axis comes from `face`, and the
  // row marches along the first (U) or second (V) of the remaining axes in x,y,z order. Written
  // out here rather than imported because occt.ts only runs in a browser — and because a hole
  // array is only correct relative to how the kernel reads it.
  function centres(cut: HoleArrayCut): Vec3[] {
    const normal = cut.face[1].toLowerCase() as 'x' | 'y' | 'z'
    const inFace = (['x', 'y', 'z'] as const).filter((a) => a !== normal)
    const axis = cut.axis === 'U' ? inFace[0] : inFace[1]
    return Array.from({ length: cut.count }, (_, i) => ({
      ...cut.start,
      [axis]: cut.start[axis] + cut.pitch * i,
    }))
  }

  function toCarcase(panel: PanelSpec, v: Vec3): Vec3 {
    const [x, y, z] = applyMatrixToPoint(composeWorldMatrix(boardOf(panel)), v.x, v.y, v.z)
    return { x, y, z }
  }

  const inside = (v: Vec3, b: { min: Vec3; max: Vec3 }) =>
    v.x > b.min.x &&
    v.x < b.max.x &&
    v.y > b.min.y &&
    v.y < b.max.y &&
    v.z > b.min.z &&
    v.z < b.max.z

  // One opening top to bottom, so a side panel bounds exactly one section. `base` carries a fixed
  // shelf, which now makes two sections and therefore two rows per face on the same panel — true,
  // and asserted below in its own right, but it is not what a test about pitch is about.
  const oneBay: CarcaseParams = { ...base, section: sec([], 0) }

  it('puts two rows on each side panel', () => {
    for (const role of ['left-side', 'right-side']) {
      const cuts = carcaseHoleArrays(oneBay, role)
      expect(cuts, role).toHaveLength(2)
      expect(cuts.every((c) => c.kind === 'hole-array')).toBe(true)
    }
  })

  it('honours the configured count and pitch', () => {
    const [row] = carcaseHoleArrays(oneBay, 'left-side')
    expect(row.count).toBe(10)
    expect(row.pitch).toBe(32)
  })

  it('emits one row per configured row', () => {
    const oneRow = { ...base, section: shelved(sec([], 0), { rows: 1 }) }
    expect(carcaseHoleArrays(oneRow, 'left-side')).toHaveLength(1)
  })

  // The inversion this stage makes: a row belongs to the section that needs it, so a panel that
  // bounds two sections carries a row for each. Before, one full-height row spanned the panel
  // whatever divided it.
  it('gives a panel one row per section it bounds', () => {
    const panel = panelsOf(base).get('left-side')!
    const rows = carcaseHoleArrays(base, 'left-side')
    expect(rows).toHaveLength(2 * ADJ.rows)
    const starts = rows.map((c) => toCarcase(panel, centres(c)[0]).z.toFixed(6))
    expect(new Set(starts).size).toBe(2)
  })

  it('emits nothing when the adjustable count is zero', () => {
    expect(
      carcaseHoleArrays(
        { ...base, section: shelved(sec([], 0), { count: 0 }) },
        'left-side',
      ),
    ).toEqual([])
  })

  it('emits nothing for a role that is not a side or a partition', () => {
    for (const role of [
      'bottom',
      'top',
      'back',
      'toe-kick',
      shelfRole(base, 0, 0),
      'ladder-front',
    ]) {
      expect(carcaseHoleArrays(base, role), role).toEqual([])
    }
  })

  it('emits nothing for a carcase whose parameters do not build', () => {
    expect(carcaseHoleArrays({ ...base, width: 20 }, 'left-side')).toEqual([])
  })

  it('drills a partition on both faces, since it serves a bay on each side', () => {
    const divided = { ...base, section: sec([0.5], 0) }
    const cuts = carcaseHoleArrays(divided, partitionRole(divided))
    expect(cuts).toHaveLength(2 * ADJ.rows)
    expect(new Set(cuts.map((c) => c.face)).size).toBe(2)
  })

  // The defect this stage exists to fix. A partition between a shelved bay and a bay that holds
  // drawers used to be bored on both faces, because the rows belonged to the panel and the panel
  // could not tell the two sides apart. A row of pin holes facing a drawer bank is a row of holes
  // nothing can ever rest on.
  it('drills a partition only on the face of the bay that asks for shelves', () => {
    const tree = sec([0.5], 0)
    if (tree.content.kind !== 'split') throw new Error('fixture is not a split')
    const [shelvedBay, drawerBank] = tree.content.children
    const p: CarcaseParams = {
      ...base,
      section: {
        ...tree,
        content: {
          ...tree.content,
          children: [shelvedBay, { ...drawerBank, interior: undefined }],
        },
      },
    }
    const role = partitionRole(p)
    const cuts = carcaseHoleArrays(p, role)
    expect(cuts).toHaveLength(ADJ.rows)
    expect(new Set(cuts.map((c) => c.face)).size).toBe(1)

    // And it is the left face — the one that looks into the shelved bay. Asserting the letters of
    // `face` would only prove the table matches itself, so the bored face is followed one
    // millimetre out and has to land on the shelved side of the partition.
    const panel = panelsOf(p).get(role)!
    const box = aabb(panel)
    for (const c of cuts) {
      const dir = faceDirInCarcase(panel, c.face)
      const start = toCarcase(panel, c.start)
      expect(start.x + dir.x, `face ${c.face} opens away from the shelved bay`).toBeLessThan(
        box.min.x,
      )
    }
  })

  it('drills no deeper than the panel is thick', () => {
    for (const p of [
      base,
      { ...base, carcaseMaterial: '12mm MDF' },
      { ...base, carcaseMaterial: '25mm Ply' },
    ]) {
      for (const c of carcaseHoleArrays(p, 'left-side')) {
        expect(c.depth).toBeLessThan(tOf(p)('left-side'))
        expect(c.depth).toBeGreaterThan(0)
      }
    }
  })

  // The self-check, same shape as the joint-face test: a pin hole must be bored into a face that
  // looks *into* a bay. Asserting the letters '+Z'/'-Z' would only prove the table matches itself,
  // so the board-local face is turned into a carcase-space direction and followed: one millimetre
  // past the face there must be air, and it must be air inside the cabinet.
  it('drills every row into a face that opens onto a bay', () => {
    const cases: Record<string, CarcaseParams> = {
      base,
      wall: { ...base, baseMode: 'none' },
      ladder: { ...base, baseMode: 'ladder' },
      divided: { ...base, section: sec([0.5], 1) },
      'two dividers': { ...base, section: sec([0.34, 0.67], 1) },
      'applied back': { ...base, backMode: 'applied' },
      'no top, no back': { ...base, hasTop: false, backMode: 'none' },
    }
    for (const [name, p] of Object.entries(cases)) {
      const panels = panelsOf(p)
      const envelopes = [...panels.values()].map(aabb)
      const shell = {
        min: {
          x: Math.min(...envelopes.map((b) => b.min.x)),
          y: Math.min(...envelopes.map((b) => b.min.y)),
          z: Math.min(...envelopes.map((b) => b.min.z)),
        },
        max: {
          x: Math.max(...envelopes.map((b) => b.max.x)),
          y: Math.max(...envelopes.map((b) => b.max.y)),
          z: Math.max(...envelopes.map((b) => b.max.z)),
        },
      }
      const uprights = new Set(divisionRoles(p, 'x'))
      const roles = [...panels.keys()].filter(
        (r) => r === 'left-side' || r === 'right-side' || uprights.has(r),
      )
      expect(roles.length, name).toBeGreaterThan(0)
      for (const role of roles) {
        const panel = panels.get(role)!
        const cuts = carcaseHoleArrays(p, role)
        expect(cuts.length, `${name}: ${role}`).toBeGreaterThan(0)
        for (const c of cuts) {
          const dir = faceDirInCarcase(panel, c.face)
          const start = toCarcase(panel, c.start)
          const probe = { x: start.x + dir.x, y: start.y + dir.y, z: start.z + dir.z }
          const where = `${name}: ${role} face ${c.face}`
          expect(inside(probe, shell), `${where} bores out of the cabinet`).toBe(true)
          for (const [otherRole, other] of panels) {
            expect(inside(probe, aabb(other)), `${where} bores into ${otherRole}`).toBe(false)
          }
        }
      }
    }
  })

  // A row that runs off the end of the panel is a hole in nothing — or worse, a hole through the
  // panel's edge. Swept rather than fixtured: the interesting failures are a cabinet too short to
  // hold the configured count and a partition whose bay is shorter still.
  it('keeps every hole inside the panel it drills', () => {
    for (const height of [210, 300, 400, 720, 1200, 2100]) {
      for (const count of [1, 5, 10, 40]) {
        {
          const p: CarcaseParams = {
            ...base,
            height,
            section: shelved(sec([0.5], 0), { count }),
          }
          if (validateCarcaseParams(p).length > 0) continue
          const panels = panelsOf(p)
          for (const role of ['left-side', 'right-side', partitionRole(p)]) {
            const panel = panels.get(role)!
            for (const c of carcaseHoleArrays(p, role)) {
              const where = `h=${height} n=${count} ${role}`
              expect(c.count, where).toBeGreaterThan(0)
              expect(c.count, where).toBeLessThanOrEqual(count)
              expect(c.depth, where).toBeLessThan(panel.thickness)
              const all = centres(c)
              for (const v of [all[0], all[all.length - 1]]) {
                expect(v.x - PIN_RADIUS, where).toBeGreaterThanOrEqual(0)
                expect(v.x + PIN_RADIUS, where).toBeLessThanOrEqual(panel.length)
                expect(v.y - PIN_RADIUS, where).toBeGreaterThanOrEqual(0)
                expect(v.y + PIN_RADIUS, where).toBeLessThanOrEqual(panel.width)
                expect(v.z, where).toBeGreaterThanOrEqual(0)
                expect(v.z, where).toBeLessThanOrEqual(panel.thickness)
              }
            }
          }
        }
      }
    }
  })

  // A shelf sits on four pins, two of them in a partition. Rows that start from each panel's own
  // bottom edge would put the partition's pins 100 mm above the side's on a toe-kick cabinet, and
  // every shelf in the cabinet would sit on a slope.
  it('puts a partition’s pins at the same heights as the pins in the sides', () => {
    for (const p of [
      { ...base, section: sec([0.5], 1) },
      { ...base, section: sec([0.5], 1), baseMode: 'ladder' as const },
      { ...base, section: sec([0.5], 1), height: 400 },
    ]) {
      const panels = panelsOf(p)
      const heightsOf = (role: string) =>
        carcaseHoleArrays(p, role).flatMap((c) =>
          centres(c).map((v) => toCarcase(panels.get(role)!, v).z),
        )
      const side = new Set(heightsOf('left-side').map((z) => z.toFixed(6)))
      const divider = heightsOf(partitionRole(p))
      expect(divider.length).toBeGreaterThan(0)
      for (const z of divider)
        expect(side.has(z.toFixed(6)), `${z} is not a side pin height`).toBe(true)
    }
  })

  // `setback` and `backSetback` are two parameters, not one convention applied twice.
  it('measures the front row from the front edge and the back row from the back edge', () => {
    const p: CarcaseParams = {
      ...base,
      section: shelved(sec([], 0), { setback: 37, backSetback: 60 }),
    }
    const panel = panelsOf(p).get('left-side')!
    const depths = carcaseHoleArrays(p, 'left-side').map((c) => centres(c)[0].x)
    expect(depths.length).toBe(2)
    expect(Math.min(...depths)).toBeCloseTo(37, 9)
    expect(Math.max(...depths)).toBeCloseTo(panel.length - 60, 9)
  })
})

describe('the section tree in the generator', () => {
  // Contacts are derived from the same resolved tree the boxes are, so a role that appears in one
  // and not the other would mean the two had drifted apart — which is what the shared `bayEdges`
  // used to prevent.
  it('every contact pair names a role the generator actually emits', () => {
    for (const params of SWEEP) {
      const roles = new Set(carcaseBoxes(params).map((b) => b.role))
      for (const [a, b] of carcaseContactPairs(params)) {
        expect(roles.has(a), a).toBe(true)
        expect(roles.has(b), b).toBe(true)
      }
    }
  })

  // All three presets ship fixed shelves, which is why Stage A could not also move
  // adjustableShelves into the tree.
  it.each([
    ['Base 600', 1],
    ['Wall 600', 1],
    ['Tall 600', 4],
  ])('%s still has %i fixed shelves', (name, expected) => {
    const params = CARCASE_PRESETS.find((p) => p.name === name)!.params
    const divisions = carcaseBoxes(params).filter((b) => b.role.startsWith('division-'))
    expect(divisions).toHaveLength(expected)
    for (const d of divisions) expect(d.thicknessAxis).toBe('z')
  })
})
