import { buildMachiningSchedule } from './machiningSchedule'
import { buildMachiningCsv } from '../ui/buildMachiningCsv'
import { expect, it } from 'vitest'
import { worktopBoard, worktopScene } from './__fixtures__/worktop'
import {
  defaultWorktopFeature,
  worktopMachiningError,
  type WorktopFeature,
  type WorktopMachining,
} from './worktopMachiningRecipe'
import {
  acceptWorktopMachining,
  previewWorktopMachining,
  regenerateWorktopMachining,
  resolveWorktopFeatures,
  worktopCutOwned,
  worktopMachiningEligible,
} from './worktopMachining'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import { buildDrawingSheets } from '../geom/drawing'
import { buildSvg } from '../ui/buildSvg'
import { manufacturingParts } from './manufacturingPart'
import { buildCsv } from '../ui/buildCsv'
import type { BoardPart, ZimmuFile } from './types'
const feature = (patch: Partial<WorktopFeature> = {}): WorktopFeature => ({
  ...defaultWorktopFeature('f'),
  ...patch,
})
const recipe = (...features: WorktopFeature[]): WorktopMachining => ({ version: 1, features })
const resolve = (f = feature()) => resolveWorktopFeatures(worktopBoard(), recipe(f))[0]
const preview = (f = feature()) => previewWorktopMachining(worktopScene(), 'top', recipe(f))
it.each(['rectangle', 'circle'] as const)(
  'emits a real %s through cut at the board top',
  (shape) => {
    const r = resolve(feature({ shape }))
    expect(r.errors).toEqual([])
    expect(r.depth).toBe(30)
    expect(r.cut).toMatchObject({ id: 'wm_f', face: '+Z' })
    if (shape === 'rectangle')
      expect(r.cut).toMatchObject({
        kind: 'box',
        position: { x: 500, y: 225, z: 0 },
        size: { x: 200, y: 150, z: 30 },
      })
    else
      expect(r.cut).toMatchObject({
        kind: 'hole-array',
        start: { x: 600, y: 300, z: 30 },
        depth: 30,
        count: 1,
        diameter: 35,
      })
  },
)
it.each(['rectangle', 'circle'] as const)(
  'emits a blind %s with positive floor material',
  (shape) => {
    const r = resolve(feature({ shape, mode: 'blind', depth: 12 }))
    expect(r.errors).toEqual([])
    expect(r.depth).toBe(12)
    if (shape === 'rectangle') expect(r.cut).toMatchObject({ position: { z: 18 }, size: { z: 12 } })
    else expect(r.cut).toMatchObject({ depth: 12, start: { z: 30 } })
  },
)
it.each([
  ['left', 150, 150],
  ['centre', -100, 500],
  ['right', 150, 1050],
] as const)('resolves %s X references', (xRef, x, expected) => {
  expect(resolve(feature({ xRef, x })).x).toBe(expected)
})
it.each([
  ['front', 100, 100],
  ['centre', -100, 200],
  ['rear', 100, 500],
] as const)('resolves %s Y references', (yRef, y, expected) => {
  expect(resolve(feature({ yRef, y })).y).toBe(expected)
})
it('supports sink/hob starters without claiming appliance dimensions', () => {
  expect(defaultWorktopFeature('s', 'sink')).toMatchObject({
    label: 'Sink opening',
    length: 500,
    width: 400,
  })
  expect(defaultWorktopFeature('h', 'hob')).toMatchObject({
    label: 'Hob opening',
    length: 560,
    width: 490,
  })
  expect(defaultWorktopFeature('c', 'circle').shape).toBe('circle')
})
it.each([
  { xRef: 'left', x: 100, clearance: 1 },
  { yRef: 'rear', y: 75, clearance: 1 },
  { mode: 'blind', depth: 30 },
  { mode: 'blind', depth: 31 },
  { x: Number.MAX_VALUE, length: Number.MAX_VALUE },
] as Partial<WorktopFeature>[])('omits unsafe geometry %j', (patch) => {
  const r = resolve(feature(patch))
  expect(r.errors.length).toBeGreaterThan(0)
  expect(r.cut).toBeNull()
})
it.each([
  [feature(), feature({ id: 'g', x: 199 })],
  [
    feature({ shape: 'circle', diameter: 100 }),
    feature({ id: 'g', shape: 'circle', diameter: 100, x: 99 }),
  ],
  [feature(), feature({ id: 'g', shape: 'circle', diameter: 100, x: 149 })],
] as const)('invalidates both overlapping features', (a, b) => {
  const rows = resolveWorktopFeatures(worktopBoard(), recipe(a, b))
  expect(rows.every((r) => r.errors.some((e) => e.includes('Overlaps')))).toBe(true)
  expect(rows.every((r) => r.cut === null)).toBe(true)
})
it.each([
  [feature(), feature({ id: 'g', x: 200 })],
  [
    feature({ shape: 'circle', diameter: 100 }),
    feature({ id: 'g', shape: 'circle', diameter: 100, x: 100 }),
  ],
  [feature(), feature({ id: 'g', shape: 'circle', diameter: 100, x: 150 })],
  [feature(), feature({ id: 'g', shape: 'circle', diameter: 100, x: 145, y: 120 })],
] as const)('permits tangency and non-overlapping circle/rectangle corners', (a, b) => {
  expect(resolveWorktopFeatures(worktopBoard(), recipe(a, b)).flatMap((r) => r.errors)).toEqual([])
})
it.each([
  null,
  [],
  {},
  { version: 2, features: [] },
  { version: 1, features: {} },
  { version: 1, features: [null] },
  recipe(feature(), feature()),
  recipe(feature({ id: '' })),
  recipe(feature({ label: '' })),
  recipe(feature({ shape: 'bad' as never })),
  recipe(feature({ mode: 'bad' as never })),
  recipe(feature({ xRef: 'bad' as never })),
  recipe(feature({ yRef: 'bad' as never })),
  recipe(feature({ x: NaN })),
  recipe(feature({ width: 0.1 })),
  recipe(feature({ clearance: -1 })),
  recipe(feature({ xRef: 'left', x: -1 })),
  recipe(feature({ yRef: 'front', y: -1 })),
  recipe(...Array.from({ length: 101 }, (_, i) => feature({ id: String(i) }))),
])('rejects malformed saved recipe %#', (value) => {
  expect(worktopMachiningError(value)).toBeTypeOf('string')
})
it('requires eligible manual boards and valid finite board dimensions', () => {
  for (const patch of [
    { driven: true },
    { role: 'top' },
    { frontPull: {} },
    { finishing: { draft: { kind: 'left-end' } } },
  ])
    expect(worktopMachiningEligible({ ...worktopBoard(), ...patch } as BoardPart)).toBe(false)
  for (const patch of [{ length: Infinity }, { width: 0 }, { thickness: 0.1 }])
    expect(() =>
      resolveWorktopFeatures({ ...worktopBoard(), ...patch }, recipe(feature())),
    ).toThrow('dimensions')
  expect(() =>
    resolveWorktopFeatures({ ...worktopBoard(), driven: true }, recipe(feature())),
  ).toThrow('manual')
})
it('applies by stable board/feature IDs and preserves unrelated manufacturing data', () => {
  const s = worktopScene(),
    p = s.parts[0] as BoardPart
  p.cuts = [{ kind: 'mitre', id: 'manual', label: 'Trim', end: '+X', axis: 'Z', angle: 10 }]
  p.edgeBanding = { x0: null }
  p.visible = false
  const before = JSON.stringify(s),
    request = previewWorktopMachining(s, 'top', recipe(feature()))
  expect(request.errors).toEqual([])
  expect(JSON.stringify(s)).toBe(before)
  const next = acceptWorktopMachining(s, request)!,
    actual = next.parts[0] as BoardPart
  expect(actual).toMatchObject({ id: 'top', visible: false, edgeBanding: { x0: null } })
  expect(actual.cuts[0]).toEqual(p.cuts[0])
  expect(worktopCutOwned(actual, 'wm_f')).toBe(true)
  const edit = previewWorktopMachining(next, 'top', recipe(feature({ x: 50 })))
  expect((acceptWorktopMachining(next, edit)!.parts[0] as BoardPart).cuts[1]).toMatchObject({
    id: 'wm_f',
    position: { x: 550 },
  })
})
it('rebuilds supplied candidates, rejects stale/no-op/invalid requests and missing targets', () => {
  const s = worktopScene(),
    p = preview()
  p.part!.length = 9999
  expect(acceptWorktopMachining(s, p)?.parts[0].length).toBe(1200)
  const next = acceptWorktopMachining(s, preview())!
  const noOp = previewWorktopMachining(next, 'top', recipe(feature()))
  expect(noOp.changed).toBe(false)
  expect(acceptWorktopMachining(next, { ...noOp, changed: true })).toBeNull()
  for (const patch of [
    { changed: false },
    { part: null },
    { errors: ['bad'] },
    { signature: 'old' },
  ])
    expect(acceptWorktopMachining(s, { ...preview(), ...patch })).toBeNull()
  expect(
    acceptWorktopMachining(
      { ...s, materials: { ...s.materials, Other: { thickness: 20 } } },
      preview(),
    ),
  ).toBeNull()
  expect(previewWorktopMachining(s, 'missing', recipe(feature())).errors.join()).toContain(
    'available',
  )
  expect(
    acceptWorktopMachining(s, { ...preview(), recipe: recipe(feature({ x: 99999 })) }),
  ).toBeNull()
})
it('rejects cut ID collisions and cannot capture joint/component cuts', () => {
  for (const owner of [{}, { sourceJointId: 'joint' }, { sourceComponentId: 'cab' }]) {
    const s = worktopScene(),
      p = s.parts[0] as BoardPart
    p.cuts = [
      {
        kind: 'box',
        id: 'wm_f',
        label: 'Other cut',
        face: '+Z',
        position: { x: 0, y: 0, z: 0 },
        size: { x: 5, y: 5, z: 5 },
        ...owner,
      },
    ]
    if (Object.keys(owner).length) p.worktopMachining = recipe(feature())
    expect(previewWorktopMachining(s, 'top', recipe(feature())).errors.join()).toContain(
      'conflicts',
    )
  }
})
it('follows thickness/edge references, omits invalid resized cuts and restores after repair', () => {
  const s = acceptWorktopMachining(worktopScene(), preview(feature({ xRef: 'right', x: 150 })))!
  const p = s.parts[0] as BoardPart
  p.length = 1400
  p.thickness = 40
  const next = regenerateWorktopMachining(s),
    cut = next.parts[0].cuts[0]
  expect(cut).toMatchObject({ position: { x: 1150, z: 0 }, size: { z: 40 } })
  p.width = 100
  const invalid = regenerateWorktopMachining(s)
  expect(invalid.parts[0].cuts).toEqual([])
  expect((invalid.parts[0] as BoardPart).worktopMachining).toBeDefined()
  p.width = 600
  expect(regenerateWorktopMachining(s).parts[0].cuts).toHaveLength(1)
})
it('removes saved features and their cuts without stripping unrelated machining', () => {
  const s = acceptWorktopMachining(worktopScene(), preview())!,
    p = s.parts[0] as BoardPart
  p.cuts.push({ kind: 'mitre', id: 'manual', label: 'Trim', end: '+X', axis: 'Z', angle: 10 })
  const next = acceptWorktopMachining(s, previewWorktopMachining(s, 'top', recipe()))!
  expect(next.parts[0].cuts.map((c) => c.id)).toEqual(['manual'])
  expect((next.parts[0] as BoardPart).worktopMachining).toBeUndefined()
})
const envelope = (scene = worktopScene()): ZimmuFile => ({
  version: FILE_FORMAT_VERSION,
  name: 'Worktop',
  units: 'mm',
  appVersion: '0.0.0',
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
  camera: { position: { x: 100, y: 200, z: 300 }, target: { x: 0, y: 0, z: 0 } },
  scene,
})
it('round-trips recipes and emits drawing, nesting and cutting records', () => {
  const s = acceptWorktopMachining(worktopScene(), preview())!,
    file = parseFile(JSON.stringify(envelope(s))),
    p = file.scene.parts[0] as BoardPart
  expect(p.worktopMachining).toEqual((s.parts[0] as BoardPart).worktopMachining)
  expect(p.cuts).toHaveLength(1)
  expect(buildSvg(buildDrawingSheets([p], 'Worktop')[1])).toContain('200')
  expect(manufacturingParts([p], s.materials, s.components)[0]).toMatchObject({
    nesting: { cuts: p.cuts },
  })
  expect(buildCsv([p], s.materials, s.components)).toContain('Kitchen worktop')
})
it.each([validateCurrentFile, validateLegacyFileInput])(
  'validates both file boundaries',
  (validate) => {
    const file = envelope(acceptWorktopMachining(worktopScene(), preview())!)
    expect(() => validate(file)).not.toThrow()
    const p = file.scene.parts[0] as BoardPart
    p.worktopMachining = { version: 2 } as never
    expect(() => validate(file)).toThrow('worktopMachining')
    p.worktopMachining = recipe(feature())
    p.driven = true
    expect(() => validate(file)).toThrow('manual')
  },
)
it.each([
  { xRef: 'left', x: 99 },
  { xRef: 'right', x: 99 },
  { yRef: 'front', y: 74 },
  { yRef: 'rear', y: 74 },
] as Partial<WorktopFeature>[])('checks each board edge independently: %j', (patch) => {
  const row = resolve(feature({ ...patch, clearance: 0 }))
  expect(row.errors).toContain('Feature violates the minimum edge clearance.')
  expect(row.cut).toBeNull()
})
it('explains overflowing resolved coordinates before creating geometry', () => {
  expect(resolve(feature({ x: Number.MAX_VALUE, length: Number.MAX_VALUE })).errors).toContain(
    'Resolved geometry must be finite.',
  )
})
it('rejects invalid schemas at the geometry boundary', () => {
  expect(() =>
    resolveWorktopFeatures(worktopBoard(), { version: 2, features: [] } as never),
  ).toThrow('version')
})
it('retains unrelated joint/component machining even when its ID conflicts with a recipe', () => {
  const s = worktopScene(),
    p = s.parts[0] as BoardPart
  p.worktopMachining = recipe(feature())
  p.cuts = [
    {
      kind: 'box',
      id: 'wm_f',
      label: 'Joint',
      face: '+Z',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 5, y: 5, z: 5 },
      sourceJointId: 'joint',
    },
  ]
  expect(regenerateWorktopMachining(s).parts[0]).toBe(p)
})
it.each([validateCurrentFile, validateLegacyFileInput])(
  'rejects role and pull ownership conflicts at either file boundary',
  (validate) => {
    const file = envelope(acceptWorktopMachining(worktopScene(), preview())!),
      p = file.scene.parts[0] as BoardPart
    p.role = 'top'
    expect(() => validate(file)).toThrow('manual')
    delete p.role
    p.frontPull = {} as never
    expect(() => validate(file)).toThrow('manual')
  },
)

