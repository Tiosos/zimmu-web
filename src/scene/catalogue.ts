import type { CataloguePackage } from './cataloguePackage'
import { qualifiedDefinition, remapRuleMaterials } from './cataloguePackage'
import type { RuleContent, ProductContent } from '../company/types'
import { CARCASE_PRESETS, type CarcasePreset } from './carcasePresets'
import type { CarcaseComponent, CarcaseParams } from './types'
import {
  companyRuleValues,
  STARTER_RULES,
  RULE_KEYS,
  type CabinetRules,
  type RuleOverrides,
} from './constructionRules'

export type CatalogueDefinition = CarcasePreset & {
  catalogueId: string
  catalogueVersion: number
  category: 'base' | 'wall' | 'tall'
  /** Sparse recipe rules; an absent key inherits the company version. */
  ruleOverrides?: RuleOverrides
  companyValues?: RuleOverrides
  companyLabel?: string
}

const starterDefinitions: CatalogueDefinition[] = CARCASE_PRESETS.filter(
  (preset): preset is CatalogueDefinition =>
    Boolean(preset.catalogueId && preset.catalogueVersion && preset.category),
)

// Adapt the existing complete starter presets once; future recipes declare overrides explicitly.
export const CABINET_CATALOGUE = starterDefinitions.map((definition) => ({
  ...definition,
  ruleOverrides: Object.fromEntries(
    RULE_KEYS.filter(
      (key) => comparable(definition.params[key]) !== comparable(STARTER_RULES.values[key]),
    ).map((key) => [key, definition.params[key]]),
  ) as RuleOverrides,
}))

export function installedDefinitions(packages: CataloguePackage[] = []): CatalogueDefinition[] {
  return packages.flatMap((pkg) =>
    pkg.versions
      .filter((v) => v.kind === 'product')
      .map((v) => {
        const product = v.content as ProductContent
        const rule = pkg.versions.find(
          (r) =>
            r.kind === 'rule' &&
            r.definitionId === product.rule.id &&
            r.version === product.rule.version,
        )!
        const master = rule.content as RuleContent
        const seed = CABINET_CATALOGUE.find(
          (d) =>
            d.catalogueId === product.source.id && d.catalogueVersion === product.source.version,
        )!
        const remap = <T extends Record<string, unknown>>(values: T) =>
          remapRuleMaterials(values, pkg.companyId, rule.definitionId, rule.version)
        return {
          name: product.name,
          catalogueId: qualifiedDefinition(pkg.companyId, v.definitionId),
          catalogueVersion: v.version,
          category: product.category!,
          params: remap(
            product.params! as unknown as Record<string, unknown>,
          ) as unknown as CarcaseParams,
          companyValues: remap(master.values),
          companyLabel: `${pkg.companyId} · ${product.rule.id} v${product.rule.version}`,
          ruleOverrides: remap(
            Object.fromEntries(
              Object.entries({ ...seed.ruleOverrides, ...product.overrides }).filter(([key]) =>
                (RULE_KEYS as readonly string[]).includes(key),
              ),
            ),
          ) as RuleOverrides,
        }
      }),
  )
}
export const catalogueDefinitions = (packages: CataloguePackage[] = []): CatalogueDefinition[] => [
  ...CABINET_CATALOGUE,
  ...installedDefinitions(packages),
]
export function catalogueDefinition(
  id: string,
  version: number,
  packages: CataloguePackage[] = [],
): CatalogueDefinition | undefined {
  return catalogueDefinitions(packages).find(
    (entry) => entry.catalogueId === id && entry.catalogueVersion === version,
  )
}

// Section IDs belong to an instance. They cannot decide whether its section design was overridden.
function comparable(value: unknown): string {
  return (
    JSON.stringify(value, (key, item: unknown) => (key === 'id' ? undefined : item)) ?? 'undefined'
  )
}

export function catalogueBaseline(
  definition: CatalogueDefinition,
  rules?: CabinetRules,
): CarcaseParams | undefined {
  const company = definition.companyValues ?? companyRuleValues(rules)
  if (!company) return undefined
  const recipe: Partial<CarcaseParams> = { ...definition.params }
  for (const key of RULE_KEYS) delete recipe[key]
  return { ...company, ...recipe, ...definition.ruleOverrides, ...rules?.project } as CarcaseParams
}

export function catalogueOverrides(
  cabinet: CarcaseComponent,
  rules?: CabinetRules,
  packages: CataloguePackage[] = [],
): Partial<CarcaseParams> {
  const ref = cabinet.catalogue
  const definition = ref && catalogueDefinition(ref.id, ref.version, packages)
  const baseline = definition && catalogueBaseline(definition, rules)
  if (!baseline) return ref?.overrides ?? {}
  const overrides: Partial<CarcaseParams> = {}
  const keys = new Set([
    ...Object.keys(baseline),
    ...Object.keys(cabinet.params),
  ] as (keyof CarcaseParams)[])
  for (const key of keys) {
    if (comparable(cabinet.params[key]) !== comparable(baseline[key])) {
      // Each field is an atomic override; section and frame are intentionally one field each.
      Object.assign(overrides, { [key]: cabinet.params[key] })
    }
  }
  return overrides
}

export function reconcileCatalogue(
  cabinet: CarcaseComponent,
  rules?: CabinetRules,
  packages: CataloguePackage[] = [],
): CarcaseComponent {
  if (!cabinet.catalogue) return cabinet
  const definition = catalogueDefinition(cabinet.catalogue.id, cabinet.catalogue.version, packages)
  const baseline = definition && catalogueBaseline(definition, rules)
  // Without a baseline, retain the recorded override keys and refresh their saved values.
  // The unresolved version prevents claiming provenance for other parameters.
  const overrides = baseline
    ? catalogueOverrides(cabinet, rules, packages)
    : Object.fromEntries(
        Object.keys(cabinet.catalogue.overrides)
          .filter((key) => Object.hasOwn(cabinet.params, key))
          .map((key) => [key, cabinet.params[key as keyof CarcaseParams]]),
      )
  // Instance IDs must survive in the persisted override even when its design is unchanged.
  if (JSON.stringify(overrides) === JSON.stringify(cabinet.catalogue.overrides)) return cabinet
  return { ...cabinet, catalogue: { ...cabinet.catalogue, overrides } }
}

export function catalogueSources(
  cabinet: CarcaseComponent,
  rules?: CabinetRules,
  packages: CataloguePackage[] = [],
): Partial<Record<keyof CarcaseParams, 'company' | 'catalogue' | 'project' | 'item'>> {
  const definition =
    cabinet.catalogue &&
    catalogueDefinition(cabinet.catalogue.id, cabinet.catalogue.version, packages)
  if (!definition || !catalogueBaseline(definition, rules)) return {}
  const overrides = catalogueOverrides(cabinet, rules, packages)
  return Object.fromEntries(
    (Object.keys(cabinet.params) as (keyof CarcaseParams)[]).map((key) => [
      key,
      key in overrides
        ? 'item'
        : Object.hasOwn(rules?.project ?? {}, key)
          ? 'project'
          : RULE_KEYS.includes(key as (typeof RULE_KEYS)[number]) &&
              !Object.hasOwn(definition.ruleOverrides ?? {}, key)
            ? 'company'
            : 'catalogue',
    ]),
  )
}
