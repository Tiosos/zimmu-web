import { expect, it } from 'vitest'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
import { PRESET_MATERIALS } from './carcasePresets'
import {
  acceptFinishing,
  FINISHING_KINDS,
  finishingDraft,
  finishingMaterials,
  finishingSignature,
  previewFinishing,
} from './finishingPanels'
import { regenerateComponents } from './regenerateComponents'
import { parseFile } from './useFile'
import { buildCsv } from '../ui/buildCsv'
import { manufacturingParts } from './manufacturingPart'
import type { BoardPart, CarcaseComponent, Scene } from './types'
const own = (): CarcaseComponent => ({
  ...cabinet,
  id: 'cab',
  label: 'Cabinet',
  position: { x: 100, y: 200, z: 300 },
  rotation: { x: 0, y: 0, z: 90 },
})
const sceneOf = (): Scene => ({
  components: [own()],
  parts: partsOfCarcase(cabinet.params, 'cab'),
  materials: PRESET_MATERIALS,
  joints: [],
  hardware: [],
})
const preview = (s = sceneOf(), kind: Parameters<typeof finishingDraft>[2] = 'worktop') =>
  previewFinishing(s, 'cab', finishingDraft(s, 'cab', kind))
const boxOf = (p: BoardPart) => {
  const matrix = resolveWorldMatrix({ ...p, parentId: null }, new Map())
  const points = [0, p.length].flatMap((x) =>
    [0, p.width].flatMap((y) => [0, p.thickness].map((z) => applyMatrixToPoint(matrix, x, y, z))),
  )
  return {
    x0: Math.min(...points.map((p) => p[0])),
    x1: Math.max(...points.map((p) => p[0])),
    y0: Math.min(...points.map((p) => p[1])),
    y1: Math.max(...points.map((p) => p[1])),
    z0: Math.min(...points.map((p) => p[2])),
    z1: Math.max(...points.map((p) => p[2])),
  }
}
it.each(FINISHING_KINDS)('creates a real oriented %s board with cabinet-local bounds', (kind) => {
  const s = sceneOf(),
    p = preview(s, kind)
  expect(p.errors).toEqual([])
  expect(p.part?.parentId).toBe('cab')
  expect(p.part?.driven).toBe(false)
  expect(p.part?.role).toBeUndefined()
  const actual = boxOf(p.part!)
  for (const key of ['x0', 'x1', 'y0', 'y1', 'z0', 'z1'] as const)
    expect(actual[key]).toBeCloseTo(p.bounds![key])
  expect(p.part?.cuts).toEqual([])
  expect(p.part?.thickness).toBe(18)
})
it('fits worktop overhangs to fronts/frames/applied backs and uses a separate vertical gap', () => {
  const s = sceneOf()
  const c = s.components[0] as CarcaseComponent
  c.params = { ...c.params, backMode: 'applied' }
  const d = {
    ...finishingDraft(s, 'cab'),
    left: '10',
    right: '20',
    front: '30',
    rear: '40',
    bottom: '5',
  }
  const p = previewFinishing(s, 'cab', d)
  expect(p.errors).toEqual([])
  expect(p.bounds).toEqual({ x0: -10, x1: 620, y0: -48, y1: 612, z0: 725, z1: 743 })
  expect(p.part?.length).toBe(630)
  expect(p.part?.width).toBe(660)
  const point = applyMatrixToPoint(
    resolveWorldMatrix(p.part!, new Map(s.components.map((c) => [c.id, c]))),
    0,
    0,
    0,
  )
  expect(point[0]).toBeCloseTo(148)
  expect(point[1]).toBeCloseTo(190)
  expect(point[2]).toBeCloseTo(1025)
})
it('sizes ends, fillers, plinth and splashback independently with clearances', () => {
  const s = sceneOf()
  for (const kind of [
    'left-end',
    'right-end',
    'left-filler',
    'right-filler',
    'plinth',
    'splashback',
  ] as const) {
    const d = {
      ...finishingDraft(s, 'cab', kind),
      height: '200',
      bottom: '7',
      fillerWidth: '65',
      setback: '40',
    }
    const p = previewFinishing(s, 'cab', d)
    expect(p.errors).toEqual([])
    expect(p.bounds!.z0).toBe(kind === 'splashback' ? 727 : 7)
    expect(p.bounds!.z1 - p.bounds!.z0).toBe(200)
    if (kind.includes('filler')) {
      expect(p.bounds!.x1 - p.bounds!.x0).toBe(65)
      expect(p.bounds!.y0).toBe(-18)
    }
    if (kind === 'plinth') {
      expect(p.bounds!.y0).toBe(22)
      expect(p.bounds!.y1).toBe(40)
    }
    if (kind === 'splashback') expect(p.bounds!.y0).toBe(560)
  }
})
it('filters materials, follows stock thickness and permits an explicit custom thickness and grain', () => {
  const s = sceneOf()
  s.materials = {
    ...s.materials,
    Thick: { thickness: 30 },
    Edge: { thickness: 2, use: 'edge' },
    Bad: { thickness: 0 },
    Infinite: { thickness: Infinity },
    Linear: { costPerM: 2 },
  }
  expect(finishingMaterials(s)).toContain('Thick')
  expect(finishingMaterials(s)).not.toContain('Edge')
  expect(finishingMaterials(s)).not.toContain('Bad')
  expect(finishingMaterials(s)).not.toContain('Infinite')
  expect(finishingMaterials(s)).not.toContain('Linear')
  const d = {
    ...finishingDraft(s, 'cab'),
    material: 'Thick',
    grain: 'width' as const,
    label: '  Kitchen worktop  ',
  }
  expect(previewFinishing(s, 'cab', d).part?.thickness).toBe(30)
  const p = previewFinishing(s, 'cab', { ...d, thicknessMode: 'custom', thickness: '25' })
  expect(p.part?.thickness).toBe(25)
  expect(p.part?.grain).toBe('width')
  expect(p.part?.label).toBe('Kitchen worktop')
  const fallback = { ...s, materials: { Only: { thickness: 22 } } }
  expect(finishingDraft(fallback, 'cab').material).toBe('Only')
  expect(finishingDraft({ ...s, materials: {} }, 'cab').material).toBe('')
})
it('keeps accepted boards through cabinet regeneration, persistence and manufacturing outputs', () => {
  const s = sceneOf(),
    p = preview(s),
    next = acceptFinishing(s, p, 'board-new')!
  const board = next.parts.at(-1) as BoardPart
  const resized = {
    ...next,
    components: next.components.map((c) =>
      c.kind === 'carcase' ? { ...c, params: { ...c.params, width: 800 } } : c,
    ),
  }
  const regenerated = regenerateComponents(resized)
  expect(regenerated.parts.find((p) => p.id === board.id)).toEqual(board)
  const loaded = parseFile(
    JSON.stringify({
      version: 17,
      name: 'Finishing',
      units: 'mm',
      appVersion: '0.0.0',
      createdAt: '2026-10-20T00:00:00Z',
      updatedAt: '2026-10-20T00:00:00Z',
      camera: { position: { x: 100, y: 200, z: 300 }, target: { x: 0, y: 0, z: 0 } },
      scene: regenerated,
    }),
  )
  expect(loaded.scene.parts.find((p) => p.id === board.id)).toEqual(board)
  expect(buildCsv(loaded.scene.parts, loaded.scene.materials, loaded.scene.components)).toContain(
    'Worktop',
  )
  const record = manufacturingParts([board], s.materials, s.components)[0]
  expect(record.kind).toBe('board')
  if (record.kind === 'board') {
    expect(record.nesting.length).toBe(board.length)
    expect(record.nesting.width).toBe(board.width)
  }
  expect(s.parts.some((p) => p.id === board.id)).toBe(false)
})
it('copies the draft, rebuilds on acceptance, retains current metadata and uses a fresh unique ID', () => {
  const s = sceneOf(),
    d = finishingDraft(s, 'cab'),
    p = previewFinishing(s, 'cab', d)
  d.left = '500'
  const current = { ...s, hardware: [{ id: 'new-hardware' }] as Scene['hardware'] }
  const next = acceptFinishing(current, { ...p, part: { ...p.part!, length: 9999 } }, 'new')!
  expect(next.parts.at(-1)?.length).toBe(600)
  expect(next.hardware).toBe(current.hardware)
  expect(next.components).toBe(current.components)
  expect(acceptFinishing(s, p, '')).toBeNull()
  expect(acceptFinishing(s, p, 'cab')).toBeNull()
  expect(acceptFinishing(s, p, s.parts[0].id)).toBeNull()
  const collision = { ...s, parts: [...s.parts, { ...p.part!, id: 'finishing-preview:cab' }] }
  expect(preview(collision).part?.id).not.toBe('finishing-preview:cab')
})
it('invalidates geometry changes but ignores mesh updates and unrelated hardware changes', () => {
  const s = sceneOf(),
    p = preview(s)
  const meshes = { ...s, parts: s.parts.map((part) => ({ ...part, mesh: undefined })) }
  expect(finishingSignature(meshes)).toBe(finishingSignature(s))
  expect(acceptFinishing(meshes, p, 'new')).not.toBeNull()
  const changed = {
    ...s,
    parts: s.parts.map((part, i) => (i === 0 ? { ...part, length: part.length + 1 } : part)),
  }
  expect(acceptFinishing(changed, p, 'new')).toBeNull()
  expect(acceptFinishing({ ...s, materials: {} }, p, 'new')).toBeNull()
  expect(acceptFinishing(s, { ...p, errors: ['bad'] }, 'new')).toBeNull()
  expect(acceptFinishing(s, { ...p, part: null }, 'new')).toBeNull()
  expect(acceptFinishing(s, { ...p, draft: { ...p.draft, label: '' } }, 'new')).toBeNull()
})
it('rejects invalid selection, material, grain, thickness mode, names and source geometry', () => {
  const s = sceneOf(),
    d = finishingDraft(s, 'cab')
  expect(previewFinishing(s, 'missing', d).errors.join()).toContain('available')
  expect(() => finishingDraft(s, 'missing')).toThrow('available')
  expect(
    previewFinishing(s, 'cab', { ...d, kind: 'invalid' as typeof d.kind }).errors.join(),
  ).toContain('supported')
  expect(previewFinishing(s, 'cab', { ...d, label: '  ' }).errors.join()).toContain('Name')
  expect(previewFinishing(s, 'cab', { ...d, material: 'missing' }).errors.join()).toContain(
    'panel material',
  )
  expect(
    previewFinishing(s, 'cab', { ...d, grain: 'invalid' as typeof d.grain }).errors.join(),
  ).toContain('grain')
  expect(
    previewFinishing(s, 'cab', {
      ...d,
      thicknessMode: 'invalid' as typeof d.thicknessMode,
    }).errors.join(),
  ).toContain('stock or custom')
  const bad = sceneOf()
  ;(bad.components[0] as CarcaseComponent).params = { ...cabinet.params, width: -1 }
  expect(preview(bad).errors.join()).toContain('width must exceed')
})
it('rejects blank, nonfinite, nonpositive and negative dimensions with no scene changes', () => {
  const s = sceneOf(),
    d = finishingDraft(s, 'cab'),
    snapshot = JSON.stringify(s)
  for (const raw of ['', 'NaN', 'Infinity'])
    expect(previewFinishing(s, 'cab', { ...d, left: raw }).errors.join()).toContain(
      'Complete every',
    )
  for (const key of ['height', 'fillerWidth'] as const)
    expect(previewFinishing(s, 'cab', { ...d, [key]: '0' }).errors.join()).toContain(
      'greater than zero',
    )
  expect(
    previewFinishing(s, 'cab', { ...d, thicknessMode: 'custom', thickness: '0' }).errors.join(),
  ).toContain('greater than zero')
  for (const key of ['left', 'right', 'front', 'rear', 'bottom', 'setback'] as const)
    expect(previewFinishing(s, 'cab', { ...d, [key]: '-1' }).errors.join()).toContain(
      'zero or greater',
    )
  expect(
    previewFinishing(s, 'cab', { ...d, kind: 'plinth', setback: '1000' }).errors.join(),
  ).toContain('occupied depth')
  expect(JSON.stringify(s)).toBe(snapshot)
})
it('rejects finite inputs that collapse or overflow output dimensions and invalid hierarchy transforms', () => {
  const s = sceneOf(),
    d = finishingDraft(s, 'cab')
  expect(
    previewFinishing(s, 'cab', { ...d, left: '1e308', right: '1e308' }).errors.join(),
  ).toContain('positive finite')
  expect(
    previewFinishing(s, 'cab', { ...d, left: '1e200', front: '1e200' }).errors.join(),
  ).toContain('positive finite')
  expect(previewFinishing(s, 'cab', { ...d, bottom: '1e308' }).errors.join()).toContain(
    'positive finite',
  )
  const bad = sceneOf()
  bad.components[0] = { ...bad.components[0], position: { x: NaN, y: 0, z: 0 } }
  expect(preview(bad).errors.join()).toContain('non-finite board placement')
})
