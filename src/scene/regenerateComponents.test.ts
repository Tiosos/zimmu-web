import { describe, it, expect, afterEach, vi } from 'vitest'
import { regenerateComponents } from './regenerateComponents'
import { reconcileJoints } from './reconcileJoints'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { carcaseBoxes } from './carcaseRoles'
import { legacyToSection } from './migrateSections'
import { dadoDepthFor } from '../geom/dado'
import { defaultScrewJoint } from './defaultJoint'
import { changeJointKind, type ConvertibleKind } from './changeJointKind'
import { componentsById } from './componentTree'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
import { roleThicknessFor, type PartOverrides, type RoleThickness } from './resolveThickness'
import type {
  BoardPart,
  BoxCut,
  CarcaseComponent,
  CarcaseParams,
  CutDef,
  DadoJoint,
  HoleArrayCut,
  Joint,
  Part,
  Scene,
} from './types'

const params: CarcaseParams = {
  width: 600,
  height: 720,
  depth: 560,
  carcaseMaterial: '18mm Ply',
  backMaterial: '12mm MDF',
  hasTop: true,
  backMode: 'captured',
  baseMode: 'none',
  toeKickHeight: 100,
  toeKickSetback: 60,
  section: legacyToSection([], 1, 600, 18),
  adjustableShelves: {
    rows: 1,
    pitch: 32,
    setback: 37,
    backSetback: 37,
    startHeight: 200,
    count: 0,
  },
  jointMethod: 'dado-rabbet',
}

// A division's role key carries the uuid of the section it splits, so tests name one by what it is
// and look the key up.
const divisionRoles = (p: CarcaseParams, thicknessAxis: 'x' | 'z') =>
  carcaseBoxes(p, roleThicknessFor(p, PRESET_MATERIALS, new Map()))
    .filter((b) => b.role.startsWith('division-') && b.thicknessAxis === thicknessAxis)
    .map((b) => b.role)

const shelfRole = (p: CarcaseParams, i = 0): string => divisionRoles(p, 'z')[i]
const partitionRole = (p: CarcaseParams, i = 0): string => divisionRoles(p, 'x')[i]

const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'cmp_1',
  label: 'Base Cabinet 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params,
}

// Seeded exactly as a new scene is: the cabinet names its materials, and a scene without them
// resolves no panel at all.
const empty: Scene = {
  parts: [],
  materials: { ...PRESET_MATERIALS },
  hardware: [],
  joints: [],
  components: [cabinet],
}

function partsOf(s: Scene): Part[] {
  return s.parts.filter((p) => p.parentId === 'cmp_1')
}

// Re-run with a fresh parameter bundle, carrying the already-generated parts forward.
function withParams(s: Scene, overrides: Partial<CarcaseParams>): Scene {
  return regenerateComponents({
    ...s,
    components: [{ ...cabinet, params: { ...params, ...overrides } }],
  })
}

describe('grain', () => {
  // Membership, not `not.toBe('free')`: an unset field is not 'free' either, so the weaker
  // assertion passes against a generator that never writes grain at all.
  it('every generated board states a real direction', () => {
    const after = regenerateComponents(empty)
    const driven = after.parts.filter((p) => p.driven && p.kind === 'board')
    expect(driven.length).toBeGreaterThan(0)
    for (const p of driven) {
      expect(['length', 'width']).toContain(p.kind === 'board' ? p.grain : undefined)
    }
  })

  it('a detached part keeps its own grain while its freed role regenerates with a real one', () => {
    const first = regenerateComponents(empty)
    const side = first.parts.find((p) => p.role === 'left-side')!
    const detached = {
      ...first,
      parts: first.parts.map((p) =>
        p.id === side.id ? { ...p, driven: false, role: undefined, grain: 'free' as const } : p,
      ),
    }

    const after = withParams(detached, { depth: 600 })

    const kept = after.parts.find((p) => p.id === side.id)!
    expect(kept.kind === 'board' && kept.grain).toBe('free')
    // The role came back on a fresh part. If the generator simply carried grain through from
    // whatever it found, this one would be 'free' too.
    const reclaimed = after.parts.find((p) => p.role === 'left-side')!
    expect(reclaimed.id).not.toBe(side.id)
    expect(reclaimed.kind === 'board' && reclaimed.grain).toBe('width')
  })
})

