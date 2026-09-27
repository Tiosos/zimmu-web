import type { CarcaseParams } from './types'
import type { RoleThickness } from './resolveThickness'
import { resolveSections, validateSection } from './sectionTree'
import { frontCells } from './frontCells'
import { floorZ, frontGeometryOf, openingRect, sectionThickness } from './carcaseLayout'
import { validateFrameLayout } from './faceFrame'

// Total and side-effect free by contract: the generator calls this on every keystroke and emits
// nothing when it returns errors, so the last-good parts survive transient states like a width of
// `6` on the way to `600`. Every problem is collected — a panel that reported one at a time would
// turn fixing three mistakes into three round trips.
export function validateCarcaseParams(p: CarcaseParams, thicknessOf: RoleThickness): string[] {
  const errors: string[] = []

  // `roleThicknessFor` is fatal by design; here it must not be. The parameter panel validates on
  // every keystroke, so a slot whose material cannot say how thick it is has to read back as a
  // message beside the fields rather than as an exception that takes the app down mid-edit. Every
  // rule below reads thicknesses through this, so the function stays total.
  const unresolved = new Set<string>()
  const thicknessAt: RoleThickness = (role) => {
    try {
      return thicknessOf(role)
    } catch {
      // Named by slot, not by role: every role but the back draws on the same one, so one message
      // per slot is what the user can act on.
      const message =
        role === 'back'
          ? `backMaterial "${p.backMaterial}" has no thickness`
          : role.startsWith('stile-') || role.startsWith('rail-')
            ? `frameMaterial "${p.frameMaterial}" has no thickness`
            : `carcaseMaterial "${p.carcaseMaterial}" has no thickness`
      if (!unresolved.has(message)) {
        unresolved.add(message)
        errors.push(message)
      }
      return 0
    }
  }
  const left = thicknessAt('left-side')
  const right = thicknessAt('right-side')
  const bottom = thicknessAt('bottom')
  // Charged against the height budget whether or not the cabinet has a top, as one cabinet-wide
  // thickness was: a carcase too short for two panels is too short for the one it does have.
  const top = thicknessAt('top')
  const back = p.backMode === 'none' ? 0 : thicknessAt('back')
  const ladderFront = p.baseMode === 'ladder' ? thicknessAt('ladder-front') : 0
  const ladderBack = p.baseMode === 'ladder' ? thicknessAt('ladder-back') : 0
  // Asked about, and the answer discarded: no rule below reads these, but every panel the box
  // table will build has to fail here, where an unusable material is a message, rather than there,
  // where it is a throw.
  if (p.baseMode === 'toe-kick') thicknessAt('toe-kick')
  if (p.baseMode === 'ladder') {
    thicknessAt('ladder-left')
    thicknessAt('ladder-right')
  }
  // Only a framed cabinet builds a frame, so only it answers for the frame material. One member
  // stands for all four: they share one slot.
  if (p.frame !== undefined) thicknessAt('stile-left')
  // Nothing below this can mean anything while a thickness is unknown.
  if (errors.length > 0) return errors

  if (Math.min(left, right, bottom, top) <= 0) errors.push('thickness must be positive')
  if (p.width <= left + right) errors.push('width must exceed 2 × thickness')
  if (p.height <= bottom + top) errors.push('height must exceed 2 × thickness')
  // The thickest shell panel is the one that runs out of depth first.
  if (p.depth <= Math.max(left, right, bottom, top)) errors.push('depth must exceed thickness')
  // Both bases spend toeKickHeight out of the total height: a toe kick lifts the bottom panel
  // inside sides that still reach the ground, a ladder lifts the whole carcase onto its frame.
  if (p.baseMode === 'toe-kick' || p.baseMode === 'ladder') {
    if (p.toeKickHeight >= p.height) {
      errors.push('toeKickHeight must be less than height')
    } else if (p.toeKickHeight + bottom + top >= p.height) {
      errors.push('toeKickHeight leaves no room between top and bottom')
    }
  }
  if (p.baseMode === 'toe-kick' && p.toeKickSetback >= p.depth) {
    errors.push('toeKickSetback must be less than depth')
  }
  // A ladder needs the setback to clear two rail thicknesses, not one: its side rails run
  // y:[KS+T, D-T] and invert — a negative extent OCCT sees as a degenerate solid — before the
  // front rail alone would run out of depth.
  if (p.baseMode === 'ladder' && p.toeKickSetback + ladderFront + ladderBack >= p.depth) {
    errors.push('toeKickSetback leaves no room for the ladder side rails')
  }
  if (p.backMode !== 'none' && back >= p.depth) {
    errors.push('the back material is thicker than the cabinet is deep')
  }
  // Refused rather than quietly hung as overlay: half-overlay laps a stile, and a frameless
  // cabinet has none to lap.
  if (p.frontMount === 'half-overlay' && p.frame === undefined) {
    errors.push('half-overlay needs a face frame')
  }
  // Only the frame's own parameter impossibilities refuse the cabinet here. A geometry case the
  // frame cannot build is handled by `faceFrameGeometry` declining safely rather than turning an
  // in-progress edit into a vanished cabinet.
  if (p.frame !== undefined) {
    const { stileWidth, railWidth, midStileWidth, midRailWidth } = p.frame
    if (Math.min(stileWidth, railWidth, midStileWidth, midRailWidth) <= 0) {
      errors.push('frame members must be wider than zero')
    } else if (p.width - 2 * stileWidth <= 0 || p.height - floorZ(p) - 2 * railWidth <= 0) {
      // `floorZ`, because the frame sits on the carcase and the toe kick is recessed behind it —
      // the same floor the front's own rectangle starts from.
      errors.push('the face frame leaves no opening')
    }
  }
  errors.push(...validateSection(p.section))
  errors.push(...validateFrameLayout(p.section, p.frame))
  // The tree's own rules are about the tree; only the resolved rectangles know whether the cabinet
  // is big enough to hold it. A section squeezed to nothing does not produce a thin panel, it
  // produces panels that pass through the shell and through each other — which is what the v12
  // rules named `dividers` and `fixedShelves` were guarding against.
  const resolved = resolveSections(
    p.section,
    openingRect(p, thicknessAt),
    sectionThickness(thicknessAt),
  )
  for (const rect of resolved.rects.values()) {
    if (rect.x1 - rect.x0 <= 0 || rect.z1 - rect.z0 <= 0) {
      errors.push('the sections do not fit in the carcase')
      break
    }
  }

  // A reveal is taken off every edge of every front, so a big enough one turns the door inside out
  // — an inset front at 400 mm on a 600 cabinet comes out −236 × −216, which reaches OCCT as a
  // degenerate solid. Read off the cells the cabinet would actually emit rather than off the number
  // alone: a cabinet with no front cannot be hurt by any reveal, and failing it would reject a
  // parameter that costs it nothing.
  if (p.frontReveal < 0) errors.push('the reveal must be 0 or more')
  else {
    const cells = frontCells(p.section, resolved, frontGeometryOf(p, resolved))
    if (cells.some((c) => c.rect.x1 - c.rect.x0 <= 0 || c.rect.z1 - c.rect.z0 <= 0)) {
      errors.push('the reveal leaves no front')
    }
  }
  return errors
}

