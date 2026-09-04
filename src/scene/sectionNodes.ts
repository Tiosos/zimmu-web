import type { SectionOpening } from './sectionInterior'
import type { Part, SectionId } from './types'

// Which opening owns which part, and nothing else. It is handed openings that are ALREADY resolved
// and ordered — it neither resolves nor validates — so a caller must pass what `sectionOpenings`
// returned. That is what makes the tree and the elevation number openings identically: they read
// one array rather than each deriving an order.
//
// Ownership is not inferred; the role keys the generator writes already state it. Five other
// modules read a role's *family* (`grain.ts`, `resolveThickness.ts`, `carcaseRoles.ts`); this is
// the only place a key is taken apart to recover the section id inside it.

export interface SectionNode {
  sectionId: SectionId
  parts: Part[]
}

// A leading capture of the family, then the section id. `division-` is deliberately absent: it
// names the section that was SPLIT, which is always an internal node and so never an opening.
const OWNED_BY_SECTION = /^(?:front|adj-shelf|fixed-shelf)-(.+)-\d+$/

export function sectionNodes(
  openings: readonly SectionOpening[],
  parts: readonly Part[],
): { sections: SectionNode[]; carcase: Part[] } {
  const sections: SectionNode[] = openings.map((o) => ({ sectionId: o.sectionId, parts: [] }))
  const byId = new Map(sections.map((s) => [s.sectionId, s]))
  const carcase: Part[] = []

  for (const part of parts) {
    const owner = part.role === undefined ? null : (OWNED_BY_SECTION.exec(part.role)?.[1] ?? null)
    const node = owner === null ? undefined : byId.get(owner)
    if (node === undefined) carcase.push(part)
    else node.parts.push(part)
  }

  return { sections, carcase }
}
