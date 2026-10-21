import { cupRow } from './frontMachining'
import { expect, it } from 'vitest'
import { motionScene } from './__fixtures__/motion'
import { defaultHingeLayout, hingeLayoutError, hingeLayoutRow } from './hingeLayout'
import {
  acceptMotion,
  emptyMotionDraft,
  motionDoors,
  motionDrawers,
  motionDrawer,
  motionDoorIssues,
  previewMotion,
  stageHinges,
  stageMotionDrawer,
} from './motionHardware'
import { applyPipeline } from './pipeline'
import { carcaseHardware } from './carcaseHardware'
import { defaultPull } from './pullPattern'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import { buildDrawingSheets } from '../geom/drawing'
import { buildSvg } from '../ui/buildSvg'
import { manufacturingParts } from './manufacturingPart'
import { buildMachiningSchedule } from './machiningSchedule'
import type {
  BoardPart,
  CarcaseComponent,
  DrawerComponent,
  HoleArrayCut,
  Scene,
  ZimmuFile,
} from './types'
const layout = () => ({
  ...defaultHingeLayout(),
  countMode: 'manual' as const,
  count: 3,
  insetMode: 'manual' as const,
  endInset: 75,
})
const staged = (s = motionScene()) =>
  stageHinges(
    s,
    'cab',
    emptyMotionDraft(),
    motionDoors(s, 'cab').map((t) => t.id),
    layout(),
  )
const preview = (s = motionScene()) => previewMotion(s, 'cab', staged(s))
const added = (s = motionScene()) => acceptMotion(s, preview(s))!
const door = (s: Scene) => motionDoors(s, 'cab')[0].part
const cups = (p: BoardPart) =>
  p.cuts.find((c): c is HoleArrayCut => c.kind === 'hole-array' && c.id.startsWith('cups_'))
