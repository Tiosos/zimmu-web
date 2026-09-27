import type { FrontSpec, Rect, ResolvedTree, Section, SectionId } from './sectionTree'

export type { FrontSpec }

export interface FrontGeometry {
  // What an overlay front expands to at the cabinet's edge: x from 0 to width, z from the carcase
  // floor to its top. Passed in rather than derived, so this module needs no CarcaseParams and no
  // thickness resolver — it is about rectangles.
  outer: Rect
  mount: 'overlay' | 'half-overlay' | 'inset'
  reveal: number
  // Each leaf's clear opening inside the face frame, where the cabinet wears one that resolved.
  // Absent, or silent about a section, and that section's front is sized as if frameless. This
  // is the deliberate fallback when a frame declines a still-unsupported configuration.
  frameOpenings?: Map<SectionId, Rect>
  // Clear openings for individual leaves when the face frame divides a structural section without
  // a carcase partition behind it.
  frameLeafOpenings?: Map<string, Rect>
  // Display/manufacturing members from the same frame solve. Consumers such as the elevation can
  // draw the real frame without re-running frame geometry independently.
  frameMembers?: { role: string; rect: Rect }[]
  frameFrontOpenings?: Map<
    string,
    { id: string; sectionId: SectionId; rect: Rect; front: FrontSpec }
  >
}

export interface FrontCell {
  sectionId: SectionId
  // Physical front-opening owner. Equal to sectionId on legacy section-driven fronts.
  openingId: string
  // Which leaf of a two-leaf door. 0 for everything else, and part of the role key, so a pair of
  // doors cannot collide on one id.
  leaf: 0 | 1
  spec: FrontSpec
  rect: Rect
  hinge: 'left' | 'right' | undefined
}

