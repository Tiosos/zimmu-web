import { expect, it } from 'vitest'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { cabinetSpaceBox } from '../geom/assembly'
import { PRESET_MATERIALS } from './carcasePresets'
import {
  acceptFinishing,
  finishingDraft,
  finishingIssues,
  finishingSignature,
  previewFinishing,
  regenerateFinishing,
  releaseEditedFinishing,
  FINISHING_KINDS,
  type FinishingDraft,
} from './finishingPanels'
import { finishingLinkError } from './finishingRecipe'
import { applyPipeline } from './pipeline'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { validateCurrentFile } from './fileValidation'
import { buildCsv } from '../ui/buildCsv'
import { manufacturingParts } from './manufacturingPart'
import type { BoardPart, CarcaseComponent, Scene, ZimmuFile } from './types'

const sceneOf = (): Scene => ({
  components: [
    {
      ...cabinet,
      id: 'cab',
      params: { ...cabinet.params, toeKickHeight: 100, toeKickSetback: 40 },
    },
  ],
  parts: partsOfCarcase(cabinet.params, 'cab'),
  materials: { ...PRESET_MATERIALS },
  joints: [],
  hardware: [],
})
const add = (
  s: Scene,
  kind: FinishingDraft['kind'] = 'worktop',
  patch: Partial<FinishingDraft> = {},
  id = 'finish',
) =>
  acceptFinishing(
    s,
    previewFinishing(s, 'cab', { ...finishingDraft(s, 'cab', kind), follow: true, ...patch }),
    id,
  )!
const board = (s: Scene, id = 'finish') => s.parts.find((p) => p.id === id) as BoardPart
const resize = (s: Scene, patch: Partial<CarcaseComponent['params']> = {}) =>
  applyPipeline({
    ...s,
    components: s.components.map((c) =>
      c.kind === 'carcase'
        ? {
            ...c,
            params: {
              ...c.params,
              width: 800,
              depth: 660,
              height: 900,
              toeKickHeight: 120,
              toeKickSetback: 60,
              ...patch,
            },
          }
        : c,
    ),
  })
const bounds = (s: Scene) =>
  cabinetSpaceBox(
    board(s),
    new Map(s.components.map((c) => [c.id, c])),
    s.components[0] as CarcaseComponent,
  )!
const envelope = (s: Scene): ZimmuFile => ({
  version: FILE_FORMAT_VERSION,
  name: 'Linked finishing',
  units: 'mm',
  appVersion: '0.0.0',
  createdAt: '2026-10-20T00:00:00Z',
  updatedAt: '2026-10-20T00:00:00Z',
  camera: { position: { x: 100, y: 200, z: 300 }, target: { x: 0, y: 0, z: 0 } },
  scene: s,
})

