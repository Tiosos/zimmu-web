import { expect, it, vi } from 'vitest'
import * as pipeline from './pipeline'
import { motionScene } from './__fixtures__/motion'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from './carcasePresets'
import { acceptRunFit, allocateRunWidths, previewRunFit, runFitDraft } from './runFit'
import { worldBoundsOf } from './carcaseWorldBounds'
import { frontsSignature } from './frontsDrawers'
import type { CarcaseComponent, Scene } from './types'
const fitScene = (): Scene => ({
  components: ['a', 'b'].map((id, i) => ({
    ...structuredClone(cabinet),
    id,
    label: id.toUpperCase(),
    position: { x: i * 900, y: i * 300, z: i * 50 },
  })),
  parts: [],
  materials: PRESET_MATERIALS,
  joints: [],
  hardware: [],
})
const draft = () => ({ ...runFitDraft(['a', 'b']), target: '1800' })
const get = (scene: Scene, id: string) =>
  scene.components.find((c) => c.id === id) as CarcaseComponent
it('fits equal widths with reserves/gaps and near alignment, preserving heights and original scene', () => {
  const scene = fitScene(),
    signature = frontsSignature(scene)
  const preview = previewRunFit(scene, {
    ...draft(),
    target: '1885',
    start: '50',
    end: '25',
    gap: '10',
  })
  expect(preview.errors).toEqual([])
  expect(preview.rows.map((r) => r.afterWidth)).toEqual([900, 900])
  expect(preview.rows.map((r) => r.after)).toEqual([
    { x: 50, y: 0, z: 0 },
    { x: 960, y: 0, z: 50 },
  ])
  expect(preview.cabinetSpan + preview.reserve + preview.gaps).toBe(1885)
  expect(frontsSignature(scene)).toBe(signature)
  expect(preview.scene!.parts.length).toBeGreaterThan(0)
  expect(get(preview.scene!, 'b').params.section).toEqual(get(scene, 'b').params.section)
})
it('redistributes bounded widths and keeps fixed widths unchanged', () => {
  const d = draft()
  d.entries[0].max = '700'
  expect(previewRunFit(fitScene(), d).rows.map((r) => r.afterWidth)).toEqual([700, 1100])
  d.entries[0].fixed = true
  expect(previewRunFit(fitScene(), d).rows.map((r) => r.afterWidth)).toEqual([600, 1200])
})
it('allocates proportional widths and clamps at both bounds', () => {
  expect(
    allocateRunWidths(900, [
      { min: 100, max: 1000, weight: 1 },
      { min: 100, max: 1000, weight: 2 },
    ]),
  ).toEqual([300, 600])
  const clamped = allocateRunWidths(900, [
    { min: 400, max: 1000, weight: 1 },
    { min: 100, max: 1000, weight: 2 },
  ])
  expect(clamped[0]).toBeCloseTo(400, 6)
  expect(clamped[1]).toBeCloseTo(500, 6)
  const scene = fitScene()
  get(scene, 'b').params.width = 1200
  const p = previewRunFit(scene, { ...draft(), target: '2400', allocation: 'proportional' })
  expect(p.errors).toEqual([])
  expect(p.rows[1].afterWidth).toBeCloseTo(p.rows[0].afterWidth * 2)
})
it.each([-1, 0, NaN, Infinity])('rejects invalid budgets %s', (n) =>
  expect(() => allocateRunWidths(n, [{ min: 1, max: 10, weight: 1 }])).toThrow('positive finite'),
)
it.each([
  { min: 0, max: 10, weight: 1 },
  { min: 10, max: 1, weight: 1 },
  { min: 1, max: 10, weight: 0 },
  { min: 1, max: Infinity, weight: 1 },
])('rejects invalid bounds %j', (p) =>
  expect(() => allocateRunWidths(5, [p])).toThrow('positive finite'),
)
it('rejects budgets outside summed limits and empty allocations', () => {
  for (const budget of [1, 100])
    expect(() => allocateRunWidths(budget, [{ min: 5, max: 10, weight: 1 }])).toThrow('cannot fit')
  expect(() => allocateRunWidths(1, [])).toThrow()
})
it('satisfies feasible bounds and sums across varied deterministic cases', () => {
  for (let n = 2; n <= 20; n++) {
    const limits = Array.from({ length: n }, (_, i) => ({
      min: 100 + i * 10,
      max: 400 + i * 20,
      weight: i + 1,
    }))
    const min = limits.reduce((a, b) => a + b.min, 0),
      max = limits.reduce((a, b) => a + b.max, 0)
    for (const ratio of [0, 0.01, 0.3, 0.7, 0.99, 1]) {
      const budget = min + (max - min) * ratio,
        widths = allocateRunWidths(budget, limits)
      expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(budget, 6)
      widths.forEach((w, i) => {
        expect(w).toBeGreaterThanOrEqual(limits[i].min - 1e-6)
        expect(w).toBeLessThanOrEqual(limits[i].max + 1e-6)
      })
    }
  }
})
it('supports negative runs and reversed fit order', () => {
  const p = previewRunFit(fitScene(), {
    ...draft(),
    direction: -1,
    start: '50',
    end: '25',
    gap: '10',
    target: '1885',
  })
  expect(p.errors).toEqual([])
  expect(p.rows.map((r) => r.after.x)).toEqual([-350, -1260])
  const d = draft()
  d.entries.reverse()
  expect(previewRunFit(fitScene(), d).rows[0].id).toBe('b')
})
it.each([90, 270])('fits co-oriented Y cabinets at %s degrees', (angle) => {
  const scene = fitScene()
  scene.components = scene.components.map((c) => ({ ...c, rotation: { x: 0, y: 0, z: angle } }))
  const p = previewRunFit(scene, { ...draft(), axis: 'y', gap: '20', target: '1820' })
  expect(p.errors).toEqual([])
  const a = worldBoundsOf(get(p.scene!, 'a'), scene.materials),
    b = worldBoundsOf(get(p.scene!, 'b'), scene.materials)
  expect(b.y0 - a.y1).toBeCloseTo(20)
  expect(a.x0).toBeCloseTo(b.x0)
})
it('rejects missing/duplicate/too few/too many/cross-parent selections', () => {
  const scene = fitScene()
  for (const ids of [
    [],
    ['a'],
    ['a', 'a'],
    ['a', 'missing'],
    Array.from({ length: 101 }, (_, i) => String(i)),
  ])
    expect(previewRunFit(scene, runFitDraft(ids)).errors.length).toBeGreaterThan(0)
  get(scene, 'b').parentId = 'other'
  expect(previewRunFit(scene, draft()).errors.join()).toContain('share one parent frame')
})
it.each(['target', 'start', 'end', 'gap'] as const)(
  'rejects blank/negative/nonfinite %s',
  (key) => {
    for (const value of ['', '-1', 'Infinity'])
      expect(previewRunFit(fitScene(), { ...draft(), [key]: value }).errors.join()).toContain(
        'finite',
      )
  },
)
it('rejects all-fixed, impossible capacities, reversed bounds and impossible construction', () => {
  const d = draft()
  d.entries.forEach((e) => (e.fixed = true))
  expect(previewRunFit(fitScene(), d).errors.join()).toContain('Unlock')
  d.entries.forEach((e) => (e.fixed = false))
  d.target = '10000'
  expect(previewRunFit(fitScene(), d).errors.join()).toContain('cannot fit')
  d.target = '1500'
  d.entries[0].min = '1000'
  d.entries[0].max = '500'
  expect(previewRunFit(fitScene(), d).errors.join()).toContain('bounds')
  d.entries.forEach((e) => {
    e.min = '1'
    e.max = '100'
  })
  d.target = '20'
  expect(previewRunFit(fitScene(), d).errors.length).toBeGreaterThan(0)
})
it('rejects mismatched, tilted, nonfinite and wrong-axis orientations', () => {
  for (const rotation of [
    { x: 0, y: 0, z: 90 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: NaN },
  ]) {
    const scene = fitScene()
    get(scene, 'b').rotation = rotation
    expect(previewRunFit(scene, draft()).errors.join()).toContain('co-oriented')
  }
  const scene = fitScene()
  scene.components = scene.components.map((c) => ({ ...c, rotation: { x: 0, y: 0, z: 90 } }))
  expect(previewRunFit(scene, draft()).errors.join()).toContain('run axis')
})
it('requires selected anchor detachment and retains unselected followers', () => {
  const scene = fitScene()
  get(scene, 'b').anchor = { to: 'a', face: 'right', gap: 0, offset: { u: 0, v: 0 } }
  expect(previewRunFit(scene, draft()).errors.join()).toContain('Detach')
  expect(previewRunFit(scene, { ...draft(), detach: true }).errors).toEqual([])
  const follower = {
    ...structuredClone(get(scene, 'b')),
    id: 'c',
    label: 'Follower',
    anchor: { to: 'b', face: 'right' as const, gap: 0, offset: { u: 0, v: 0 } },
  }
  scene.components.push(follower)
  const p = previewRunFit(scene, { ...draft(), detach: true })
  expect(get(p.scene!, 'c').anchor).toEqual(follower.anchor)
  expect(get(p.scene!, 'c').position.x).toBe(1800)
})
it('reports sibling overlaps but permits intentional acceptance', () => {
  const scene = fitScene()
  scene.components.push({
    ...structuredClone(get(scene, 'a')),
    id: 'obstacle',
    label: 'Obstacle',
    position: { x: 300, y: 0, z: 0 },
  })
  const p = previewRunFit(scene, draft())
  expect(p.overlaps.some((v) => v.a === 'Obstacle' || v.b === 'Obstacle')).toBe(true)
  expect(acceptRunFit(scene, p)).not.toBeNull()
})
it('rebuilds acceptance, rejects stale/errors/noops and ignores mesh-only updates', () => {
  const scene = fitScene(),
    p = previewRunFit(scene, draft())
  const accepted = acceptRunFit(scene, { ...p, scene: { ...scene, components: [] } })!
  expect(accepted.components.length).toBe(2)
  expect(acceptRunFit(scene, { ...p, errors: ['bad'] })).toBeNull()
  expect(acceptRunFit(scene, { ...p, changed: false })).toBeNull()
  expect(
    acceptRunFit({ ...scene, materials: { ...scene.materials, Extra: { thickness: 12 } } }, p),
  ).toBeNull()
  const noop = previewRunFit(accepted, { ...draft(), target: '1800' })
  expect(noop.changed).toBe(false)
  expect(acceptRunFit(accepted, noop)).toBeNull()
  expect(acceptRunFit({ ...scene, parts: [...scene.parts] }, p)).not.toBeNull()
})

