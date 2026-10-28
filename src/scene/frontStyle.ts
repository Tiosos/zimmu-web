// How a door or a drawer front is *made*, as opposed to what covers an opening. Absent means a flat
// slab, which is what every file written before this module carries.
//
// A shaker front is five boards: two stiles, two rails and a panel set back between them. The panel
// is thinner than the frame, which is why it states its own thickness rather than reading the front
// material's — the same reason a part carries an override, stated here because the style is an
// input to generation and must be known before any box exists.
import { CUP_DIAMETER, CUP_EDGE_DISTANCE } from './frontMachining'

export type FrontStyle =
  | { kind: 'slab' }
  | {
      kind: 'shaker'
      // The visible frame face, measured across the door. A real shaker frame is 50–70 mm; 60 mm
      // is the stated default, not a figure derived from anything the app knows.
      frameWidth: number
      // How far back from the front's outer face the panel's face sits.
      panelRecess: number
      // The panel's own thickness. Stated rather than read off the front material: a 6 mm panel in
      // an 18 mm door is ordinary, and the frame is the part that follows the material.
      panelThickness: number
    }

// A cup is bored into the hinge stile, so the stile has to be at least half a cup plus the cup's
// edge distance. Derived from the hardware figures rather than restated: 35 / 2 + 22.5 = 40 mm.
export const MIN_SHAKER_FRAME = CUP_DIAMETER / 2 + CUP_EDGE_DISTANCE

export const DEFAULT_SHAKER = {
  kind: 'shaker' as const,
  frameWidth: 60,
  panelRecess: 6,
  panelThickness: 6,
}

export type FrontPiece = 'stile-l' | 'stile-r' | 'rail-t' | 'rail-b' | 'panel'

// Ordered as a door is built: the two stiles first, then the rails between them, then the panel —
// the array is the order the roles reach the cutting list.
export const FRONT_PIECES: readonly FrontPiece[] = ['stile-l', 'stile-r', 'rail-b', 'rail-t', 'panel']

export interface ShakerSpec {
  frameWidth: number
  panelRecess: number
  panelThickness: number
}

// The style of a front that can be made in pieces. A false front and a cover panel carry no style
// at all, so the caller passes what it has and this answers `null` for them.
export function shakerOf(style: FrontStyle | undefined): ShakerSpec | null {
  return style !== undefined && style.kind === 'shaker' ? style : null
}

// The role key of one piece of a made front. The base role is the door's own — `front-<section>-<n>`
// — so ownership parsing keeps working: `sectionNodes` reads the base and ignores the suffix.
export function pieceRole(base: string, piece: FrontPiece): string {
  return `${base}-${piece}`
}

// Whether a role is one of the pieces of the front whose base role is `base`. Asked wherever a
// caller looks for "the board that covers this opening": a made front has five, and a check that
// only looked for the base role would report a door that exists as not fitting.
export function isPieceOf(base: string, role: string | undefined): boolean {
  if (role === undefined || !role.startsWith(`${base}-`)) return false
  return FRONT_PIECES.includes(role.slice(base.length + 1) as FrontPiece)
}