it('follows worktop dimensions while retaining overhangs, gap and stable board identity', () => {
  const s = add(sceneOf(), 'worktop', {
    left: '10',
    right: '20',
    front: '30',
    rear: '40',
    bottom: '7',
  })
  const next = resize(s)
  expect(board(next)).toMatchObject({
    id: 'finish',
    length: 830,
    width: 748,
    thickness: 18,
    parentId: 'cab',
    driven: false,
  })
  expect(board(next).role).toBeUndefined()
  expect(bounds(next).min).toEqual({ x: -10, y: -48, z: 907 })
  expect(bounds(next).max).toEqual({ x: 820, y: 700, z: 925 })
  expect(applyPipeline(next)).toEqual(next)
  expect(board(s).length).toBe(630)
})
it.each(['left-end', 'right-end', 'left-filler', 'right-filler'] as const)(
  'follows %s height and placement while preserving filler width and clearance',
  (kind) => {
    const s = add(sceneOf(), kind, { heightMode: 'cabinet', fillerWidth: '65', bottom: '7' })
    const next = resize(s),
      box = bounds(next)
    expect(box.min.z).toBeCloseTo(7)
    expect(box.max.z).toBeCloseTo(900)
    if (kind.includes('end')) {
      expect(box.max.y - box.min.y).toBeCloseTo(678)
      expect(box.max.x - box.min.x).toBeCloseTo(18)
      expect(box.min.x).toBeCloseTo(kind === 'left-end' ? -18 : 800)
    } else {
      expect(box.max.x - box.min.x).toBeCloseTo(65)
      expect(box.min.x).toBeCloseTo(kind === 'left-filler' ? -65 : 800)
      expect(box.min.y).toBeCloseTo(-18)
    }
  },
)
it('supports toe-kick height/setback following, custom heights and splashbacks', () => {
  const plinth = resize(
    add(sceneOf(), 'plinth', { heightMode: 'toe-kick', setbackMode: 'toe-kick', bottom: '5' }),
  )
  expect(bounds(plinth).min.y).toBeCloseTo(42)
  expect(bounds(plinth).max.z).toBeCloseTo(120)
  expect(board(plinth).width).toBe(800)
  const custom = resize(add(sceneOf(), 'right-end', { height: '400', bottom: '5' }))
  expect(bounds(custom).max.z).toBeCloseTo(405)
  const splash = resize(add(sceneOf(), 'splashback', { height: '150', bottom: '8' }))
  expect(bounds(splash).min).toEqual({ x: 0, y: 660, z: 908 })
  expect(bounds(splash).max.y).toBeCloseTo(678)
  expect(bounds(splash).max.z).toBeCloseTo(1058)
  expect(board(splash).width).toBe(800)
})
it('follows stock thickness and envelope changes but preserves custom thickness/grain', () => {
  const s = add(sceneOf(), 'worktop', { grain: 'width' })
  const material = board(s).material
  const next = applyPipeline({
    ...s,
    materials: { ...s.materials, [material]: { ...s.materials[material], thickness: 25 } },
  })
  expect(board(next).thickness).toBe(25)
  expect(board(next).width).toBe(605) // thicker overlay front expands occupied depth
  expect(board(next).grain).toBe('width')
  const custom = add(sceneOf(), 'worktop', {
    thicknessMode: 'custom',
    thickness: '30',
    grain: 'free',
  })
  expect(board(applyPipeline({ ...custom, materials: next.materials }))).toMatchObject({
    thickness: 30,
    grain: 'free',
  })
})
it('keeps invalid links at last-good geometry and resumes when cabinet inputs recover', () => {
  const s = add(sceneOf(), 'plinth', { heightMode: 'toe-kick', setbackMode: 'toe-kick' })
  const bad = resize(s, { toeKickHeight: 0 })
  expect(board(bad)).toEqual(board(s))
  expect(finishingIssues(bad, board(bad)).length).toBeGreaterThan(0)
  const outside = resize(s, { toeKickSetback: 900 })
  expect(board(outside)).toEqual(board(s))
  expect(finishingIssues(outside, board(outside)).length).toBeGreaterThan(0)
  expect(finishingIssues(resize(bad), board(resize(bad)))).toEqual([])
  const noStock = regenerateFinishing({ ...s, materials: {} })
  expect(board(noStock)).toEqual(board(s))
  expect(finishingIssues(noStock, board(noStock)).join()).toContain('panel material')
  const end = add(sceneOf(), 'left-end', { heightMode: 'cabinet', bottom: '700' })
  const tooShort = resize(end, { height: 650 })
  expect(board(tooShort)).toEqual(board(end))
})
it('preserves manufacturing metadata and world geometry under a rotated cabinet', () => {
  const s = add(sceneOf(), 'worktop')
  const original = board(s)
  original.color = '#123456'
  original.visible = false
  original.edgeBanding = { x0: null }
  original.cuts = [
    {
      kind: 'box',
      id: 'cut',
      label: 'Notch',
      position: { x: 1, y: 2, z: 0 },
      size: { x: 10, y: 10, z: 18 },
      face: '+Z',
    },
  ]
  const editPreview = previewFinishing(s, 'cab', original.finishing!.draft, original.id)
  expect(editPreview.part).toMatchObject({
    id: original.id,
    cuts: original.cuts,
    edgeBanding: original.edgeBanding,
  })
  const turned = {
    ...s,
    components: s.components.map((c) => ({
      ...c,
      position: { x: 200, y: 300, z: 400 },
      rotation: { x: 0, y: 0, z: 90 },
    })),
  }
  const next = resize(turned)
  expect(board(next)).toMatchObject({
    color: '#123456',
    visible: false,
    edgeBanding: { x0: null },
    cuts: original.cuts,
  })
  expect(bounds(next).min.x).toBeCloseTo(0)
  expect(bounds(next).max.x).toBeCloseTo(800)
  expect(board(next).finishing).toEqual(original.finishing)
})
it('edits by ID, rebuilds forged geometry and rejects stale, unknown or non-owned targets', () => {
  const s = add(sceneOf())
  const draft = { ...board(s).finishing!.draft, left: '15', label: 'Edited' }
  const p = previewFinishing(s, 'cab', draft, 'finish')
  const next = acceptFinishing(s, { ...p, part: { ...p.part!, length: 999 } }, '')!
  expect(next.parts).toHaveLength(s.parts.length)
  expect(board(next)).toMatchObject({ id: 'finish', label: 'Edited', length: 615 })
  expect(acceptFinishing(resize(s), p, 'new')).toBeNull()
  expect(acceptFinishing(s, { ...p, targetId: 'missing' }, 'new')).toBeNull()
  expect(acceptFinishing(s, { ...p, targetId: '' }, 'new')).toBeNull()
  const ordinary = {
    ...s,
    parts: s.parts.map((part) => (part.id === 'finish' ? { ...part, finishing: undefined } : part)),
  }
  expect(
    acceptFinishing(ordinary, { ...p, signature: finishingSignature(ordinary) }, 'new'),
  ).toBeNull()
  const recipeChanged = {
    ...s,
    parts: s.parts.map((part) =>
      part.id === 'finish' ? { ...board(s), finishing: { ...board(s).finishing!, draft } } : part,
    ),
  }
  expect(acceptFinishing(recipeChanged, p, 'new')).toBeNull()
  for (const patch of [{ driven: true }, { role: 'left-side' }, { parentId: 'other' }]) {
    const changed = {
      ...s,
      parts: s.parts.map((part) => (part.id === 'finish' ? { ...part, ...patch } : part)),
    }
    expect(
      acceptFinishing(changed, { ...p, signature: finishingSignature(changed) }, 'new'),
    ).toBeNull()
  }
})
it('detaches or deletes even invalid panels, and never regenerates a deleted board', () => {
  const s = add(sceneOf(), 'plinth', { heightMode: 'toe-kick' })
  const bad = resize(s, { toeKickHeight: 0 })
  const p = previewFinishing(bad, 'cab', board(bad).finishing!.draft, 'finish')
  expect(p.errors.length).toBeGreaterThan(0)
  const detached = acceptFinishing(bad, { ...p, action: 'detach' }, '')!
  expect(board(detached).finishing).toBeUndefined()
  expect(board(resize(detached)).length).toBe(board(s).length)
  const deleted = acceptFinishing(bad, { ...p, action: 'delete' }, '')!
  expect(board(resize(deleted))).toBeUndefined()
  expect(acceptFinishing(s, { ...p, action: 'delete' }, '')).toBeNull()
  expect(
    acceptFinishing(
      s,
      { ...p, signature: finishingSignature(s), targetId: undefined, action: 'detach' },
      '',
    ),
  ).toBeNull()
})
it('releases a lost parent and direct owned edits, preserving cosmetic and machining edits', () => {
  const s = add(sceneOf())
  expect(board(regenerateFinishing({ ...s, components: [] })).finishing).toBeUndefined()
  const p = board(s)
  for (const patch of [
    { length: 700 },
    { width: 700 },
    { thickness: 30 },
    { parentId: null },
    { position: { x: 1, y: 0, z: 0 } },
    { rotation: { x: 0, y: 90, z: 0 } },
    { label: 'new' },
    { material: 'other' },
    { grain: 'free' as const },
  ])
    expect(releaseEditedFinishing(p, { ...p, ...patch }).finishing).toBeUndefined()
  expect(
    releaseEditedFinishing(p, {
      ...p,
      visible: false,
      color: '#fff',
      cuts: [],
      edgeBanding: { x0: null },
    }).finishing,
  ).toEqual(p.finishing)
})
it('roundtrips linked settings, exports resized boards and preserves fixed-size legacy boards', () => {
  const s = add(sceneOf(), 'left-filler', { heightMode: 'cabinet', fillerWidth: '75' })
  const loaded = parseFile(JSON.stringify(envelope(s)))
  expect(board(loaded.scene)).toEqual(board(s))
  const next = resize(loaded.scene)
  expect(buildCsv(next.parts, next.materials, next.components)).toContain('Left filler')
  const record = manufacturingParts([board(next)], next.materials, next.components)[0]
  expect(record.kind).toBe('board')
  if (record.kind === 'board') expect(record.nesting.length).toBe(900)
  const old = acceptFinishing(
    sceneOf(),
    previewFinishing(sceneOf(), 'cab', finishingDraft(sceneOf(), 'cab')),
    'finish',
  )!
  expect(board(resize(parseFile(JSON.stringify({ ...envelope(old), version: 28 })).scene))).toEqual(
    board(old),
  )
})
it.each(FINISHING_KINDS)(
  'reopens and regenerates %s recipes with no mutation of source scene',
  (kind) => {
    const s = add(sceneOf(), kind),
      snapshot = JSON.stringify(s)
    const loaded = parseFile(JSON.stringify(envelope(s)))
    expect(finishingIssues(resize(loaded.scene), board(resize(loaded.scene)))).toEqual([])
    expect(JSON.stringify(s)).toBe(snapshot)
  },
)
it('rejects malformed or ambiguous saved ownership at both file boundaries', () => {
  const s = add(sceneOf()),
    good = board(s).finishing!
  for (const value of [
    null,
    [],
    { ...good, version: 2 },
    { version: 1, draft: [] },
    ...[
      { follow: false },
      { kind: 'bad' },
      { grain: 'bad' },
      { thicknessMode: 'bad' },
      { heightMode: 'bad' },
      { setbackMode: 'bad' },
      { heightMode: 'cabinet' },
      { setbackMode: 'toe-kick' },
      { heightMode: 'toe-kick' },
      { label: '' },
      { material: 5 },
      { left: 'Infinity' },
      { bottom: '-1' },
      { height: '0' },
      { fillerWidth: '' },
    ].map((patch) => ({ ...good, draft: { ...good.draft, ...patch } })),
  ]) {
    expect(() => finishingLinkError(value)).not.toThrow()
    expect(finishingLinkError(value)).not.toBeNull()
    const file = envelope({
      ...s,
      parts: s.parts.map((part) => (part.id === 'finish' ? { ...part, finishing: value } : part)),
    } as Scene)
    expect(() => parseFile(JSON.stringify(file))).toThrow('finishing')
    expect(() => validateCurrentFile(file)).toThrow('finishing')
  }
  const driven = envelope({
    ...s,
    parts: s.parts.map((part) => (part.id === 'finish' ? { ...part, driven: true } : part)),
  })
  expect(() => parseFile(JSON.stringify(driven))).toThrow('role-free')
  expect(() => validateCurrentFile(driven)).toThrow('role-free')
})

