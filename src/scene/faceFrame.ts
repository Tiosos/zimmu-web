import type { Rect, Section, SectionId } from './sectionTree'
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

// The whole frame rule, stated once.
//
// Takes the cabinet's front rectangle rather than its parameters, the same choice `frontCells`
// makes and for the same reason: this module is about rectangles, so it needs no CarcaseParams,
// no base-mode branch and no thickness resolver. That rectangle is `floorZ`-based and already
// accounts for a toe kick, which is the one figure a second copy here would get wrong — and it
// keeps the dependency pointing one way, since the carcase reads the frame and an import of
// `floorZ` back out of `carcaseRoles` would be a cycle.
//
// Pure: a function of the section tree, that rectangle and the frame parameters, all of which
// exist before any generator runs. Three consumers read it — `regenerateFaceFrames` for the
// boards, `frontCells` for the door, and (from stage 3) `regenerateDrawers` for the box — and none
// reads another's output. That is the only reason the frame, the doors and the drawers do not form
// a cycle, and it is `drawerBoxMetrics`' shape reused.
//
// Null when the frame cannot be built, and the cabinet then emits no frame at all: the same rule
// as a drawer box with no runner, or a door too thin to bore. A frame that half exists is worse
// than one that refuses.
export function faceFrameGeometry(
  root: Section,
  outer: Rect,
  frame: FaceFrameParams | undefined,
): FrameGeometry | null {
  // `frame === undefined` is the frameless state, the way `anchor === undefined` is the detached
  // one: presence or absence already draws the line, so there is no second flag to disagree with.
  if (frame === undefined) return null

  // Stage 1 builds a single-opening cabinet only. A split cabinet is refused rather than given a
  // frame that ignores its own partitions; stage 2 adds the mid members.
  if (root.content.kind === 'split') return null

  // A drawer is a LEAF, so the guard above does not catch it — a separate branch, not a wider
  // condition. Stage 3 sizes a drawer box to the framed opening; until then the cabinet declines
  // rather than emitting a box that passes through a frame nobody measured it against.
  if (root.front?.kind === 'drawer-front') return null

  const { stileWidth, railWidth } = frame
  if (stileWidth <= 0 || railWidth <= 0) return null

  const openX0 = outer.x0 + stileWidth
  const openX1 = outer.x1 - stileWidth
  const openZ0 = outer.z0 + railWidth
  const openZ1 = outer.z1 - railWidth
  if (openX1 <= openX0 || openZ1 <= openZ0) return null

  // Stiles run the full height and the rails fit between them — how a face frame is actually made,
  // and what makes the joint a rail tenoned into a stile rather than the reverse.
  const members: FrameMember[] = [
    { role: 'stile-left', rect: { x0: outer.x0, x1: openX0, z0: outer.z0, z1: outer.z1 } },
    { role: 'stile-right', rect: { x0: openX1, x1: outer.x1, z0: outer.z0, z1: outer.z1 } },
    { role: 'rail-top', rect: { x0: openX0, x1: openX1, z0: openZ1, z1: outer.z1 } },
    { role: 'rail-bottom', rect: { x0: openX0, x1: openX1, z0: outer.z0, z1: openZ0 } },
  ]

  return {
    members,
    openings: new Map([[root.id, { x0: openX0, x1: openX1, z0: openZ0, z1: openZ1 }]]),
  }
}
