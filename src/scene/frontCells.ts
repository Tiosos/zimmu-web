import type { FrontSpec, Rect, ResolvedTree, Section, SectionId } from './sectionTree'

export type { FrontSpec }

export interface FrontGeometry {
  // What an overlay front expands to at the cabinet's edge: x from 0 to width, z from the carcase
  // floor to its top. Passed in rather than derived, so this module needs no CarcaseParams and no
  // thickness resolver — it is about rectangles.
  outer: Rect
  mount: 'overlay' | 'half-overlay' | 'inset'
  reveal: number
}

export interface FrontCell {
  sectionId: SectionId
  // Which leaf of a two-leaf door. 0 for everything else, and part of the role key, so a pair of
  // doors cannot collide on one id.
  leaf: 0 | 1
  spec: FrontSpec
  rect: Rect
  hinge: 'left' | 'right' | undefined
}

// What lies immediately beyond one edge of a section. `expandTo` is where an overlay front reaches
// on that side — the cabinet's outer edge, or the midline of the division it shares. `material`
// says whether a *full* reveal is owed there: an inset front clears carcase material by the whole
// reveal, and another front by half, so the gap between two fronts is one reveal either way.
interface Side {
  material: boolean
  expandTo: number
}

interface Sides {
  left: Side
  right: Side
  bottom: Side
  top: Side
}

// Every front on the cabinet, as a rectangle on its front face with the reveals already taken.
//
// The whole reveal rule lives here. It is stated once as: an overlay cell reaches to the material
// midline on every side and then gives back half a reveal; an inset cell is the opening itself and
// gives back a full reveal where it meets material, half where it meets another front.
//
// The two mounts therefore differ in what "one reveal" is measured between, and the difference is
// real rather than an artefact: overlay fronts cover the division and meet over it, so the gap is
// between the two fronts; inset fronts sit either side of a division that stays visible, so each
// clears that division by a reveal and the gap between them is wider by its thickness.
export function frontCells(root: Section, tree: ResolvedTree, g: FrontGeometry): FrontCell[] {
  const cells: FrontCell[] = []
  const half = g.reveal / 2

  const walk = (section: Section, sides: Sides): void => {
    const rect = tree.rects.get(section.id)!

    if (section.content.kind === 'split') {
      const { axis, division, children } = section.content
      const vertical = axis === 'vertical'
      const [lo, hi] = vertical ? (['left', 'right'] as const) : (['bottom', 'top'] as const)
      const near = (s: Section, low: boolean): number => {
        const r = tree.rects.get(s.id)!
        return vertical ? (low ? r.x0 : r.x1) : low ? r.z0 : r.z1
      }
      // Between two children there is either a division panel — material, and an overlay front
      // reaches its midline — or nothing at all, in which case the two fronts meet on the section
      // boundary and each gives back half a reveal.
      const between = (own: number, sibling: number): Side =>
        division === 'none'
          ? { material: false, expandTo: own }
          : { material: true, expandTo: (own + sibling) / 2 }

      children.forEach((child, i) => {
        walk(child, {
          ...sides,
          [lo]: i === 0 ? sides[lo] : between(near(child, true), near(children[i - 1], false)),
          [hi]:
            i === children.length - 1
              ? sides[hi]
              : between(near(child, false), near(children[i + 1], true)),
        })
      })
      return
    }

    const spec = section.front
    if (spec === undefined) return

    // Tested for inset rather than overlay so half-overlay lands on the overlay side: it laps its
    // stile, so it is an overlay that stops short. Task-local until the framed branch reads the
    // frame's own opening.
    const cell: Rect =
      g.mount !== 'inset'
        ? {
            x0: sides.left.expandTo + half,
            x1: sides.right.expandTo - half,
            z0: sides.bottom.expandTo + half,
            z1: sides.top.expandTo - half,
          }
        : {
            x0: rect.x0 + (sides.left.material ? g.reveal : half),
            x1: rect.x1 - (sides.right.material ? g.reveal : half),
            z0: rect.z0 + (sides.bottom.material ? g.reveal : half),
            z1: rect.z1 - (sides.top.material ? g.reveal : half),
          }

    if (spec.kind === 'door' && spec.leaves === 2) {
      // The pair divides the cell, one reveal between them. Each leaf is hinged on its own outer
      // edge, which is what makes `hinge` meaningless on a two-leaf door and unread here.
      const mid = (cell.x0 + cell.x1) / 2
      cells.push(
        { sectionId: section.id, leaf: 0, spec, rect: { ...cell, x1: mid - half }, hinge: 'left' },
        { sectionId: section.id, leaf: 1, spec, rect: { ...cell, x0: mid + half }, hinge: 'right' },
      )
      return
    }

    cells.push({
      sectionId: section.id,
      leaf: 0,
      spec,
      rect: cell,
      hinge: spec.kind === 'door' ? spec.hinge : undefined,
    })
  }

  walk(root, {
    left: { material: true, expandTo: g.outer.x0 },
    right: { material: true, expandTo: g.outer.x1 },
    bottom: { material: true, expandTo: g.outer.z0 },
    top: { material: true, expandTo: g.outer.z1 },
  })
  return cells
}