it('validates retained drawer parameters before committing resized geometry', () => {
  const scene = motionScene('drawer')
  scene.components.push(structuredClone(fitScene().components[0]))
  const fit = { ...runFitDraft(['cab', 'a']), target: '1800' }
  expect(previewRunFit(scene, fit).errors).toEqual([])
  scene.components = scene.components.map((c) =>
    c.kind === 'drawer' ? { ...c, params: { ...c.params, boxHeight: 1 } } : c,
  )
  expect(previewRunFit(scene, fit).errors.join()).toContain('drawer boxes do not fit')
})
it('rejects unsupported choices and degenerate numeric ranges', () => {
  const d = draft()
  for (const bad of [{ axis: 'z' }, { direction: 0 }, { allocation: 'bad' }])
    expect(previewRunFit(fitScene(), { ...d, ...bad } as typeof d).errors.join()).toContain(
      'supported',
    )
  expect(() =>
    allocateRunWidths(100, [
      { min: 1, max: 1000, weight: Number.MIN_VALUE },
      { min: 1, max: 1000, weight: 1 },
    ]),
  ).toThrow('numeric range')
})

it('rejects reconciliation that changes requested dimensions instead of accepting a different fit', () => {
  const spy = vi.spyOn(pipeline, 'applyPipeline').mockImplementation((scene) => ({
    ...scene,
    components: scene.components.map((c) =>
      c.kind === 'carcase' ? { ...c, params: { ...c.params, width: c.params.width + 1 } } : c,
    ),
  }))
  try {
    expect(previewRunFit(fitScene(), draft()).errors.join()).toContain('rule changed')
  } finally {
    spy.mockRestore()
  }
})
it('enforces the selected-cabinet cap for distinct available cabinet identities', () => {
  const scene = fitScene(),
    template = scene.components[0]
  scene.components = Array.from({ length: 101 }, (_, i) => ({
    ...structuredClone(template),
    id: `c${i}`,
  }))
  expect(
    previewRunFit(scene, runFitDraft(scene.components.map((c) => c.id))).errors.join(),
  ).toContain('2–100 distinct')
})
it('rejects invalid current widths before fitting even when new widths could be valid', () => {
  const scene = fitScene()
  get(scene, 'b').params.width = 0
  expect(previewRunFit(scene, draft()).errors.join()).toContain('Current cabinet widths')
})
