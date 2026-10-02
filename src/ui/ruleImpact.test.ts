import { describe, expect, it } from 'vitest'
import { buildRuleImpact } from './ruleImpact'
import type { RulePreview } from '../scene/ruleFlow'
import type {
  BoardPart,
  HoleArrayCut,
  Scene,
  HardwareLibraryEntry,
  CarcaseComponent,
} from '../scene/types'
import { CABINET_CATALOGUE, catalogueBaseline, installedDefinitions } from '../scene/catalogue'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { applyPipeline } from '../scene/pipeline'
import { installCataloguePackage } from '../scene/cataloguePackage'
import { packageFixture } from '../scene/__fixtures__/companyCatalogue'
import { previewCatalogueUpdate, previewProjectRules } from '../scene/ruleFlow'
import { DEFAULT_CABINET_RULES } from '../scene/constructionRules'
import { HARDWARE_CATALOGUE } from '../scene/hardwareCatalogue'
import { carcaseHardware } from '../scene/carcaseHardware'
import { effectiveMaterialsOf } from '../scene/effectiveMaterials'
import { groupParts, groupDowels, groupEdgeBand } from './buildCsv'
import { groupHardware } from './groupHardware'
const board = (id = 'board'): BoardPart => ({
  kind: 'board',
  id,
  label: id,
  length: 1000,
  width: 500,
  thickness: 18,
  material: 'Ply',
  grain: 'length',
  color: 'red',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  parentId: null,
  visible: true,
  driven: false,
  cuts: [],
})
const empty = (): Scene => ({
  parts: [],
  components: [],
  joints: [],
  hardware: [],
  materials: { Ply: { thickness: 18 } },
})
export const comparison = (source: Scene, candidate: Scene): RulePreview => ({
  source: JSON.stringify(source),
  candidate,
  errors: [],
  changes: [],
  partsChanged: 0,
  hardwareChanged: false,
})
const hardwareLibrary: Record<string, HardwareLibraryEntry> = Object.fromEntries(
  Object.keys(HARDWARE_CATALOGUE).map((key) => [
    key,
    { supplier: '', partNumber: '', unitCost: 2 },
  ]),
)
function companyScene(): Scene {
  const s = installCataloguePackage({ ...empty(), materials: PRESET_MATERIALS }, packageFixture())
  const d = installedDefinitions(s.companyCatalogues)[0]
  const cabinet: CarcaseComponent = {
    kind: 'carcase',
    id: 'cabinet',
    label: d.name,
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: catalogueBaseline(d)!,
    catalogue: { id: d.catalogueId, version: 1, overrides: {} },
  }
  return applyPipeline({ ...s, components: [cabinet] })
}
describe('manufacturing impact comparison', () => {
  it('reports no changes for identical scenes and ignores object field order', () => {
    const source = { ...empty(), parts: [board()] }
    const next = structuredClone(source)
    next.parts[0].position = { z: 0, y: 0, x: 0 }
    const result = buildRuleImpact(comparison(source, next))!
    expect(result.parts).toEqual([])
    expect(result.materials).toEqual([])
    expect(result.hardware).toEqual([])
    expect(result.costDelta).toBeNull()
    expect(result.beforeCost.total).toBeNull()
  })
  it('matches by stable ID and reports added/removed parts and placement-only change', () => {
    const source = { ...empty(), parts: [board('removed'), board('same')] }
    const next = {
      ...empty(),
      parts: [board('added'), { ...board('same'), position: { x: 50, y: 0, z: 0 } }],
    }
    const result = buildRuleImpact(comparison(source, next))!
    expect(result.parts.map((p) => [p.id, p.status])).toEqual([
      ['added', 'added'],
      ['removed', 'removed'],
      ['same', 'changed'],
    ])
    expect(result.parts.find((p) => p.id === 'same')?.fields).toEqual(['assembly placement'])
    expect(result.materials).toEqual([])
  })
  it('includes world placement inherited from a moved parent assembly', () => {
    const source = companyScene()
    const next = structuredClone(source)
    next.components[0].position.x += 50
    next.components[0].rotation.y = 90
    const result = buildRuleImpact(comparison(source, next))!
    expect(result.parts).toHaveLength(source.parts.length)
    expect(result.parts.every((p) => p.fields.includes('assembly placement'))).toBe(true)
    expect(result.parts[0].before?.placement).toContain('worldPosition')
    expect(result.parts[0].after?.placement).not.toBe(result.parts[0].before?.placement)
    expect(result.materials).toEqual([])
    expect(result.hardware).toEqual([])
  })
  it('reports an anchored neighbour moved indirectly by an imported version update', () => {
    let source = companyScene()
    const first = source.components[0] as CarcaseComponent
    const neighbour: CarcaseComponent = {
      ...structuredClone(first),
      id: 'neighbour',
      label: 'Neighbour',
      catalogue: undefined,
      anchor: { to: first.id, face: 'right', gap: 0, offset: { u: 0, v: 0 } },
    }
    source = applyPipeline({ ...source, components: [...source.components, neighbour] })
    source = installCataloguePackage(source, packageFixture(2))
    const preview = previewCatalogueUpdate(source, first.id, 2)
    expect(preview.errors).toEqual([])
    const result = buildRuleImpact(preview)!
    const neighbourIds = new Set(
      source.parts.filter((p) => p.parentId === 'neighbour').map((p) => p.id),
    )
    const moved = result.parts.filter((p) => neighbourIds.has(p.id))
    expect(moved.length).toBeGreaterThan(0)
    expect(moved.some((p) => p.fields.length === 1 && p.fields[0] === 'assembly placement')).toBe(
      true,
    )
    expect(preview.candidate.components.find((c) => c.id === 'neighbour')?.position.x).toBe(620)
    expect(source.components.find((c) => c.id === 'neighbour')?.position.x).toBe(610)
  })
  it('detects equal-count changed drilling depth/face and manual instructions', () => {
    const b = board()
    b.cuts = [
      {
        kind: 'hole-array',
        id: 'row',
        label: 'Shelf pins',
        face: '+X',
        axis: 'U',
        start: { x: 18, y: 40, z: 40 },
        pitch: 32,
        count: 4,
        diameter: 5,
        depth: 10,
      },
    ]
    b.operations = [
      {
        kind: 'manual-machining',
        id: 'manual',
        label: 'Jig pilot',
        face: '+X',
        at: { x: 0, y: 0, z: 0 },
        diameter: 2,
        pitch: 20,
        count: 2,
        angle: 15,
        edgeOffset: 10,
        template: 'Jig A',
        instruction: 'Use jig A',
        hardwareKey: 'hinge-overlay',
      },
    ]
    const source = { ...empty(), parts: [b] }
    const next = structuredClone(source)
    next.parts[0].cuts[0] = { ...(b.cuts[0] as HoleArrayCut), face: '-X', depth: 12 }
    next.parts[0].operations![0].instruction = 'Use jig B'
    const part = buildRuleImpact(comparison(source, next))!.parts[0]
    expect(part.fields).toEqual(['machining', 'manual instructions'])
    expect(part.after?.machiningDetails[0]).toContain('Depth (mm): 12')
    expect(part.after?.machiningDetails[0]).toContain('Face: -X')
    expect(part.before?.instructionDetails[0]).toContain('Use jig A')
    expect(part.after?.instructionDetails[0]).toContain('Use jig B')
  })
  it('uses cut area and exact edge lengths, preserving finished dimensions', () => {
    const source = {
      ...empty(),
      materials: {
        Ply: { thickness: 18, costPerM2: 10 },
        Tape: { use: 'edge' as const, thickness: 2, costPerM: 3 },
      },
      parts: [board()],
    }
    const next = structuredClone(source)
    next.parts[0].edgeBanding = { x0: 'Tape', x1: 'Tape' }
    const result = buildRuleImpact(comparison(source, next))!
    expect(result.parts[0].fields).toEqual(['cut size', 'edge treatment'])
    expect(result.parts[0].before?.finished).toEqual([1000, 500, 18])
    expect(result.parts[0].after?.cut).toEqual([996, 500, 18])
    expect(result.materials.find((q) => q.unit === 'm²')).toMatchObject({
      before: 0.5,
      after: 0.498,
    })
    expect(result.materials.find((q) => q.name === 'Edge band: Tape')).toMatchObject({
      before: 0,
      after: 1,
    })
    expect(result.beforeCost.total).toBe(5)
    expect(result.afterCost.total).toBeCloseTo(7.98)
    expect(result.costDelta).toBeCloseTo(2.98)
  })
  it('does not claim a total for missing, negative or non-finite rates; explicit zero is priced', () => {
    const source = { ...empty(), parts: [board()] }
    const preview = comparison(source, source)
    for (const rate of [undefined, -1, NaN, Infinity]) {
      const result = buildRuleImpact(preview, { library: { Ply: { costPerM2: rate } } })!
      expect(result.beforeCost.issues).toHaveLength(1)
      expect(result.beforeCost.total).toBeNull()
      expect(result.costDelta).toBeNull()
    }
    const zero = buildRuleImpact(preview, { library: { Ply: { costPerM2: 0 } } })!
    expect(zero.beforeCost.total).toBe(0)
    expect(zero.costDelta).toBe(0)
  })
  it('shows unknown total when only the old version is priced, and reprices on current libraries', () => {
    let source = companyScene()
    source = installCataloguePackage(source, packageFixture(2))
    const preview = previewCatalogueUpdate(source, 'cabinet', 2)
    const library = Object.fromEntries(
      Object.keys(source.materials)
        .filter((k) => k.includes(':v1:'))
        .map((k) => [k, { costPerM2: 10 }]),
    )
    const incomplete = buildRuleImpact(preview, { library, hardwareLibrary })!
    expect(incomplete.beforeCost.total).not.toBeNull()
    expect(incomplete.afterCost.total).toBeNull()
    expect(incomplete.costDelta).toBeNull()
    expect(incomplete.afterCost.issues.some((s) => s.includes(':v2:'))).toBe(true)
    expect(incomplete.materials.some((q) => q.name.includes(':v1:') && q.after === 0)).toBe(true)
    expect(incomplete.materials.some((q) => q.name.includes(':v2:') && q.before === 0)).toBe(true)
    const all = Object.fromEntries(Object.keys(source.materials).map((k) => [k, { costPerM2: 20 }]))
    expect(buildRuleImpact(preview, { library: all, hardwareLibrary })!.costDelta).not.toBeNull()
    expect(
      buildRuleImpact(preview, { library: all, hardwareLibrary })!.beforeCost.known,
    ).toBeGreaterThan(incomplete.beforeCost.known)
  })
  it('matches BOM subtotals on project/library merges and includes round stock/manual hardware', () => {
    const source = companyScene()
    source.parts.push({
      ...board('dowel'),
      kind: 'cylinder',
      diameter: 8,
      length: 500,
      material: 'Oak',
      cuts: [],
    })
    source.materials.Oak = { costPerM: 4 }
    source.hardware.push({
      id: 'manual',
      name: 'Bracket',
      qty: 2,
      unitCost: 3,
      unit: 'pcs',
      supplier: '',
      partNumber: '',
      notes: '',
      linkedPartIds: [],
      linkedComponentIds: [],
    })
    const library = Object.fromEntries(
      Object.keys(source.materials).map((k) => [k, { costPerM2: 10, costPerM: 9 }]),
    )
    const materials = effectiveMaterialsOf(library, source.materials)
    const expected = [
      ...groupParts(source.parts, materials, source.components).map((r) => r.totalCost),
      ...groupDowels(source.parts, materials).map((r) => r.totalCost),
      ...groupEdgeBand(source.parts, materials, source.components).map((r) => r.cost),
      ...groupHardware(carcaseHardware(source), hardwareLibrary).map((r) => r.totalCost),
    ].reduce<number>((n, cost) => n + (cost ?? 0), 6)
    const result = buildRuleImpact(comparison(empty(), source), { library, hardwareLibrary })!
    expect(result.afterCost.total).toBeCloseTo(expected)
    expect(result.materials.find((q) => q.name === 'Round stock: Oak')?.after).toBe(0.5)
    expect(result.hardware.find((q) => q.name === 'Manual: Bracket')?.after).toBe(2)
  })
  it('flags impossible cut sizes without treating their negative area as a priced credit', () => {
    const source = {
      ...empty(),
      materials: {
        Ply: { thickness: 18, costPerM2: 10 },
        Tape: { thickness: 600, use: 'edge' as const, costPerM: 0 },
      },
      parts: [board()],
    }
    const next = structuredClone(source)
    next.parts[0].edgeBanding = { x0: 'Tape', x1: 'Tape', y0: 'Tape', y1: 'Tape' }
    const result = buildRuleImpact(comparison(source, next))!
    expect(result.parts[0].after?.problem).toBeTruthy()
    expect(result.materials.find((q) => q.name === 'Board: Ply')?.after).toBeNull()
    expect(result.afterCost.total).toBeNull()
    expect(result.afterCost.known).toBe(0)
    expect(result.costDelta).toBeNull()
  })
  it('keeps invalid round stock incomplete even at an explicit zero rate', () => {
    const source = empty()
    source.parts = [
      { ...board('round'), kind: 'cylinder', material: 'Oak', length: -100, diameter: 0, cuts: [] },
    ]
    const result = buildRuleImpact(comparison(empty(), source), {
      library: { Oak: { costPerM: 0 } },
    })!
    expect(result.materials[0].after).toBeNull()
    expect(result.afterCost.total).toBeNull()
    expect(result.afterCost.issues).toHaveLength(1)
  })
  it('reports generated hardware selection and machining changes without changing the scenes', () => {
    const d = CABINET_CATALOGUE[0]
    const cabinet: CarcaseComponent = {
      ...(companyScene().components[0] as CarcaseComponent),
      params: d.params,
      catalogue: { id: d.catalogueId, version: 1, overrides: {} },
    }
    const source = applyPipeline({ ...empty(), materials: PRESET_MATERIALS, components: [cabinet] })
    const preview = previewProjectRules(source, {
      ...DEFAULT_CABINET_RULES,
      project: { frontMount: 'inset' },
    })
    expect(preview.errors).toEqual([])
    const signatures = [JSON.stringify(source), JSON.stringify(preview.candidate)]
    const result = buildRuleImpact(preview)!
    expect(result.hardware.find((q) => q.name.includes('(hinge-overlay)'))?.after).toBe(0)
    expect(result.hardware.find((q) => q.name.includes('(hinge-inset)'))?.before).toBe(0)
    expect(result.parts.some((p) => p.fields.includes('machining'))).toBe(true)
    expect([JSON.stringify(source), JSON.stringify(preview.candidate)]).toEqual(signatures)
  })
  it('skips blocked previews without presenting an impact estimate', () => {
    expect(
      buildRuleImpact({
        ...comparison(empty(), empty()),
        errors: ['Invalid rules'],
      }),
    ).toBeUndefined()
  })
  it('detects cost overflow without reporting an infinite total', () => {
    const source = { ...empty(), parts: [board('one'), board('two'), board('three')] }
    source.parts.forEach((p, i) => {
      p.length = 2000
      p.material = `Ply-${i}`
    })
    const library = Object.fromEntries(source.parts.map((p) => [p.material, { costPerM2: 1e308 }]))
    const result = buildRuleImpact(comparison(source, source), { library })!
    expect(result.beforeCost.known).toBe(1e308)
    expect(result.beforeCost.total).toBeNull()
  })
  it('rejects invalid manual hardware quantity/rate even when their product is positive', () => {
    const source = empty()
    source.hardware = [
      {
        id: 'manual',
        name: 'Bracket',
        qty: -2,
        unitCost: -3,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        notes: '',
        linkedPartIds: [],
        linkedComponentIds: [],
      },
    ]
    const result = buildRuleImpact(comparison(source, source))!
    expect(result.beforeCost.total).toBeNull()
    expect(result.beforeCost.known).toBe(0)
    expect(result.beforeCost.issues).toHaveLength(1)
  })
  it('keeps a material quantity unavailable when any member has an invalid cut size', () => {
    const source = {
      ...empty(),
      materials: {
        Ply: { thickness: 18, costPerM2: 10 },
        Tape: { thickness: 600, use: 'edge' as const, costPerM: 0 },
      },
      parts: [board('one'), board('two')],
    }
    const next = structuredClone(source)
    next.parts[0].edgeBanding = { x0: 'Tape', x1: 'Tape' }
    const result = buildRuleImpact(comparison(source, next))!
    expect(result.materials.find((q) => q.name === 'Board: Ply')?.after).toBeNull()
    expect(result.afterCost.total).toBeNull()
    expect(result.afterCost.known).toBe(5)
  })
})
