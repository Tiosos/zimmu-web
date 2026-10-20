import { expect, it } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
import { buildDrawingSheets } from '../geom/drawing'
import { buildSvg } from '../ui/buildSvg'
import { PRESET_MATERIALS, DEFAULT_FRAME } from './carcasePresets'
import { defaultInterior } from './sectionInterior'
import { applyPipeline } from './pipeline'
import { defaultPull, pullHardwareKey, type PullSpec } from './pullPattern'
import { acceptPulls, previewPulls, pullIssues, pullTargets, stagePull } from './pullLayout'
import { frontsSignature } from './frontsDrawers'
import { finishingSignature } from './finishingPanels'
import { manufacturingParts } from './manufacturingPart'
import { carcaseHardware } from './carcaseHardware'
import { groupHardware } from '../ui/groupHardware'
import { buildHardwareCsv } from '../ui/buildCsv'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import type { BoardPart, CarcaseComponent, Scene, ZimmuFile } from './types'
const sceneOf = (leaves: 1 | 2 = 1): Scene =>
  applyPipeline({
    components: [
      {
        ...cabinet,
        id: 'cab',
        params: {
          ...cabinet.params,
          frontReveal: 2,
          section: {
            ...cabinet.params.section,
            front: { kind: 'door', leaves, hinge: 'left' },
            interior: defaultInterior(0),
          },
        },
      },
    ],
    parts: [],
    joints: [],
    hardware: [],
    materials: PRESET_MATERIALS,
  })
const ids = (s: Scene) => pullTargets(s, 'cab').map((t) => t.id)
const apply = (s: Scene, setting: PullSpec | null = defaultPull(), selected = ids(s)) =>
  acceptPulls(s, previewPulls(s, 'cab', stagePull(s, 'cab', {}, selected, setting)))!
const resize = (s: Scene, patch = { width: 800, height: 900 }) =>
  applyPipeline({
    ...s,
    components: s.components.map((c) =>
      c.kind === 'carcase' ? { ...c, params: { ...c.params, ...patch } } : c,
    ),
  })
