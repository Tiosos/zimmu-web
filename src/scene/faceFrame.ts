import type { Rect, ResolvedTree, Section, SectionId } from './sectionTree'
import type { FaceFrameParams, FrameZone } from './types'
import type { FrontSpec, SectionSize } from './sectionTree'

// A stile or a rail, as a rectangle on the cabinet's front face in carcase x/z.
export interface FrameMember {
  role: string
  rect: Rect
}

export interface FrameAccessOpening {
  id: string
  sectionId: SectionId
  rect: Rect
}

export interface FrameFrontOpening extends FrameAccessOpening {
  front: FrontSpec
}

export interface FrameGeometry {
  members: FrameMember[]
  // The clear opening owned by each structural section. Interiors keep reading this map: adding a
  // frame-only pair stile must not invent a carcase section or silently move a shelf to one side.
  openings: Map<SectionId, Rect>
  // A front may have more physical leaves than its structural section has openings. Independent
  // pair stiles therefore state the clear rectangle of each door leaf separately.
  leafOpenings: Map<string, Rect>
  // Physical front openings. Legacy section-driven fronts use the section id; independent
  // frame-zone fronts use their own stable zone id.
  frontOpenings: Map<string, FrameFrontOpening>
  // Every physical aperture through the frame, including leaves with no front. Removable
  // interiors use this map for insertion checks; it is deliberately not inferred from fronts.
  accessOpenings: Map<string, FrameAccessOpening>
}

export const frameLeafKey = (sectionId: SectionId, leaf: 0 | 1): string =>
  `${sectionId}|${leaf}`


const validRect = (rect: Rect): boolean => rect.x1 > rect.x0 && rect.z1 > rect.z0

const spanOf = (size: SectionSize, clear: number): number =>
  size.kind === 'fixed' ? size.mm : size.kind === 'percent' ? (size.pct / 100) * clear : 0

function zoneSpans(children: FrameZone[], clear: number): number[] {
  const stated = children.map((child) => spanOf(child.size, clear))
  const claimed = stated.reduce((sum, n) => sum + n, 0)
  const equals = children.filter((child) => child.size.kind === 'equal').length
  if (equals === 0) return stated
  const each = (clear - claimed) / equals
  return children.map((child, i) => (child.size.kind === 'equal' ? each : stated[i]))
}

