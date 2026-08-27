import { describe, test, expect } from 'vitest'
import type {
  BoardPart,
  CarcaseComponent,
  CarcaseParams,
  ComponentId,
  DadoJoint,
  Part,
  PartId,
  Scene,
} from './types'
import { suggestJointsForScene } from './suggestJoints'
import { defaultDadoJoint } from './defaultJoint'
import type { ChecklistRow } from './jointChecklist'
import { buildJointChecklist, MAX_NOOFFER_ROWS } from './jointChecklist'
import { componentsById } from './componentTree'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { legacyToSection } from './migrateSections'
import { regenerateComponents } from './regenerateComponents'

const NO_COMPONENTS = componentsById([])

function board(over: Partial<BoardPart>): BoardPart {
  return {
    kind: 'board',
    id: 'X',
    label: 'X',
    length: 100,
    width: 40,
    thickness: 18,
    grain: 'free' as const,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...over,
  }
}

// Perpendicular tee — the engine offers a dado and a mortise-tenon for this pair.
const teeH = board({ id: 'H', length: 200, width: 100, thickness: 20 })
const teeD = board({
  id: 'D',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 100, y: 30, z: 20 },
})

// Broad face on broad face: they touch, but no joint kind applies. Not a half-lap either —
// isValidHalfLap requires a shared stack axis with coincident spans, and these are stacked.
const stackLower = board({ id: 'L', length: 200, width: 100, thickness: 18 })
const stackUpper = board({
  id: 'U',
  length: 200,
  width: 100,
  thickness: 18,
  position: { x: 0, y: 0, z: 18 },
})

function build(parts: Part[], joints: DadoJoint[] = []) {
  return buildJointChecklist(
    parts,
    joints,
    suggestJointsForScene(parts, joints, NO_COMPONENTS),
    NO_COMPONENTS,
    PRESET_MATERIALS,
  )
}

test('a touching pair with offers and no joint is open', () => {
  const c = build([teeH, teeD])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('open')
  expect(c.rows[0].options.length).toBeGreaterThan(0)
  expect(c.rows[0].joints).toEqual([])
})

test('a pair carrying a joint is jointed, and carries no options', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1', NO_COMPONENTS)
  const c = build([teeH, teeD], [joint])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('jointed')
  expect(c.rows[0].joints).toEqual([joint])
  expect(c.rows[0].options).toEqual([])
})

test('a touching pair the engine has no offer for is no-offer, and is not a row', () => {
  const c = build([stackLower, stackUpper])
  expect(c.rows).toEqual([])
  expect(c.unresolved).toHaveLength(1)
  expect(c.unresolved[0].state).toBe('no-offer')
})

test('a non-touching pair produces no row at all', () => {
  const far = board({ id: 'F', position: { x: 5000, y: 0, z: 0 } })
  const c = build([teeH, teeD, far])
  expect([...c.rows, ...c.unresolved].map((r) => r.key)).toEqual(['D|H'])
})

// AABB adjacency over-reports: a small board sitting in the empty off-diagonal corner of a rotated
// bar's bounding box passes boardsTouch but does not actually meet the bar. The oriented-box check
// keeps it out of the no-offer group entirely, rather than padding that list with a phantom pair.
test('an AABB-only false positive is dropped from the no-offer group', () => {
  const bar = board({
    id: 'BAR',
    length: 200,
    width: 20,
    thickness: 20,
    rotation: { x: 0, y: 0, z: 45 },
  })
  const corner = board({
    id: 'S',
    length: 20,
    width: 20,
    thickness: 20,
    position: { x: 110, y: 0, z: 0 },
  })
  const c = build([bar, corner])
  expect(c.rows).toEqual([])
  expect(c.unresolved).toEqual([])
})

// reconcileJoints preserves a joint whose deriveJoint returns null, so a joint outlives its boards
// being moved apart. Gating rows on adjacency alone would drop it and silently decrement the count.
test('a jointed pair whose boards no longer touch still produces a jointed row', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1', NO_COMPONENTS)
  const moved = { ...teeD, position: { x: 5000, y: 0, z: 0 } }
  const c = build([teeH, moved], [joint])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('jointed')
  expect(c.jointedCount).toBe(1)
})

// The stacked pair is parked well clear of the tee: at the origin it would touch teeD's standing
// end and quietly become a second *open* row, which is not what this test is measuring.
test('counts exclude no-offer rows so 100% stays reachable', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1', NO_COMPONENTS)
  const farLower = { ...stackLower, position: { x: 0, y: 1000, z: 0 } }
  const farUpper = { ...stackUpper, position: { x: 0, y: 1000, z: 18 } }
  const c = build([teeH, teeD, farLower, farUpper], [joint])
  expect(c.jointedCount).toBe(1)
  expect(c.actionableTotal).toBe(1)
  expect(c.unresolved).toHaveLength(1)
})

