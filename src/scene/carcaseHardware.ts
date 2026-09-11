import { clearDepth } from './carcaseRoles'
import { resolveCarcase } from './carcaseOpenings'
import {
  CATALOGUE_ORDER,
  hingeKeyFor,
  runnerKeyFor,
  SCREW_KEY,
  SHELF_PIN_KEY,
} from './hardwareCatalogue'
import type { CarcaseComponent, ComponentId, Scene } from './types'

// What a generated cabinet needs bought, counted off what its machining actually bored.
//
// The rule, stated once because four families follow it: **quantity always comes from what the
// pipeline emitted, and where a family has more than one variant, that variant comes from the
// cabinet too.** Re-deriving counts from `CarcaseParams` would order hinges for a door too thin to
// bore and screws for a joint converted to a dado — the bores already know better.
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
        //
        // Dropped rather than Ungrouped: the catalogue key depends on the cabinet's `frontMount`
        // (overlay and inset are different products), and with no cabinet there is no way to know
        // which one to order — unlike a screw, whose key is universal.
        if (cabinet === undefined) continue
        add(owner, hingeKeyFor(cabinet.params.frontMount), cut.count)
      }

      if (cut.id.startsWith('slide_')) {
        // Dropped rather than Ungrouped, same reason as a hinge: no cabinet means no clear depth.
        if (cabinet === undefined || owner === null) continue
        // Reusing `cell()` for a dedupe key, not a tally key, is safe because neither a component
        // id nor a cut id can contain the separator, so the composed string is unambiguous either
        // way.
        const seen = cell(owner, cut.id)
        if (seenSlide.has(seen)) continue
        seenSlide.add(seen)
        const key = runnerKeyFor(clearDepth(cabinet.params, backThickness.get(owner) ?? 0))
        if (key !== null) add(owner, key, 1)
        continue
      }

      // Clearance only. `deriveScrewJoint` emits a clearance array on the panel screwed THROUGH and
      // a pilot array into the panel receiving them, both at `screwCount`: the same screws seen
      // from two ends. Counting both doubles every figure in the quote.
      //
      // `_clearance` is unique to `screw.ts`, and `sourceJointId` is what makes it a joint's bore
      // rather than a component's.
      if (cut.sourceJointId !== undefined && cut.id.endsWith('_clearance')) {
        add(owner, SCREW_KEY, cut.count)
      }
    }
  }

  // A pin row belongs to the section that asked for it, so the pins do too: `resolveCarcase` says
  // which opening owns which shelf, and the rows the cabinet actually BORED around that section
  // say how many pins each shelf takes — one per row.
  //
  // Counted off the emitted arrays rather than off `adjustable.rows`, because the two come apart:
  // `carcaseHoleArrays` refuses to bore a row whose setback is inside the pin's own radius, while
  // `shelfPins` seats its shelves regardless. Multiplying by the asked-for `rows` quotes pins for
  // a cabinet carrying no pin holes at all. Normally both uprights are bored `rows` rows each, so
  // this is the same four-at-the-default it has always been.
  //
  // Matching `_{sectionId}_` inside a cut id is not a second role-key parser: the section id is
  // already in hand and this asks whether a bore names it, rather than recovering an unknown id.
  for (const cabinet of carcases.values()) {
    const resolved = resolveCarcase(cabinet, scene.parts, scene.materials)
    if (resolved === null) continue
    const cabinetParts = scene.parts.filter((p) => p.kind === 'board' && p.parentId === cabinet.id)
    for (const opening of resolved.openings) {
      // `sectionNodes` returns `{ sections, carcase }`, not a flat array — a divider belongs to
      // the carcase, so the openings live under `.sections`.
      const owned = resolved.nodes.sections.find((n) => n.sectionId === opening.sectionId)
      const shelves = owned?.parts.filter((p) => p.role?.startsWith('adj-shelf-')).length ?? 0
      if (shelves === 0) continue
      const boredRows = cabinetParts.reduce(
        (n, part) =>
          n +
          part.cuts.filter(
            (c) =>
              c.kind === 'hole-array' &&
              c.id.startsWith('holes_') &&
              c.id.includes(`_${opening.sectionId}_`),
          ).length,
        0,
      )
      if (boredRows > 0) add(cabinet.id, SHELF_PIN_KEY, shelves * boredRows)
    }
  }

  // Row order is stated, not incidental: cabinets as the scene holds them, then keys as the
  // catalogue lists them, with the ungrouped rows last. A CSV regenerated from an unchanged scene
  // is then byte-identical, which is what makes it diffable.
  const lines: HardwareLine[] = []
  const emit = (id: ComponentId | null, label: string) => {
    for (const key of CATALOGUE_ORDER) {
      const qty = tally.get(cell(id, key))
      if (qty !== undefined && qty > 0)
        lines.push({ componentId: id, cabinetLabel: label, key, qty })
    }
  }
  for (const c of scene.components) if (c.kind === 'carcase') emit(c.id, c.label)
  emit(null, UNGROUPED_LABEL)
  return lines
}
