import { CARCASE_PRESETS, type CarcasePreset } from './carcasePresets'
import type { CarcaseComponent, CarcaseParams } from './types'
import { companyRuleValues, STARTER_RULES, RULE_KEYS, type CabinetRules, type RuleOverrides } from './constructionRules'

export type CatalogueDefinition = CarcasePreset & {
  catalogueId: string
  catalogueVersion: number
  category: 'base' | 'wall' | 'tall'
  /** Sparse recipe rules; an absent key inherits the company version. */
  ruleOverrides?: RuleOverrides
}

const starterDefinitions: CatalogueDefinition[] = CARCASE_PRESETS.filter(
  (preset): preset is CatalogueDefinition => Boolean(preset.catalogueId && preset.catalogueVersion && preset.category),
)

// Adapt the existing complete starter presets once; future recipes declare overrides explicitly.
export const CABINET_CATALOGUE = starterDefinitions.map((definition) => ({ ...definition,
  ruleOverrides: Object.fromEntries(RULE_KEYS.filter((key) => comparable(definition.params[key]) !==
    comparable(STARTER_RULES.values[key])).map((key) => [key, definition.params[key]])) as RuleOverrides,
}))

export function catalogueDefinition(id: string, version: number): CatalogueDefinition | undefined {
  return CABINET_CATALOGUE.find((entry) => entry.catalogueId === id && entry.catalogueVersion === version)
}

// Section IDs belong to an instance. They cannot decide whether its section design was overridden.
function comparable(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => key === 'id' ? undefined : item) ?? 'undefined'
}

export function catalogueBaseline(definition: CatalogueDefinition, rules?: CabinetRules): CarcaseParams | undefined {
  const company = companyRuleValues(rules)
  if (!company) return undefined
  const recipe: Partial<CarcaseParams> = { ...definition.params }
  for (const key of RULE_KEYS) delete recipe[key]
  return { ...company, ...recipe, ...definition.ruleOverrides, ...rules?.project } as CarcaseParams
}

export function catalogueOverrides(cabinet: CarcaseComponent, rules?: CabinetRules): Partial<CarcaseParams> {
  const ref = cabinet.catalogue
  const definition = ref && catalogueDefinition(ref.id, ref.version)
  const baseline = definition && catalogueBaseline(definition, rules)
  if (!baseline) return ref?.overrides ?? {}
  const overrides: Partial<CarcaseParams> = {}
  const keys = new Set([...Object.keys(baseline), ...Object.keys(cabinet.params)] as (keyof CarcaseParams)[])
  for (const key of keys) {
    if (comparable(cabinet.params[key]) !== comparable(baseline[key])) {
      // Each field is an atomic override; section and frame are intentionally one field each.
      Object.assign(overrides, { [key]: cabinet.params[key] })
    }
  }
  return overrides
}

export function reconcileCatalogue(cabinet: CarcaseComponent, rules?: CabinetRules): CarcaseComponent {
  if (!cabinet.catalogue) return cabinet
  const definition = catalogueDefinition(cabinet.catalogue.id, cabinet.catalogue.version)
  const baseline = definition && catalogueBaseline(definition, rules)
  // Without a baseline, retain the recorded override keys and refresh their saved values.
  // The unresolved version prevents claiming provenance for other parameters.
  const overrides = baseline ? catalogueOverrides(cabinet, rules) : Object.fromEntries(
    Object.keys(cabinet.catalogue.overrides).filter((key) => Object.hasOwn(cabinet.params, key))
      .map((key) => [key, cabinet.params[key as keyof CarcaseParams]]),
  )
  // Instance IDs must survive in the persisted override even when its design is unchanged.
  if (JSON.stringify(overrides) === JSON.stringify(cabinet.catalogue.overrides)) return cabinet
  return { ...cabinet, catalogue: { ...cabinet.catalogue, overrides } }
}

export function catalogueSources(cabinet: CarcaseComponent, rules?: CabinetRules): Partial<Record<keyof CarcaseParams, 'company' | 'catalogue' | 'project' | 'item'>> {
  const definition = cabinet.catalogue && catalogueDefinition(cabinet.catalogue.id, cabinet.catalogue.version)
  if (!definition || !catalogueBaseline(definition, rules)) return {}
  const overrides = catalogueOverrides(cabinet, rules)
  return Object.fromEntries((Object.keys(cabinet.params) as (keyof CarcaseParams)[])
    .map((key) => [key, key in overrides ? 'item' : Object.hasOwn(rules?.project ?? {}, key) ? 'project' :
      RULE_KEYS.includes(key as typeof RULE_KEYS[number]) && !Object.hasOwn(definition.ruleOverrides ?? {}, key) ? 'company' : 'catalogue']))
}
