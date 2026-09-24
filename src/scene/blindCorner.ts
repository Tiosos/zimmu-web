import type { CarcaseComponent, Component, ComponentId, MaterialDef } from './types'
import { openingRect, sectionThickness, validateCarcaseParams } from './carcaseRoles'
import { roleThicknessFor, type PartOverrides } from './resolveThickness'
import { resolveSections } from './sectionTree'
import { sectionOpenings } from './sectionInterior'
import { carcaseBounds } from './carcaseBounds'

// How much WIDER than the return run's depth the blind portion has to be.
//
// The spec's rule is bare contact — the blind portion at least as wide as the return cabinets are
// deep — and that rule is arithmetic containing no vendor figure. Whether real practice wants a
// margin here for door swing, a handle, or a minimum accessible opening is a woodworker's call that
// has NOT been made. Zero is the spec as written, isolated so that answer changes one number rather
// than the rule.
export const BLIND_CLEARANCE = 0

// Slots only, like every other placement-time reader: overrides live on emitted parts and this is
// asked of a cabinet's parameters, not its boards.
const NO_OVERRIDES = new Map<string, PartOverrides>()

export interface CornerWarning {
  // The cabinet returning into the corner.
  cabinetId: ComponentId
  // The blind unit it returns into.
  targetId: ComponentId
  required: number
  available: number
}

// The total width of a cabinet's blind leaves: the ones wearing no door. A 'panel' or
// 'false-front' leaf is blind — a dead front over the corner — while 'door' and 'drawer-front' are
// the accessible part. `front === undefined` is a bare opening, also blind.
//
// Null when the parameters do not build, which is not an error: mid-keystroke params are handled
// the same way everywhere else in this codebase.
export function blindWidthOf(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): number | null {
  const thicknessOf = roleThicknessFor(c.params, materials, NO_OVERRIDES)
  if (validateCarcaseParams(c.params, thicknessOf).length > 0) return null
  const tree = resolveSections(
    c.params.section,
    openingRect(c.params, thicknessOf),
    sectionThickness(thicknessOf),
  )
  let total = 0
  for (const o of sectionOpenings(c.params.section, tree)) {
    const front = o.section.front
    if (front === undefined || front.kind === 'panel' || front.kind === 'false-front') {
      total += o.rect.x1 - o.rect.x0
    }
  }
  return total
}

// Every corner whose blind portion is too narrow for the run returning into it.
//
// Only a FRONT anchor makes a corner — that is how a return run butts into a blind unit, and it is
// the same face that starts a new run in runs.ts. A left or right anchor is a straight run, where
// no blind portion is in play at all.
export function cornerWarnings(
  components: Component[],
  materials: Record<string, MaterialDef>,
): CornerWarning[] {
  const carcases = new Map<ComponentId, CarcaseComponent>()
  for (const c of components) if (c.kind === 'carcase') carcases.set(c.id, c)

  const warnings: CornerWarning[] = []
  for (const c of carcases.values()) {
    const a = c.anchor
    if (a === undefined || a.face !== 'front') continue
    const t = carcases.get(a.to)
    // Honoured on exactly resolvePlacement's terms: a corner the resolver does not build is not a
    // corner to warn about.
    if (t === undefined || t.id === c.id || t.parentId !== c.parentId) continue

    const available = blindWidthOf(t, materials)
    if (available === null) continue

    const thicknessOf = roleThicknessFor(c.params, materials, NO_OVERRIDES)
    if (validateCarcaseParams(c.params, thicknessOf).length > 0) continue
    // The RETURN cabinet's own depth, read in its own frame. Its world footprint is the same
    // number seen through whatever rotation put it there, so reading that instead would make the
    // rule depend on how the corner happens to be turned.
    const own = carcaseBounds(c.params, thicknessOf)
    const required = own.y1 - own.y0 + BLIND_CLEARANCE

    if (available + 1e-6 < required) {
      warnings.push({ cabinetId: c.id, targetId: t.id, required, available })
    }
  }
  return warnings
}