const fileOf = (scene: Scene): ZimmuFile => ({
  version: FILE_FORMAT_VERSION,
  name: 'Pulls',
  units: 'mm',
  appVersion: '0.0.0',
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
  camera: { position: { x: 100, y: 200, z: 300 }, target: { x: 0, y: 0, z: 0 } },
  scene,
})
it('builds actual through holes, preserves board IDs and derives one handle rather than two screws', () => {
  const s = sceneOf(),
    before = ids(s),
    next = apply(s),
    target = pullTargets(next, 'cab')[0]
  expect(ids(next)).toEqual(before)
  const cut = target.part.cuts.find((c) => c.id.startsWith('pull_'))!
  expect(cut).toMatchObject({ kind: 'hole-array', count: 2, depth: 18, sourceComponentId: 'cab' })
  expect(carcaseHardware(next).find((h) => h.key === pullHardwareKey(defaultPull()))?.qty).toBe(1)
  expect(carcaseHardware(next).filter((h) => !h.key.startsWith('pull-'))).toEqual(
    carcaseHardware(s),
  )
  expect(pullTargets(s, 'cab')[0].part.frontPull).toBeUndefined()
  expect(applyPipeline(next)).toEqual(next)
})
it('selects paired leaves independently and mirrors free edges through rotated cabinet space', () => {
  let s = sceneOf(2)
  s = {
    ...s,
    components: s.components.map((c) => ({
      ...c,
      position: { x: 200, y: 300, z: 400 },
      rotation: { x: 0, y: 0, z: 90 },
    })),
  }
  expect(ids(s)).toHaveLength(2)
  const firstOnly = apply(s, defaultPull(), [ids(s)[0]])
  expect(carcaseHardware(firstOnly).find((h) => h.key.startsWith('pull-'))?.qty).toBe(1)
  const next = apply(firstOnly),
    targets = pullTargets(next, 'cab')
  const ys = targets.map((t) => {
    const cut = t.part.cuts.find((c) => c.kind === 'hole-array' && c.id.startsWith('pull_'))!
    if (cut.kind !== 'hole-array') throw Error('expected bore')
    return applyMatrixToPoint(
      resolveWorldMatrix(t.part, new Map(next.components.map((c) => [c.id, c]))),
      cut.start.x,
      cut.start.y,
      cut.start.z,
    )[1]
  })
  expect(ys[1] - ys[0]).toBeCloseTo(102)
  expect(carcaseHardware(next).find((h) => h.key.startsWith('pull-'))?.qty).toBe(2)
})
it('follows resized front dimensions and omits invalid patterns while preserving repairable settings', () => {
  const s = apply(sceneOf()),
    next = resize(s),
    target = pullTargets(next, 'cab')[0]
  const cut = target.part.cuts.find((c) => c.kind === 'hole-array' && c.id.startsWith('pull_'))!
  expect(cut.kind === 'hole-array' && cut.start.y).toBe(target.part.width - 50)
  const tooNarrow = resize(s, { width: 40, height: 900 }),
    invalid = pullTargets(tooNarrow, 'cab')[0]
  expect(invalid.part.frontPull).toEqual(defaultPull())
  expect(invalid.part.cuts.some((c) => c.id.startsWith('pull_'))).toBe(false)
  expect(pullIssues(invalid).join()).toContain('inside')
  expect(carcaseHardware(tooNarrow).some((h) => h.key.startsWith('pull-'))).toBe(false)
  expect(pullIssues(pullTargets(resize(tooNarrow), 'cab')[0])).toEqual([])
})
it('supports drawer fronts and independent framed leaves while excluding cover and false fronts', () => {
  const drawer = sceneOf()
  drawer.components = drawer.components.map((c) =>
    c.kind === 'carcase'
      ? {
          ...c,
          params: {
            ...c.params,
            section: { ...c.params.section, front: { kind: 'drawer-front' } },
          },
        }
      : c,
  )
  const ds = applyPipeline(drawer)
  const setting = {
    ...defaultPull(),
    orientation: 'horizontal' as const,
    horizontalOffset: 0,
    vertical: 'center' as const,
    verticalOffset: 0,
  }
  const next = apply(ds, setting)
  expect(pullTargets(next, 'cab')[0].kind).toBe('drawer-front')
  expect(pullIssues(pullTargets(next, 'cab')[0])).toEqual([])
  for (const kind of ['panel', 'false-front'] as const) {
    const changed = applyPipeline({
      ...next,
      components: next.components.map((c) =>
        c.kind === 'carcase'
          ? { ...c, params: { ...c.params, section: { ...c.params.section, front: { kind } } } }
          : c,
      ),
    })
    expect(pullTargets(changed, 'cab')).toEqual([])
    expect(changed.parts.some((p) => p.kind === 'board' && p.frontPull)).toBe(false)
    expect(carcaseHardware(changed).some((h) => h.key.startsWith('pull-'))).toBe(false)
  }
  const framed = sceneOf(2)
  framed.components = framed.components.map((c) =>
    c.kind === 'carcase'
      ? {
          ...c,
          params: { ...c.params, frameMaterial: c.params.carcaseMaterial, frame: DEFAULT_FRAME },
        }
      : c,
  )
  const fs = applyPipeline(framed)
  expect(ids(fs)).toHaveLength(2)
  expect(previewPulls(fs, 'cab', stagePull(fs, 'cab', {}, ids(fs), defaultPull())).errors).toEqual(
    [],
  )
})
it('copies staged settings, rejects missing/duplicate/locked fronts and validates settings again at preview', () => {
  const s = sceneOf(),
    setting = defaultPull(),
    draft = stagePull(s, 'cab', {}, ids(s), setting)
  setting.pitch = 5000
  expect(draft[ids(s)[0]]?.pitch).toBe(96)
  for (const selected of [[], ['missing'], [ids(s)[0], ids(s)[0]]])
    expect(() => stagePull(s, 'cab', {}, selected, defaultPull())).toThrow()
  expect(() => stagePull(s, 'cab', {}, ['missing'], defaultPull())).toThrow('no longer available')
  const detached = {
    ...s,
    parts: s.parts.map((p) => (p.id === ids(s)[0] ? { ...p, driven: false } : p)),
  }
  expect(pullTargets(detached, 'cab')[0].locked).toBe(true)
  expect(() => stagePull(detached, 'cab', {}, ids(s), defaultPull())).toThrow('Detached')
  expect(() => stagePull(s, 'cab', {}, ids(s), { ...defaultPull(), pitch: 0 })).toThrow('positive')
  expect(
    previewPulls(s, 'cab', { [ids(s)[0]]: { ...defaultPull(), diameter: -1 } }).errors.join(),
  ).toContain('positive')
  expect(previewPulls(s, 'missing', {}).errors.length).toBeGreaterThan(0)
})
it('rejects invalid and stale previews, ignores forged geometry, and preserves unrelated current metadata', () => {
  const s = sceneOf(),
    draft = stagePull(s, 'cab', {}, ids(s), defaultPull()),
    p = previewPulls(s, 'cab', draft)
  expect(acceptPulls(resize(s), p)).toBeNull()
  expect(acceptPulls(s, { ...p, changed: false })).toBeNull()
  expect(acceptPulls(s, { ...p, errors: ['invalid'] })).toBeNull()
  expect(
    acceptPulls(s, { ...p, draft: { [ids(s)[0]]: { ...defaultPull(), pitch: 9999 } } }),
  ).toBeNull()
  const current = { ...s, hardware: [{ id: 'manual-item' }] as Scene['hardware'] }
  const next = acceptPulls(current, { ...p, scene: { ...s, parts: [] } })!
  expect(next.hardware).toBe(current.hardware)
  expect(pullTargets(next, 'cab')[0].part.cuts.some((c) => c.id.startsWith('pull_'))).toBe(true)
  const edited = {
    ...next,
    parts: next.parts.map((p) =>
      p.kind === 'board' && p.frontPull ? { ...p, frontPull: { ...p.frontPull, diameter: 6 } } : p,
    ),
  }
  expect(frontsSignature(edited)).not.toBe(frontsSignature(next))
  expect(finishingSignature(edited)).not.toBe(finishingSignature(next))
})
it('stages removal, rejects no-ops and preserves unrelated machining, edges and instructions', () => {
  const s = sceneOf(),
    id = ids(s)[0]
  s.parts = s.parts.map((p) =>
    p.id === id
      ? ({
          ...p,
          cuts: [
            ...p.cuts,
            {
              kind: 'hole-array',
              id: 'manual',
              label: 'Manual hole',
              face: '+Z',
              axis: 'U',
              start: { x: 20, y: 20, z: 18 },
              pitch: 1,
              count: 1,
              diameter: 2,
              depth: 5,
            },
          ],
          edgeBanding: { x0: null },
          operations: [
            {
              kind: 'manual-machining',
              id: 'instruction',
              label: 'Jig pilot',
              hardwareKey: 'manual',
              face: '+Z',
              at: { x: 20, y: 20, z: 18 },
              diameter: 3,
              pitch: 1,
              count: 1,
              angle: 15,
              edgeOffset: 20,
              template: 'jig',
              instruction: 'Use jig',
            },
          ],
        } as BoardPart)
      : p,
  )
  const next = apply(s)
  const part = pullTargets(next, 'cab')[0].part
  expect(part.cuts.some((c) => c.id === 'manual')).toBe(true)
  expect(part.edgeBanding).toEqual({ x0: null })
  expect(part.operations?.map((op) => op.id)).toEqual(['instruction'])
  const noOp = previewPulls(next, 'cab', stagePull(next, 'cab', {}, ids(next), defaultPull()))
  expect(noOp.changed).toBe(false)
  expect(acceptPulls(next, noOp)).toBeNull()
  expect(acceptPulls(s, previewPulls(s, 'cab', {}))).toBeNull()
  const removed = apply(next, null)
  expect(pullTargets(removed, 'cab')[0].part.frontPull).toBeUndefined()
  expect(pullTargets(removed, 'cab')[0].part.cuts.some((c) => c.id.startsWith('pull_'))).toBe(false)
  expect(carcaseHardware(removed).some((h) => h.key.startsWith('pull-'))).toBe(false)
})
it('roundtrips v30 settings, validates both file boundaries and retains legacy boards without pulls', () => {
  const s = apply(sceneOf()),
    loaded = parseFile(JSON.stringify(fileOf(s)))
  expect(pullTargets(loaded.scene, 'cab')[0].part.frontPull).toEqual(defaultPull())
  expect(carcaseHardware(applyPipeline(loaded.scene))).toEqual(carcaseHardware(s))
  for (const value of [
    null,
    [],
    { ...defaultPull(), version: 2 },
    { ...defaultPull(), diameter: '5' },
  ]) {
    const bad = fileOf({
      ...s,
      parts: s.parts.map((p) =>
        p.kind === 'board' && p.frontPull ? { ...p, frontPull: value } : p,
      ),
    } as Scene)
    expect(() => validateLegacyFileInput(bad)).toThrow('frontPull')
    expect(() => validateCurrentFile(bad)).toThrow('frontPull')
    expect(() => parseFile(JSON.stringify(bad))).toThrow('frontPull')
  }
  const old = parseFile(JSON.stringify({ ...fileOf(sceneOf()), version: 29 }))
  expect(old.scene.parts.some((p) => p.kind === 'board' && p.frontPull)).toBe(false)
})
it('prices dimension-specific generic items, exports quantities and emits drawing bores', () => {
  const s = apply(sceneOf()),
    lines = carcaseHardware(s),
    key = pullHardwareKey(defaultPull())
  const rows = groupHardware(lines, {
    [key]: { supplier: 'Shop', partNumber: 'Pull96', unitCost: 4.5 },
  })
  expect(rows.find((r) => r.key === key)).toMatchObject({
    qty: 1,
    unit: 'pcs',
    totalCost: 4.5,
    supplier: 'Shop',
  })
  expect(buildHardwareCsv([], rows)).toContain('96 mm bar pull')
  const target = pullTargets(s, 'cab')[0],
    svg = buildSvg(buildDrawingSheets([target.part], 'Pulls')[1])
  expect(svg).toContain('Drilling [pull_')
  expect(svg).toContain('DIA 5; depth 18 mm')
  expect(svg).toContain('pitch 96 mm along U')
  const record = manufacturingParts([target.part], s.materials, s.components)[0]
  expect(record.kind).toBe('board')
  if (record.kind === 'board')
    expect(record.nesting.cuts.some((c) => c.id.startsWith('pull_'))).toBe(true)
  const noDrilling = {
    ...s,
    parts: s.parts.map((p) =>
      p.kind === 'board' && p.id === target.id
        ? { ...p, cuts: p.cuts.filter((c) => !c.id.startsWith('pull_')) }
        : p,
    ),
  }
  expect(carcaseHardware(noDrilling).some((h) => h.key === key)).toBe(false)
})

