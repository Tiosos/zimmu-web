import { test, expect } from 'vitest'
import type { BoardPart, CylinderPart, HoleArrayCut, Part, ScrewJoint, Vec3 } from '../scene/types'
import { deriveScrewJoint } from './screw'
import type { DeriveResult } from './dado'
import { deriveJoint } from './dado'
import { defaultScrewJoint, MAX_SCREW_SPACING } from '../scene/defaultJoint'
import { faceAxes } from '../scene/snapMath'
import { applyMatrixToPoint, resolveWorldMatrix } from './transform'
import { componentsById } from '../scene/componentTree'

const NO_COMPONENTS = componentsById([])

// Through panel: flat board, +Z face up (the plane z = 25), at the origin, unrotated.
const through: BoardPart = {
  kind: 'board',
  id: 'T',
  label: 'Side',
  length: 200,
  width: 100,
  thickness: 25,
  grain: 'free',
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

// Receiving panel: standing on the through panel via Ry=90, so its local +X end points to world
// -Z and lands exactly on z = 25. Local +Y (width) → world +Y; local +Z (thickness) → world +X,
// spanning x ∈ [50, 68], so the joint line sits at x = 59.
const receiving: BoardPart = {
  ...through,
  id: 'R',
  label: 'Bottom',
  length: 120,
  width: 100,
  thickness: 18,
  position: { x: 50, y: 0, z: 145 },
  rotation: { x: 0, y: 90, z: 0 },
}

const parts: Part[] = [through, receiving]

const joint = defaultScrewJoint(through, receiving, '+Z', '+X', 'j1', 'Screw fixing 1')

function derived(j: ScrewJoint, ps: Part[] = parts): DeriveResult {
  const res = deriveScrewJoint(j, ps, NO_COMPONENTS)
  if (res === null) throw new Error('expected a derive result')
  return res
}

function holeArrayOn(res: DeriveResult, partId: string): HoleArrayCut {
  const cut = res.cuts.find((c) => c.partId === partId)?.cut
  if (cut?.kind !== 'hole-array') throw new Error(`no hole array on ${partId}`)
  return cut
}

// The panel's extent along the axis a bore into `face` travels — what "through" and "blind" are
// measured against, and what the shop drawing compares a bore's depth to.
function drillExtent(p: BoardPart, cut: HoleArrayCut): number {
  return { x: p.length, y: p.width, z: p.thickness }[faceAxes(cut.face).depth]
}

function holeCentresInWorld(p: BoardPart, cut: HoleArrayCut): [number, number, number][] {
  const axes = faceAxes(cut.face)
  const step = cut.axis === 'U' ? axes.u : axes.v
  const m = resolveWorldMatrix(p, NO_COMPONENTS)
  return Array.from({ length: cut.count }, (_, i) => {
    const centre: Vec3 = { ...cut.start }
    centre[step] += cut.pitch * i
    return applyMatrixToPoint(m, centre.x, centre.y, centre.z)
  })
}

test('the two rows land on different parts — clearance through one, pilots into the other', () => {
  const res = derived(joint)
  expect(res.cuts.map((c) => c.partId).sort()).toEqual(['R', 'T'])
  expect(holeArrayOn(res, 'T').diameter).toBe(joint.clearanceDiameter)
  expect(holeArrayOn(res, 'T').face).toBe('+Z')
  expect(holeArrayOn(res, 'R').diameter).toBe(joint.pilotDiameter)
  expect(holeArrayOn(res, 'R').face).toBe('+X')
})

test('the clearance bore passes fully through the panel it enters', () => {
  const clearance = holeArrayOn(derived(joint), 'T')
  expect(clearance.depth).toBeGreaterThanOrEqual(drillExtent(through, clearance))
})

test('the pilot is blind — a screw through the far face is a defect, not a hole', () => {
  const pilot = holeArrayOn(derived(joint), 'R')
  expect(pilot.depth).toBeLessThan(drillExtent(receiving, pilot))
})

test('a pilot deeper than the panel is clamped back inside it', () => {
  const pilot = holeArrayOn(derived({ ...joint, pilotDepth: 10_000 }), 'R')
  expect(pilot.depth).toBeLessThan(drillExtent(receiving, pilot))
})

test('both rows carry the same count, and the joint id that owns them', () => {
  const res = derived(joint)
  const clearance = holeArrayOn(res, 'T')
  const pilot = holeArrayOn(res, 'R')
  expect(clearance.count).toBe(joint.screwCount)
  expect(pilot.count).toBe(joint.screwCount)
  expect(clearance.sourceJointId).toBe('j1')
  expect(pilot.sourceJointId).toBe('j1')
})

test('a short joint line takes the two end screws and nothing between them', () => {
  // 100 mm of joint line, inset 30 at each end: 40 mm apart, well inside the maximum spacing.
  expect(joint.screwCount).toBe(2)
  expect(holeArrayOn(derived(joint), 'R').pitch).toBeCloseTo(100 - 2 * joint.endInset)
})

test('a long joint line takes intermediates until no gap exceeds the maximum spacing', () => {
  const long: BoardPart = { ...receiving, width: 900 }
  const j = defaultScrewJoint(through, long, '+Z', '+X', 'j2', 'Screw fixing 2')
  const run = long.width - 2 * j.endInset
  expect(j.screwCount).toBe(Math.ceil(run / MAX_SCREW_SPACING) + 1)
  const pilot = holeArrayOn(derived(j, [through, long]), 'R')
  expect(pilot.pitch).toBeCloseTo(run / (j.screwCount - 1))
  expect(pilot.pitch).toBeLessThanOrEqual(MAX_SCREW_SPACING)
})

function expectCentres(actual: [number, number, number][], expected: number[][]): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((centre, i) => centre.forEach((n, k) => expect(n).toBeCloseTo(expected[i][k], 6)))
}

