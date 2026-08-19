import { test, expect } from 'vitest'
import type { BoardPart, DadoJoint, Joint, Part } from '../scene/types'
import {
  isValidDadoSeat,
  deriveDadoAxes,
  computeDadoGroove,
  computeDadoSeat,
  defaultDadoDepth,
  computeRabbet,
  computeNotch,
  deriveJoint,
} from './dado'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'
import { computeLocalFaceCenter } from '../scene/snapMath'
import { componentsById } from '../scene/componentTree'

const NO_COMPONENTS = componentsById([])

// Housing: flat board, +Z face up, at the origin, unrotated.
const housing: BoardPart = {
  kind: 'board',
  id: 'H',
  label: 'Housing',
  length: 200,
  width: 100,
  thickness: 25,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
}
// Housed: standing vertically via Ry=90 so its local +X end points to world -Z
// (opposes housing +Z → valid seat). Local +Z (thickness) → world +X.
const housed: BoardPart = {
  kind: 'board',
  id: 'D',
  label: 'Housed',
  length: 120,
  width: 100,
  thickness: 18,
  material: '',
  color: '#fff',
  position: { x: 50, y: 0, z: 30 },
  rotation: { x: 0, y: 90, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
}
const joint: DadoJoint = {
  kind: 'dado',
  id: 'j1',
  label: 'Dado 1',
  driven: false,
  housingPartId: 'H',
  housingFace: '+Z',
  housedPartId: 'D',
  housedEnd: '+X',
  offset: 50,
  depth: 8,
  clearance: 0,
  profile: 'plain',
  tongueThickness: 8,
  rabbetFace: '+Z',
  stopStart: 0,
  stopEnd: 0,
}

test('isValidDadoSeat: perpendicular end opposing the face is valid', () => {
  expect(isValidDadoSeat(housing, '+Z', housed, '+X')).toBe(true)
})

test('isValidDadoSeat: a non-opposing end is invalid', () => {
  const flat: BoardPart = { ...housed, rotation: { x: 0, y: 0, z: 0 } }
  expect(isValidDadoSeat(housing, '+Z', flat, '+X')).toBe(false)
})

test('deriveDadoAxes: narrow axis follows the housed thickness direction', () => {
  // housed thickness (local Z) → world +X → housing u ('x' for +Z face).
  expect(deriveDadoAxes(housing, housed, '+Z')).toEqual({ narrowAx: 'x', runAx: 'y' })
})

test('computeDadoGroove: full-width channel, thickness-wide, depth-deep from the face', () => {
  const cut = computeDadoGroove(housing, housed, joint)
  expect(cut.kind).toBe('box')
  expect(cut.sourceJointId).toBe('j1')
  expect(cut.face).toBe('+Z')
  expect(cut.size).toEqual({ x: 18, y: 100, z: 8 }) // thk+clr, full width, depth
  expect(cut.position).toEqual({ x: 50 - 9, y: 0, z: 25 - 8 }) // centered at offset, flush at +Z
})

test('computeDadoGroove: depth clamps below the housing thickness', () => {
  const deep = computeDadoGroove(housing, housed, { ...joint, depth: 999 })
  expect(deep.size.z).toBe(24) // thickness - 1
})

test('computeDadoGroove: stopStart insets the run-axis start; length shrinks', () => {
  const cut = computeDadoGroove(housing, housed, { ...joint, stopStart: 10 })
  expect(cut.position.y).toBe(10)
  expect(cut.size.y).toBe(90) // 100 − 10
  expect(cut.size.x).toBe(18) // narrow width unchanged
  expect(cut.position.z).toBe(17) // depth flush unchanged
})

test('computeDadoGroove: both stops inset both ends', () => {
  const cut = computeDadoGroove(housing, housed, { ...joint, stopStart: 10, stopEnd: 15 })
  expect(cut.position.y).toBe(10)
  expect(cut.size.y).toBe(75) // 100 − 10 − 15
})

test('computeDadoGroove: combined stops clamp to leave ≥ 1 mm of groove', () => {
  const cut = computeDadoGroove(housing, housed, { ...joint, stopStart: 200, stopEnd: 200 })
  expect(cut.position.y).toBe(99) // ss clamped to dim − 1
  expect(cut.size.y).toBe(1) // never below 1 mm
})

test('defaultDadoDepth: ~thickness/3, clamped', () => {
  expect(defaultDadoDepth(housing, '+Z')).toBe(8) // round(25/3)=8
})

test('computeDadoSeat: housed end lands on the groove bottom, centered on offset', () => {
  const seat = computeDadoSeat(housing, housed, joint)
  const seated: BoardPart = { ...housed, position: seat.position }
  const endLocal = computeLocalFaceCenter({ x: 1, y: 0, z: 0 }, seated) // +X end center
  const [wx, , wz] = applyMatrixToPoint(
    composeWorldMatrix(seated),
    endLocal.x,
    endLocal.y,
    endLocal.z,
  )
  expect(wz).toBeCloseTo(25 - 8, 6) // groove bottom plane
  expect(wx).toBeCloseTo(50, 6) // groove center = offset
})

test('computeDadoSeat is idempotent (re-seating a seated board is a no-op)', () => {
  const once = computeDadoSeat(housing, housed, joint)
  const twice = computeDadoSeat(housing, { ...housed, position: once.position }, joint)
  expect(twice.position.x).toBeCloseTo(once.position.x, 6)
  expect(twice.position.y).toBeCloseTo(once.position.y, 6)
  expect(twice.position.z).toBeCloseTo(once.position.z, 6)
})

const rabbeted = {
  ...joint,
  profile: 'rabbeted' as const,
  tongueThickness: 8,
  rabbetFace: '+Z' as const,
}

test('computeDadoGroove: rabbeted groove width = tongueThickness (+clearance), narrower than plain', () => {
  expect(computeDadoGroove(housing, housed, rabbeted).size.x).toBe(8) // vs 18 for plain
})

test('computeRabbet: removes T−t from the +Z face over the last `depth` mm, full width', () => {
  const cut = computeRabbet(housing, housed, rabbeted)
  expect(cut.id.endsWith('_rabbet')).toBe(true)
  expect(cut.sourceJointId).toBe('j1')
  expect(cut.face).toBe('+Z')
  expect(cut.size).toEqual({ x: 8, y: 100, z: 10 }) // len=depth, full width, T−t=18−8
  expect(cut.position).toEqual({ x: 120 - 8, y: 0, z: 8 }) // flush at +X end, remove z∈[8,18]
})

test('computeRabbet: rabbetFace −Z removes the low face instead', () => {
  const cut = computeRabbet(housing, housed, { ...rabbeted, rabbetFace: '-Z' })
  expect(cut.position.z).toBe(0)
  expect(cut.size.z).toBe(10) // removes z∈[0,10], tongue at z∈[10,18]
})

test('computeNotch: start-end corner box — depth deep into the end, stop wide, full thickness', () => {
  const cut = computeNotch(housing, housed, { ...joint, stopStart: 10 }, 'start')
  expect(cut.size).toEqual({ x: 8, y: 10, z: 18 }) // d=depth, stop, full thickness
  expect(cut.position).toEqual({ x: 112, y: 0, z: 0 }) // flush at +X end, low width end
  expect(cut.id).toBe('cut_j1_notch0')
  expect(cut.label).toBe('Dado 1 notch')
  expect(cut.face).toBe('+X')
  expect(cut.sourceJointId).toBe('j1')
})

test('computeNotch: end-end corner box sits at the far width end', () => {
  const cut = computeNotch(housing, housed, { ...joint, stopEnd: 15 }, 'end')
  expect(cut.size).toEqual({ x: 8, y: 15, z: 18 })
  expect(cut.position).toEqual({ x: 112, y: 85, z: 0 }) // width − stop = 100 − 15
  expect(cut.id).toBe('cut_j1_notch1')
})

test('computeNotch: stop width clamps below the housed width', () => {
  const cut = computeNotch(housing, housed, { ...joint, stopStart: 999 }, 'start')
  expect(cut.size.y).toBeCloseTo(100 - 0.1, 6)
})

test('computeNotch: when the housed width axis opposes the housing run axis, the start notch flips to the far width end', () => {
  const flipped = { ...housed, rotation: { x: 180, y: 90, z: 0 } }
  const cut = computeNotch(housing, flipped, { ...joint, stopStart: 10 }, 'start')
  expect(cut.position.y).toBe(90) // width − stop = 100 − 10 (far end, because aligned is false)
  expect(cut.size).toEqual({ x: 8, y: 10, z: 18 })
})

test('computeDadoSeat: rabbeted centers the tongue (not the board) on the groove; seating depth unchanged', () => {
  const plainSeat = computeDadoSeat(housing, housed, { ...joint, profile: 'plain' })
  const rabSeat = computeDadoSeat(housing, housed, rabbeted)
  // narrow axis is world X here; shift = (T−t)/2 = (18−8)/2 = 5
  expect(Math.abs(rabSeat.position.x - plainSeat.position.x)).toBeCloseTo(5, 6)
  // face-normal (world Z) and run (world Y) components unchanged
  expect(rabSeat.position.z).toBeCloseTo(plainSeat.position.z, 6)
  expect(rabSeat.position.y).toBeCloseTo(plainSeat.position.y, 6)
})

test('computeDadoSeat: rabbeted with a thickness-end housedEnd falls back to plain (no tongue shift)', () => {
  const thicknessEnd = { ...rabbeted, housedEnd: '+Z' as const }
  const plainEnd = { ...joint, profile: 'plain' as const, housedEnd: '+Z' as const }
  const rab = computeDadoSeat(housing, housed, thicknessEnd)
  const plain = computeDadoSeat(housing, housed, plainEnd)
  expect(rab.position.x).toBeCloseTo(plain.position.x, 6)
  expect(rab.position.y).toBeCloseTo(plain.position.y, 6)
  expect(rab.position.z).toBeCloseTo(plain.position.z, 6)
})

const parts: Part[] = [housing, housed]

test('deriveJoint: plain returns one groove cut on the housing + a seat', () => {
  const r = deriveJoint({ ...joint, profile: 'plain' }, parts, NO_COMPONENTS)
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(1)
  expect(r!.cuts[0].partId).toBe('H')
  expect(r!.seat!.partId).toBe('D')
})

test('deriveJoint: rabbeted returns groove (housing) + rabbet (housed)', () => {
  const r = deriveJoint(rabbeted, parts, NO_COMPONENTS)
  expect(r!.cuts).toHaveLength(2)
  expect(r!.cuts.map((c) => c.partId).sort()).toEqual(['D', 'H'])
  expect(r!.cuts.find((c) => c.partId === 'D')!.cut.id.endsWith('_rabbet')).toBe(true)
})

test('deriveJoint: invalid seat returns null (stale)', () => {
  const flat = { ...housed, rotation: { x: 0, y: 0, z: 0 } }
  expect(deriveJoint(rabbeted, [housing, flat], NO_COMPONENTS)).toBeNull()
})

test('deriveJoint dispatches half-laps to the half-lap deriver (no seat)', () => {
  const la: BoardPart = {
    ...housing,
    id: 'LA',
    length: 200,
    width: 40,
    thickness: 20,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }
  const lb: BoardPart = {
    ...la,
    id: 'LB',
    length: 40,
    width: 200,
    position: { x: 80, y: -80, z: 0 },
  }
  const lap = {
    kind: 'halflap' as const,
    id: 'jl',
    label: 'Half-lap 1',
    driven: false,
    partAId: 'LA',
    partBId: 'LB',
    split: 0.5,
    clearance: 0,
  }
  const r = deriveJoint(lap, [la, lb], NO_COMPONENTS)
  expect(r).not.toBeNull()
  expect(r!.seat).toBeUndefined()
  expect(r!.cuts.map((c) => c.partId).sort()).toEqual(['LA', 'LB'])
})

test('deriveJoint dispatches a mortise-tenon to the M&T deriver', () => {
  const m: BoardPart = {
    ...housing,
    id: 'MM',
    length: 200,
    width: 100,
    thickness: 40,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }
  const t: BoardPart = {
    ...housing,
    id: 'TT',
    length: 120,
    width: 60,
    thickness: 30,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 90, z: 0 },
  }
  const mt = {
    kind: 'mortise-tenon' as const,
    id: 'jm',
    label: 'Mortise & tenon 1',
    driven: false,
    mortisePartId: 'MM',
    mortiseFace: '+Z' as const,
    tenonPartId: 'TT',
    tenonEnd: '+X' as const,
    tenonLength: 27,
    tenonThickness: 10,
    tenonWidth: 40,
    clearance: 0,
    through: false,
    offsetU: 100,
    offsetV: 50,
  }
  const r = deriveJoint(mt, [m, t], NO_COMPONENTS)
  expect(r).not.toBeNull()
  expect(r!.seat!.partId).toBe('TT')
  expect(r!.cuts).toHaveLength(5)
})

