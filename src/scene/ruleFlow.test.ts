import { describe, expect, it } from 'vitest'
import { CABINET_CATALOGUE, catalogueBaseline, catalogueSources, reconcileCatalogue } from './catalogue'
import { DEFAULT_CABINET_RULES } from './constructionRules'
import { PRESET_MATERIALS } from './carcasePresets'
import { freshSectionIds } from './sectionTree'
import { applyPipeline } from './pipeline'
import { acceptedRulePreview, previewCatalogueUpdate, previewProjectRules } from './ruleFlow'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { defaultProject } from './projectStructure'
import type { CarcaseComponent, Scene } from './types'

const definition = CABINET_CATALOGUE[0]
const rules = (frontReveal = 5) => ({ ...DEFAULT_CABINET_RULES, project: { frontReveal } })
const cabinet = (): CarcaseComponent => ({ kind: 'carcase', id: 'cabinet', label: 'Base', parentId: null,
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', visible: true,
  params: { ...definition.params, section: freshSectionIds(definition.params.section) },
  catalogue: { id: definition.catalogueId, version: 1, overrides: {} } })
const scene = (component = cabinet()): Scene => applyPipeline({ components: [component], parts: [],
  materials: PRESET_MATERIALS, joints: [], hardware: [] })
const first = (value: Scene) => value.components[0] as CarcaseComponent