test('the two rows bore the same points in space', () => {
  const res = derived(joint)
  // The panels butt, so a clearance hole and its pilot meet on the contact plane: same world point.
  expectCentres(holeCentresInWorld(through, holeArrayOn(res, 'T')), [
    [59, 30, 25],
    [59, 70, 25],
  ])
  expectCentres(holeCentresInWorld(receiving, holeArrayOn(res, 'R')), [
    [59, 30, 25],
    [59, 70, 25],
  ])
})

test('a row still bores those points when the through panel faces the other way', () => {
  // Same box in world, turned 180° about Z, so its own +Y runs against the joint line. A row only
  // ever marches its axis upwards, so this one has to start from the far screw.
  const turned: BoardPart = {
    ...through,
    position: { x: 200, y: 100, z: 0 },
    rotation: { x: 0, y: 0, z: 180 },
  }
  const res = derived(joint, [turned, receiving])
  expectCentres(holeCentresInWorld(turned, holeArrayOn(res, 'T')), [
    [59, 70, 25],
    [59, 30, 25],
  ])
})

test('screwing does not seat either panel', () => {
  expect(derived(joint).seat).toBeUndefined()
})

test('deriveJoint routes a screw joint to its own derivation', () => {
  const res = deriveJoint(joint, parts, NO_COMPONENTS)
  expect(res?.cuts).toHaveLength(2)
})

test('a joint whose part is gone is stale', () => {
  expect(deriveScrewJoint(joint, [through], NO_COMPONENTS)).toBeNull()
})

test('a joint on a part that is not a board is stale', () => {
  const dowel: CylinderPart = {
    kind: 'cylinder',
    id: 'R',
    label: 'Dowel',
    diameter: 8,
    length: 120,
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
  expect(deriveScrewJoint(joint, [through, dowel], NO_COMPONENTS)).toBeNull()
})

test('a receiving face that is the panel itself, not an end, is stale', () => {
  expect(deriveScrewJoint({ ...joint, receivingEnd: '-Z' }, parts, NO_COMPONENTS)).toBeNull()
})
