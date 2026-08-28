import type {
  InteriorSpec,
  Rect,
  ResolvedTree,
  Section,
  SectionBounds,
  SectionId,
} from './sectionTree'
export type { AdjustableSpec, InteriorSpec } from './sectionTree'

export interface SectionInterior {
  sectionId: SectionId
  rect: Rect
  bounds: SectionBounds
  spec: InteriorSpec
}

// A spec is worth listing only if it would actually draw something: a shelf board, a row of pin
// holes, or both. `shelves: 0, count: 0` is what an interior looks like when nothing was asked for
// — the same as no interior at all — so it is excluded rather than emitted as an empty row.
function asksForSomething(spec: InteriorSpec): boolean {
  return spec.adjustable.shelves > 0 || spec.adjustable.count > 0
}

// Every leaf section that asks for something, with where it landed and what encloses it. A split
// section holds no interior of its own — its children do — so only leaves are listed.
//
// This is the inversion Stage D is built on: a pin row belongs to the *section* that needs it, and
// is contributed to the panels bounding that section. Asking a panel what rows it carries is what
// bored a divider on the face of a bay that has no shelves.
export function sectionInteriors(root: Section, tree: ResolvedTree): SectionInterior[] {
  const result: SectionInterior[] = []

  const walk = (section: Section): void => {
    if (section.content.kind === 'split') {
      section.content.children.forEach(walk)
      return
    }
    const spec = section.interior
    if (spec === undefined || !asksForSomething(spec)) return
    result.push({
      sectionId: section.id,
      rect: tree.rects.get(section.id)!,
      bounds: tree.boundsOf(section.id),
      spec,
    })
  }

  walk(root)
  return result
}

// The interior of the first leaf that has one. The legacy divider/fixed-shelf shim rebuilds the
// whole tree — new sections, new ids — so it has no way to map an old section onto a new one. This
// is what it carries across, and it is exact for the cabinet-wide shelving that shim describes.
export function firstInterior(root: Section): InteriorSpec | undefined {
  if (root.content.kind === 'leaf') return root.interior
  for (const child of root.content.children) {
    const found = firstInterior(child)
    if (found !== undefined) return found
  }
  return undefined
}

// Puts the same interior on every leaf of a tree. Two callers need exactly this and nothing more
// nuanced: the presets, whose cabinets used to state one bundle for the whole carcase, and the
// v16 file migration, which has one bundle and no way to know which section the user meant it for.
export function seedInteriors(root: Section, spec: InteriorSpec): Section {
  if (root.content.kind === 'leaf') return { ...root, interior: spec }
  return {
    ...root,
    content: { ...root.content, children: root.content.children.map((c) => seedInteriors(c, spec)) },
  }
}
