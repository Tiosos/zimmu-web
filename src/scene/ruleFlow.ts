import { CABINET_CATALOGUE, catalogueBaseline, catalogueOverrides, type CatalogueDefinition } from './catalogue'
import { companyRuleValues, type CabinetRules } from './constructionRules'
import { validateCabinetRules } from './fileValidation'
import type { CarcaseComponent, CarcaseParams, Scene } from './types'
import { applyPipeline } from './pipeline'
import { roleThicknessFor } from './resolveThickness'
import { validateCarcaseParams } from './carcaseRoles'
import { carcaseHardware } from './carcaseHardware'

export interface RulePreview {
  source: string
  candidate: Scene
  errors: string[]
  changes: { cabinetId: string; label: string; fields: string[] }[]
  partsChanged: number
  hardwareChanged: boolean
}

const equalDesign = (a: unknown, b: unknown) => JSON.stringify(a, (key, value: unknown) => key === 'id' ? undefined : value)
  === JSON.stringify(b, (key, value: unknown) => key === 'id' ? undefined : value)

function preview(scene: Scene, rules: CabinetRules | undefined, target?: { cabinetId: string; id: string; version: number },
  definitions: CatalogueDefinition[] = CABINET_CATALOGUE): RulePreview {
  const result: RulePreview = { source: JSON.stringify(scene), candidate: scene, errors: [], changes: [], partsChanged: 0, hardwareChanged: false }
  try {
    if (rules) validateCabinetRules(rules)
    for (const [key, value] of Object.entries(rules?.project ?? {})) {
      if (key.endsWith('Material') && value && !scene.materials[String(value)])
        result.errors.push(`${key}: project material is unavailable.`)
      if (key === 'edgeMaterial' && value && scene.materials[String(value)]?.use !== 'edge')
        result.errors.push('edgeMaterial must name edge-band stock')
    }
    if (!companyRuleValues(rules)) result.errors.push('Company rule version is unavailable.')
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Invalid project rules.')
  }
  if (result.errors.length) return result
  if (target && !scene.components.some((c) => c.id === target.cabinetId && c.kind === 'carcase' && c.catalogue))
    result.errors.push('The catalogue cabinet is no longer available.')
  const components = scene.components.map((component) => {
    if (component.kind !== 'carcase' || !component.catalogue || (target && component.id !== target.cabinetId)) return component
    const ref = component.catalogue
    const oldDefinition = definitions.find((d) => d.catalogueId === ref.id && d.catalogueVersion === ref.version)
    const nextDefinition = target ? definitions.find((d) => d.catalogueId === target.id && d.catalogueVersion === target.version) : oldDefinition
    if (!oldDefinition || !nextDefinition || nextDefinition.catalogueId !== ref.id) {
      result.errors.push(`${component.label}: catalogue version is unavailable or belongs to another product.`)
      return component
    }
    const baseline = catalogueBaseline(nextDefinition, rules)
    if (!baseline || !catalogueBaseline(oldDefinition, scene.cabinetRules)) {
      result.errors.push(`${component.label}: company rule version is unavailable.`)
      return component
    }
    const overrides = catalogueOverrides(component, scene.cabinetRules)
    if ((!Object.hasOwn(overrides, 'section') && !equalDesign(component.params.section, baseline.section)) ||
        (!Object.hasOwn(overrides, 'frame') && !equalDesign(component.params.frame, baseline.frame))) {
      result.errors.push(`${component.label}: section/frame layout changes require manual reconciliation.`)
      return component
    }
    const params: CarcaseParams = { ...baseline, section: component.params.section, ...overrides }
    const errors = validateCarcaseParams(params, roleThicknessFor(params, scene.materials, new Map()))
    if (params.edgeMaterial && scene.materials[params.edgeMaterial]?.use !== 'edge') errors.push('edgeMaterial must name edge-band stock')
    result.errors.push(...errors.map((error) => `${component.label}: ${error}`))
    const fields = [...new Set([...Object.keys(params), ...Object.keys(component.params)])]
      .filter((key) => !equalDesign(component.params[key as keyof CarcaseParams], params[key as keyof CarcaseParams]))
    if (fields.length || ref.version !== nextDefinition.catalogueVersion) result.changes.push({ cabinetId: component.id, label: component.label, fields })
    return { ...component, params, catalogue: { ...ref, version: nextDefinition.catalogueVersion, overrides } } as CarcaseComponent
  })
  if (result.errors.length) return result
  result.candidate = applyPipeline({ ...scene, ...(rules ? { cabinetRules: rules } : {}), components })
  const before = new Map(scene.parts.map((p) => [p.id, p]))
  const after = new Map(result.candidate.parts.map((p) => [p.id, p]))
  result.partsChanged = [...new Set([...before.keys(), ...after.keys()])]
    .filter((id) => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))).length
  result.hardwareChanged = JSON.stringify(carcaseHardware(scene)) !== JSON.stringify(carcaseHardware(result.candidate))
  return result
}

export const previewProjectRules = (scene: Scene, rules: CabinetRules): RulePreview => preview(scene, rules)
export const previewCatalogueUpdate = (scene: Scene, cabinetId: string, version: number,
  definitions: CatalogueDefinition[] = CABINET_CATALOGUE): RulePreview => {
  const cabinet = scene.components.find((c) => c.id === cabinetId)
  return preview(scene, scene.cabinetRules, { cabinetId, id: cabinet?.kind === 'carcase' ? cabinet.catalogue?.id ?? '' : '', version }, definitions)
}

export function acceptedRulePreview(scene: Scene, result: RulePreview): Scene | undefined {
  return result.errors.length === 0 && result.source === JSON.stringify(scene) ? result.candidate : undefined
}