it.each(['through', 'blind'] as const)(
  'exports circular %s machining as assessed drilling',
  (mode) => {
    const scene = acceptWorktopMachining(
      worktopScene(),
      preview(feature({ shape: 'circle', mode, depth: 12 })),
    )!
    const schedule = buildMachiningSchedule(
      manufacturingParts(scene.parts, scene.materials, scene.components),
    )
    expect(schedule.entries).toHaveLength(1)
    expect(schedule.entries[0]).toMatchObject({
      category: 'geometric-drilling',
      depthMode: mode,
      operation: { id: 'wm_f', diameter: 35, count: 1 },
    })
    expect(buildMachiningCsv(schedule)).toContain('wm_f')
  },
)

it('rejects a through-opening that removes the entire board', () => {
  const row = resolve(feature({ length: 1200, width: 600, clearance: 0 }))
  expect(row.errors.join()).toContain('positive volume')
  expect(row.cut).toBeNull()
})
it('rejects tangent through-features that collectively remove the entire board', () => {
  const rows = resolveWorktopFeatures(
    worktopBoard(),
    recipe(
      feature({ length: 600, width: 600, x: -300, clearance: 0 }),
      feature({ id: 'other', length: 600, width: 600, x: 300, clearance: 0 }),
    ),
  )
  expect(rows.every((r) => r.errors.some((e) => e.includes('positive volume')))).toBe(true)
  expect(rows.every((r) => r.cut === null)).toBe(true)
})
