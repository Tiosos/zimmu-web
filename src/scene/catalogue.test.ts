import { describe, expect, it } from 'vitest'
import { CABINET_CATALOGUE, catalogueDefinition, catalogueOverrides, catalogueSources, reconcileCatalogue } from './catalogue'
import { freshSectionIds } from './sectionTree'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { defaultProject } from './projectStructure'
import { validateCurrentFile } from './fileValidation'
import type { CarcaseComponent, Scene, ZimmuFile } from './types'

const definition = CABINET_CATALOGUE[0]
const cabinet = (): CarcaseComponent => ({
  kind: 'carcase', id: 'cmp_1', label: definition.name, parentId: null,
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ', visible: true,
  params: { ...definition.params, section: freshSectionIds(definition.params.section) },
  catalogue: { id: definition.catalogueId, version: definition.catalogueVersion, overrides: {} },
})
const scene = (component = cabinet()): Scene => ({
  parts: [], components: [component], materials: {}, hardware: [], joints: [],
})
const envelope = (component = cabinet()): ZimmuFile => ({
  version: FILE_FORMAT_VERSION, name: 'Test', appVersion: '0', units: 'mm',
  createdAt: '', updatedAt: '',
  camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
  scene: scene(component), project: defaultProject(scene(component), 'test'),
})

describe('cabinet catalogue', () => {
  it('has unique pinned base, wall, and tall products with existing preset geometry', () => {
    expect(CABINET_CATALOGUE.map((entry) => entry.category)).toEqual(['base', 'wall', 'tall'])
    expect(new Set(CABINET_CATALOGUE.map((entry) => entry.catalogueId)).size).toBe(3)
    for (const entry of CABINET_CATALOGUE) {
      expect(catalogueDefinition(entry.catalogueId, entry.catalogueVersion)?.params).toEqual(entry.params)
    }
  })

  it('ignores instance section IDs, then records an explicit width override', () => {
    const original = cabinet()
    expect(catalogueOverrides(original)).toEqual({})
    const edited = { ...original, params: { ...original.params, width: 750 } }
    const reconciled = reconcileCatalogue(edited)
    expect(reconciled.catalogue?.overrides).toEqual({ width: 750 })
    expect(catalogueSources(reconciled).width).toBe('item')
    expect(catalogueSources(reconciled).height).toBe('catalogue')
    expect(reconcileCatalogue({ ...reconciled, params: original.params }).catalogue?.overrides).toEqual({})
  })

  it('records a newly added optional frame as an item override', () => {
    const original = cabinet()
    const frame = { stileWidth: 38, railWidth: 38, midStileWidth: 51, midRailWidth: 38 }
    const edited = reconcileCatalogue({ ...original, params: { ...original.params, frame } })
    expect(edited.catalogue?.overrides.frame).toEqual(frame)
    expect(catalogueSources(edited).frame).toBe('item')
  })

  it('keeps saved geometry and overrides when the pinned version is unavailable', () => {
    const base = cabinet()
    const missing = { ...base, params: { ...base.params, width: 750 },
      catalogue: { id: definition.catalogueId, version: 99, overrides: { width: 750 } } }
    expect(catalogueDefinition(missing.catalogue.id, missing.catalogue.version)).toBeUndefined()
    expect(reconcileCatalogue(missing)).toBe(missing)
    expect(parseFile(JSON.stringify(envelope(missing))).scene.components[0]).toMatchObject({
      params: missing.params, catalogue: missing.catalogue,
    })
  })

  it('reads a v24 cabinet as custom and preserves its geometry', () => {
    const legacy = cabinet()
    const custom: CarcaseComponent = { ...legacy, catalogue: undefined }
    const parsed = parseFile(JSON.stringify({ ...envelope(custom), version: 24 }))
    expect(parsed.scene.components[0]).toMatchObject({ params: custom.params })
    expect((parsed.scene.components[0] as CarcaseComponent).catalogue).toBeUndefined()
  })

  it('rejects malformed catalogue references and unknown override fields', () => {
    expect(() => validateCurrentFile(envelope({ ...cabinet(), catalogue: {
      id: '', version: 1, overrides: {},
    } }))).toThrow(/catalogue.id/)
    expect(() => validateCurrentFile(envelope({ ...cabinet(), catalogue: {
      id: definition.catalogueId, version: 1, overrides: { nonsense: 1 } as never,
    } }))).toThrow(/catalogue.overrides.nonsense/)
  })
})
