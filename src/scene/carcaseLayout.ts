import type { CarcaseParams, ThicknessAxis, Vec3 } from './types'
import type { RoleThickness } from './resolveThickness'
import type { DivisionThickness, Rect, ResolvedTree } from './sectionTree'
import type { FrontGeometry } from './frontCells'
import { faceFrameGeometry } from './faceFrame'

export interface LocalBox {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

export interface PanelSpec {
  length: number
  width: number
  thickness: number
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
}

// Every carcase part is an axis-aligned panel; only which axis carries the material thickness
// differs. Each rotation maps all three board axes onto carcase axes positively, so the board's
// local origin always lands on the box's min corner and `position` needs no compensation.
export function orientedPanel(b: LocalBox, thicknessAxis: ThicknessAxis): PanelSpec {
  const dx = b.x1 - b.x0
  const dy = b.y1 - b.y0
  const dz = b.z1 - b.z0
  const position = { x: b.x0, y: b.y0, z: b.z0 }
  const rotationOrder = 'XYZ' as const

  if (thicknessAxis === 'z') {
    return {
      length: dx,
      width: dy,
      thickness: dz,
      position,
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder,
    }
  }
  if (thicknessAxis === 'x') {
    // board x→carcase y, y→z, z→x
    return {
      length: dy,
      width: dz,
      thickness: dx,
      position,
      rotation: { x: 0, y: 90, z: 90 },
      rotationOrder,
    }
  }
  // board x→carcase z, y→x, z→y
  return {
    length: dz,
    width: dx,
    thickness: dy,
    position,
    rotation: { x: -90, y: 0, z: -90 },
    rotationOrder,
  }
}

// Where the bottom panel sits. Shared by the validator and the role table so a shelf budget is
// never computed against a floor the generator does not use.
export function floorZ(p: CarcaseParams): number {
  return p.baseMode === 'toe-kick' || p.baseMode === 'ladder' ? p.toeKickHeight : 0
}

// What every front on a cabinet is measured against, stated once for the three places that ask:
// the validator, the box table and the machining. The frame's openings are carried only where the
// frame resolved, so a frame stage 1 declines leaves the fronts exactly where a frameless cabinet
// puts them — the door and the frame boards both read `faceFrameGeometry`, and cannot disagree
// about whether there is a frame to hang on.
export function frontGeometryOf(p: CarcaseParams, tree?: ResolvedTree): FrontGeometry {
  // The carcase *body*, which is what a front covers: from the bottom panel's underside to the
  // top. `floorZ` already returns `toeKickHeight` for both a toe kick and a ladder and 0
  // otherwise, so no base-mode branch is needed. Not `carcaseZ0`: under a toe kick the sides run
  // to the ground and a door that followed them would cover the kick.
  const outer = { x0: 0, x1: p.width, z0: floorZ(p), z1: p.height }
  const frame = faceFrameGeometry(p.section, outer, p.frame, tree)
  return {
    outer,
    mount: p.frontMount,
    reveal: p.frontReveal,
    frameOpenings: frame?.openings,
    frameLeafOpenings: frame?.leafOpenings,
    frameMembers: frame?.members,
    frameFrontOpenings: frame?.frontOpenings,
  }
}

// The rectangle the section tree divides: the clear opening between the shell panels. Each edge
// spends the thickness of the panel that bounds it — four separate panels, four separate calls —
// so a 25 mm left side moves x0 to 25 while an 18 mm right side leaves x1 where it was. A fixture
// whose panels are all the same thickness cannot tell the four apart.
export function openingRect(p: CarcaseParams, thicknessOf: RoleThickness): Rect {
  return {
    x0: thicknessOf('left-side'),
    x1: p.width - thicknessOf('right-side'),
    z0: floorZ(p) + thicknessOf('bottom'),
    z1: p.hasTop ? p.height - thicknessOf('top') : p.height,
  }
}

// The opening a removable interior item can actually pass through. A face frame can be narrower
// than the carcase opening, but it can also be narrower on only one axis or even wider than the
// carcase where a stile is slim. Intersection states the physical constraint: the item must clear
// BOTH. Structural fixed shelves deliberately do not use this helper.
export function usableInteriorRect(section: Rect, framed: Rect | undefined): Rect {
  if (framed === undefined) return section
  return {
    x0: Math.max(section.x0, framed.x0),
    x1: Math.min(section.x1, framed.x1),
    z0: Math.max(section.z0, framed.z0),
    z1: Math.min(section.z1, framed.z1),
  }
}

// How deep the inside of the cabinet actually is: a captured back stands inside the carcase and
// takes its own thickness out of the depth; an applied one hangs behind it and takes none. Stated
// here because a drawer runner has to fit this and a division panel's length *is* it — two copies
// of the rule is how a runner comes to disagree with the panel it screws to.
export function clearDepth(p: CarcaseParams, backThickness: number): number {
  return p.backMode === 'captured' ? p.depth - backThickness : p.depth
}

// A division panel is as thick as the panel it is, not as thick as the cabinet: the tree asks by
// parent section and index, which is exactly what the box table names the role after.
export function sectionThickness(thicknessOf: RoleThickness): DivisionThickness {
  return (parentId, index) => thicknessOf(`division-${parentId}-${index}`)
}



// The widest clear span a ladder base is allowed to leave between two of its uprights.
const MAX_LADDER_SPAN = 600

export function ladderMidRails(p: CarcaseParams, thicknessOf: RoleThickness): string[] {
  const clear = p.width - thicknessOf('ladder-left') - thicknessOf('ladder-right')
  const roles: string[] = []
  let spent = 0
  while ((clear - spent) / (roles.length + 1) > MAX_LADDER_SPAN) {
    const role = `ladder-mid-${roles.length}`
    spent += thicknessOf(role)
    roles.push(role)
  }
  return roles
}

export const PIN_DIAMETER = 5
const FIRST_PIN_INSET = 32

export function pinRow(rect: Rect, a: { count: number; pitch: number }): { first: number; count: number } {
  const first = rect.z0 + FIRST_PIN_INSET
  const count = Math.min(a.count, Math.floor((rect.z1 - PIN_DIAMETER / 2 - first) / a.pitch) + 1)
  return { first, count }
}