// A driven part the user has taken one dimension of. The point of the stage: the part keeps
// following width, depth and joinery, and the layout resolves against the override rather than
// applying it afterwards.
describe('a part overriding its own thickness', () => {
  const withOverride = (s: Scene, role: string, overrides: PartOverrides): Scene => ({
    ...s,
    parts: s.parts.map((p) => (p.role === role ? { ...p, overrides } : p)),
  })
  const boardOf = (s: Scene, role: string): BoardPart => {
    const part = s.parts.find((p) => p.role === role)
    if (part === undefined || part.kind !== 'board') throw new Error(`no board for ${role}`)
    return part
  }

  it('is written onto the part it belongs to, and nowhere else', () => {
    const overridden = withOverride(regenerateComponents(empty), 'left-side', { thickness: 25 })
    const after = regenerateComponents(overridden)

    expect(boardOf(after, 'left-side').thickness).toBe(25)
    expect(boardOf(after, 'right-side').thickness).toBe(18)
  })

  // Read before the layout runs, not applied after it: the panels between the sides have to come
  // out shorter, or the cabinet is 7 mm wider than its own sides allow. Each end then reaches into
  // the dado that houses it, which is a depth of that housing panel's own thickness.
  it('shortens the panels between the sides', () => {
    const overridden = withOverride(regenerateComponents(empty), 'left-side', { thickness: 25 })
    const bottom = boardOf(regenerateComponents(overridden), 'bottom')

    expect(bottom.length).toBe(params.width - 25 - 18 + dadoDepthFor(25) + dadoDepthFor(18))
    expect(bottom.position.x).toBe(25 - dadoDepthFor(25))
  })

  it('survives a parameter change, and the part still follows that parameter', () => {
    const overridden = withOverride(regenerateComponents(empty), 'left-side', { thickness: 25 })
    const wider = withParams(overridden, { width: 900 })
    const side = boardOf(wider, 'left-side')

    expect(side.overrides).toEqual({ thickness: 25 })
    expect(side.thickness).toBe(25)
    expect(side.driven).toBe(true)
    // The dimension it did not take ownership of still comes from the cabinet.
    expect(boardOf(wider, 'bottom').length).toBe(
      900 - 25 - 18 + dadoDepthFor(25) + dadoDepthFor(18),
    )
  })

  it('names the material it overrides on the part, and resolves that thickness', () => {
    const overridden = withOverride(regenerateComponents(empty), 'left-side', {
      material: '25mm Ply',
    })
    const after = regenerateComponents({
      ...overridden,
      materials: { ...PRESET_MATERIALS, '25mm Ply': { thickness: 25 } },
    })

    expect(boardOf(after, 'left-side').material).toBe('25mm Ply')
    expect(boardOf(after, 'left-side').thickness).toBe(25)
    expect(boardOf(after, 'right-side').material).toBe('18mm Ply')
  })
})

