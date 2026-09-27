import type { Rect, ResolvedTree, Section, SectionId } from './sectionTree'
import type { FaceFrameParams } from './types'

// A stile or a rail, as a rectangle on the cabinet's front face in carcase x/z.
export interface FrameMember {
  role: string
  rect: Rect
}

export interface FrameGeometry {
  members: FrameMember[]
  // The clear opening of each leaf, INSIDE the frame. What a door covers and what a drawer box
  // must pass through — which is why both read this rather than the carcase's own opening.
  openings: Map<SectionId, Rect>
}

const validRect = (rect: Rect): boolean => rect.x1 > rect.x0 && rect.z1 > rect.z0

// The whole frame rule, stated once.
//
// The section tree is the only description of the cabinet's divisions. Stage 2 therefore receives
// the ALREADY RESOLVED carcase tree for split cabinets rather than resolving the children again
// inside the smaller frame opening. Re-solving would move fixed-size and percentage sections away
// from the partitions behind the frame. A single-opening cabinet needs no resolved tree and keeps
// the Stage-1 call shape.
//
// Mid members are centred on their carcase divisions, then clipped by recursion to the framed
// rectangle of the section that owns the split. A vertical split nested below a horizontal one
// therefore makes a stile that stops at those rails instead of crossing the whole cabinet.
//
// Null when the frame cannot be built, and the cabinet then emits no frame at all: the same rule
// as a drawer box with no runner, or a door too thin to bore. A frame that half exists is worse
// than one that refuses.
export function faceFrameGeometry(
  root: Section,
  outer: Rect,
  frame: FaceFrameParams | undefined,
  tree?: ResolvedTree,
): FrameGeometry | null {
  // `frame === undefined` is the frameless state, the way `anchor === undefined` is the detached
  // one: presence or absence already draws the line, so there is no second flag to disagree with.
  if (frame === undefined) return null

  const { stileWidth, railWidth, midStileWidth, midRailWidth } = frame
  if (stileWidth <= 0 || railWidth <= 0) return null
  if (root.content.kind === 'split' && tree === undefined) return null

  const openX0 = outer.x0 + stileWidth
  const openX1 = outer.x1 - stileWidth
  const openZ0 = outer.z0 + railWidth
  const openZ1 = outer.z1 - railWidth
  const rootOpening: Rect = { x0: openX0, x1: openX1, z0: openZ0, z1: openZ1 }
  if (!validRect(rootOpening)) return null

  // Stiles run the full height and the rails fit between them — how a face frame is actually made,
  // and what makes the joint a rail tenoned into a stile rather than the reverse.
  const members: FrameMember[] = [
    { role: 'stile-left', rect: { x0: outer.x0, x1: openX0, z0: outer.z0, z1: outer.z1 } },
    { role: 'stile-right', rect: { x0: openX1, x1: outer.x1, z0: outer.z0, z1: outer.z1 } },
    { role: 'rail-top', rect: { x0: openX0, x1: openX1, z0: openZ1, z1: outer.z1 } },
    { role: 'rail-bottom', rect: { x0: openX0, x1: openX1, z0: outer.z0, z1: openZ0 } },
  ]
  const openings = new Map<SectionId, Rect>()

  if (root.content.kind === 'leaf') {
    openings.set(root.id, rootOpening)
    return { members, openings }
  }

  const resolved = tree!
  const divisionByKey = new Map(
    resolved.divisions.map((d) => [`${d.parentId}|${d.index}`, d] as const),
  )

  const place = (section: Section, framed: Rect): boolean => {
    if (!validRect(framed)) return false
    if (section.content.kind === 'leaf') {
      openings.set(section.id, framed)
      return true
    }

    const { axis, division, children } = section.content
    const vertical = axis === 'vertical'
    const parentHi = vertical ? framed.x1 : framed.z1
    let cursor = vertical ? framed.x0 : framed.z0

    for (let i = 0; i < children.length; i++) {
      const last = i === children.length - 1
      let childHi = parentHi
      let nextCursor = parentHi

      if (!last) {
        if (division === 'none') {
          // No partition means no frame member. Keep the boundary the carcase resolver already
          // chose so two neighbouring openings meet at exactly the same place.
          const childRect = resolved.rects.get(children[i].id)
          if (childRect === undefined) return false
          childHi = vertical ? childRect.x1 : childRect.z1
          nextCursor = childHi
          if (childHi <= cursor || childHi >= parentHi) return false
        } else {
          const d = divisionByKey.get(`${section.id}|${i}`)
          if (d === undefined) return false
          const width = vertical ? midStileWidth : midRailWidth
          if (width <= 0) return false
          const center = vertical
            ? (d.rect.x0 + d.rect.x1) / 2
            : (d.rect.z0 + d.rect.z1) / 2
          const memberLo = center - width / 2
          const memberHi = center + width / 2
          if (memberLo <= cursor || memberHi >= parentHi) return false

          members.push({
            role: `${vertical ? 'stile' : 'rail'}-${section.id}-${i}`,
            rect: vertical
              ? { x0: memberLo, x1: memberHi, z0: framed.z0, z1: framed.z1 }
              : { x0: framed.x0, x1: framed.x1, z0: memberLo, z1: memberHi },
          })
          childHi = memberLo
          nextCursor = memberHi
        }
      }

      const childFramed: Rect = vertical
        ? { ...framed, x0: cursor, x1: childHi }
        : { ...framed, z0: cursor, z1: childHi }
      if (!place(children[i], childFramed)) return false
      cursor = nextCursor
    }
    return true
  }

  return place(root, rootOpening) ? { members, openings } : null
}