// What is wrong with a style at a given front size. Total and side-effect free, like every other
// validator here: the generator asks before it emits, and a style it cannot build emits nothing
// rather than a door that only looks like a shaker.
//
// `thickness` is the front material's thickness — the frame's depth — and the panel has to stay
// inside it.
export function shakerIssues(
  style: ShakerSpec,
  width: number,
  height: number,
  thickness: number,
): string[] {  const issues: string[] = []
  if (!Number.isFinite(style.frameWidth) || style.frameWidth <= 0) {
    issues.push('shaker frame width must be greater than zero')
  } else if (style.frameWidth < MIN_SHAKER_FRAME) {
    issues.push(
      `shaker frame width must be at least ${MIN_SHAKER_FRAME} mm so the hinge cup fits in the stile`,
    )
  }
  if (2 * style.frameWidth >= width) {
    issues.push(`a ${style.frameWidth} mm shaker frame leaves no panel across a ${width} mm front`)
  }
  if (2 * style.frameWidth >= height) {
    issues.push(`a ${style.frameWidth} mm shaker frame leaves no panel down a ${height} mm front`)
  }
  if (!Number.isFinite(style.panelThickness) || style.panelThickness <= 0) {
    issues.push('shaker panel thickness must be greater than zero')
  }
  if (!Number.isFinite(style.panelRecess) || style.panelRecess < 0) {
    issues.push('shaker panel recess must be zero or more')
  } else if (
    Number.isFinite(style.panelThickness) &&
    style.panelThickness > 0 &&
    style.panelRecess + style.panelThickness > thickness
  ) {
    issues.push(
      `a ${style.panelThickness} mm panel set ${style.panelRecess} mm back does not fit inside a ${thickness} mm front`,
    )
  }
  return issues
}

export interface PieceRect {
  x0: number
  x1: number
  z0: number
  z1: number
}

// Which stile a door is hung on. A left-hinged door bores its cups into the left stile, and the
// stile's own board frame still runs the door's height along board x — so the cup row needs no new
// arithmetic, only the piece it lands on.
export function hingePiece(hinge: 'left' | 'right'): FrontPiece {
  return hinge === 'left' ? 'stile-l' : 'stile-r'
}

// The style a front is actually *made* with, or null where it is a plain slab. The one statement of
// the fallback: a style the cabinet cannot build is a flat front, and both the geometry pass and
// the machining pass read that decision here rather than each deciding for itself.
export function madeFront(
  front: { kind: string; style?: FrontStyle },
  width: number,
  height: number,
  thickness: number,
): ShakerSpec | null {
  if (front.kind !== 'door' && front.kind !== 'drawer-front') return null
  const style = shakerOf(front.style)
  if (style === null) return null
  return shakerIssues(style, width, height, thickness).length === 0 ? style : null
}

// The five boards a made front occupies, in the front's own plane. `outer` is the front cell's
// rectangle — reveals already taken by `frontCells` — and `y0`/`y1` are the depth extent the frame
// occupies. The panel is set back from the outer face (`y0` is the outer face, because the front
// faces −y) by `panelRecess` and is `panelThickness` deep, so it never leaves the frame's depth.
//
// Stated as rectangles rather than boxes so it can be tested without a carcase, and so the one
// description of a shaker front is readable in one place.
export function shakerPieces(
  outer: PieceRect,
  style: ShakerSpec,
  y0: number,
  y1: number,
): { piece: FrontPiece; rect: PieceRect; y0: number; y1: number }[] {
  const frame = style.frameWidth
  const innerX0 = outer.x0 + frame
  const innerX1 = outer.x1 - frame
  const innerZ0 = outer.z0 + frame
  const innerZ1 = outer.z1 - frame
  const panelY0 = y0 + style.panelRecess
  return [
    { piece: 'stile-l', rect: { x0: outer.x0, x1: innerX0, z0: outer.z0, z1: outer.z1 }, y0, y1 },
    { piece: 'stile-r', rect: { x0: innerX1, x1: outer.x1, z0: outer.z0, z1: outer.z1 }, y0, y1 },
    {
      piece: 'rail-b',
      rect: { x0: innerX0, x1: innerX1, z0: outer.z0, z1: innerZ0 },
      y0,
      y1,
    },
    {
      piece: 'rail-t',
      rect: { x0: innerX0, x1: innerX1, z0: innerZ1, z1: outer.z1 },
      y0,
      y1,
    },
    {
      piece: 'panel',
      rect: { x0: innerX0, x1: innerX1, z0: innerZ0, z1: innerZ1 },
      y0: panelY0,
      y1: panelY0 + style.panelThickness,
    },
  ]
}