describe('regenerateComponents', () => {
  it('creates one part per role, all driven and parented to the carcase', () => {
    const out = regenerateComponents(empty)
    expect(partsOf(out).map((p) => p.role)).toEqual([
      'left-side',
      'right-side',
      'bottom',
      'top',
      'back',
      shelfRole(params),
    ])
    expect(partsOf(out).every((p) => p.driven)).toBe(true)
    expect(partsOf(out)).toHaveLength(out.parts.length)
  })

  it('keeps part ids stable across a regeneration that changes dimensions', () => {
    const first = regenerateComponents(empty)
    const idsBefore = partsOf(first).map((p) => p.id)
    const second = withParams(first, { depth: 600 })

    expect(partsOf(second).map((p) => p.id)).toEqual(idsBefore)
  })

  it('resizes driven parts when a parameter changes', () => {
    const first = regenerateComponents(empty)
    const before = partsOf(first).find((p) => p.role === 'left-side') as BoardPart
    const second = withParams(first, { depth: 600 })
    const after = partsOf(second).find((p) => p.role === 'left-side') as BoardPart

    expect(before.length).toBeCloseTo(560, 9)
    expect(after.length).toBeCloseTo(600, 9)
  })

  it('never touches a detached part', () => {
    const first = regenerateComponents(empty)
    const sideId = partsOf(first).find((p) => p.role === 'left-side')!.id
    const detached: Scene = {
      ...first,
      parts: first.parts.map((p) =>
        p.id === sideId ? { ...p, driven: false, position: { x: -50, y: 7, z: 999 } } : p,
      ),
    }
    const snapshot = structuredClone(detached.parts.find((p) => p.id === sideId)!)

    // depth drives its length, height its width: both would move under regeneration.
    const second = withParams(detached, { depth: 600, height: 900 })
    const kept = second.parts.find((p) => p.id === sideId)!

    expect(kept).toEqual(snapshot)
  })

  it('deletes a driven part whose role the params no longer imply', () => {
    const first = regenerateComponents(empty)
    const second = withParams(first, { hasTop: false })

    expect(partsOf(second).map((p) => p.role)).not.toContain('top')
    expect(partsOf(second)).toHaveLength(partsOf(first).length - 1)
  })

  it('keeps a detached part whose role is gone, clearing its role', () => {
    const first = regenerateComponents(empty)
    const topId = partsOf(first).find((p) => p.role === 'top')!.id
    const detached: Scene = {
      ...first,
      parts: first.parts.map((p) => (p.id === topId ? { ...p, driven: false } : p)),
    }
    const second = withParams(detached, { hasTop: false })
    const kept = second.parts.find((p) => p.id === topId)

    expect(kept).toBeDefined()
    expect(kept?.role).toBeUndefined()
    expect(kept?.parentId).toBe('cmp_1')
    expect(kept?.driven).toBe(false)
  })

  it('emits nothing and preserves last-good parts when params are invalid', () => {
    const first = regenerateComponents(empty)
    const second = withParams(first, { width: 5 })

    expect(partsOf(second)).toHaveLength(partsOf(first).length)
    expect(partsOf(second)).toEqual(partsOf(first))
  })

  it('is idempotent', () => {
    const once = regenerateComponents(empty)
    const twice = regenerateComponents(once)

    expect(twice).toEqual(once)
  })

  it('leaves a scene with no carcase components untouched by identity', () => {
    const flat: Scene = { parts: [], materials: {}, hardware: [], joints: [], components: [] }

    expect(regenerateComponents(flat)).toBe(flat)
  })

  it('leaves parts belonging to other components alone', () => {
    const other: BoardPart = {
      kind: 'board',
      id: 'loose',
      label: 'Loose Board',
      length: 100,
      width: 50,
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
    }
    const out = regenerateComponents({ ...empty, parts: [other] })

    expect(out.parts.find((p) => p.id === 'loose')).toBe(other)
  })

  // A detached part must not be reclaimed when its role comes back. Keying reconciliation on the
  // role alone (instead of on `driven`) silently resurrects the user's part in place of a fresh
  // one — it looks correct until the user notices their hand-edits are now the cabinet's top.
  it('does not reclaim a detached part when its role returns', () => {
    const first = regenerateComponents(empty)
    const topId = partsOf(first).find((p) => p.role === 'top')!.id
    const detached: Scene = {
      ...first,
      parts: first.parts.map((p) =>
        p.id === topId
          ? { ...p, driven: false, label: 'My Top', position: { x: 1, y: 2, z: 3 } }
          : p,
      ),
    }
    const snapshot = structuredClone(detached.parts.find((p) => p.id === topId)!)

    const gone = withParams(detached, { hasTop: false })
    const back = withParams(gone, { hasTop: true })

    const mine = partsOf(back)
    const ex = mine.find((p) => p.id === topId)
    const fresh = mine.find((p) => p.role === 'top')

    expect(ex).toEqual({ ...snapshot, role: undefined })
    expect(fresh).toBeDefined()
    expect(fresh!.id).not.toBe(topId)
    expect(fresh!.driven).toBe(true)
    expect(mine.filter((p) => p.role === 'top')).toHaveLength(1)
  })

  // Id churn is invisible in a single-step test and catastrophic for the shapeKey geometry cache:
  // a fresh id on every keystroke rebuilds every board in OCCT.
  it('holds a surviving role at one id across a long edit sequence', () => {
    const edits: Partial<CarcaseParams>[] = [
      { depth: 600 },
      { depth: 600, height: 900 },
      { depth: 600, height: 900, section: legacyToSection([], 3, 600, 18) },
      { depth: 600, height: 900, section: legacyToSection([], 3, 600, 18), hasTop: false },
      {
        depth: 480,
        height: 2100,
        section: legacyToSection([0.5], 0, 600, 18),
        hasTop: false,
      },
      { depth: 480, height: 2100, section: legacyToSection([0.5], 2, 600, 18), hasTop: true },
      { depth: 560, height: 720, section: legacyToSection([], 1, 600, 18), hasTop: true },
    ]

    let scene = regenerateComponents(empty)
    const sideId = partsOf(scene).find((p) => p.role === 'left-side')!.id
    const seen = new Set<string>([sideId])

    for (const edit of edits) {
      scene = withParams(scene, edit)
      const side = partsOf(scene).find((p) => p.role === 'left-side')
      expect(side).toBeDefined()
      seen.add(side!.id)
    }

    expect([...seen]).toEqual([sideId])
  })
})

