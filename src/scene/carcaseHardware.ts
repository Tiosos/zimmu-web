import { clearDepth } from './carcaseRoles'
import { hingeKeyFor, runnerKeyFor } from './hardwareCatalogue'
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

  // The clear depth needs the back panel's own thickness, and the emitted panel already carries it.
  const backThickness = new Map<ComponentId, number>()
  for (const p of scene.parts) {
    if (p.kind === 'board' && p.role === 'back' && p.parentId !== null)
      backThickness.set(p.parentId, p.thickness)
  }

  // A slide row is bored into BOTH uprights of a bay and both carry the same cut id, because both
  // name the front the bay wears. Deduped by that id, the pair is counted once.
  const seenSlide = new Set<string>()

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

      if (cut.id.startsWith('slide_')) {
        if (cabinet === undefined || owner === null) continue
        const seen = cell(owner, cut.id)
        if (seenSlide.has(seen)) continue
        seenSlide.add(seen)
        const key = runnerKeyFor(clearDepth(cabinet.params, backThickness.get(owner) ?? 0))
        if (key !== null) add(owner, key, 1)
        continue
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