test('deriveJoint dispatches a finger joint to the finger deriver', () => {
  const a: BoardPart = {
    ...housing,
    id: 'FA',
    length: 200,
    width: 80,
    thickness: 18,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }
  const b: BoardPart = {
    ...housing,
    id: 'FB',
    length: 200,
    width: 80,
    thickness: 18,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 90, z: 0 },
  }
  const fj = {
    kind: 'finger' as const,
    id: 'jf',
    label: 'Finger joint 1',
    driven: false,
    partAId: 'FA',
    endA: '+X' as const,
    partBId: 'FB',
    endB: '+X' as const,
    fingerCount: 4,
    clearance: 0,
  }
  const r = deriveJoint(fj, [a, b], NO_COMPONENTS)
  expect(r).not.toBeNull()
  expect(r!.seat!.partId).toBe('FB')
  expect(r!.cuts).toHaveLength(4)
})

test('computeDadoGroove: rabbeted with a thickness-end housedEnd keeps the full-thickness groove (no tongue → no narrowing)', () => {
  const thicknessEnd = { ...rabbeted, housedEnd: '+Z' as const }
  // hasTongue is false (housedEnd depth axis is 'z'), so no narrowing.
  expect(computeDadoGroove(housing, housed, thicknessEnd).size.x).toBe(18)
})

