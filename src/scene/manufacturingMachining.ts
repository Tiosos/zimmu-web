import type { ManufacturingPart } from './manufacturingPart'
import type { ManualMachiningOperation, HoleArrayCut } from './types'
import { faceAxes } from './snapMath'

export interface MachiningFinding {
  reference: string
  code:
    | 'drilling-parameters'
    | 'drilling-entry'
    | 'drilling-bounds'
    | 'drilling-unassessed'
    | 'manual-review'
  message: string
  part: { id: string; label: string; cabinetId: string | null }
  operation: {
    id: string
    label: string
    kind: string
    sourceJointId?: string
    sourceComponentId?: string
  }
  instruction?: ManualMachiningOperation
}
const positive = (n: number) => Number.isFinite(n) && n > 0
const EPS = 1e-6 // mm, only accommodates arithmetic at a face or tangent boundary.

// Envelope checks deliberately use original part-local axes, not grain-ordered or banded sizes.
// First/last extrema cover a straight row without allocating count hole centres.
function holeProblem(
  p: Extract<ManufacturingPart, { kind: 'board' }>,
  h: HoleArrayCut,
): { code: MachiningFinding['code']; message: string } | null {
  if (
    !['+X', '-X', '+Y', '-Y', '+Z', '-Z'].includes(h.face) ||
    (h.axis !== 'U' && h.axis !== 'V') ||
    !Number.isSafeInteger(h.count) ||
    h.count < 1 ||
    !positive(h.diameter) ||
    !positive(h.depth) ||
    !Number.isFinite(h.pitch) ||
    (h.count > 1 && h.pitch === 0) ||
    ![h.start.x, h.start.y, h.start.z].every(Number.isFinite)
  )
    return {
      code: 'drilling-parameters',
      message:
        'Hole array requires a valid face and U/V axis, a positive safe integer count, finite start/pitch, positive finite diameter/depth and nonzero pitch for multiple holes.',
    }
  if (![p.local.length, p.local.width, p.local.thickness].every(positive))
    return {
      code: 'drilling-unassessed',
      message: 'Board envelope cannot be assessed because its dimensions are invalid.',
    }
  const dims = { x: p.local.length, y: p.local.width, z: p.local.thickness }
  const axes = faceAxes(h.face)
  const facePosition = h.face.startsWith('+') ? dims[axes.depth] : 0
  if (Math.abs(h.start[axes.depth] - facePosition) > EPS)
    return { code: 'drilling-entry', message: 'Hole array start is not on its named board face.' }
  const row = h.axis === 'U' ? axes.u : axes.v
  const last = h.start[row] + (h.count - 1) * h.pitch
  if (!Number.isFinite(last))
    return {
      code: 'drilling-parameters',
      message: 'Hole array endpoint overflows finite coordinates.',
    }
  const radius = h.diameter / 2
  for (const axis of [axes.u, axes.v]) {
    const end = axis === row ? last : h.start[axis]
    if (
      Math.min(h.start[axis], end) - radius < -EPS ||
      Math.max(h.start[axis], end) + radius > dims[axis] + EPS
    )
      return {
        code: 'drilling-bounds',
        message: 'A hole footprint crosses the rectangular finished-board boundary.',
      }
  }
  // Any positive depth may be through drilling; the kernel clips the bore to the board.
  return null
}

export function manufacturingMachining(records: ManufacturingPart[]) {
  const findings: MachiningFinding[] = []
  let boardHoleArrays = 0,
    roundBores = 0,
    manualOperations = 0
  const add = (
    p: ManufacturingPart,
    operation: MachiningFinding['operation'],
    code: MachiningFinding['code'],
    message: string,
    instruction?: ManualMachiningOperation,
  ) => {
    findings.push({
      reference: `D${findings.length + 1}`,
      code,
      message,
      part: { id: p.id, label: p.label, cabinetId: p.provenance.cabinetId },
      operation: {
        id: operation.id,
        label: operation.label,
        kind: operation.kind,
        ...(operation.sourceJointId ? { sourceJointId: operation.sourceJointId } : {}),
        ...(operation.sourceComponentId ? { sourceComponentId: operation.sourceComponentId } : {}),
      },
      ...(instruction ? { instruction: structuredClone(instruction) } : {}),
    })
  }
  for (const p of records) {
    if (p.kind === 'board') {
      for (const h of p.cuts) {
        if (h.kind !== 'hole-array') continue
        boardHoleArrays++
        const problem = holeProblem(p, h)
        if (problem) add(p, h, problem.code, problem.message)
      }
    } else
      for (const bore of p.cuts) {
        if (bore.kind !== 'bore-axial' && bore.kind !== 'bore-transverse') continue
        roundBores++
        add(
          p,
          bore,
          'drilling-unassessed',
          'Round-stock bore geometry is not assessed by the board envelope checks.',
        )
      }
    for (const op of p.operations) {
      manualOperations++
      add(
        p,
        op,
        'manual-review',
        'Manual machining instruction requires setup review; machine compatibility is unassessed.',
        op,
      )
    }
  }
  return {
    schemaVersion: 1 as const,
    boardHoleArrays,
    roundBores,
    manualOperations,
    findings,
    scope:
      'Hole-array parameters, named entry face and rectangular finished-board footprint. Positive depths may be through holes. Includes hidden parts; manual instructions remain separate from geometry.',
    unassessed: [
      'Machine operation compatibility',
      'Round-stock bore geometry',
      'Non-drilling cuts (boxes, mitres, round-stock trims and notches)',
      'Interactions with bands, mitres, notches and other cuts',
      'Hole overlap, machining sequence and tool access',
      'Manual instruction geometry',
      'Hardware suitability and physical installation',
    ],
  }
}
