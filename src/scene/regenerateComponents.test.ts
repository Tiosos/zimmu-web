import { describe, it, expect } from 'vitest'
import { regenerateComponents } from './regenerateComponents'
import { reconcileJoints } from './reconcileJoints'
import type {
  BoardPart,
  BoxCut,
  CarcaseComponent,
  CarcaseParams,
  DadoJoint,
  Part,
  Scene,
} from './types'

const params: CarcaseParams = {
  width: 600,
  height: 720,
  depth: 560,
  material: '18mm Ply',
  thickness: 18,
  hasTop: true,
  backMode: 'captured',
  backThickness: 12,
  baseMode: 'none',
  toeKickHeight: 100,
  toeKickSetback: 60,
  fixedShelves: 1,
  adjustableShelves: { rows: 1, pitch: 32, setback: 37, startHeight: 200, count: 0 },
  jointMethod: 'dado-rabbet',
  dividers: [],
}

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

const empty: Scene = { parts: [], materials: {}, hardware: [], joints: [], components: [cabinet] }

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

describe('regenerateComponents', () => {
  it('creates one part per role, all driven and parented to the carcase', () => {
    const out = regenerateComponents(empty)
    expect(partsOf(out).map((p) => p.role)).toEqual([
      'left-side',
      'right-side',
      'bottom',
      'top',
      'back',
      'shelf-0-0',
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
      { depth: 600, height: 900, fixedShelves: 3 },
      { depth: 600, height: 900, fixedShelves: 3, hasTop: false },
      { depth: 480, height: 2100, fixedShelves: 0, hasTop: false, dividers: [0.5] },
      { depth: 480, height: 2100, fixedShelves: 2, hasTop: true, dividers: [0.5] },
      { depth: 560, height: 720, fixedShelves: 1, hasTop: true, dividers: [] },
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
    expect(owned('sourceJointId').map((c) => c.id)).toEqual(['cut_j1'])
    expect(afterJoints.cuts.some((c) => c.id === handMade.id)).toBe(true)
  })
})