test('computeDadoGroove: rabbeted groove width clamps tongueThickness to < housed thickness', () => {
  const wide = { ...rabbeted, tongueThickness: 999 }
  expect(computeDadoGroove(housing, housed, wide).size.x).toBeCloseTo(18 - 0.1, 6)
})

test('deriveJoint: rabbeted with a thickness-end housedEnd emits only the groove, full-width', () => {
  // A housed board seating a thickness face: unrotated, housedEnd '-Z' opposes the +Z housing face (valid seat), but the end is a thickness end.
  const flatHoused = { ...housed, rotation: { x: 0, y: 0, z: 0 } }
  const r = deriveJoint(
    { ...rabbeted, housedEnd: '-Z' as const },
    [housing, flatHoused],
    NO_COMPONENTS,
  )
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(1) // groove only, no rabbet
  expect(r!.cuts[0].partId).toBe('H')
})

test('deriveJoint: one stop → groove (housing) + one notch (housed)', () => {
  const r = deriveJoint({ ...joint, stopStart: 10 }, parts, NO_COMPONENTS)
  expect(r!.cuts).toHaveLength(2)
  expect(r!.cuts.map((c) => c.partId).sort()).toEqual(['D', 'H'])
  expect(r!.cuts.find((c) => c.partId === 'D')!.cut.id).toBe('cut_j1_notch0')
})

