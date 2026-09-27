import type { CarcaseParams, Face } from './types'
import type { RoleThickness } from './resolveThickness'
import type { CarcaseJointKind, RoleJointKind } from './resolveJointKind'
import { resolveSections, type Bound, type ResolvedDivision, type SectionBounds } from './sectionTree'
import { sectionInteriors } from './sectionInterior'
import { ladderMidRails, openingRect, sectionThickness } from './carcaseLayout'
import { validateCarcaseParams } from './carcaseValidation'

export interface JointDescriptor {
  kind: CarcaseJointKind
  housingRole: string
  housedRole: string
  housingFace: Face
  housedEnd: Face
  sourceComponentId: string
  driven: true
}

// Board-local faces, so they follow the panel's thickness axis. A side and a divider are both
// thickness-on-x panels, which is why one pair of constants covers every housing here: an edge
// facing carcase +x presents its board +Z, and the panel it houses meets it with its own -X (for
// a thickness-on-z panel: bottom, top, shelf) or -Y (thickness-on-y: back, toe kick).
const LEFT_EDGE_FACE: Face = '+Z'
const RIGHT_EDGE_FACE: Face = '-Z'

interface SideSpec {
  role: string
  inward: Face
  endOfFlat: Face
  endOfUpright: Face
}

const SIDES: SideSpec[] = [
  { role: 'left-side', inward: LEFT_EDGE_FACE, endOfFlat: '-X', endOfUpright: '-Y' },
  { role: 'right-side', inward: RIGHT_EDGE_FACE, endOfFlat: '+X', endOfUpright: '+Y' },
]

interface Housing {
  role: string
  housingFace: Face
  housedEnd: Face
}

// What a division is housed into, and with which faces. Both branches are transcribed from the two
// rules the old code wrote separately — a partition into bottom and top, a shelf into whatever
// bounds its bay — so these face constants are the ones that were already shipping, not ones
// re-derived from the frames.
//
// The two panel kinds line up because a bound is always the same thickness axis as the shell panel
// it replaces: a shelf is thickness-on-z like bottom and top, a partition is thickness-on-x like a
// side, so one pair of faces covers a shell bound and a division bound alike.
function housingsFor(p: CarcaseParams, d: ResolvedDivision, parent: SectionBounds): Housing[] {
  const roleOf = (b: Bound, shell: string | null): string | null =>
    b.kind === 'division' ? `division-${b.parentId}-${b.index}` : shell

  if (d.axis === 'vertical') {
    // Was: add('dado', 'bottom', `divider-${i}`, '+Z', '-Y') / ('top', …, '-Z', '+Y')
    const below = roleOf(parent.bottom, 'bottom')
    const above = roleOf(parent.top, p.hasTop ? 'top' : null)
    return [
      ...(below === null
        ? []
        : [{ role: below, housingFace: '+Z' as Face, housedEnd: '-Y' as Face }]),
      ...(above === null
        ? []
        : [{ role: above, housingFace: '-Z' as Face, housedEnd: '+Y' as Face }]),
    ]
  }

  // Was: add('dado', left, `shelf-…`, LEFT_EDGE_FACE, '-X') / (right, …, RIGHT_EDGE_FACE, '+X')
  const left = roleOf(parent.left, 'left-side')
  const right = roleOf(parent.right, 'right-side')
  return [
    ...(left === null
      ? []
      : [{ role: left, housingFace: LEFT_EDGE_FACE, housedEnd: '-X' as Face }]),
    ...(right === null
      ? []
      : [{ role: right, housingFace: RIGHT_EDGE_FACE, housedEnd: '+X' as Face }]),
  ]
}

