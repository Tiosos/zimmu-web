import type { CarcaseParams } from './types'
import type { RoleThickness } from './resolveThickness'
import { resolveSections, type Rect } from './sectionTree'
import { sectionInteriors } from './sectionInterior'
import { faceFrameGeometry } from './faceFrame'
import { frontGeometryOf, ladderMidRails, openingRect, sectionThickness } from './carcaseLayout'
import { validateCarcaseParams } from './carcaseValidation'
import { carcaseBoxes } from './carcaseParts'

// Role pairs that touch and are deliberately left unjointed: a shelf stops at the back, it is not
// housed in it, and the kick carries the bottom rather than joining it. Independent of jointMethod —
// they abut whatever fastens the cabinet.
export function carcaseContactPairs(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
): [string, string][] {
  if (validateCarcaseParams(p, thicknessOf).length > 0) return []

  const pairs: [string, string][] = []
  if (p.baseMode === 'toe-kick') pairs.push(['bottom', 'toe-kick'])
  // Everything the ladder frame meets, it meets across one plane: the carcase is built as a box and
  // set down on the frame's top at z = toeKickHeight. The bottom lies flat on the rails exactly as
  // it lies on a toe kick, and each side's bottom edge lands on a rail's top edge — end to end, not
  // end into face. Screwed down through that plane, not joined into it.
  if (p.baseMode === 'ladder') {
    for (const rail of [
      'ladder-front',
      'ladder-back',
      'ladder-left',
      'ladder-right',
      ...ladderMidRails(p, thicknessOf),
    ]) {
      pairs.push(['bottom', rail])
    }
    for (const [side, rail] of [
      ['left-side', 'ladder-left'],
      ['right-side', 'ladder-right'],
    ] as const) {
      pairs.push([side, 'ladder-front'], [side, 'ladder-back'], [side, rail])
    }
  }
  // An applied back is screwed onto the back of the shell instead of being let into a groove in
  // it, so every panel it meets there is a contact rather than joinery.
  if (p.backMode === 'applied') {
    pairs.push(['back', 'left-side'], ['back', 'right-side'], ['back', 'bottom'])
    if (p.hasTop) pairs.push(['back', 'top'])
    // Covering the shell, the back runs down to the top of a ladder frame, where its bottom edge
    // lands on the back rail's top edge — the same set-down plane the sides and the bottom meet the
    // frame across, and screwed down through it just the same.
    if (p.baseMode === 'ladder') pairs.push(['back', 'ladder-back'])
  }
  if (p.backMode !== 'none') {
    const tree = resolveSections(
      p.section,
      openingRect(p, thicknessOf),
      sectionThickness(thicknessOf),
    )
    for (const d of tree.divisions) pairs.push(['back', `division-${d.parentId}-${d.index}`])
    // A fixed shelf stops at the back exactly as a division does: it meets it, it is not housed
    // in it.
    for (const { sectionId, spec } of sectionInteriors(p.section, tree)) {
      for (let i = 0; i < spec.fixedShelves; i++) {
        pairs.push(['back', `fixed-shelf-${sectionId}-${i}`])
      }
    }
  }

  // A front that reaches the carcase face lands flat on every panel it covers, and is fixed to it —
  // by hinges, by screws through a drawer box, by whatever hangs it. That is a contact, not
  // joinery, and a contact the generator does not name is an unjoined pair on the checklist
  // forever. An inset front stands in the opening, a reveal clear of everything, and contributes
  // none.
  //
  // Read off the emitted boxes rather than off `frontMount`: the mount is what *decides* where the
  // front sits, so asking it here would let the box and the contact disagree silently if either
  // moved. `y1 === 0` is the front's inner face on the carcase face, which is the contact itself.
  const boxes = carcaseBoxes(p, thicknessOf)
  const fronts = boxes.filter((b) => b.role.startsWith('front-') && b.box.y1 === 0)
  for (const f of fronts) {
    for (const b of boxes) {
      // The carcase face is y = 0. Every panel that reaches it and lies behind the front's
      // rectangle is under it; the toe kick and the ladder rails are set back and are not.
      if (b.box.y0 !== 0 || b.role.startsWith('front-')) continue
      if (b.box.x1 <= f.box.x0 || b.box.x0 >= f.box.x1) continue
      if (b.box.z1 <= f.box.z0 || b.box.z0 >= f.box.z1) continue
      pairs.push([f.role, b.role])
    }
  }
  return pairs
}

// What a face frame touches that is not joinery, read off the emitted boxes exactly as
// `carcaseContactPairs` reads its own. Three families, each a contact by an existing precedent:
//
//   - stile against rail, which the spec asks the frame to declare rather than report as open —
//     how the frame is put together is a `jointMethod` question, not a new joint kind;
//   - a member against a carcase panel's front edge, the mirror of an applied back screwed onto the
//     rear ones, which `carcaseContactPairs` already declares;
//   - a front standing on the frame, the overlay front's contact moved one surface out.
//
// Empty where no frame was built, so a frame stage 1 declines declares nothing, as it builds
// nothing. Roles only: which cabinet a board belongs to is the checklist's question, since every
// cabinet has a `left-side`.
export function faceFrameContactPairs(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
): [string, string][] {
  const g = faceFrameGeometry(p.section, frontGeometryOf(p).outer, p.frame)
  if (g === null) return []
  const depth = thicknessOf('stile-left')
  const overlaps = (a: Rect, b: Rect): boolean =>
    a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
  // Two members meet along an edge: flush on one axis, overlapping along the other.
  const meet = (a: Rect, b: Rect): boolean =>
    ((a.x1 === b.x0 || b.x1 === a.x0) && a.z0 < b.z1 && b.z0 < a.z1) ||
    ((a.z1 === b.z0 || b.z1 === a.z0) && a.x0 < b.x1 && b.x0 < a.x1)

  const pairs: [string, string][] = []
  g.members.forEach((m, i) => {
    for (const n of g.members.slice(i + 1)) if (meet(m.rect, n.rect)) pairs.push([m.role, n.role])
  })
  for (const b of carcaseBoxes(p, thicknessOf)) {
    const front = b.role.startsWith('front-')
    // A front's inner face on the frame's face; a panel's front edge on the carcase face, which is
    // the frame's back. The toe kick and ladder rails are set back and reach neither.
    if (front ? b.box.y1 !== -depth : b.box.y0 !== 0) continue
    for (const m of g.members) {
      if (!overlaps(m.rect, b.box)) continue
      pairs.push(front ? [b.role, m.role] : [m.role, b.role])
    }
  }
  return pairs
}

