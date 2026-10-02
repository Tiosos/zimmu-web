import { CARCASE_PRESETS, type CarcasePreset } from './carcasePresets'
import type { CarcaseComponent, CarcaseParams } from './types'

export type CatalogueDefinition = CarcasePreset & {
  catalogueId: string
  catalogueVersion: number
  category: 'base' | 'wall' | 'tall'
}

export const CABINET_CATALOGUE: CatalogueDefinition[] = CARCASE_PRESETS.filter(
  (preset): preset is CatalogueDefinition => Boolean(preset.catalogueId && preset.catalogueVersion && preset.category),
)

export function catalogueDefinition(id: string, version: number): CatalogueDefinition | undefined {
  return CABINET_CATALOGUE.find((entry) => entry.catalogueId === id && entry.catalogueVersion === version)
}

// Section IDs belong to an instance. They cannot decide whether its section design was overridden.
function comparable(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => key === 'id' ? undefined : item) ?? 'undefined'
}

export function catalogueOverrides(cabinet: CarcaseComponent): Partial<CarcaseParams> {
  const ref = cabinet.catalogue
  const definition = ref && catalogueDefinition(ref.id, ref.version)
  if (!definition) return ref?.overrides ?? {}
  const overrides: Partial<CarcaseParams> = {}
  const keys = new Set([...Object.keys(definition.params), ...Object.keys(cabinet.params)] as (keyof CarcaseParams)[])
  for (const key of keys) {
    if (comparable(cabinet.params[key]) !== comparable(definition.params[key])) {
      // Each field is an atomic override; section and frame are intentionally one field each.
      Object.assign(overrides, { [key]: cabinet.params[key] })
    }
  }
  return overrides
}

export function reconcileCatalogue(cabinet: CarcaseComponent): CarcaseComponent {
  if (!cabinet.catalogue || !catalogueDefinition(cabinet.catalogue.id, cabinet.catalogue.version)) return cabinet
  const overrides = catalogueOverrides(cabinet)
  if (comparable(overrides) === comparable(cabinet.catalogue.overrides)) return cabinet
  return { ...cabinet, catalogue: { ...cabinet.catalogue, overrides } }
}

export function catalogueSources(cabinet: CarcaseComponent): Partial<Record<keyof CarcaseParams, 'catalogue' | 'item'>> {
  if (!cabinet.catalogue || !catalogueDefinition(cabinet.catalogue.id, cabinet.catalogue.version)) return {}
  const overrides = catalogueOverrides(cabinet)
  return Object.fromEntries((Object.keys(cabinet.params) as (keyof CarcaseParams)[])
    .map((key) => [key, key in overrides ? 'item' : 'catalogue']))
}