// The cabinet gave one part two independent cut owners: regenerateComponents re-derives cuts
// carrying sourceComponentId, reconcileJoints re-derives cuts carrying sourceJointId, and a cut
// with neither belongs to the user. Each stage stripping only its own is what keeps a toe-kick
// notch from vanishing when a dado is edited, and vice versa.
describe('cut ownership', () => {
  const toeKick: CarcaseComponent = {
    ...cabinet,
    params: { ...params, baseMode: 'toe-kick' },
  }
  const toeKickScene: Scene = { ...empty, components: [toeKick] }

  const handMade: BoxCut = {
    kind: 'box',
    id: 'cut_by_hand',
    label: 'Hand Notch',
    face: '+Z',
    position: { x: 300, y: 300, z: 0 },
    size: { x: 20, y: 20, z: 30 },
  }

  const pinRow: HoleArrayCut = {
    kind: 'hole-array',
    id: 'cut_pins_left-side',
    label: 'Shelf Pins',
    face: '+Z',
    axis: 'U',
    start: { x: 37, y: 200, z: 0 },
    pitch: 32,
    count: 10,
    diameter: 5,
    depth: 12,
    sourceComponentId: 'cmp_1',
  }

  it('notches each side panel with a component-owned cut', () => {
    const out = regenerateComponents(toeKickScene)
    for (const role of ['left-side', 'right-side']) {
      const side = partsOf(out).find((p) => p.role === role) as BoardPart
      expect(side.cuts).toHaveLength(1)
      expect(side.cuts[0].kind === 'box' && side.cuts[0].sourceComponentId).toBe('cmp_1')
    }
  })

  it('re-derives its own cuts without duplicating them', () => {
    const once = regenerateComponents(toeKickScene)
    const twice = regenerateComponents(once)
    expect(twice).toEqual(once)

    const wider = regenerateComponents({
      ...once,
      components: [{ ...toeKick, params: { ...toeKick.params, toeKickSetback: 90 } }],
    })
    const side = partsOf(wider).find((p) => p.role === 'left-side') as BoardPart
    expect(side.cuts).toHaveLength(1)
    expect(side.cuts[0].kind === 'box' && side.cuts[0].size.x).toBeCloseTo(90, 9)
  })

  // Ownership is the property that decides who may strip a cut, and the tag carries it. Keying the
  // filter on the kind as well left every kind added after 'box' un-strippable.
  it('strips a stale component-owned cut whatever its kind', () => {
    const first = regenerateComponents(toeKickScene)
    const side = partsOf(first).find((p) => p.role === 'left-side') as BoardPart
    const stale: Scene = {
      ...first,
      parts: first.parts.map((p) =>
        p.id === side.id ? { ...(p as BoardPart), cuts: [...side.cuts, pinRow, handMade] } : p,
      ),
    }

    const after = regenerateComponents(stale).parts.find((p) => p.id === side.id) as BoardPart
    expect(after.cuts.filter((c) => c.kind === 'hole-array')).toEqual([])
    expect(after.cuts.map((c) => c.id).sort()).toEqual(['cut_by_hand', 'cut_toekick_left-side'])
  })

  it('keeps component-owned and joint-owned cuts on the same part', () => {
    const first = regenerateComponents(toeKickScene)
    const side = partsOf(first).find((p) => p.role === 'left-side') as BoardPart
    const bottom = partsOf(first).find((p) => p.role === 'bottom') as BoardPart

    // A real dado: the bottom panel seats into the left side's inner face. The side is the
    // housing, so the groove — a joint-owned cut — lands on the panel that carries the notch.
    const joint: DadoJoint = {
      kind: 'dado',
      id: 'j1',
      label: 'Dado 1',
      driven: false,
      housingPartId: side.id,
      housingFace: '+Z',
      housedPartId: bottom.id,
      housedEnd: '-X',
      offset: 200,
      depth: 6,
      clearance: 0,
      profile: 'plain',
      tongueThickness: 6,
      rabbetFace: '+Z',
      stopStart: 0,
      stopEnd: 0,
    }
    const staleGroove: BoxCut = {
      kind: 'box',
      id: 'cut_stale',
      label: 'Dado 1',
      face: '+Z',
      position: { x: 0, y: 0, z: 12 },
      size: { x: 560, y: 18, z: 6 },
      sourceJointId: 'j1',
    }
    const withJoint: Scene = {
      ...first,
      joints: [joint],
      parts: first.parts.map((p) =>
        p.id === side.id ? { ...(p as BoardPart), cuts: [...side.cuts, staleGroove, handMade] } : p,
      ),
    }

    const regenerated = regenerateComponents(withJoint)
    const afterRegen = regenerated.parts.find((p) => p.id === side.id) as BoardPart
    expect(
      afterRegen.cuts.filter((c) => c.kind === 'box' && c.sourceComponentId === 'cmp_1'),
    ).toHaveLength(1)
    expect(
      afterRegen.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1'),
    ).toHaveLength(1)
    expect(afterRegen.cuts.some((c) => c.id === handMade.id)).toBe(true)

    // The real pipeline order. reconcileJoints strips and re-derives the groove (cut_stale is
    // replaced by cut_j1) — the component-owned notch and the hand-made cut must ride through it.
    const reconciled = reconcileJoints(regenerated)
    const afterJoints = reconciled.parts.find((p) => p.id === side.id) as BoardPart
    const owned = (f: 'sourceComponentId' | 'sourceJointId') =>
      afterJoints.cuts.filter((c) => c.kind === 'box' && c[f] !== undefined)

    expect(owned('sourceComponentId').map((c) => c.id)).toEqual([`cut_toekick_left-side`])
    // The carcase houses five panels in this side, so its own dados land here too. What matters
    // is that the hand-made joint's groove is re-derived among them and the stale one is not.
    expect(owned('sourceJointId').map((c) => c.id)).toContain('cut_j1')
    expect(owned('sourceJointId').map((c) => c.id)).not.toContain('cut_stale')
    expect(afterJoints.cuts.some((c) => c.id === handMade.id)).toBe(true)
  })
})

