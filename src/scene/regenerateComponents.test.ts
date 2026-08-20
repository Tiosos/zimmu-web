import { describe, it, expect } from 'vitest'
import { regenerateComponents } from './regenerateComponents'
import type { BoardPart, CarcaseComponent, CarcaseParams, Part, Scene } from './types'

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