it('counts only complete emitted fixing patterns and deduplicates matching arrays', () => {
  const s = apply(sceneOf()),
    t = pullTargets(s, 'cab')[0],
    key = pullHardwareKey(defaultPull())
  const cut = t.part.cuts.find((c) => c.kind === 'hole-array' && c.id.startsWith('pull_'))!
  const replace = (patch: object) => ({
    ...s,
    parts: s.parts.map((p) =>
      p.kind === 'board' && p.id === t.id
        ? ({
            ...p,
            cuts: p.cuts.map((c) => (c.id === cut.id ? { ...c, ...patch } : c)),
          } as BoardPart)
        : p,
    ),
  })
  for (const patch of [
    { count: 1 },
    { diameter: 6 },
    { face: '-Z' },
    { depth: 12 },
    { pitch: 128 },
    { axis: 'V' },
  ])
    expect(carcaseHardware(replace(patch)).some((h) => h.key === key)).toBe(false)
  const duplicate = {
    ...s,
    parts: s.parts.map((p) =>
      p.kind === 'board' && p.id === t.id
        ? { ...p, cuts: [...p.cuts, { ...cut, id: 'pull_duplicate' }] }
        : p,
    ),
  }
  expect(carcaseHardware(duplicate).find((h) => h.key === key)?.qty).toBe(1)
  const malformed = {
    ...s,
    parts: s.parts.map((p) =>
      p.kind === 'board' && p.frontPull ? { ...p, frontPull: { ...p.frontPull, diameter: -1 } } : p,
    ),
  }
  expect(carcaseHardware(malformed).some((h) => h.key.startsWith('pull-'))).toBe(false)
})
it('retains independent face-frame opening identity and rejects invalid current role ownership', () => {
  const s = sceneOf(),
    original = s.components[0] as CarcaseComponent,
    sectionId = original.params.section.id
  const framed = applyPipeline({
    ...s,
    components: [
      {
        ...original,
        params: {
          ...original.params,
          frameMaterial: original.params.carcaseMaterial,
          frame: {
            ...DEFAULT_FRAME,
            layout: {
              [sectionId]: {
                id: 'fr-root',
                size: { kind: 'equal' },
                content: {
                  kind: 'split',
                  axis: 'vertical',
                  children: [
                    {
                      id: 'fr-left',
                      size: { kind: 'equal' },
                      content: { kind: 'leaf' },
                      front: { kind: 'door', leaves: 1, hinge: 'left' },
                    },
                    {
                      id: 'fr-right',
                      size: { kind: 'equal' },
                      content: { kind: 'leaf' },
                      front: { kind: 'door', leaves: 1, hinge: 'right' },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  })
  expect(ids(framed)).toHaveLength(2)
  const configured = apply(framed, { ...defaultPull(), kind: 'knob' })
  expect(carcaseHardware(configured).find((h) => h.key === 'pull-knob-d5')?.qty).toBe(2)
  const front = pullTargets(s, 'cab')[0].part
  const duplicateRole = { ...s, parts: [...s.parts, { ...front, id: 'duplicate-role' }] }
  const p = previewPulls(duplicateRole, 'cab', { [front.id]: defaultPull() })
  expect(p.errors.join()).toContain('proposed front is unavailable')
})

it('rejects forged no-op acceptance and compares settings independently of property order', () => {
  const s = apply(sceneOf()),
    id = ids(s)[0]
  const reordered = Object.fromEntries(
    Object.entries(defaultPull()).reverse(),
  ) as unknown as PullSpec
  const p = previewPulls(s, 'cab', { [id]: reordered })
  expect(p.changed).toBe(false)
  expect(acceptPulls(s, { ...p, changed: true })).toBeNull()
  const empty = previewPulls(s, 'cab', {})
  expect(empty.errors).toEqual([])
  expect(empty.scene).toBe(s)
})

it('edits existing pull dimensions without changing front IDs or retaining the previous hardware item', () => {
  const s = apply(sceneOf()),
    next = apply(s, { ...defaultPull(), pitch: 128, diameter: 4 })
  expect(ids(next)).toEqual(ids(s))
  expect(carcaseHardware(next).find((h) => h.key === 'pull-bar-p128-d4')?.qty).toBe(1)
  expect(carcaseHardware(next).some((h) => h.key === 'pull-bar-p96-d5')).toBe(false)
})