// Every fixture below is whatever the generator actually produces for a shipped preset: a
// hand-written cabinet is how a wrong joint count survives a phase.
describe('joint emission', () => {
  // Pinned to dado rather than taking the preset's method: the assertions below are about grooves
  // and housing panels, which only a dado has. The preset now ships `butt-screw`, and letting
  // these follow it would leave tests named for a dado quietly asserting something else.
  const presetParams: CarcaseParams = { ...CARCASE_PRESETS[0].params, jointMethod: 'dado-rabbet' }
  const preset: CarcaseComponent = { ...cabinet, params: presetParams }
  const presetScene: Scene = { ...empty, components: [preset] }

  function withPresetParams(s: Scene, overrides: Partial<CarcaseParams>): Scene {
    return regenerateComponents({
      ...s,
      components: [{ ...preset, params: { ...presetParams, ...overrides } }],
    })
  }

  function ownedJoints(s: Scene): Joint[] {
    return s.joints.filter((j) => j.sourceComponentId === 'cmp_1')
  }

  it('creates twelve driven joints for a base cabinet', () => {
    const out = regenerateComponents(presetScene)

    expect(ownedJoints(out)).toHaveLength(12)
    expect(out.joints).toHaveLength(12)
    expect(out.joints.every((j) => j.driven)).toBe(true)
  })

  it('points each joint at the parts carrying its roles, labelled from the roles', () => {
    const out = regenerateComponents(presetScene)
    const roleOf = new Map(out.parts.map((p) => [p.id, p.role]))
    const dado = out.joints.find((j) => j.id === 'joint_cmp_1_left-side__bottom') as DadoJoint

    expect(dado).toBeDefined()
    expect(roleOf.get(dado.housingPartId)).toBe('left-side')
    expect(roleOf.get(dado.housedPartId)).toBe('bottom')
    expect(dado.label).toBe('Dado — Left Side / Bottom')
  })

  // The dado fixtures above pin what a dado does; this pins what the shipped preset now does.
  // Without it, flipping the preset back to a groove-cutting method would break no test.
  it('a shipped preset is screwed together, and each joint bores two rows on two parts', () => {
    const screwed: Scene = {
      ...empty,
      components: [{ ...cabinet, params: CARCASE_PRESETS[0].params }],
    }
    const out = reconcileJoints(regenerateComponents(screwed))
    const joints = out.joints.filter((j) => j.sourceComponentId === 'cmp_1')

    expect(joints.length).toBeGreaterThan(0)
    expect(joints.every((j) => j.kind === 'screw')).toBe(true)

    for (const j of joints) {
      const bores = out.parts.flatMap((p) =>
        p.kind === 'board'
          ? p.cuts
              .filter((c) => c.kind === 'hole-array' && c.sourceJointId === j.id)
              .map(() => p.id)
          : [],
      )
      // One clearance row and one pilot row, and never both on the same panel — you screw through
      // one part into the other.
      expect(bores, j.id).toHaveLength(2)
      expect(new Set(bores).size, j.id).toBe(2)
    }
  })

  it('keeps joint ids stable across a regeneration', () => {
    const first = regenerateComponents(presetScene)
    const before = first.joints.map((j) => j.id).sort()
    const second = withPresetParams(first, { depth: 600 })

    expect(before).toHaveLength(12)

    expect(second.joints.map((j) => j.id).sort()).toEqual(before)
  })

  it('removes joints whose roles the params no longer imply', () => {
    const first = regenerateComponents(presetScene)
    const second = withPresetParams(first, { hasTop: false })

    // Loses both side/top dados, the top/back dado and the top/divider row it never had: 12 → 9.
    expect(ownedJoints(second)).toHaveLength(9)
    expect(second.joints.some((j) => j.id.includes('top'))).toBe(false)
  })

  it('leaves hand-made joints alone', () => {
    const first = regenerateComponents(presetScene)
    const handMade: DadoJoint = {
      ...(first.joints.find((j) => j.kind === 'dado') as DadoJoint),
      id: 'j_hand',
      label: 'Dado 1',
      driven: false,
      sourceComponentId: undefined,
    }
    const second = regenerateComponents({ ...first, joints: [...first.joints, handMade] })

    expect(second.joints.find((j) => j.id === 'j_hand')).toEqual(handMade)
    expect(ownedJoints(second)).toHaveLength(12)
  })

  // The joint equivalent of detaching a part: the user takes the joint the cabinet emitted, keeping
  // its id and its component tag, and regeneration must leave that choice standing.
  const SIDE_BOTTOM = 'joint_cmp_1_left-side__bottom'

  function takenAsScrew(s: Scene, id: string): Scene {
    const dado = s.joints.find((j) => j.id === id) as DadoJoint
    const housing = s.parts.find((p) => p.id === dado.housingPartId) as BoardPart
    const housed = s.parts.find((p) => p.id === dado.housedPartId) as BoardPart
    const screw: Joint = {
      ...defaultScrewJoint(housing, housed, dado.housingFace, dado.housedEnd, id, dado.label),
      sourceComponentId: 'cmp_1',
    }
    return { ...s, joints: s.joints.map((j) => (j.id === id ? screw : j)) }
  }

  it('keeps a joint the user took through a parameter change', () => {
    const first = takenAsScrew(regenerateComponents(presetScene), SIDE_BOTTOM)
    const second = withPresetParams(first, { depth: 600 })
    const kept = second.joints.find((j) => j.id === SIDE_BOTTOM)

    expect(kept?.kind).toBe('screw')
    expect(kept?.driven).toBe(false)
  })

  it('emits no generated twin beside the joint the user took', () => {
    const first = takenAsScrew(regenerateComponents(presetScene), SIDE_BOTTOM)
    const second = withPresetParams(first, { depth: 600 })

    expect(second.joints.filter((j) => j.id === SIDE_BOTTOM)).toHaveLength(1)
    expect(ownedJoints(second)).toHaveLength(12)
    expect(ownedJoints(second).filter((j) => j.kind === 'screw')).toHaveLength(1)
  })

  it('still replaces a driven joint on regeneration', () => {
    const first = regenerateComponents(presetScene)
    const edited: Scene = {
      ...first,
      joints: first.joints.map((j) =>
        j.id === SIDE_BOTTOM ? ({ ...j, depth: 99 } as DadoJoint) : j,
      ),
    }
    const second = withPresetParams(edited, { depth: 600 })

    expect((second.joints.find((j) => j.id === SIDE_BOTTOM) as DadoJoint).depth).not.toBe(99)
  })

  // Where a joint parts company with a detached part: a detached part is kept when its role goes,
  // because a board exists on its own. A joint is a relation, and the top it named is now deleted.
  it('drops a joint the user took once its role pair is gone', () => {
    const first = takenAsScrew(regenerateComponents(presetScene), 'joint_cmp_1_left-side__top')
    const second = withPresetParams(first, { hasTop: false })

    expect(second.joints.some((j) => j.id === 'joint_cmp_1_left-side__top')).toBe(false)
  })

  it('preserves last-good joints when params are invalid', () => {
    const first = regenerateComponents(presetScene)
    const second = withPresetParams(first, { width: 5 })

    expect(first.joints).toHaveLength(12)
    expect(second.joints).toEqual(first.joints)
  })

  it('is idempotent over joints as well as parts', () => {
    const once = regenerateComponents(presetScene)

    expect(once.joints.length).toBeGreaterThan(0)
    expect(regenerateComponents(once)).toEqual(once)
  })
})