test('hidden and non-board parts produce no rows', () => {
  const hidden = { ...teeD, visible: false }
  expect(build([teeH, hidden]).rows).toEqual([])
  expect(build([teeH, hidden]).unresolved).toEqual([])
})

test('an empty scene produces empty arrays and zero counts', () => {
  const c = build([])
  expect(c).toEqual({
    rows: [],
    groups: [],
    unresolved: [],
    contact: [],
    jointedCount: 0,
    actionableTotal: 0,
  })
})

// Two uprights on one shelf, at different distances from it, so row order is non-trivial.
const shelf = board({ id: 'S', length: 400, width: 100, thickness: 20 })
const upNear = board({
  id: 'N',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 180, y: 30, z: 20 },
})
const upFar = board({
  id: 'R',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 20, y: 30, z: 20 },
})

test('rows are ordered by pair centre distance, nearest first', () => {
  const c = build([shelf, upFar, upNear])
  expect(c.rows.map((r) => r.key)).toEqual(['N|S', 'R|S'])
})

// The whole point of computing distance for jointed rows too: joint the nearest pair and the row
// order must not move. Ordering off the suggestion list instead would make a row jump the moment
// you joint it, losing your place halfway through a carcase.
test('a row keeps its position when it flips from open to jointed', () => {
  const parts = [shelf, upFar, upNear]
  const before = build(parts)
  const joint = defaultDadoJoint(shelf, upNear, '+Z', '-X', 'joint_1', 'Dado 1', NO_COMPONENTS)
  const after = build(parts, [joint])

  expect(after.rows.map((r) => r.key)).toEqual(before.rows.map((r) => r.key))
  expect(after.rows.find((r) => r.key === 'N|S')!.state).toBe('jointed')
  expect(after.rows.find((r) => r.key === 'R|S')!.state).toBe('open')
})

// Equidistant pairs otherwise fall back on board-iteration order and reshuffle as parts are added
// or reordered — the same interleaving trap groupByPair documents.
// Mirrored about the shelf's centre so both pairs are exactly equidistant. Two things bite here:
// under Ry=-90 `position.x` is the board's *max* x edge, so A spans x 2..20 (centre 11) and its
// mirror about the shelf centre of 200 is centre 389, i.e. position.x 398. And they must not be
// coincident copies — two boards in the same place overlap on every axis and form a half-lap with
// each other, adding a third row this test is not about.
test('equidistant pairs come back in deterministic key order', () => {
  const left = board({
    id: 'A',
    length: 80,
    width: 40,
    thickness: 18,
    rotation: { x: 0, y: -90, z: 0 },
    position: { x: 20, y: 30, z: 20 },
  })
  const right = { ...left, id: 'Z', position: { x: 398, y: 30, z: 20 } }
  const c = build([shelf, right, left])
  expect(c.rows.map((r) => r.key)).toEqual(['A|S', 'S|Z'])
})

// A flood of no-offer pairs must not eat the actionable list's budget. The uprights sit well clear
// of the stacked plates in x, so the only pairs in play are each plate on the base (no-offer) and
// each upright teed into it (open).
test('caps rows and no-offer rows independently', () => {
  const base = board({ id: 'B', length: 20000, width: 100, thickness: 20 })
  const parts: Part[] = [base]
  for (let i = 0; i < MAX_NOOFFER_ROWS + 5; i++) {
    parts.push(
      board({
        id: `P${i}`,
        length: 40,
        width: 100,
        thickness: 18,
        position: { x: i * 60, y: 0, z: 20 },
      }),
    )
  }
  for (let i = 0; i < 3; i++) {
    parts.push(
      board({
        id: `T${i}`,
        length: 80,
        width: 40,
        thickness: 18,
        rotation: { x: 0, y: -90, z: 0 },
        position: { x: 10000 + i * 200, y: 30, z: 20 },
      }),
    )
  }
  const c = build(parts)
  // The no-offer flood is capped tightly, while the actionable rows keep their own generous budget.
  expect(c.unresolved).toHaveLength(MAX_NOOFFER_ROWS)
  expect(c.rows).toHaveLength(3)
  expect(c.rows.every((r) => r.state === 'open')).toBe(true)
  expect(c.actionableTotal).toBe(3)
})

// groupSuggestions.ts warns that PairGroup.aId is role order, and that sorting the ids would invert
// every orientation arrow. Open rows must inherit it verbatim rather than take board-loop order.
test('an open row inherits the group role order, not board-iteration order', () => {
  const c = build([teeH, teeD])
  const row = c.rows[0]
  const dado = row.options.find((o) => o.kind === 'dado')
  if (dado?.kind !== 'dado') throw new Error('expected a dado suggestion for the tee fixture')
  expect(row.aId).toBe(dado.housingPartId)
  expect(row.bId).toBe(dado.housedPartId)
})