it('stages symmetric cups and matching mounting plates with actual hinge quantities', () => {
  const s = motionScene(),
    before = JSON.stringify(s),
    p = preview(s)
  expect(p.errors).toEqual([])
  expect(p.changed).toBe(true)
  expect(JSON.stringify(s)).toBe(before)
  const front = door(p.scene!),
    row = cups(front)!
  expect(row).toMatchObject({ count: 3, start: { x: 75 }, diameter: 35, depth: 12.5 })
  expect(row.pitch).toBeCloseTo((front.length - 150) / 2)
  const plateBoard = p.scene!.parts.find(
    (p): p is BoardPart =>
      p.kind === 'board' && p.cuts.some((c) => c.id === `plate_${front.role}_0`),
  )!
  const rows = plateBoard.cuts.filter(
    (c): c is HoleArrayCut => c.kind === 'hole-array' && c.id.startsWith(`plate_${front.role}_`),
  )
  expect(rows).toHaveLength(3)
  rows.forEach((c, i) =>
    expect(c.start.y + plateBoard.position.z).toBeCloseTo(front.position.z + 75 + row.pitch * i),
  )
  expect(p.hardware.some((r) => r.after - r.before === 1)).toBe(true)
  expect(
    carcaseHardware(p.scene!)
      .filter((r) => r.key.startsWith('hinge'))
      .reduce((n, r) => n + r.qty, 0),
  ).toBe(3)
})
it('sets paired leaves independently and supports multi-leaf selection', () => {
  const s = motionScene('pair'),
    targets = motionDoors(s, 'cab')
  expect(targets).toHaveLength(2)
  const d = stageHinges(s, 'cab', emptyMotionDraft(), [targets[0].id], layout()),
    p = previewMotion(s, 'cab', d)
  expect(p.errors).toEqual([])
  expect(motionDoors(p.scene!, 'cab').map((t) => cups(t.part)?.count)).toEqual([3, 2])
  const both = previewMotion(s, 'cab', staged(s))
  expect(both.errors).toEqual([])
  expect(motionDoors(both.scene!, 'cab').map((t) => cups(t.part)?.count)).toEqual([3, 3])
})
it.each([
  null,
  [],
  {},
  { version: 2 },
  { ...layout(), countMode: 'bad' },
  { ...layout(), insetMode: 'bad' },
  { ...layout(), count: 1 },
  { ...layout(), count: 9 },
  { ...layout(), count: 2.5 },
  { ...layout(), endInset: 0 },
  { ...layout(), endInset: Infinity },
])('rejects malformed hinge layout %#', (value) => {
  expect(hingeLayoutError(value)).toBeTypeOf('string')
})
it.each([{ endInset: 10 }, { endInset: 500 }, { count: 8, endInset: 300 }])(
  'rejects cups outside edges or overlapping: %j',
  (patch) => {
    const s = motionScene(),
      d = stageHinges(s, 'cab', emptyMotionDraft(), [door(s).id], { ...layout(), ...patch })
    expect(previewMotion(s, 'cab', d).errors.join()).toContain('fit')
    expect(hingeLayoutRow(700, { ...layout(), ...patch }, 2)).toBeNull()
  },
)
it('keeps automatic defaults and restores the original pattern', () => {
  const s = motionScene(),
    next = acceptMotion(s, preview(s))!
  const reset = previewMotion(
    next,
    'cab',
    stageHinges(next, 'cab', emptyMotionDraft(), [door(next).id], null),
  )
  expect(reset.errors).toEqual([])
  expect(cups(door(reset.scene!))).toEqual(cups(door(s)))
  expect(door(reset.scene!).hingeLayout).toBeUndefined()
  expect(hingeLayoutRow(700, defaultHingeLayout(), 2)).toEqual({ first: 100, pitch: 500, count: 2 })
  expect(hingeLayoutRow(Infinity, layout(), 2)).toBeNull()
})
it('requires valid, distinct, driven door targets and frameless applications', () => {
  const s = motionScene(),
    id = door(s).id
  for (const ids of [[], [id, id], ['missing']])
    expect(() => stageHinges(s, 'cab', emptyMotionDraft(), ids, layout())).toThrow()
  expect(() => stageHinges(s, 'missing', emptyMotionDraft(), [id], layout())).toThrow('cabinet')
  door(s).driven = false
  expect(() => stageHinges(s, 'cab', emptyMotionDraft(), [id], layout())).toThrow('detached')
  const frame = motionScene('door', true)
  expect(motionDoorIssues(frame, 'cab', motionDoors(frame, 'cab')[0]).join()).toContain(
    'Face-frame',
  )
  expect(() => stageHinges(frame, 'cab', emptyMotionDraft(), [door(frame).id], layout())).toThrow(
    'frameless',
  )
})
it('drops custom layouts when a front becomes a panel or the cabinet becomes framed', () => {
  const s = added(),
    cab = s.components[0] as CarcaseComponent
  cab.params.frame = structuredClone(
    (motionScene('door', true).components[0] as CarcaseComponent).params.frame,
  )
  expect(door(applyPipeline(s)).hingeLayout).toBeUndefined()
  const other = added(),
    c = other.components[0] as CarcaseComponent
  c.params.section.front = { kind: 'panel' }
  expect(
    applyPipeline(other)
      .parts.filter((p) => p.kind === 'board' && p.role?.startsWith('front-'))
      .every((p) => p.kind === 'board' && !p.hingeLayout),
  ).toBe(true)
})
it('follows resizing and omits invalid cup/plate rows while retaining settings for repair', () => {
  const s = added(),
    cab = s.components[0] as CarcaseComponent
  cab.params.height = 1000
  const resized = applyPipeline(s),
    front = door(resized)
  expect(cups(front)?.count).toBe(3)
  expect(cups(front)?.pitch).toBeCloseTo((front.length - 150) / 2)
  cab.params.height = 180
  const invalid = applyPipeline(s),
    short = door(invalid)
  expect(short.hingeLayout).toBeDefined()
  expect(cups(short)).toBeUndefined()
  expect(
    invalid.parts
      .flatMap((p) => (p.kind === 'board' ? p.cuts : []))
      .some((c) => c.id.startsWith(`plate_${short.role}_`)),
  ).toBe(false)
  expect(motionDoorIssues(invalid, 'cab', motionDoors(invalid, 'cab')[0]).join()).toContain('fit')
})
it('refuses custom cups that invalidate saved pull drilling', () => {
  let s = motionScene()
  door(s).frontPull = {
    ...defaultPull(),
    kind: 'knob',
    horizontal: 'left',
    horizontalOffset: 22.5,
    vertical: 'bottom',
    verticalOffset: 75,
  }
  s = applyPipeline(s)
  expect(door(s).cuts.some((c) => c.id.startsWith('pull_'))).toBe(true)
  expect(preview(s).errors.join()).toContain('overlap')
})
it('shortens drawer boxes and quotes the same explicit runner nominal', () => {
  const s = motionScene('drawer'),
    t = motionDrawers(s, 'cab')[0]
  const d = stageMotionDrawer(s, 'cab', emptyMotionDraft(), [t.id], {
      kind: 'nominal',
      value: '400',
    }),
    p = previewMotion(s, 'cab', d)
  expect(p.errors).toEqual([])
  const drawer = motionDrawer(p.scene!, 'cab', t)!
  expect(drawer.params.nominal).toBe(400)
  const side = p.scene!.parts.find((p) => p.parentId === drawer.id && p.role === 'box-left')!
  expect(side.length).toBe(400)
  const rows = p
    .scene!.parts.flatMap((p) => (p.kind === 'board' ? p.cuts : []))
    .filter((c): c is HoleArrayCut => c.kind === 'hole-array' && c.id.startsWith('slide_'))
  expect(rows).toHaveLength(2)
  for (const row of rows)
    expect(row.start.x + (row.count - 1) * row.pitch + row.diameter / 2).toBeLessThanOrEqual(400)
  expect(carcaseHardware(p.scene!).filter((r) => r.key.startsWith('runner-'))).toMatchObject([
    { key: 'runner-400', qty: 1 },
  ])
  expect(p.hardware.some((r) => r.key === 'runner-400' && r.after === 1)).toBe(true)
})
it.each(['999', 'NaN', '-1', '475', ''])('rejects unsupported runner nominal %s', (value) => {
  const s = motionScene('drawer'),
    id = motionDrawers(s, 'cab')[0].id
  expect(() =>
    stageMotionDrawer(s, 'cab', emptyMotionDraft(), [id], { kind: 'nominal', value }),
  ).toThrow()
})
it('rejects a supported nominal that cannot fit, without quoting or generating a box', () => {
  const s = motionScene('drawer'),
    t = motionDrawers(s, 'cab')[0],
    d = stageMotionDrawer(s, 'cab', emptyMotionDraft(), [t.id], { kind: 'nominal', value: '600' })
  expect(previewMotion(s, 'cab', d).errors.join()).toContain('fit')
  motionDrawer(s, 'cab', t)!.params.nominal = 600
  const invalid = applyPipeline(s)
  expect(carcaseHardware(invalid).filter((r) => r.key.startsWith('runner-'))).toEqual([])
  expect(invalid.parts.filter((p) => p.parentId === motionDrawer(invalid, 'cab', t)!.id)).toEqual(
    [],
  )
})
it('stages family, height, offset, material and auto defaults through existing drawer validation', () => {
  const s = motionScene('drawer'),
    ids = motionDrawers(s, 'cab').map((t) => t.id)
  let d = emptyMotionDraft()
  for (const action of [
    { kind: 'nominal', value: '350' },
    { kind: 'height', value: '100' },
    { kind: 'offset', value: '20' },
    { kind: 'material', value: '' },
  ] as const)
    d = stageMotionDrawer(s, 'cab', d, ids, action)
  const p = previewMotion(s, 'cab', d)
  expect(p.errors).toEqual([])
  expect(motionDrawer(p.scene!, 'cab', motionDrawers(p.scene!, 'cab')[0])?.params).toMatchObject({
    nominal: 350,
    boxHeight: 100,
    runnerOffset: 20,
  })
  d = stageMotionDrawer(s, 'cab', d, ids, { kind: 'family', value: 'undermount' })
  expect(previewMotion(s, 'cab', d).errors).toEqual([])
  expect(() => stageMotionDrawer(s, 'cab', d, ids, { kind: 'offset', value: '20' })).toThrow(
    'side-mount',
  )
  d = stageMotionDrawer(s, 'cab', d, ids, { kind: 'nominal', value: null })
  d = stageMotionDrawer(s, 'cab', d, ids, { kind: 'height', value: null })
  expect(previewMotion(s, 'cab', d).errors).toEqual([])
})
it('rebuilds acceptance, refuses stale/invalid/no-op previews and keeps stable IDs', () => {
  const s = motionScene(),
    p = preview(s),
    id = door(s).id
  expect(p.errors).toEqual([])
  door(p.scene!).label = 'Forged'
  const next = acceptMotion(s, p)!
  expect(door(next).id).toBe(id)
  expect(door(next).label).not.toBe('Forged')
  const noOp = previewMotion(next, 'cab', staged(next))
  expect(noOp.changed).toBe(false)
  expect(acceptMotion(next, { ...noOp, changed: true })).toBeNull()
  for (const patch of [
    { signature: 'old' },
    { errors: ['invalid'] },
    { scene: null },
    { changed: false },
  ])
    expect(acceptMotion(s, { ...preview(s), ...patch })).toBeNull()
  expect(
    acceptMotion({ ...s, materials: { ...s.materials, Other: { thickness: 30 } } }, preview(s)),
  ).toBeNull()
  const bad = preview(s)
  bad.draft.hinges[id] = { ...layout(), endInset: 1 }
  expect(acceptMotion(s, bad)).toBeNull()
})
const envelope = (scene: Scene): ZimmuFile => ({
  version: FILE_FORMAT_VERSION,
  name: 'Hardware',
  units: 'mm',
  appVersion: '0.0.0',
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
  camera: { position: { x: 100, y: 200, z: 300 }, target: { x: 0, y: 0, z: 0 } },
  scene,
})
it('persists hinge recipes and explicit nominals and exports the actual machining', () => {
  const s = added(),
    loaded = parseFile(JSON.stringify(envelope(s)))
  expect(door(loaded.scene).hingeLayout).toEqual(layout())
  const front = door(loaded.scene)
  expect(buildSvg(buildDrawingSheets([front], 'Hardware')[1])).toContain('35')
  expect(
    buildMachiningSchedule(manufacturingParts([front], s.materials, s.components)).entries.some(
      (e) => e.operation.id.startsWith('cups_'),
    ),
  ).toBe(true)
  const d = motionScene('drawer'),
    t = motionDrawers(d, 'cab')[0]
  const next = acceptMotion(
    d,
    previewMotion(
      d,
      'cab',
      stageMotionDrawer(d, 'cab', emptyMotionDraft(), [t.id], { kind: 'nominal', value: '400' }),
    ),
  )!
  expect(
    (
      parseFile(JSON.stringify(envelope(next))).scene.components.find(
        (c) => c.kind === 'drawer',
      ) as DrawerComponent
    ).params.nominal,
  ).toBe(400)
})
it.each([validateCurrentFile, validateLegacyFileInput])(
  'validates new fields at both file boundaries',
  (validate) => {
    const s = added(),
      file = envelope(s)
    expect(() => validate(file)).not.toThrow()
    door(s).hingeLayout = { version: 2 } as never
    expect(() => validate(file)).toThrow('hingeLayout')
    const d = motionScene('drawer'),
      f = envelope(d),
      row = d.components.find((c): c is DrawerComponent => c.kind === 'drawer')!
    row.params.nominal = 999
    expect(() => validate(f)).toThrow('nominal')
  },
)

