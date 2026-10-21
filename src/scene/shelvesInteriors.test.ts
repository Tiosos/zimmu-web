import { expect, it } from 'vitest'
import { motionScene } from './__fixtures__/motion'
import {
  acceptInteriors,
  interiorTargets,
  parseShelfForm,
  previewInteriors,
  shelfForm,
  stageInteriors,
} from './shelvesInteriors'
import { defaultInterior } from './sectionInterior'
const source = () => motionScene('door')
const setup = () => {
  const scene = source(),
    id = interiorTargets(scene, 'cab')[0].id
  return { scene, id }
}
it('stages and generates shelf boards, pin rows and hardware without editing the source', () => {
  const { scene, id } = setup(),
    before = JSON.stringify(scene)
  const draft = stageInteriors(scene, 'cab', {}, [id], defaultInterior(2, 1))
  const preview = previewInteriors(scene, 'cab', draft)
  expect(preview.errors).toEqual([])
  expect(preview.changed).toBe(true)
  expect(preview.boards).toHaveLength(3)
  expect(preview.pinBores).toBeGreaterThan(0)
  expect(preview.hardware.some((r) => r.after > r.before)).toBe(true)
  expect(JSON.stringify(scene)).toBe(before)
  expect(acceptInteriors(scene, { ...preview, scene: null })).not.toBeNull()
})
it.each(['fixed', 'shelves', 'count', 'rows', 'front', 'back'] as const)(
  'rejects invalid %s input',
  (key) => {
    for (const value of ['', '-1', 'Infinity'])
      expect(() => parseShelfForm({ ...shelfForm(), [key]: value })).toThrow('finite')
  },
)
it('rejects fractional/oversized counts and unsupported rows', () => {
  for (const key of ['fixed', 'shelves', 'count'] as const)
    for (const value of ['1.5', '1001'])
      expect(() => parseShelfForm({ ...shelfForm(), [key]: value })).toThrow('whole')
  expect(() => parseShelfForm({ ...shelfForm(), rows: '0' })).toThrow('one or two')
})
it('preserves section IDs, fronts, drawers and construction while changing only interior specs', () => {
  const { scene, id } = setup(),
    p = previewInteriors(scene, 'cab', { [id]: defaultInterior(1) })
  const before = scene.components.find((c) => c.kind === 'carcase')!,
    after = p.scene!.components.find((c) => c.kind === 'carcase')!
  expect(after).toMatchObject({
    ...before,
    params: {
      ...before.params,
      section: { ...before.params.section, interior: defaultInterior(1) },
    },
  })
})
it('rejects unavailable targets, duplicate/empty selection and unsupported pitch', () => {
  const { scene, id } = setup()
  for (const ids of [[], [id, id], ['missing']])
    expect(() => stageInteriors(scene, 'cab', {}, ids, defaultInterior(1))).toThrow()
  expect(() =>
    stageInteriors(scene, 'cab', {}, [id], {
      ...defaultInterior(1),
      adjustable: { ...defaultInterior(1).adjustable, pitch: 16 as 32 },
    }),
  ).toThrow('32 mm')
  expect(previewInteriors(scene, 'cab', { missing: defaultInterior(1) }).errors.join()).toContain(
    'unavailable',
  )
})
it('locks openings containing detached shelf boards', () => {
  const { scene, id } = setup(),
    populated = previewInteriors(scene, 'cab', { [id]: defaultInterior(1) }).scene!
  populated.parts = populated.parts.map((p) =>
    p.kind === 'board' && p.role?.startsWith('adj-shelf-') ? { ...p, driven: false } : p,
  )
  expect(interiorTargets(populated, 'cab')[0].locked).toBe(true)
  expect(() => stageInteriors(populated, 'cab', {}, [id], defaultInterior(0))).toThrow('detached')
  expect(previewInteriors(populated, 'cab', { [id]: defaultInterior(0) }).errors.join()).toContain(
    'detached',
  )
})
it('blocks missing boards and invalid drilling rather than silently dropping requests', () => {
  const { scene, id } = setup()
  for (const spec of [
    { ...defaultInterior(2), adjustable: { ...defaultInterior(2).adjustable, count: 1 } },
    { ...defaultInterior(1), adjustable: { ...defaultInterior(1).adjustable, setback: 0 } },
    { ...defaultInterior(1), adjustable: { ...defaultInterior(1).adjustable, setback: 9999 } },
  ])
    expect(previewInteriors(scene, 'cab', { [id]: spec }).errors.length).toBeGreaterThan(0)
})
it('detects overlapping front/rear rows', () => {
  const { scene, id } = setup(),
    spec = defaultInterior(1)
  spec.adjustable.setback = 280
  spec.adjustable.backSetback = 280
  expect(previewInteriors(scene, 'cab', { [id]: spec }).errors.join()).toContain('overlap')
})
it('removes shelves and pin drilling, rejects stale/invalid/no-op acceptance', () => {
  const { scene, id } = setup(),
    first = previewInteriors(scene, 'cab', { [id]: defaultInterior(1) })
  expect(
    acceptInteriors(
      { ...scene, materials: { ...scene.materials, Extra: { thickness: 12 } } },
      first,
    ),
  ).toBeNull()
  expect(acceptInteriors(scene, { ...first, errors: ['bad'] })).toBeNull()
  expect(acceptInteriors(scene, { ...first, changed: false })).toBeNull()
  const spec = defaultInterior(0)
  spec.adjustable.count = 0
  const clear = previewInteriors(first.scene!, 'cab', { [id]: spec })
  expect(clear.errors).toEqual([])
  expect(clear.boards).toEqual([])
  expect(clear.pinBores).toBe(0)
  const noop = previewInteriors(first.scene!, 'cab', { [id]: defaultInterior(1) })
  expect(noop.changed).toBe(false)
  expect(acceptInteriors(first.scene!, noop)).toBeNull()
})
it('reports frame insertion failures while refusing missing manufacturing boards', () => {
  const scene = motionScene('pair', true)
  scene.components = scene.components.map((c) =>
    c.kind === 'carcase'
      ? {
          ...c,
          params: { ...c.params, height: 300, frame: { ...c.params.frame!, pairStile: true } },
        }
      : c,
  )
  const id = interiorTargets(scene, 'cab')[0].id,
    p = previewInteriors(scene, 'cab', { [id]: defaultInterior(1) })
  expect(p.errors.join()).toContain('face-frame insertion')
  expect(p.diagnostics.join()).toContain('not generated')
})
it('limits staged openings and treats absent interior specs as no shelves or drilling', () => {
  const { scene, id } = setup()
  expect(
    previewInteriors(
      scene,
      'cab',
      Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), defaultInterior(1)])),
    ).errors.join(),
  ).toContain('100 openings')
  scene.components = scene.components.map((c) =>
    c.kind === 'carcase'
      ? { ...c, params: { ...c.params, section: { ...c.params.section, interior: undefined } } }
      : c,
  )
  const empty = defaultInterior(0)
  empty.adjustable.count = 0
  expect(previewInteriors(scene, 'cab', { [id]: empty }).changed).toBe(false)
})
it('rejects unsafe source geometry before invoking count-driven generation', () => {
  const scene = source()
  scene.components = scene.components.map((c) =>
    c.kind === 'carcase' ? { ...c, params: { ...c.params, width: 100001 } } : c,
  )
  expect(() => interiorTargets(scene, 'cab')).toThrow('100,000')
})
it('validates retained drawer settings when staging drilling-only changes', () => {
  const scene = motionScene('drawer')
  scene.components = scene.components.map((c) =>
    c.kind === 'drawer' ? { ...c, params: { ...c.params, boxHeight: 1 } } : c,
  )
  const id = interiorTargets(scene, 'cab')[0].id,
    spec = defaultInterior(0)
  spec.adjustable.count = 8
  expect(previewInteriors(scene, 'cab', { [id]: spec }).errors.join()).toContain(
    'drawer boxes do not fit',
  )
})