it('reports missing or malformed owners and freezes malformed runtime recipes', () => {
  const s = add(sceneOf()),
    p = board(s)
  expect(finishingIssues(s, { ...p, parentId: null }).join()).toContain('available')
  const malformed = { ...p, finishing: { ...p.finishing!, version: 2 } } as unknown as BoardPart
  expect(finishingIssues(s, malformed).join()).toContain('version 1')
  const corrupt = { ...s, parts: s.parts.map((part) => (part.id === p.id ? malformed : part)) }
  expect(board(regenerateFinishing(corrupt))).toEqual(malformed)
  expect(finishingIssues(s, { ...p, finishing: undefined })).toEqual([])
  expect(releaseEditedFinishing({ ...p, finishing: undefined }, p)).toBe(p)
})
it('rejects invalid follow modes and derived dimensions before creating a linked board', () => {
  const s = sceneOf(),
    d = { ...finishingDraft(s, 'cab'), follow: true }
  expect(
    previewFinishing(s, 'cab', { ...d, follow: 'yes' } as unknown as FinishingDraft).errors.join(),
  ).toContain('whether')
  expect(previewFinishing(s, 'cab', { ...d, heightMode: 'cabinet' }).errors.join()).toContain(
    'only available',
  )
  const short = { ...d, kind: 'left-end' as const, heightMode: 'cabinet' as const, bottom: '720' }
  expect(previewFinishing(s, 'cab', short).errors.join()).toContain(
    'greater than zero after clearance',
  )
  const negativeSetback = {
    ...s,
    components: s.components.map((c) =>
      c.kind === 'carcase' ? { ...c, params: { ...c.params, toeKickSetback: -1 } } : c,
    ),
  }
  const plinth = {
    ...finishingDraft(s, 'cab', 'plinth'),
    follow: true,
    setbackMode: 'toe-kick' as const,
  }
  expect(previewFinishing(negativeSetback, 'cab', plinth).errors.join()).toContain(
    'Following setback',
  )
})
it('removes joints involving a deleted linked board and refuses unsupported management actions', () => {
  const s = add(sceneOf())
  s.joints = [
    {
      kind: 'dado',
      id: 'joint',
      label: 'Seat',
      housingPartId: 'finish',
      housedPartId: s.parts[0].id,
      depth: 3,
      driven: false,
    } as Scene['joints'][number],
  ]
  const p = previewFinishing(s, 'cab', board(s).finishing!.draft, 'finish')
  const next = acceptFinishing(s, { ...p, action: 'delete' }, '')!
  expect(next.joints).toEqual([])
  expect(s.joints).toHaveLength(1)
  expect(acceptFinishing(s, { ...p, action: 'unsupported' } as unknown as typeof p, '')).toBeNull()
})

it('refuses management without a target without throwing', () => {
  const s = add(sceneOf()),
    p = previewFinishing(s, 'cab', board(s).finishing!.draft)
  expect(() => acceptFinishing(s, { ...p, action: 'detach' }, '')).not.toThrow()
  expect(acceptFinishing(s, { ...p, action: 'detach' }, '')).toBeNull()
})