// The joints a carcase implies, keyed by role because part ids are only known after reconciliation.
//
// Screw fixing is joinery here, not hardware — the comment this replaces said the opposite of all
// three fastener methods. A ScrewJoint derives two hole arrays, clearance through one panel and
// pilots into the other's end, so a screwed cabinet emits the same role pairs the dado path does
// and gets its bores from them. Dowel and confirmat still emit nothing, for the reason screwing no
// longer has: neither is a kind in the Joint union, so there is nothing to derive geometry from.
export function carcaseJoints(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
  kindOf: RoleJointKind,
  componentId: string,
): JointDescriptor[] {
  if (validateCarcaseParams(p, thicknessOf).length > 0) return []
  if (
    p.jointMethod !== 'dado-rabbet' &&
    p.jointMethod !== 'finger' &&
    p.jointMethod !== 'butt-screw'
  )
    return []

  const out: JointDescriptor[] = []
  const add = (
    kind: CarcaseJointKind,
    housingRole: string,
    housedRole: string,
    housingFace: Face,
    housedEnd: Face,
  ) => {
    out.push({
      // What this pair is actually joined with: a joint the user took ownership of is the one
      // regeneration keeps, so it is the one the panels have to be sized to. `jointMethod` is only
      // the default the rest of this function derives.
      kind: kindOf(housingRole, housedRole) ?? kind,
      housingRole,
      housedRole,
      housingFace,
      housedEnd,
      sourceComponentId: componentId,
      driven: true,
    })
  }

  // A corner takes fingers only when the two outer faces are coplanar. A toe kick insets the bottom
  // while the sides still run to the floor, so that corner stays a dado — which is also the only
  // thing the suggestion engine would offer there.
  const finger = p.jointMethod === 'finger'
  const fingerBottom = finger && p.baseMode !== 'toe-kick'
  // Every pair the dado path names, a screwed cabinet names too, with the same two faces: the
  // panel that would house the groove is the one screwed through, and the panel that would sit in
  // it takes the pilots in its end. That is the pairing defaultScrewJoint is written to.
  const joinery: CarcaseJointKind = p.jointMethod === 'butt-screw' ? 'screw' : 'dado'

  for (const s of SIDES) {
    if (fingerBottom) add('finger', s.role, 'bottom', '-Y', s.endOfFlat)
    else add(joinery, s.role, 'bottom', s.inward, s.endOfFlat)
    if (p.hasTop) {
      if (finger) add('finger', s.role, 'top', '+Y', s.endOfFlat)
      else add(joinery, s.role, 'top', s.inward, s.endOfFlat)
    }
    if (p.backMode === 'captured') add(joinery, s.role, 'back', s.inward, s.endOfUpright)
    if (p.baseMode === 'toe-kick') add(joinery, s.role, 'toe-kick', s.inward, s.endOfUpright)
  }

  // The base frame is joined to itself: each side rail's end lands in the inner face of the
  // full-width rail crossing it. Nothing above the frame is jointed into it — the carcase is set
  // down on the frame's top plane, which carcaseContactPairs declares.
  if (p.baseMode === 'ladder') {
    for (const rail of ['ladder-left', 'ladder-right', ...ladderMidRails(p, thicknessOf)]) {
      add(joinery, 'ladder-front', rail, '+Z', '-X')
      add(joinery, 'ladder-back', rail, '-Z', '+X')
    }
  }

  // A captured back sits on the bottom and under the top, so they house it, not the other way
  // round. An applied back is screwed onto the rear edges instead — carcaseContactPairs declares it.
  if (p.backMode === 'captured') {
    add(joinery, 'bottom', 'back', '+Z', '-X')
    if (p.hasTop) add(joinery, 'top', 'back', '-Z', '+X')
  }

  // A division is housed at both ends into whatever bounds its parent section along the
  // perpendicular axis: a partition into the bottom and the top, a shelf into the two uprights of
  // its bay, whether those are the sides or the partitions beside it.
  const tree = resolveSections(
    p.section,
    openingRect(p, thicknessOf),
    sectionThickness(thicknessOf),
  )
  for (const d of tree.divisions) {
    if (d.kind === 'rail') continue // butt-jointed; no housing
    const housedRole = `division-${d.parentId}-${d.index}`
    for (const h of housingsFor(p, d, tree.boundsOf(d.parentId))) {
      add(joinery, h.role, housedRole, h.housingFace, h.housedEnd)
    }
  }

  // A fixed shelf inside a section is housed exactly as a horizontal division is — in the two
  // uprights bounding its own section, whether those are the sides or the partitions beside them.
  // `housingsFor` already answers that for a horizontal split, so the shelf is handed to it as one
  // rather than growing a second copy of the same table.
  for (const { sectionId, rect, spec } of sectionInteriors(p.section, tree)) {
    const bounds = tree.boundsOf(sectionId)
    for (let i = 0; i < spec.fixedShelves; i++) {
      const asDivision: ResolvedDivision = {
        parentId: sectionId,
        index: i,
        axis: 'horizontal',
        kind: 'panel',
        rect,
      }
      for (const h of housingsFor(p, asDivision, bounds)) {
        add(joinery, h.role, `fixed-shelf-${sectionId}-${i}`, h.housingFace, h.housedEnd)
      }
    }
  }

  return out
}

