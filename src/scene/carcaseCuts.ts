import type { BoxCut, CarcaseParams } from './types'
import type { RoleThickness } from './resolveThickness'

// Cuts a carcase places on its own panels, independent of any joint. With a toe kick the sides run
// to the floor while the bottom sits on top of the kick, so the recess is blocked by the sides
// themselves until each is notched at the front bottom corner.
//
// The panel's board frame comes from orientedPanel(..., 'x'): board x runs the carcase depth axis,
// board y the height axis, board z the material thickness.
export function carcaseCuts(p: CarcaseParams, thicknessOf: RoleThickness, role: string): BoxCut[] {
  if (p.baseMode !== 'toe-kick') return []
  if (role !== 'left-side' && role !== 'right-side') return []

  const T = thicknessOf(role)
  return [
    {
      kind: 'box',
      id: `cut_toekick_${role}`,
      label: 'Toe Kick Notch',
      // The notch passes clear through the thickness, so it reads on the Face view.
      face: '-Z',
      // A tool face coplanar with the face it subtracts from is resolved unreliably by OCCT;
      // overshooting both thickness faces keeps it an unambiguous through-cut.
      position: { x: 0, y: 0, z: -T / 2 },
      size: { x: p.toeKickSetback, y: p.toeKickHeight, z: T * 2 },
    },
  ]
}

