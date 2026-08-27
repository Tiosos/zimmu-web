import type { Grain, ThicknessAxis } from './types'

export type GrainAxis = 'x' | 'y' | 'z'

// Which carcase axes a panel's length and width land on, given where its thickness is. This mirrors
// `orientedPanel`'s three rotations and is checked against them in the tests — the map is the
// contract, the rotations are the implementation.
export const GRAIN_IN_PLANE: Record<ThicknessAxis, { length: GrainAxis; width: GrainAxis }> = {
  z: { length: 'x', width: 'y' },
  x: { length: 'y', width: 'z' },
  y: { length: 'z', width: 'x' },
}

// The convention, stated once, in carcase axes. Vertical panels run grain up (+Z); flat panels and
// the kick run it across the cabinet (+X); ladder side rails run it front-to-back (+Y). Which board
// *field* that becomes is derived below and differs per role — that is the frames differing, not
// the convention.
//
// A `division-` role names a partition or a shelf depending only on which way its parent section
// was split, so it cannot state a grain alone — the caller passes the axis it resolved.
export function grainAxisOf(role: string, splitAxis?: 'vertical' | 'horizontal'): GrainAxis {
  if (role.startsWith('division-')) {
    if (splitAxis === undefined) {
      throw new Error(`zimmu: division role "${role}" needs its split axis to state a grain`)
    }
    return splitAxis === 'vertical' ? 'z' : 'x'
  }
  if (role === 'left-side' || role === 'right-side') return 'z'
  if (role === 'back') return 'z'
  if (role === 'bottom' || role === 'top') return 'x'
  if (role === 'toe-kick' || role === 'ladder-front' || role === 'ladder-back') return 'x'
  if (role === 'ladder-left' || role === 'ladder-right' || role.startsWith('ladder-mid-'))
    return 'y'
  // Deliberately fatal. A silent default would give a new role an arbitrary grain and no test would
  // notice — a nest would just come out slightly worse for a reason nobody could find.
  throw new Error(`zimmu: no grain convention for role "${role}"`)
}

export function grainFieldFor(thicknessAxis: ThicknessAxis, grainAxis: GrainAxis): Grain {
  const inPlane = GRAIN_IN_PLANE[thicknessAxis]
  if (grainAxis === inPlane.length) return 'length'
  if (grainAxis === inPlane.width) return 'width'
  // Grain along the thickness is meaningless for a sheet good; the caller has a bad pairing.
  throw new Error(`zimmu: grain axis ${grainAxis} is the thickness axis of this panel`)
}