// A cabinet is screwed together, and one joint in it is not. The panels have to be sized to the
// joint each pair actually has: a bottom sized to the cabinet default is butt length, and the
// groove it is then seated in pulls it 6 mm away from the side at the other end — a hole in the
// carcase that no test of joint kinds alone can see.
describe('a joint the user changed sizes the panels', () => {
  const screwed: Scene = {
    ...empty,
    components: [{ ...cabinet, params: CARCASE_PRESETS[0].params }],
  }
  const LEFT_BOTTOM = 'joint_cmp_1_left-side__bottom'
  const RIGHT_BOTTOM = 'joint_cmp_1_right-side__bottom'

  // The user's own path: convertibleKinds offers the kind, changeJointKind builds it, and the joint
  // it returns carries `driven: false` — which is what regeneration reads.
  function convert(s: Scene, id: string, kind: ConvertibleKind): Scene {
    const joint = s.joints.find((j) => j.id === id)
    expect(joint, id).toBeDefined()
    const next = changeJointKind(joint!, kind, s.parts, componentsById(s.components))
    expect(next, `${id} → ${kind}`).not.toBeNull()
    return { ...s, joints: s.joints.map((j) => (j.id === id ? next! : j)) }
  }

  // Carcase-local extents read off the generated part itself — position and rotation together —
  // rather than off whichever board dimension a role's orientation happens to put on x. Both edges
  // of every assertion below come from these, never from a literal: a hardcoded 570 would still
  // pass if the generator and the fixture drifted together.
  function boxOf(s: Scene, role: string) {
    const part = s.parts.find((p) => p.role === role) as BoardPart
    const m = resolveWorldMatrix(part, componentsById(s.components))
    const min = { x: Infinity, y: Infinity, z: Infinity }
    const max = { x: -Infinity, y: -Infinity, z: -Infinity }
    for (const cx of [0, part.length])
      for (const cy of [0, part.width])
        for (const cz of [0, part.thickness]) {
          const [wx, wy, wz] = applyMatrixToPoint(m, cx, cy, cz)
          min.x = Math.min(min.x, wx)
          min.y = Math.min(min.y, wy)
          min.z = Math.min(min.z, wz)
          max.x = Math.max(max.x, wx)
          max.y = Math.max(max.y, wy)
          max.z = Math.max(max.z, wz)
        }
    return { min, max }
  }

  const built = (s: Scene): Scene => reconcileJoints(regenerateComponents(s))

  const depthOf = (s: Scene, id: string): number =>
    (s.joints.find((j) => j.id === id) as DadoJoint).depth

  it('reaches the groove floor at the dado end and the side it still butts at the other', () => {
    const out = built(convert(regenerateComponents(screwed), LEFT_BOTTOM, 'dado'))

    const left = boxOf(out, 'left-side')
    const right = boxOf(out, 'right-side')
    const bottom = boxOf(out, 'bottom')
    const depth = depthOf(out, LEFT_BOTTOM)

    expect(depth).toBeGreaterThan(0)
    expect(bottom.min.x).toBeCloseTo(left.max.x - depth, 6)
    // The end the defect opened: sizing the bottom to the cabinet default and seating it in the
    // groove moved it left by `depth`, leaving exactly that much daylight here.
    expect(bottom.max.x).toBeCloseTo(right.min.x, 6)
  })

  it('reaches both groove floors when both side joints are dados', () => {
    const first = convert(regenerateComponents(screwed), LEFT_BOTTOM, 'dado')
    const out = built(convert(first, RIGHT_BOTTOM, 'dado'))

    const left = boxOf(out, 'left-side')
    const right = boxOf(out, 'right-side')
    const bottom = boxOf(out, 'bottom')

    expect(bottom.min.x).toBeCloseTo(left.max.x - depthOf(out, LEFT_BOTTOM), 6)
    expect(bottom.max.x).toBeCloseTo(right.min.x + depthOf(out, RIGHT_BOTTOM), 6)
  })

  // The pass stays a function in one direction. What it reads is a joint's *kind*, never a
  // dimension it has just generated, so a second run has nothing new to see — an override that fed
  // back into the layout would settle over several passes, or not at all.
  it('regenerates an overridden cabinet to itself', () => {
    const once = regenerateComponents(convert(regenerateComponents(screwed), LEFT_BOTTOM, 'dado'))

    expect(regenerateComponents(once)).toEqual(once)
  })

  // The other half of the rule, and the one that stops the fix being "extend everything": with no
  // joint overridden the bottom is exactly its butt length, inner face to inner face.
  it('butts a cabinet nobody has overridden exactly', () => {
    const out = built(screwed)

    expect(out.joints.filter((j) => j.sourceComponentId === 'cmp_1').length).toBeGreaterThan(0)
    expect(out.joints.every((j) => j.kind === 'screw')).toBe(true)

    const bottom = boxOf(out, 'bottom')
    expect(bottom.min.x).toBeCloseTo(boxOf(out, 'left-side').max.x, 6)
    expect(bottom.max.x).toBeCloseTo(boxOf(out, 'right-side').min.x, 6)
  })
})

