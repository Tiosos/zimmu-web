import { test, expect } from 'vitest'
import type { BoardPart, DadoJoint, Scene } from './types'
import { reconcileJoints } from './reconcileJoints'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'
import { computeLocalFaceCenter } from './snapMath'

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
}
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
}
const joint: DadoJoint = {
  kind: 'dado',
  id: 'j1',
  label: 'Dado 1',
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
const scene = (): Scene => ({
  parts: [structuredClone(housing), structuredClone(housed)],
  materials: {},
  hardware: [],
  joints: [structuredClone(joint)],
})

test('valid joint materializes a groove on the housing and seats the housed board', () => {
  const out = reconcileJoints(scene())
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  const D = out.parts.find((p) => p.id === 'D') as BoardPart
  expect(H.cuts).toHaveLength(1)
  expect(H.cuts[0].kind === 'box' && H.cuts[0].sourceJointId).toBe('j1')
  // Housed board is seated: its +X end center lands on the groove-bottom plane (z=17).
  const endLocal = computeLocalFaceCenter({ x: 1, y: 0, z: 0 }, D)
  const [, , wz] = applyMatrixToPoint(composeWorldMatrix(D), endLocal.x, endLocal.y, endLocal.z)
  expect(wz).toBeCloseTo(25 - 8, 6)
})

test('reconcile is idempotent', () => {
  const once = reconcileJoints(scene())
  const twice = reconcileJoints(once)
  expect(JSON.stringify(twice.parts)).toBe(JSON.stringify(once.parts))
})

test('orphaned derived cuts (no matching joint) are stripped', () => {
  const s = scene()
  ;(s.parts[0] as BoardPart).cuts = [
    {
      kind: 'box',
      id: 'cut_ghost',
      label: 'Ghost',
      face: '+Z',
      position: { x: 0, y: 0, z: 20 },
      size: { x: 5, y: 5, z: 5 },
      sourceJointId: 'gone',
    },
  ]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  expect(H.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'gone')).toBe(false)
})

test('a stale (off-axis) joint keeps its last-good derived cut', () => {
  const s = reconcileJoints(scene()) // materialize the groove first
  const staleScene: Scene = {
    ...s,
    parts: s.parts.map((p) =>
      p.id === 'D' ? { ...(p as BoardPart), rotation: { x: 0, y: 30, z: 0 } } : p,
    ),
  }
  const out = reconcileJoints(staleScene)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  expect(H.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(true)
})

test('non-derived (user) cuts pass through untouched alongside the groove', () => {
  const s = scene()
  ;(s.parts[0] as BoardPart).cuts = [
    {
      kind: 'box',
      id: 'c_user',
      label: 'User',
      face: '-Z',
      position: { x: 10, y: 10, z: 0 },
      size: { x: 10, y: 10, z: 5 },
    },
  ]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  expect(H.cuts.some((c) => c.id === 'c_user')).toBe(true)
  expect(H.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(true)
})

test('rabbeted joint materializes a groove on the housing AND a rabbet on the housed board', () => {
  const s = scene()
  s.joints = [
    { ...(s.joints[0] as DadoJoint), profile: 'rabbeted', tongueThickness: 8, rabbetFace: '+Z' },
  ]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  const D = out.parts.find((p) => p.id === 'D') as BoardPart
  expect(H.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toHaveLength(1)
  expect(D.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toHaveLength(1)
})

test('flipping rabbeted → plain removes the housed rabbet cut', () => {
  const s = scene()
  s.joints = [
    { ...(s.joints[0] as DadoJoint), profile: 'rabbeted', tongueThickness: 8, rabbetFace: '+Z' },
  ]
  const rab = reconcileJoints(s)
  const plain = reconcileJoints({
    ...rab,
    joints: [{ ...(rab.joints[0] as DadoJoint), profile: 'plain' }],
  })
  const D = plain.parts.find((p) => p.id === 'D') as BoardPart
  expect(D.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(false)
})

test('stopped joint materializes a groove on the housing AND a notch on the housed board', () => {
  const s = scene()
  s.joints = [{ ...(s.joints[0] as DadoJoint), stopStart: 10 }]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  const D = out.parts.find((p) => p.id === 'D') as BoardPart
  expect(H.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toHaveLength(1)
  const notch = D.cuts.find((c) => c.kind === 'box' && c.sourceJointId === 'j1')
  expect(notch && notch.id).toBe('cut_j1_notch0')
})

test('zeroing the stop removes the housed notch cut', () => {
  const s = scene()
  s.joints = [{ ...(s.joints[0] as DadoJoint), stopStart: 10 }]
  const stopped = reconcileJoints(s)
  const through = reconcileJoints({
    ...stopped,
    joints: [{ ...(stopped.joints[0] as DadoJoint), stopStart: 0 }],
  })
  const D = through.parts.find((p) => p.id === 'D') as BoardPart
  expect(D.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(false)
})

test('half-lap joint materializes one lap cut on each board; removal strips both; no reposition', () => {
  const la: BoardPart = {
    kind: 'board',
    id: 'LA',
    label: 'LA',
    length: 200,
    width: 40,
    thickness: 20,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
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
    partAId: 'LA',
    partBId: 'LB',
    split: 0.5,
    clearance: 0,
  }
  const s: Scene = {
    parts: [structuredClone(la), structuredClone(lb)],
    materials: {},
    hardware: [],
    joints: [lap],
  }
  const out = reconcileJoints(s)
  const A = out.parts.find((p) => p.id === 'LA') as BoardPart
  const B = out.parts.find((p) => p.id === 'LB') as BoardPart
  expect(A.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'jl')).toHaveLength(1)
  expect(B.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'jl')).toHaveLength(1)
  expect(A.position).toEqual({ x: 0, y: 0, z: 0 }) // seatless — not repositioned
  expect(B.position).toEqual({ x: 80, y: -80, z: 0 })
  const removed = reconcileJoints({ ...out, joints: [] })
  const A2 = removed.parts.find((p) => p.id === 'LA') as BoardPart
  const B2 = removed.parts.find((p) => p.id === 'LB') as BoardPart
  expect(A2.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'jl')).toBe(false)
  expect(B2.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'jl')).toBe(false)
})