test('deriveJoint: both stops → groove + two notches', () => {
  const r = deriveJoint({ ...joint, stopStart: 10, stopEnd: 15 }, parts, NO_COMPONENTS)
  expect(r!.cuts).toHaveLength(3)
  const dCutIds = r!.cuts
    .filter((c) => c.partId === 'D')
    .map((c) => c.cut.id)
    .sort()
  expect(dCutIds).toEqual(['cut_j1_notch0', 'cut_j1_notch1'])
})

test('deriveJoint: stopped-rabbeted emits groove + rabbet + two notches (4 cuts)', () => {
  const r = deriveJoint({ ...rabbeted, stopStart: 10, stopEnd: 15 }, parts, NO_COMPONENTS)
  expect(r!.cuts).toHaveLength(4)
  const dCutIds = r!.cuts
    .filter((c) => c.partId === 'D')
    .map((c) => c.cut.id)
    .sort()
  expect(dCutIds).toEqual(['cut_j1_notch0', 'cut_j1_notch1', 'cut_j1_rabbet'])
})

test('deriveJoint: a thickness-seated housed end with a stop emits groove only (no notch)', () => {
  const flatHoused = { ...housed, rotation: { x: 0, y: 0, z: 0 } }
  const r = deriveJoint(
    { ...joint, housedEnd: '-Z' as const, stopStart: 10 },
    [housing, flatHoused],
    NO_COMPONENTS,
  )
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(1)
  expect(r!.cuts[0].partId).toBe('H')
})

test('deriveJoint dispatches tongue-groove to the tongue-groove deriver', () => {
  const g: BoardPart = {
    ...housing,
    id: 'TG',
    length: 800,
    width: 150,
    thickness: 18,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }
  const t: BoardPart = { ...g, id: 'TT', position: { x: 0, y: 160, z: 0 } }
  const tg: Joint = {
    kind: 'tongue-groove',
    id: 'jtg',
    label: 'Tongue & groove 1',
    driven: false,
    groovePartId: 'TG',
    grooveEdge: '+Y',
    tonguePartId: 'TT',
    tongueEdge: '-Y',
    tongueThickness: 6,
    tongueDepth: 8,
    clearance: 0,
  }
  const r = deriveJoint(tg, [g, t], NO_COMPONENTS)
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(3)
  expect(r!.seat!.partId).toBe('TT')
})
