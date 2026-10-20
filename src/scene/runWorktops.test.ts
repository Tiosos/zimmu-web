import { buildDrawingSheets } from '../geom/drawing'
import { buildSvg } from '../ui/buildSvg'
import { buildAssemblyViews } from '../geom/assembly'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'
import type { ZimmuFile } from './types'
import { expect, it } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
import { PRESET_MATERIALS } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { releaseEditedFinishing } from './finishingPanels'
import { runDraftError, runWorktopLinkError } from './runWorktopRecipe'
import {
  acceptRunWorktop,
  anchoredRunMembers,
  previewRunWorktop,
  regenerateRunWorktops,
  runWorktopDraft,
  runWorktopIssues,
} from './runWorktops'
import type { BoardPart, CarcaseComponent, Scene } from './types'
import { buildCsv } from '../ui/buildCsv'
import { manufacturingParts } from './manufacturingPart'
export const runScene = (): Scene =>
  regenerateComponents({
    components: [
      {
        ...cabinet,
        id: 'a',
        label: 'Left',
        params: { ...cabinet.params },
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
      {
        ...cabinet,
        id: 'b',
        label: 'Right',
        params: { ...cabinet.params },
        position: { x: 600, y: 0, z: 0 },
      },
    ],
    parts: [],
    materials: PRESET_MATERIALS,
    joints: [],
    hardware: [],
  })
const draftOf = (s: Scene) => ({ ...runWorktopDraft(s, 'a'), memberIds: ['a', 'b'] })
const preview = (s = runScene()) => previewRunWorktop(s, draftOf(s))
const added = (s = runScene()) => acceptRunWorktop(s, preview(s), 'top')!
const board = (s: Scene) => s.parts.find((p) => p.id === 'top') as BoardPart
const cab = (s: Scene, id = 'b') => s.components.find((c) => c.id === id) as CarcaseComponent
it('spans occupied bounds, overhangs and vertical gap with one ordinary board', () => {
  const s = runScene(),
    before = JSON.stringify(s)
  const p = previewRunWorktop(s, {
    ...draftOf(s),
    left: '10',
    right: '20',
    front: '30',
    rear: '40',
    bottom: '5',
  })
  expect(p.errors).toEqual([])
  expect(p.bounds).toEqual({ x0: -10, x1: 1220, y0: -48, y1: 600, z0: 725, z1: 743 })
  expect(p.part).toMatchObject({
    length: 1230,
    width: 648,
    thickness: 18,
    parentId: null,
    driven: false,
  })
  expect(p.part?.role).toBeUndefined()
  expect(JSON.stringify(s)).toBe(before)
  expect(p.members.map((m) => m.id)).toEqual(['a', 'b'])
  expect(added().parts.length).toBe(s.parts.length + 1)
})
it('covers differing depths and top-aligned heights and custom materials', () => {
  const s = runScene()
  cab(s).params.depth = 700
  cab(s).params.height = 600
  cab(s).position = { x: 600, y: 0, z: 120 }
  s.materials = { ...s.materials, Thick: { thickness: 30 } }
  const p = previewRunWorktop(s, {
    ...draftOf(s),
    material: 'Thick',
    thicknessMode: 'custom',
    thickness: '25',
    grain: 'width',
  })
  expect(p.errors).toEqual([])
  expect(p.part).toMatchObject({ width: 738, thickness: 25, material: 'Thick', grain: 'width' })
  expect(previewRunWorktop(s, { ...draftOf(s), material: 'Thick' }).part?.thickness).toBe(30)
})
it('places co-oriented rotated cabinets and their worktop in a shared transformed container', () => {
  const s = runScene()
  for (const c of s.components) {
    c.parentId = 'room'
    c.rotation = { x: 0, y: 0, z: 90 }
  }
  cab(s, 'a').position = { x: 100, y: 200, z: 300 }
  cab(s).position = { x: 100, y: 800, z: 300 }
  s.components.push({
    kind: 'group',
    rotationOrder: 'XYZ',
    id: 'room',
    label: 'Room',
    parentId: null,
    visible: true,
    position: { x: 50, y: 60, z: 70 },
    rotation: { x: 15, y: 20, z: 37 },
  })
  const p = preview(s)
  expect(p.errors).toEqual([])
  expect(p.part?.parentId).toBe('room')
  const byId = new Map(s.components.map((c) => [c.id, c]))
  const actual = applyMatrixToPoint(resolveWorldMatrix(p.part!, byId), 0, 0, 0)
  const expected = applyMatrixToPoint(resolveWorldMatrix(cab(s, 'a'), byId), 0, -38, 720)
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]))
  const reversed = previewRunWorktop(s, { ...draftOf(s), memberIds: ['b', 'a'] })
  expect(reversed.errors).toEqual([])
  const corner = applyMatrixToPoint(resolveWorldMatrix(reversed.part!, byId), 0, 0, 0)
  corner.forEach((v, i) => expect(v).toBeCloseTo(actual[i]))
})
it.each([
  [
    'parent',
    (s: Scene) => {
      cab(s).parentId = 'other'
    },
    'container',
  ],
  [
    'rotation',
    (s: Scene) => {
      cab(s).rotation = { x: 0, y: 0, z: 90 }
    },
    'orientations',
  ],
  [
    'front',
    (s: Scene) => {
      cab(s).position.y = 10
    },
    'fronts',
  ],
  [
    'top',
    (s: Scene) => {
      cab(s).position.z = 10
    },
    'top planes',
  ],
  [
    'overlap',
    (s: Scene) => {
      cab(s).position.x = 599
    },
    'overlap',
  ],
  [
    'gap',
    (s: Scene) => {
      cab(s).position.x = 601
    },
    'gap',
  ],
  [
    'nonfinite',
    (s: Scene) => {
      cab(s).position.x = Infinity
    },
    'finite',
  ],
  [
    'missing',
    (s: Scene) => {
      s.components.pop()
    },
    'available',
  ],
  [
    'hierarchy',
    (s: Scene) => {
      s.components.forEach((c) => (c.parentId = 'missing'))
    },
    'hierarchy',
  ],
] as const)('rejects %s without a candidate', (_, change, message) => {
  const s = runScene()
  change(s)
  const p = preview(s)
  expect(p.errors.join()).toContain(message)
  expect(p.part).toBeNull()
})
it('requires explicit gap allowance and reports each gap', () => {
  const s = runScene()
  cab(s).position.x = 650
  const p = previewRunWorktop(s, { ...draftOf(s), maxGap: '50' })
  expect(p.errors).toEqual([])
  expect(p.members[1].gapBefore).toBe(50)
  expect(p.part?.length).toBe(1250)
})
it.each([
  { memberIds: [] },
  { memberIds: ['a', 'a'] },
  { memberIds: ['a', ' '] },
  { label: '' },
  { material: '' },
  { grain: 'bad' },
  { thicknessMode: 'bad' },
  { follow: 'yes' },
  { thickness: '0' },
  { thickness: 'NaN' },
  { left: '-1' },
  { rear: '' },
  { bottom: 'Infinity' },
])('rejects malformed draft %j', (patch) => {
  expect(runDraftError({ ...draftOf(runScene()), ...patch })).toBeTypeOf('string')
})
it('validates recipe shape and version', () => {
  const d = draftOf(runScene())
  for (const value of [
    null,
    [],
    {},
    { version: 2, draft: d },
    { version: 1, draft: { ...d, follow: false } },
  ])
    expect(runWorktopLinkError(value)).toBeTypeOf('string')
  expect(runWorktopLinkError({ version: 1, draft: d })).toBeNull()
})
it('follows resize and movement preserving board identity, color, visibility and cuts', () => {
  const s = added()
  const p = board(s)
  p.visible = false
  p.color = '#123456'
  cab(s).params.width = 800
  const next = regenerateRunWorktops(s),
    top = board(next)
  expect(top.length).toBe(1400)
  expect(top.id).toBe('top')
  expect(top.visible).toBe(false)
  expect(top.color).toBe('#123456')
  expect(top.cuts).toBe(p.cuts)
  for (const c of s.components) c.position.x += 50
  expect(board(regenerateRunWorktops(s)).position.x).toBe(50)
})
it('retains last good geometry on invalid or missing members, supports repair, and detaches when all gone', () => {
  const s = added()
  cab(s).position.y = 20
  expect(board(regenerateRunWorktops(s))).toBe(board(s))
  expect(runWorktopIssues(s, board(s)).join()).toContain('fronts')
  cab(s).position.y = 0
  s.components = s.components.filter((c) => c.id !== 'b')
  expect(board(regenerateRunWorktops(s)).length).toBe(1200)
  expect(runWorktopIssues(s, board(s)).join()).toContain('available')
  s.components.push({ ...cab(s, 'a'), id: 'b', position: { x: 600, y: 0, z: 0 } })
  expect(runWorktopIssues(s, board(s))).toEqual([])
  s.components = []
  expect(board(regenerateRunWorktops(s)).runWorktop).toBeUndefined()
})
it('fixed boards and normal geometry edits release linkage; cosmetic edits retain it', () => {
  const s = runScene(),
    d = { ...draftOf(s), follow: false }
  const fixed = acceptRunWorktop(s, previewRunWorktop(s, d), 'top')!
  expect(board(fixed).runWorktop).toBeUndefined()
  cab(fixed).params.width = 800
  expect(board(regenerateRunWorktops(fixed)).length).toBe(1200)
  const p = board(added())
  expect(releaseEditedFinishing(p, { ...p, length: 1234 }).runWorktop).toBeUndefined()
  expect(releaseEditedFinishing(p, { ...p, color: '#111111' }).runWorktop).toBe(p.runWorktop)
})
it('rebuilds acceptance from draft rather than trusting forged geometry', () => {
  const s = runScene(),
    p = preview(s)
  p.part!.length = 9999
  expect(board(acceptRunWorktop(s, p, 'top')!).length).toBe(1200)
  for (const id of ['', 'a', s.parts[0].id]) expect(acceptRunWorktop(s, preview(s), id)).toBeNull()
  expect(acceptRunWorktop({ ...s, components: s.components.slice(0, 1) }, p, 'top')).toBeNull()
  expect(acceptRunWorktop(s, { ...p, changed: false }, 'top')).toBeNull()
  expect(acceptRunWorktop(s, { ...p, part: null }, 'top')).toBeNull()
  expect(acceptRunWorktop(s, { ...p, errors: ['invalid'] }, 'top')).toBeNull()
})
it('updates by stable ID, rejects no-op, and detaches or deletes invalid links', () => {
  const s = added(),
    d = { ...draftOf(s), left: '50' }
  const p = previewRunWorktop(s, d, 'top')
  expect(p.changed).toBe(true)
  const next = acceptRunWorktop(s, p, 'ignored')!
  expect(board(next).length).toBe(1250)
  const noop = previewRunWorktop(next, d, 'top')
  expect(noop.changed).toBe(false)
  expect(acceptRunWorktop(next, { ...noop, changed: true }, 'x')).toBeNull()
  cab(next).position.y = 99
  const invalid = previewRunWorktop(next, d, 'top')
  expect(invalid.errors.length).toBeGreaterThan(0)
  expect(
    board(acceptRunWorktop(next, { ...invalid, action: 'detach' }, 'x')!).runWorktop,
  ).toBeUndefined()
  expect(
    acceptRunWorktop(next, { ...invalid, action: 'delete' }, 'x')!.parts.some(
      (p) => p.id === 'top',
    ),
  ).toBe(false)
  expect(acceptRunWorktop(s, { ...preview(s), action: 'detach' }, 'x')).toBeNull()
  board(s).driven = true
  expect(previewRunWorktop(s, d, 'top').errors.join()).toContain('owned')
})
it('uses explicit membership and anchored run shortcuts', () => {
  const s = runScene()
  cab(s).anchor = { to: 'a', face: 'right', gap: 0, offset: { u: 0, v: 0 } }
  expect(anchoredRunMembers(s, 'a')).toEqual(['a', 'b'])
  const next = added(s)
  next.components.push({ ...cab(next), id: 'c', position: { x: 1200, y: 0, z: 0 } })
  expect(board(regenerateRunWorktops(next)).length).toBe(1200)
})
it('exports one full-size board through cutting lists and nesting', () => {
  const s = added(),
    p = board(s)
  expect(buildCsv([p], s.materials, s.components)).toContain('1200')
  const records = manufacturingParts([p], s.materials, s.components)
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ nesting: { length: 1200, width: 598, thickness: 18 } })
})

