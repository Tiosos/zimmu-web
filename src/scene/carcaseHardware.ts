import { hingeKeyFor } from './hardwareCatalogue'
import type { CarcaseComponent, ComponentId, Scene } from './types'

// What a generated cabinet needs bought, counted off what its machining actually bored.
//
// The rule, stated once because four families follow it: **quantity comes from what the pipeline
// emitted; the variant comes from the cabinet.** Re-deriving counts from `CarcaseParams` would
// order hinges for a door too thin to bore and screws for a joint converted to a dado — the bores
// already know better.
//
// Nothing here is stored. This is a read over the scene, exactly as the cutting list and the dowel
// list are, which is why a hardware item needs no `driven` flag and no file-format version.

export interface HardwareLine {
  componentId: ComponentId | null
  cabinetLabel: string
  key: string
  qty: number
}

// Parts owned by no carcase still need their screws counted; a total that quietly omits them is
// worse than a group with an awkward name.
export const UNGROUPED_LABEL = 'Ungrouped'

export function carcaseHardware(scene: Scene): HardwareLine[] {
  const carcases = new Map<ComponentId, CarcaseComponent>()
  for (const c of scene.components) if (c.kind === 'carcase') carcases.set(c.id, c)

  const tally = new Map<string, number>()
  const cell = (id: ComponentId | null, key: string) => `${id ?? ''} ${key}`
  const add = (id: ComponentId | null, key: string, qty: number) =>
    tally.set(cell(id, key), (tally.get(cell(id, key)) ?? 0) + qty)

  for (const part of scene.parts) {
    if (part.kind !== 'board') continue
    const owner = part.parentId !== null && carcases.has(part.parentId) ? part.parentId : null
    const cabinet = owner === null ? undefined : carcases.get(owner)

    for (const cut of part.cuts) {
      if (cut.kind !== 'hole-array') continue

      if (cut.id.startsWith('cups_')) {
        // One hinge per cup, and the plate with it: they are sold as a set and their quantities
        // can never differ, so two rows would be two prices for one decision.
        if (cabinet === undefined) continue
        add(owner, hingeKeyFor(cabinet.params.frontMount), cut.count)
      }
    }
  }

  const lines: HardwareLine[] = []
  for (const [key, qty] of tally) {
    const [id, catalogueKey] = key.split(' ')
    if (qty <= 0) continue
    const componentId = id === '' ? null : id
    lines.push({
      componentId,
      cabinetLabel:
        componentId === null
          ? UNGROUPED_LABEL
          : (carcases.get(componentId)?.label ?? UNGROUPED_LABEL),
      key: catalogueKey,
      qty,
    })
  }
  return lines
}