it('automatic hinge metadata continues to use the height table after resizing', () => {
  const s = motionScene(),
    d = stageHinges(s, 'cab', emptyMotionDraft(), [door(s).id], defaultHingeLayout())
  const next = acceptMotion(s, previewMotion(s, 'cab', d))!
  const c = next.components[0] as CarcaseComponent
  c.params.height = 2000
  const resized = applyPipeline(next)
  expect(cups(door(resized))?.count).toBe(4)
  expect(
    carcaseHardware(resized)
      .filter((r) => r.key.startsWith('hinge'))
      .reduce((sum, r) => sum + r.qty, 0),
  ).toBe(4)
})

it('rejects custom cups on a front too narrow to contain their diameter', () => {
  expect(
    cupRow({ length: 700, width: 30, thickness: 18 }, 'left', 'front', undefined, layout()),
  ).toBeNull()
})
it('rejects a malformed recipe at the row boundary', () => {
  expect(hingeLayoutRow(700, { ...layout(), version: 2 } as never, 2)).toBeNull()
})
it('does not quote an explicit nominal incompatible with a stale emitted slide row', () => {
  const s = motionScene('drawer'),
    t = motionDrawers(s, 'cab')[0]
  motionDrawer(s, 'cab', t)!.params.nominal = 600
  expect(carcaseHardware(s).filter((r) => r.key.startsWith('runner-'))).toEqual([])
})