// The real pipeline is reconcileJoints(regenerateComponents(scene)): the joints emitted above are
// handed straight to the stage that derives their cut geometry. A wrong housing face puts the
// groove on the outside of the cabinet and nothing downstream objects.
describe('emitted joints through reconcileJoints', () => {
  // Dado for the same reason as above: this describe is about where a groove is cut.
  const preset: CarcaseComponent = {
    ...cabinet,
    params: { ...CARCASE_PRESETS[0].params, jointMethod: 'dado-rabbet' },
  }
  const presetScene: Scene = { ...empty, components: [preset] }

  it('cuts every derived groove into the housing panel', () => {
    const regenerated = regenerateComponents(presetScene)
    const out = reconcileJoints(regenerated)
    const jointById = new Map(out.joints.map((j) => [j.id, j]))

    const derived = out.parts.flatMap((p) =>
      p.kind === 'board'
        ? p.cuts.flatMap((c) =>
            c.kind === 'box' && c.sourceJointId !== undefined ? [{ partId: p.id, cut: c }] : [],
          )
        : [],
    )

    expect(derived).toHaveLength(12)
    for (const { partId, cut } of derived) {
      const joint = jointById.get(cut.sourceJointId!) as DadoJoint
      expect(joint).toBeDefined()
      expect(partId).toBe(joint.housingPartId)
    }
  })

  it('keeps the component-owned toe-kick notch through the joint stage', () => {
    const out = reconcileJoints(regenerateComponents(presetScene))

    for (const role of ['left-side', 'right-side']) {
      const side = out.parts.find((p) => p.role === role) as BoardPart
      expect(
        side.cuts
          .filter((c) => c.kind === 'box' && c.sourceComponentId === 'cmp_1')
          .map((c) => c.id),
      ).toEqual([`cut_toekick_${role}`])
    }
  })
})

