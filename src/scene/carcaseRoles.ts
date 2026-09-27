import type { CarcaseParams } from './types'

export type { ThicknessAxis } from './types'
export {
  clearDepth,
  floorZ,
  frontGeometryOf,
  openingRect,
  orientedPanel,
  sectionThickness,
} from './carcaseLayout'
export type { LocalBox, PanelSpec } from './carcaseLayout'
export { validateCarcaseParams } from './carcaseValidation'
export { carcaseBoxes, carcaseRoles } from './carcaseParts'
export type { RoleBox, RoleSpec } from './carcaseParts'
export { carcaseJoints } from './carcaseJoinery'
export type { JointDescriptor } from './carcaseJoinery'
export { carcaseContactPairs, faceFrameContactPairs } from './carcaseContacts'
export { carcaseCuts } from './carcaseCuts'
export { carcaseHoleArrays, carcaseMachining } from './carcaseMachining'

// Which carcase parameter, if any, a driven part's board dimension is a direct expression of.
// Used by the detach prompt to offer "change the cabinet" instead of "detach" where the edit has
// somewhere to go.
//
// Only *direct* one-to-one relationships are reported. A bottom panel's length is
// `width - 2 * thickness` — two parameters — so there is nothing unambiguous to push an edit into,
// and offering to change the cabinet there would silently pick one.
//
// No dimension maps to a thickness any more: thickness comes from the panel's material, and a
// cabinet-wide number to push it into no longer exists. An edit there has to become a material
// choice or a per-part override instead.
export function parameterForRole(
  role: string | undefined,
  dimension: 'length' | 'width' | 'thickness',
  p: CarcaseParams,
): keyof CarcaseParams | null {
  if (role === undefined || dimension === 'thickness') return null

  // A division — partition or shelf — spans whatever the tree gives it.
  if (role.startsWith('division-')) return null

  switch (role) {
    case 'left-side':
    case 'right-side':
      if (dimension === 'length') return 'depth'
      // The side spans carcaseZ0..H, so its width is the height parameter only when the carcase
      // starts on the ground. Under a ladder base it is height - toeKickHeight, and pushing an
      // edit into `height` would move the top without moving the bottom.
      return p.baseMode === 'ladder' ? null : 'height'
    case 'bottom':
    case 'top':
      return dimension === 'width' ? 'depth' : null
    default:
      return null
  }
}