export function frontRoleOf(cell: Pick<FrontCell, 'sectionId' | 'openingId' | 'leaf'>): string {
  return cell.openingId === cell.sectionId
    ? `front-${cell.sectionId}-${cell.leaf}`
    : `front-${cell.sectionId}|${cell.openingId}-${cell.leaf}`
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

  const framedReach = (
    opening: Rect,
    side: 'left' | 'right' | 'bottom' | 'top',
  ): number | null => {
    const EPS = 1e-6
    const vertical = side === 'left' || side === 'right'
    const edge =
      side === 'left'
        ? opening.x0
        : side === 'right'
          ? opening.x1
          : side === 'bottom'
            ? opening.z0
            : opening.z1
    const member = g.frameMembers?.find((m) => {
      if (vertical) {
        const touches = Math.abs((side === 'left' ? m.rect.x1 : m.rect.x0) - edge) < EPS
        return touches && m.rect.z0 <= opening.z0 + EPS && m.rect.z1 >= opening.z1 - EPS
      }
      const touches = Math.abs((side === 'bottom' ? m.rect.z1 : m.rect.z0) - edge) < EPS
      return touches && m.rect.x0 <= opening.x0 + EPS && m.rect.x1 >= opening.x1 - EPS
    })
    if (member === undefined) return null

    if (g.mount === 'half-overlay') {
      return vertical
        ? (member.rect.x0 + member.rect.x1) / 2
        : (member.rect.z0 + member.rect.z1) / 2
    }
    if (side === 'left' && Math.abs(member.rect.x0 - g.outer.x0) < EPS) return g.outer.x0
    if (side === 'right' && Math.abs(member.rect.x1 - g.outer.x1) < EPS) return g.outer.x1
    if (side === 'bottom' && Math.abs(member.rect.z0 - g.outer.z0) < EPS) return g.outer.z0
    if (side === 'top' && Math.abs(member.rect.z1 - g.outer.z1) < EPS) return g.outer.z1
    return vertical
      ? (member.rect.x0 + member.rect.x1) / 2
      : (member.rect.z0 + member.rect.z1) / 2
  }

  const pushFramedOpening = (
    openingId: string,
    sectionId: SectionId,
    opening: Rect,
    spec: FrontSpec,
  ): void => {
    let cell: Rect
    if (g.mount === 'inset') {
      cell = {
        x0: opening.x0 + g.reveal,
        x1: opening.x1 - g.reveal,
        z0: opening.z0 + g.reveal,
        z1: opening.z1 - g.reveal,
      }
    } else {
      const left = framedReach(opening, 'left')
      const right = framedReach(opening, 'right')
      const bottom = framedReach(opening, 'bottom')
      const top = framedReach(opening, 'top')
      if (left === null || right === null || bottom === null || top === null) return
      cell = {
        x0: left + half,
        x1: right - half,
        z0: bottom + half,
        z1: top - half,
      }
    }
    if (cell.x1 <= cell.x0 || cell.z1 <= cell.z0) return

    if (spec.kind === 'door' && spec.leaves === 2) {
      const mid = (cell.x0 + cell.x1) / 2
      cells.push(
        { sectionId, openingId, leaf: 0, spec, rect: { ...cell, x1: mid - half }, hinge: 'left' },
        { sectionId, openingId, leaf: 1, spec, rect: { ...cell, x0: mid + half }, hinge: 'right' },
      )
      return
    }
    cells.push({
      sectionId,
      openingId,
      leaf: 0,
      spec,
      rect: cell,
      hinge: spec.kind === 'door' ? spec.hinge : undefined,
    })
  }

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

    const independent = [...(g.frameFrontOpenings?.values() ?? [])]
      .filter((opening) => opening.sectionId === section.id && opening.id !== section.id)
      .sort((a, b) => a.rect.z0 - b.rect.z0 || a.rect.x0 - b.rect.x0)
    if (independent.length > 0) {
      independent.forEach((opening) =>
        pushFramedOpening(opening.id, section.id, opening.rect, opening.front),
      )
      return
    }

    const spec = section.front
    if (spec === undefined) return

    // On a face frame the frame is the material a front meets. A full-overlay front still reaches
    // the outer edge — the frame's outer edge is the cabinet's — so it needs nothing new. An inset
    // front measures to the frame's opening instead of the carcase's. A half-overlay front reaches
    // each member's midline: halfway between outer member edges and their openings, or the
    // existing division midline for an internal member.
    const framed = g.frameOpenings?.get(section.id)
    // On an OUTER member, `expandTo` is the frame's outer edge, so half-overlay reaches
    // halfway between that edge and the framed opening. On an INTERNAL member, `expandTo` is
    // already the division's midline — exactly where half-overlay must stop. Averaging that
    // midline with the opening edge would cover only a quarter of a mid stile/rail.
    const halfOverlayEdge = (side: Side, framedEdge: number, outerEdge: number): number =>
      side.expandTo === outerEdge ? (side.expandTo + framedEdge) / 2 : side.expandTo
    const reach =
      g.mount === 'half-overlay' && framed !== undefined
        ? {
            left: halfOverlayEdge(sides.left, framed.x0, g.outer.x0),
            right: halfOverlayEdge(sides.right, framed.x1, g.outer.x1),
            bottom: halfOverlayEdge(sides.bottom, framed.z0, g.outer.z0),
            top: halfOverlayEdge(sides.top, framed.z1, g.outer.z1),
          }
        : {
            left: sides.left.expandTo,
            right: sides.right.expandTo,
            bottom: sides.bottom.expandTo,
            top: sides.top.expandTo,
          }
    const opening = framed ?? rect
    // Tested for inset rather than overlay so half-overlay lands on the overlay side: it is an
    // overlay that stops short.
    const cell: Rect =
      g.mount !== 'inset'
        ? {
            x0: reach.left + half,
            x1: reach.right - half,
            z0: reach.bottom + half,
            z1: reach.top - half,
          }
        : {
            x0: opening.x0 + (sides.left.material ? g.reveal : half),
            x1: opening.x1 - (sides.right.material ? g.reveal : half),
            z0: opening.z0 + (sides.bottom.material ? g.reveal : half),
            z1: opening.z1 - (sides.top.material ? g.reveal : half),
          }

    if (spec.kind === 'door' && spec.leaves === 2) {
      const leftOpening = g.frameLeafOpenings?.get(`${section.id}|0`)
      const rightOpening = g.frameLeafOpenings?.get(`${section.id}|1`)
      if (leftOpening !== undefined && rightOpening !== undefined) {
        // A frame-only pair stile is real material between the leaves. Inset doors clear each of
        // its two openings by a full reveal; overlay mounts meet over the stile centreline and give
        // back half a reveal each, exactly as two fronts meeting over a structural division do.
        const center = (leftOpening.x1 + rightOpening.x0) / 2
        const vertical =
          g.mount === 'inset'
            ? {
                z0: leftOpening.z0 + g.reveal,
                z1: leftOpening.z1 - g.reveal,
              }
            : { z0: cell.z0, z1: cell.z1 }
        const leftRect: Rect =
          g.mount === 'inset'
            ? {
                x0: leftOpening.x0 + g.reveal,
                x1: leftOpening.x1 - g.reveal,
                ...vertical,
              }
            : { ...vertical, x0: cell.x0, x1: center - half }
        const rightRect: Rect =
          g.mount === 'inset'
            ? {
                x0: rightOpening.x0 + g.reveal,
                x1: rightOpening.x1 - g.reveal,
                ...vertical,
              }
            : { ...vertical, x0: center + half, x1: cell.x1 }
        cells.push(
          { sectionId: section.id, openingId: section.id, leaf: 0, spec, rect: leftRect, hinge: 'left' },
          { sectionId: section.id, openingId: section.id, leaf: 1, spec, rect: rightRect, hinge: 'right' },
        )
        return
      }

      // Legacy pair: no physical member between the doors, only one reveal.
      const mid = (cell.x0 + cell.x1) / 2
      cells.push(
        { sectionId: section.id, openingId: section.id, leaf: 0, spec, rect: { ...cell, x1: mid - half }, hinge: 'left' },
        { sectionId: section.id, openingId: section.id, leaf: 1, spec, rect: { ...cell, x0: mid + half }, hinge: 'right' },
      )
      return
    }

    cells.push({
      sectionId: section.id,
      openingId: section.id,
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