// Task 8.3 attaches component-owned hole arrays. Nothing emits one yet, so the growth the stale-cut
// filter exists to prevent cannot be watched happening without standing that emission up here — and
// a filter that keeps a cut it should have stripped only shows itself once something re-adds it.
describe('a component-owned cut of a new kind', () => {
  const pinRow: HoleArrayCut = {
    kind: 'hole-array',
    id: 'cut_pins_left-side',
    label: 'Shelf Pins',
    face: '+Z',
    axis: 'U',
    start: { x: 37, y: 200, z: 0 },
    pitch: 32,
    count: 10,
    diameter: 5,
    depth: 12,
  }

  async function loadWithPinRowEmission(): Promise<(s: Scene) => Scene> {
    vi.resetModules()
    vi.doMock('./carcaseRoles', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./carcaseRoles')>()
      return {
        ...actual,
        carcaseCuts: (p: CarcaseParams, thicknessOf: RoleThickness, role: string): CutDef[] => [
          ...actual.carcaseCuts(p, thicknessOf, role),
          ...(role === 'left-side' ? [pinRow] : []),
        ],
      }
    })
    return (await import('./regenerateComponents')).regenerateComponents
  }

  afterEach(() => {
    vi.doUnmock('./carcaseRoles')
    vi.resetModules()
  })

  it('is re-derived, not accumulated, on every regeneration', async () => {
    const regenerate = await loadWithPinRowEmission()

    let scene = regenerate(empty)
    for (let i = 0; i < 3; i++) scene = regenerate(scene)

    const side = scene.parts.find((p) => p.role === 'left-side') as BoardPart
    expect(side.cuts.filter((c) => c.kind === 'hole-array')).toHaveLength(1)
    expect(side.cuts.filter((c) => c.kind === 'hole-array')[0].sourceComponentId).toBe('cmp_1')
  })
})

// Task 8.3 — the pin rows a cabinet drills for its adjustable shelves. Component-owned like the
// toe-kick notch, so the ownership rules above govern them: re-derived on every pass, never added
// to what the last pass left behind.
describe('shelf-pin hole arrays', () => {
  const pinned: CarcaseComponent = {
    ...cabinet,
    params: {
      ...params,
      section: legacyToSection([0.5], 1, 600, 18),
      adjustableShelves: { ...params.adjustableShelves, count: 10 },
    },
  }
  const scene: Scene = { ...empty, components: [pinned] }

  const arraysOn = (s: Scene, role: string) =>
    ((partsOf(s).find((p) => p.role === role) as BoardPart).cuts as CutDef[]).filter(
      (c) => c.kind === 'hole-array',
    )

  const arrayCount = (s: Scene) =>
    partsOf(s)
      .flatMap((p) => (p.kind === 'board' ? p.cuts : []))
      .filter((c) => c.kind === 'hole-array').length

  it('drills the panels that carry shelves and no others', () => {
    const out = regenerateComponents(scene)
    expect(arraysOn(out, 'left-side')).toHaveLength(1)
    expect(arraysOn(out, 'right-side')).toHaveLength(1)
    expect(arraysOn(out, partitionRole(pinned.params))).toHaveLength(2)
    for (const role of ['bottom', 'top', 'back']) {
      expect(arraysOn(out, role), role).toEqual([])
    }
  })

  it('tags every row with the component that owns it', () => {
    const rows = arraysOn(regenerateComponents(scene), 'left-side')
    expect(rows.length).toBeGreaterThan(0)
    for (const c of rows) expect(c.sourceComponentId).toBe('cmp_1')
  })

  // The stale-cut filter keys on the ownership tag alone. Were it to name kinds instead, every
  // regeneration would append another copy of each row behind the fresh one.
  it('re-derives its rows instead of accumulating them', () => {
    const once = regenerateComponents(scene)
    expect(arrayCount(once)).toBe(4)
    let scene2 = once
    for (let i = 0; i < 3; i++) scene2 = regenerateComponents(scene2)
    expect(arrayCount(scene2)).toBe(arrayCount(once))
    expect(scene2).toEqual(once)
  })
})