// Cabinet fixtures are generated, never hand-written: the pair counts asserted below are the
// measured ground truth of the real generator, and a hand-built cabinet would only prove that the
// fixture and the expectation agree with each other.
function carcase(
  id: ComponentId,
  label: string,
  over: Partial<CarcaseParams> = {},
): CarcaseComponent {
  return {
    kind: 'carcase',
    id,
    label,
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: { ...CARCASE_PRESETS[0].params, ...over },
  }
}

function cabinetScene(components: CarcaseComponent[]): Scene {
  return regenerateComponents({
    parts: [],
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components,
  })
}

function checklistOf(scene: Scene) {
  const byId = componentsById(scene.components)
  return buildJointChecklist(
    scene.parts,
    scene.joints,
    suggestJointsForScene(scene.parts, scene.joints, byId),
    byId,
    scene.materials,
  )
}

// A shelf's role key carries the uuid of the section it divides, so it is found by what it is: the
// only thickness-on-z panel of a Base 600 that is neither the bottom nor the top.
function idOfShelf(scene: Scene, componentId: ComponentId): PartId {
  const part = scene.parts.find(
    (p) => p.parentId === componentId && p.role?.startsWith('division-'),
  )
  if (!part) throw new Error(`no division part in ${componentId}`)
  return part.id
}

function idOfRole(scene: Scene, componentId: ComponentId, role: string): PartId {
  const part = scene.parts.find((p) => p.parentId === componentId && p.role === role)
  if (!part) throw new Error(`no part with role ${role} in ${componentId}`)
  return part.id
}

function rowWith(rows: ChecklistRow[], a: PartId, b: PartId): ChecklistRow | undefined {
  return rows.find((r) => (r.aId === a && r.bId === b) || (r.aId === b && r.bId === a))
}

describe('contact rows', () => {
  test('marks a shelf against the back as contact, not open', () => {
    const scene = cabinetScene([carcase('cmp_1', 'Base 600')])
    const back = idOfRole(scene, 'cmp_1', 'back')
    const shelf = idOfShelf(scene, 'cmp_1')
    const c = checklistOf(scene)

    expect(rowWith(c.contact, back, shelf)?.state).toBe('contact')
    expect(rowWith([...c.rows, ...c.groups.flatMap((g) => g.rows)], back, shelf)).toBeUndefined()
    expect(rowWith(c.unresolved, back, shelf)).toBeUndefined()
  })

  // 14 touching pairs, 12 of them jointed: the two contact pairs are what would otherwise make this
  // read 12 / 14 with nothing the user could ever do about the remaining two.
  test('leaves a fully jointed base cabinet reading 12 / 12', () => {
    const c = checklistOf(cabinetScene([carcase('cmp_1', 'Base 600')]))
    expect(c.jointedCount).toBe(12)
    expect(c.actionableTotal).toBe(12)
    expect(c.contact).toHaveLength(2)
  })

  test('still marks contact pairs when the cabinet uses a fastener method', () => {
    const c = checklistOf(cabinetScene([carcase('cmp_1', 'Base 600', { jointMethod: 'dowel' })]))
    expect(c.contact).toHaveLength(2)
    expect(c.contact.every((r) => r.state === 'contact')).toBe(true)
    expect(c.jointedCount).toBe(0)
    expect(c.actionableTotal).toBe(12)
  })

  test('matches the measured pair counts for the wall and divider cabinets', () => {
    const wall = checklistOf(
      cabinetScene([carcase('cmp_1', 'Wall 600', CARCASE_PRESETS[1].params)]),
    )
    expect(wall.jointedCount).toBe(10)
    expect(wall.actionableTotal).toBe(10)
    expect(wall.contact).toHaveLength(1)

    const divided = checklistOf(
      cabinetScene([
        carcase('cmp_1', 'Base 600', { section: legacyToSection([0.5], 1, 600, 18) }),
      ]),
    )
    expect(divided.jointedCount).toBe(16)
    expect(divided.actionableTotal).toBe(16)
    expect(divided.contact).toHaveLength(4)
  })

  // 25 touching pairs: the four base-frame corners join, and the ten pairs across the plane the
  // carcase is set down on are contact. Four of those ten had no offer at all, so before the ladder
  // table this read 10 / 24 with four rows in the muted "no joint available" list.
  test('leaves a fully jointed ladder cabinet reading 14 / 14 with nothing unresolved', () => {
    const c = checklistOf(cabinetScene([carcase('cmp_1', 'Ladder 600', { baseMode: 'ladder' })]))
    expect(c.jointedCount).toBe(14)
    expect(c.actionableTotal).toBe(14)
    expect(c.contact).toHaveLength(11)
    expect(c.unresolved).toHaveLength(0)
    expect(c.rows).toHaveLength(0)
    expect(c.groups[0].complete).toBe(true)
  })

  // Same 14 pairs as a captured back; four of them move from the joint column to the contact
  // column, because an applied back is screwed onto the rear edges rather than let into them.
  test('leaves an applied-back cabinet reading 8 / 8 with nothing unresolved', () => {
    const c = checklistOf(cabinetScene([carcase('cmp_1', 'Applied back', { backMode: 'applied' })]))
    expect(c.jointedCount).toBe(8)
    expect(c.actionableTotal).toBe(8)
    expect(c.contact).toHaveLength(6)
    expect(c.unresolved).toHaveLength(0)
    expect(c.rows).toHaveLength(0)
    expect(c.groups[0].complete).toBe(true)
  })

  // The mid rail adds three pairs: housed in the front and back rails, carrying the bottom.
  test('leaves a wide ladder cabinet reading 16 / 16 with nothing unresolved', () => {
    const c = checklistOf(
      cabinetScene([carcase('cmp_1', 'Ladder 1200', { baseMode: 'ladder', width: 1200 })]),
    )
    expect(c.jointedCount).toBe(16)
    expect(c.actionableTotal).toBe(16)
    expect(c.contact).toHaveLength(12)
    expect(c.unresolved).toHaveLength(0)
    expect(c.rows).toHaveLength(0)
    expect(c.groups[0].complete).toBe(true)
  })
})

