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
  s.joints = [{ ...s.joints[0], profile: 'rabbeted', tongueThickness: 8, rabbetFace: '+Z' }]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  const D = out.parts.find((p) => p.id === 'D') as BoardPart
  expect(H.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toHaveLength(1)
  expect(D.cuts.filter((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toHaveLength(1)
})

test('flipping rabbeted → plain removes the housed rabbet cut', () => {
  const s = scene()
  s.joints = [{ ...s.joints[0], profile: 'rabbeted', tongueThickness: 8, rabbetFace: '+Z' }]
  const rab = reconcileJoints(s)
  const plain = reconcileJoints({ ...rab, joints: [{ ...rab.joints[0], profile: 'plain' }] })
  const D = plain.parts.find((p) => p.id === 'D') as BoardPart
  expect(D.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(false)
})