const envelope = (scene: Scene): ZimmuFile => ({
  version: FILE_FORMAT_VERSION,
  name: 'Run',
  units: 'mm',
  appVersion: '0.0.0',
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
  camera: { position: { x: 100, y: 200, z: 300 }, target: { x: 0, y: 0, z: 0 } },
  scene,
})
it('persists recipes and follows dimensions after reopening, while old files still load', () => {
  const s = added(),
    file = envelope(s),
    loaded = parseFile(JSON.stringify(file))
  expect(board(loaded.scene).runWorktop).toEqual(board(s).runWorktop)
  cab(loaded.scene).params.width = 800
  expect(board(regenerateRunWorktops(loaded.scene)).length).toBe(1400)
  const old = envelope(runScene())
  old.version = 30
  expect(parseFile(JSON.stringify(old)).scene.components).toHaveLength(2)
})
it.each([validateLegacyFileInput, validateCurrentFile])(
  'rejects malformed and conflicting saved ownership at each file boundary',
  (validate) => {
    const s = added(),
      file = envelope(s)
    expect(() => validate(file)).not.toThrow()
    board(s).runWorktop = { version: 2 } as never
    expect(() => validate(file)).toThrow('runWorktop')
    board(s).runWorktop = { version: 1, draft: { ...draftOf(s), follow: true } }
    board(s).driven = true
    expect(() => validate(file)).toThrow('exclusively')
  },
)
it('complete assembly previews include an above-cabinet top without changing default sections', () => {
  const s = added(),
    c = cab(s, 'a'),
    byId = new Map(s.components.map((c) => [c.id, c]))
  const full = buildAssemblyViews(s.parts, byId, c, s.materials, false)
  const section = buildAssemblyViews(s.parts, byId, c, s.materials)
  expect(full.find((v) => v.label === 'Top')?.parts.some((p) => p.partId === 'top')).toBe(true)
  expect(section.find((v) => v.label === 'Top')?.parts.some((p) => p.partId === 'top')).toBe(false)
})
it('rejects stale acceptance even when only unrelated material metadata changes', () => {
  const s = runScene(),
    p = preview(s)
  expect(p.errors).toEqual([])
  expect(
    acceptRunWorktop({ ...s, materials: { ...s.materials, Other: { thickness: 30 } } }, p, 'top'),
  ).toBeNull()
})
it('handles matching three-axis cabinet rotations', () => {
  const s = runScene(),
    a = cab(s, 'a'),
    b = cab(s)
  a.rotation = { x: 20, y: 30, z: 40 }
  a.rotationOrder = 'XYZ'
  b.rotation = { ...a.rotation }
  b.rotationOrder = 'XYZ'
  const byId = new Map(s.components.map((c) => [c.id, c]))
  const position = applyMatrixToPoint(resolveWorldMatrix(a, byId), 600, 0, 0)
  b.position = { x: position[0], y: position[1], z: position[2] }
  const p = preview(s)
  expect(p.errors).toEqual([])
  expect(p.part?.rotationOrder).toBe('XYZ')
  const actual = applyMatrixToPoint(resolveWorldMatrix(p.part!, byId), 1200, 598, 18)
  const expected = applyMatrixToPoint(resolveWorldMatrix(a, byId), 1200, 560, 738)
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]))
})

it('exports a normal board drawing with its full run dimensions', () => {
  const p = board(added()),
    sheets = buildDrawingSheets([p], 'Run')
  expect(sheets).toHaveLength(2)
  expect(buildSvg(sheets[1])).toContain('1200')
  expect(buildSvg(sheets[1])).toContain('598')
})