describe('checklist grouping by component', () => {
  test('groups rows whose both parts belong to the same component', () => {
    const c = checklistOf(cabinetScene([carcase('cmp_1', 'Base 600')]))
    expect(c.groups).toHaveLength(1)
    expect(c.groups[0].componentId).toBe('cmp_1')
    expect(c.groups[0].label).toBe('Base 600')
    expect(c.groups[0].rows).toHaveLength(12)
    expect(c.rows).toEqual([])
  })

  test('reports a fully jointed group as complete', () => {
    const scene = cabinetScene([carcase('cmp_1', 'Base 600')])
    const done = checklistOf(scene)
    expect(done.groups[0].complete).toBe(true)
    expect(done.groups[0].jointedCount).toBe(done.groups[0].rows.length)

    const open = checklistOf({ ...scene, joints: [] })
    expect(open.groups[0].complete).toBe(false)
    expect(open.groups[0].jointedCount).toBe(0)
  })

  // Two cabinets side by side: the right side of one meets the left side of the other. Two flush
  // panels face to face have no joint the engine will offer, so the pair surfaces in the top-level
  // no-offer list — the point being that it is not swallowed by either cabinet's group.
  test('keeps a cross-component pair out of both cabinets', () => {
    const scene = cabinetScene([
      carcase('cmp_1', 'Base 600'),
      { ...carcase('cmp_2', 'Base 600 (2)'), position: { x: 600, y: 0, z: 0 } },
    ])
    const c = checklistOf(scene)
    const right = idOfRole(scene, 'cmp_1', 'right-side')
    const left = idOfRole(scene, 'cmp_2', 'left-side')

    expect(c.groups.map((g) => g.componentId)).toEqual(['cmp_1', 'cmp_2'])
    expect(c.groups.every((g) => g.rows.length === 12)).toBe(true)
    expect(c.groups.every((g) => rowWith(g.rows, right, left) === undefined)).toBe(true)
    expect(rowWith(c.unresolved, right, left)).toBeTruthy()
  })

  // One part in the cabinet, one loose: no shared component ancestor, so an actionable row stays
  // ungrouped rather than joining the cabinet its neighbour belongs to.
  test('keeps a loose board teed onto a cabinet at top level', () => {
    const scene = cabinetScene([carcase('cmp_1', 'Base 600')])
    const loose = board({
      id: 'LOOSE',
      length: 80,
      width: 40,
      thickness: 18,
      rotation: { x: 0, y: -90, z: 0 },
      position: { x: 300, y: 300, z: 720 },
    })
    const c = checklistOf({ ...scene, parts: [...scene.parts, loose] })

    expect(c.groups).toHaveLength(1)
    expect(c.groups[0].rows).toHaveLength(12)
    expect(c.rows).toHaveLength(1)
    expect(c.rows[0].state).toBe('open')
    expect([c.rows[0].aId, c.rows[0].bId]).toContain('LOOSE')
    expect(c.actionableTotal).toBe(13)
  })

  test('produces no groups for two loose touching boards', () => {
    const c = build([teeH, teeD])
    expect(c.groups).toEqual([])
    expect(c.rows).toHaveLength(1)
  })
})