describe('construction rule and catalogue update flow', () => {
  it('resolves explicit recipe rules over company, then project, then item', () => {
    expect(catalogueBaseline(definition)?.frontReveal).toBe(3)
    expect(catalogueBaseline({ ...definition, ruleOverrides: { frontReveal: 4 } })?.frontReveal).toBe(4)
    expect(catalogueBaseline({ ...definition, ruleOverrides: { frontReveal: 4 } }, rules())?.frontReveal).toBe(5)
    const component = reconcileCatalogue({ ...cabinet(), params: { ...cabinet().params, frontReveal: 7 } })
    const result = previewProjectRules(scene(component), rules())
    expect(result.errors).toEqual([])
    expect(first(result.candidate).params.frontReveal).toBe(7)
    expect(catalogueSources(first(result.candidate), rules()).frontReveal).toBe('item')
  })

  it('previews without mutating and removes project rules back to inheritance', () => {
    const original = scene()
    const signature = JSON.stringify(original)
    const result = previewProjectRules(original, rules())
    expect(result.errors).toEqual([])
    expect(first(result.candidate).params.frontReveal).toBe(5)
    expect(first(result.candidate).catalogue?.overrides).toEqual({})
    expect(catalogueSources(first(result.candidate), rules()).frontReveal).toBe('project')
    expect(JSON.stringify(original)).toBe(signature)
    expect(first(previewProjectRules(result.candidate, DEFAULT_CABINET_RULES).candidate).params.frontReveal).toBe(3)
    expect(result.candidate.parts.map((p) => p.id)).toEqual(original.parts.map((p) => p.id))
    expect(first(result.candidate).params.section).toEqual(first(original).params.section)
  })

  it('keeps custom cabinets and detached parts intact', () => {
    const original = scene({ ...cabinet(), catalogue: undefined })
    const detached = { ...original.parts[0], driven: false, label: 'Manual part' }
    original.parts[0] = detached
    const result = previewProjectRules(original, rules())
    expect(first(result.candidate).params).toEqual(first(original).params)
    expect(result.candidate.parts.find((p) => p.id === detached.id)).toEqual(detached)
    expect(result.changes).toEqual([])
  })

  it('updates a synthetic installed v2 while keeping item width and IDs', () => {
    const component = reconcileCatalogue({ ...cabinet(), params: { ...cabinet().params, width: 750 } })
    const original = scene(component)
    const v2 = { ...definition, catalogueVersion: 2, params: { ...definition.params, width: 700 }, ruleOverrides: { frontReveal: 4 } }
    const result = previewCatalogueUpdate(original, component.id, 2, [...CABINET_CATALOGUE, v2])
    expect(result.errors).toEqual([])
    expect(first(original).catalogue?.version).toBe(1)
    expect(first(result.candidate).catalogue?.version).toBe(2)
    expect(first(result.candidate).params.width).toBe(750)
    expect(first(result.candidate).params.frontReveal).toBe(4)
    expect(first(result.candidate).catalogue?.overrides.width).toBe(750)
    expect(first(result.candidate).params.section).toEqual(component.params.section)
  })

  it('requires manual reconciliation for changed unoverridden layouts', () => {
    const v2 = { ...definition, catalogueVersion: 2, params: { ...definition.params,
      section: { ...definition.params.section, front: { kind: 'panel' as const } } } }
    expect(previewCatalogueUpdate(scene(), 'cabinet', 2, [...CABINET_CATALOGUE, v2]).errors.join()).toMatch(/manual reconciliation/)
  })

  it('rejects missing versions, invalid rules, and missing materials even with no cabinets', () => {
    expect(previewCatalogueUpdate(scene(), 'cabinet', 99).errors.join()).toMatch(/unavailable/)
    expect(previewCatalogueUpdate(scene(), 'missing', 1).errors.join()).toMatch(/no longer available/)
    expect(previewProjectRules(scene({ ...cabinet(), catalogue: { id: definition.catalogueId, version: 99, overrides: {} } }), rules()).errors.join()).toMatch(/unavailable/)
    expect(previewProjectRules(scene(), { ...rules(), companyVersion: 99 }).errors.join()).toMatch(/unavailable/)
    const empty = { ...scene(), components: [], parts: [], joints: [] }
    expect(previewProjectRules(empty, { ...rules(), companyVersion: 99 }).errors.join()).toMatch(/unavailable/)
    expect(previewProjectRules(empty, rules(-1)).errors.length).toBeGreaterThan(0)
    expect(previewProjectRules(empty, { ...rules(), project: { unsupported: 1 } as never }).errors.join()).toMatch(/supported/)
    expect(previewProjectRules(scene(), { ...rules(), project: { carcaseMaterial: 'missing' } }).errors.length).toBeGreaterThan(0)
    expect(previewProjectRules(scene(), { ...rules(), project: { edgeMaterial: '18mm Ply' } }).errors.join()).toMatch(/edge-band/)
  })

  it('validates against retained per-part thickness overrides', () => {
    const original = scene()
    original.parts = original.parts.map((p) => p.kind === 'board' && p.role === 'left-side'
      ? { ...p, overrides: { thickness: 400 } } : p)
    const resolved = applyPipeline(original)
    const v2 = { ...definition, catalogueVersion: 2, params: { ...definition.params, width: 400 } }
    const result = previewCatalogueUpdate(resolved, 'cabinet', 2, [...CABINET_CATALOGUE, v2])
    expect(result.errors.join()).toMatch(/width must exceed/)
    expect(result.candidate).toBe(resolved)
  })

  it('supports explicit no-edge band and rejects stale acceptance', () => {
    const original = scene()
    const result = previewProjectRules(original, { ...rules(), project: { edgeMaterial: '' } })
    expect(result.errors).toEqual([])
    expect(first(result.candidate).params.edgeMaterial).toBe('')
    expect(acceptedRulePreview(original, result)).toBe(result.candidate)
    expect(acceptedRulePreview({ ...original, materials: { ...original.materials, Other: { thickness: 20 } } }, result)).toBeUndefined()
    expect(acceptedRulePreview(original, { ...result, errors: ['blocked'] })).toBeUndefined()
  })

  it('round-trips v26 rules and preserves v25 cabinet geometry without adopting rules', () => {
    const current = previewProjectRules(scene(), rules()).candidate
    const envelope = { version: FILE_FORMAT_VERSION, name: 'Test', appVersion: '0', units: 'mm', createdAt: '', updatedAt: '',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene: current, project: defaultProject(current, 'test') }
    expect(parseFile(JSON.stringify(envelope)).scene.cabinetRules).toEqual(rules())
    const legacy = parseFile(JSON.stringify({ ...envelope, version: 25, scene: scene() }))
    expect(legacy.scene.cabinetRules).toBeUndefined()
    expect(first(legacy.scene).params.frontReveal).toBe(3)
  })
})
