import { HARDWARE_CATALOGUE } from '../scene/hardwareCatalogue'
import type { HardwareLine } from '../scene/carcaseHardware'
import type { ComponentId, HardwareLibraryEntry } from '../scene/types'

export interface HardwareRow {
  componentId: ComponentId | null
  key: string
  cabinetLabel: string
  name: string
  qty: number
  unit: string
  supplier: string
  partNumber: string
  unitCost: number | null
  totalCost: number | null
}

// Quantity from the cabinet, identity from the catalogue, price from the library — three sources,
// joined here and nowhere else.
//
// An unpriced key costs `null`, not 0, exactly as `groupDowels` treats a material with no rate: a
// job nobody has priced yet must not add up to nothing. A library entry that says 0 IS a price.
export function groupHardware(
  lines: HardwareLine[],
  library: Record<string, HardwareLibraryEntry>,
): HardwareRow[] {
  return lines.map((line) => {
    const def = HARDWARE_CATALOGUE[line.key]
    const entry = library[line.key]
    const unitCost = entry === undefined ? null : entry.unitCost
    return {
      componentId: line.componentId,
      key: line.key,
      cabinetLabel: line.cabinetLabel,
      name: def.name,
      qty: line.qty,
      unit: def.unit,
      supplier: entry?.supplier ?? '',
      partNumber: entry?.partNumber ?? '',
      unitCost,
      totalCost: unitCost === null ? null : unitCost * line.qty,
    }
  })
}