export function validateFrameLayout(root: Section, frame: FaceFrameParams | undefined): string[] {
  if (frame?.layout === undefined) return []
  const errors: string[] = []
  const leaves = new Set<SectionId>()
  const collectLeaves = (section: Section): void => {
    if (section.content.kind === 'leaf') {
      leaves.add(section.id)
      return
    }
    section.content.children.forEach(collectLeaves)
  }
  collectLeaves(root)

  const ids = new Set<string>()
  const walk = (zone: FrameZone): void => {
    if (ids.has(zone.id)) errors.push('frame opening ids must be unique')
    ids.add(zone.id)
    if (zone.size.kind === 'fixed' && zone.size.mm <= 0) {
      errors.push('a fixed frame-zone size must be positive')
    }
    if (zone.size.kind === 'percent' && (zone.size.pct <= 0 || zone.size.pct > 100)) {
      errors.push('a frame-zone percentage must be between 0 and 100')
    }
    if (zone.content.kind === 'leaf') return
    if (zone.front !== undefined) errors.push('only a leaf frame zone can carry a front')
    if (zone.content.children.length < 2) errors.push('a frame-zone split needs at least two zones')
    const pct = zone.content.children.reduce(
      (sum, child) => sum + (child.size.kind === 'percent' ? child.size.pct : 0),
      0,
    )
    if (pct > 100) errors.push('frame-zone percentages must not exceed 100')
    zone.content.children.forEach(walk)
  }

  for (const [sectionId, zone] of Object.entries(frame.layout)) {
    if (!leaves.has(sectionId)) errors.push('a frame layout must belong to a structural leaf')
    walk(zone)
  }
  return [...new Set(errors)]
}

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
  const leafOpenings = new Map<string, Rect>()
  const frontOpenings = new Map<string, FrameFrontOpening>()
  const accessOpenings = new Map<string, FrameAccessOpening>()

  const placeZone = (sectionId: SectionId, zone: FrameZone, framed: Rect): boolean => {
    if (!validRect(framed)) return false
    if (zone.content.kind === 'leaf') {
      accessOpenings.set(zone.id, { id: zone.id, sectionId, rect: framed })
      if (zone.front !== undefined) {
        frontOpenings.set(zone.id, { id: zone.id, sectionId, rect: framed, front: zone.front })
      }
      return true
    }

    const { axis, children } = zone.content
    if (children.length < 2) return false
    const vertical = axis === 'vertical'
    const memberWidth = vertical ? midStileWidth : midRailWidth
    if (memberWidth <= 0) return false
    const lo = vertical ? framed.x0 : framed.z0
    const hi = vertical ? framed.x1 : framed.z1
    const clear = hi - lo - memberWidth * (children.length - 1)
    if (clear <= 0) return false
    const spans = zoneSpans(children, clear)
    if (spans.some((span) => span <= 0) || spans.reduce((sum, n) => sum + n, 0) > clear + 1e-6) {
      return false
    }

    let cursor = lo
    for (let i = 0; i < children.length; i++) {
      const span = spans[i]
      const childHi = cursor + span
      const childRect = vertical
        ? { ...framed, x0: cursor, x1: childHi }
        : { ...framed, z0: cursor, z1: childHi }
      if (!placeZone(sectionId, children[i], childRect)) return false
      cursor = childHi
      if (i < children.length - 1) {
        const memberLo = cursor
        const memberHi = cursor + memberWidth
        members.push({
          role: `${vertical ? 'stile' : 'rail'}-zone-${zone.id}-${i}`,
          rect: vertical
            ? { x0: memberLo, x1: memberHi, z0: framed.z0, z1: framed.z1 }
            : { x0: framed.x0, x1: framed.x1, z0: memberLo, z1: memberHi },
        })
        cursor = memberHi
      }
    }
    return Math.abs(cursor - hi) < 1e-6
  }

  const placeLeaf = (section: Section, framed: Rect): boolean => {
    openings.set(section.id, framed)
    const layout = frame.layout?.[section.id]
    if (layout !== undefined) return placeZone(section.id, layout, framed)

    if (section.front !== undefined) {
      frontOpenings.set(section.id, {
        id: section.id,
        sectionId: section.id,
        rect: framed,
        front: section.front,
      })
    }
    if (!frame.pairStile || section.front?.kind !== 'door' || section.front.leaves !== 2) {
      accessOpenings.set(section.id, { id: section.id, sectionId: section.id, rect: framed })
      return true
    }
    const width = midStileWidth
    if (width <= 0) return false
    const center = (framed.x0 + framed.x1) / 2
    const memberLo = center - width / 2
    const memberHi = center + width / 2
    if (memberLo <= framed.x0 || memberHi >= framed.x1) return false

    members.push({
      role: `stile-pair-${section.id}`,
      rect: { x0: memberLo, x1: memberHi, z0: framed.z0, z1: framed.z1 },
    })
    const leftKey = frameLeafKey(section.id, 0)
    const rightKey = frameLeafKey(section.id, 1)
    const left = { ...framed, x1: memberLo }
    const right = { ...framed, x0: memberHi }
    leafOpenings.set(leftKey, left)
    leafOpenings.set(rightKey, right)
    accessOpenings.set(leftKey, { id: leftKey, sectionId: section.id, rect: left })
    accessOpenings.set(rightKey, { id: rightKey, sectionId: section.id, rect: right })
    return true
  }

  if (root.content.kind === 'leaf') {
    return placeLeaf(root, rootOpening) ? { members, openings, leafOpenings, frontOpenings, accessOpenings } : null
  }

  const resolved = tree!
  const divisionByKey = new Map(
    resolved.divisions.map((d) => [`${d.parentId}|${d.index}`, d] as const),
  )

  const place = (section: Section, framed: Rect): boolean => {
    if (!validRect(framed)) return false
    if (section.content.kind === 'leaf') return placeLeaf(section, framed)

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

  return place(root, rootOpening) ? { members, openings, leafOpenings, frontOpenings, accessOpenings } : null
}


// The stile that physically carries one framed leaf. Geometry, not role naming, is authoritative:
// outer and nested mid stiles are the same problem once an opening edge is known.
export function hingedFrameMember(
  geometry: FrameGeometry,
  sectionId: SectionId,
  hinge: 'left' | 'right',
  openingId?: string,
): FrameMember | null {
  const opening =
    (openingId === undefined ? undefined : geometry.frontOpenings.get(openingId)?.rect) ??
    geometry.openings.get(sectionId)
  if (opening === undefined) return null
  const edge = hinge === 'left' ? opening.x0 : opening.x1
  const EPS = 1e-6
  return (
    geometry.members.find(
      (m) =>
        m.role.startsWith('stile-') &&
        Math.abs((hinge === 'left' ? m.rect.x1 : m.rect.x0) - edge) < EPS &&
        m.rect.z0 <= opening.z0 + EPS &&
        m.rect.z1 >= opening.z1 - EPS,
    ) ?? null
  )
}

// How much of the hinged stile the door covers. Inset has no overlay; for overlay mounts the
// member's inner edge and the already-resolved front edge are enough, including half-overlay and
// internal stiles.
export function frameOverlay(
  member: FrameMember,
  door: Rect,
  hinge: 'left' | 'right',
  mount: 'overlay' | 'half-overlay' | 'inset',
): number {
  if (mount === 'inset') return 0
  return hinge === 'left' ? member.rect.x1 - door.x0 : door.x1 - member.rect.x0
}
