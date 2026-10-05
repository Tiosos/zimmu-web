import type { ManufacturingPart } from './manufacturingPart'
import type { DowelBoreAxial, DowelBoreTransverse, HoleArrayCut } from './types'
import { faceAxes } from './snapMath'

type DrillingCut = HoleArrayCut | DowelBoreAxial | DowelBoreTransverse
export interface ManufacturingOperationReference {
  id: string
  label: string
  kind: DrillingCut['kind']
  sourceComponentId: string | null
  sourceJointId: string | null
}
export type DrillingCheckCode =
  | 'drilling-size'
  | 'drilling-array'
  | 'drilling-position'
  | 'drilling-bounds'
  | 'drilling-unassessed'
interface DrillingIssue {
  code: DrillingCheckCode
  message: string
  operation: ManufacturingOperationReference
}
const positive = (n: number) => Number.isFinite(n) && n > 0
const tolerance = 1e-6 // mm; allow round trips through component transforms at stock boundaries.
const fits = (centre: number, radius: number, extent: number) =>
  centre >= radius - tolerance && extent - centre >= radius - tolerance

// These are nominal-stock checks, not a simulation of intersecting cuts or tool access.
// Depth >= stock extent is an intentional through-hole, not an invalid blind-hole depth.
// Array endpoints suffice for a straight, constant-pitch row; never enumerate arbitrary counts.
export function drillingChecks(part: ManufacturingPart): DrillingIssue[] {
  const issues: DrillingIssue[] = []
  const add = (cut: DrillingCut, code: DrillingCheckCode, message: string) => {
    const operation = {
      id: cut.id,
      label: cut.label,
      kind: cut.kind,
      sourceComponentId: cut.kind === 'hole-array' ? (cut.sourceComponentId ?? null) : null,
      sourceJointId: cut.kind === 'hole-array' ? (cut.sourceJointId ?? null) : null,
    }
    issues.push({ code, message: `Drilling "${cut.label}" [${cut.id}]: ${message}`, operation })
  }
  for (const cut of part.cuts) {
    if (cut.kind !== 'hole-array' && cut.kind !== 'bore-axial' && cut.kind !== 'bore-transverse')
      continue
    if (!positive(cut.diameter) || !positive(cut.depth)) {
      add(cut, 'drilling-size', 'Diameter and depth must be finite and positive.')
      continue
    }
    if (part.kind === 'board' && cut.kind === 'hole-array') {
      if (
        !Number.isSafeInteger(cut.count) ||
        cut.count <= 0 ||
        !Number.isFinite(cut.pitch) ||
        cut.pitch < 0 ||
        (cut.count > 1 && cut.pitch === 0)
      ) {
        add(
          cut,
          'drilling-array',
          'Count must be a positive safe integer; pitch must be finite and positive for multiple holes (zero is allowed for one hole).',
        )
        continue
      }
      if (
        !['+X', '-X', '+Y', '-Y', '+Z', '-Z'].includes(cut.face) ||
        !['U', 'V'].includes(cut.axis)
      ) {
        add(cut, 'drilling-unassessed', 'Unsupported face or row axis; geometry was not assessed.')
        continue
      }
      if (![cut.start.x, cut.start.y, cut.start.z].every(Number.isFinite)) {
        add(cut, 'drilling-position', 'Entry coordinates must be finite.')
        continue
      }
      if (!Object.values(part.local).every(positive)) {
        add(
          cut,
          'drilling-unassessed',
          'Invalid board dimensions; stock boundaries were not assessed.',
        )
        continue
      }
      const dims = { x: part.local.length, y: part.local.width, z: part.local.thickness }
      const axes = faceAxes(cut.face)
      const entry = cut.face.startsWith('+') ? dims[axes.depth] : 0
      if (Math.abs(cut.start[axes.depth] - entry) > tolerance)
        add(cut, 'drilling-position', `Entry must lie on the ${cut.face} stock face.`)
      const run = cut.axis === 'U' ? axes.u : axes.v
      const across = cut.axis === 'U' ? axes.v : axes.u
      const last = cut.start[run] + (cut.count - 1) * cut.pitch
      const radius = cut.diameter / 2
      if (
        !Number.isFinite(last) ||
        !fits(cut.start[run], radius, dims[run]) ||
        !fits(last, radius, dims[run]) ||
        !fits(cut.start[across], radius, dims[across])
      )
        add(
          cut,
          'drilling-bounds',
          'The complete first and last hole openings must fit within the stock face.',
        )
    } else if (part.kind === 'cylinder' && cut.kind !== 'hole-array') {
      if (!positive(part.length) || !positive(part.diameter)) {
        add(
          cut,
          'drilling-unassessed',
          'Invalid round-stock dimensions; bore boundaries were not assessed.',
        )
        continue
      }
      if (cut.diameter >= part.diameter)
        add(cut, 'drilling-bounds', 'Bore diameter must be smaller than the round-stock diameter.')
      if (cut.kind === 'bore-axial') {
        if (cut.end !== '+Z' && cut.end !== '-Z')
          add(cut, 'drilling-unassessed', 'Unsupported bore end; entry was not assessed.')
      } else {
        if (!Number.isFinite(cut.position) || !Number.isFinite(cut.azimuth)) {
          add(cut, 'drilling-position', 'Transverse bore position and azimuth must be finite.')
          continue
        }
        if (!fits(cut.position, cut.diameter / 2, part.length))
          add(
            cut,
            'drilling-bounds',
            'The transverse bore opening must fit between the stock ends.',
          )
      }
    }
  }
  return issues
}
