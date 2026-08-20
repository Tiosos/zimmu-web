import { describe, it, test, expect } from 'vitest'
import * as THREE from 'three'
import {
  composeWorldMatrix,
  applyMatrixToPoint,
  applyInverseToPoint,
  multiplyMatrix,
  resolveWorldMatrix,
  localDirToWorld,
} from './transform'
import { componentsById } from '../scene/componentTree'
import type { BoardPart, Component, Part } from '../scene/types'

function part(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'p1',
    label: 'P',
    length: 100,
    width: 50,
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
    ...overrides,
  }
}

// Reference world matrix exactly as the viewport builds it:
// mesh.position + mesh.rotation.set(rx, ry, rz, 'XYZ'), degrees -> radians.
function threeMatrix(p: Part): number[] {
  const deg2rad = Math.PI / 180
  const e = new THREE.Euler(
    p.rotation.x * deg2rad,
    p.rotation.y * deg2rad,
    p.rotation.z * deg2rad,
    'XYZ',
  )
  const q = new THREE.Quaternion().setFromEuler(e)
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(p.position.x, p.position.y, p.position.z),
    q,
    new THREE.Vector3(1, 1, 1),
  )
  return Array.from(m.elements)
}

function expectMatrixClose(actual: Float64Array, expected: number[]) {
  for (let i = 0; i < 16; i++) expect(actual[i]).toBeCloseTo(expected[i], 9)
}

describe('composeWorldMatrix', () => {
  it('identity for zero position/rotation', () => {
    expectMatrixClose(composeWorldMatrix(part()), threeMatrix(part()))
  })

  it('pure translation', () => {
    const p = part({ position: { x: 12, y: -7, z: 3 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })

  it('rotation about X only', () => {
    const p = part({ rotation: { x: 90, y: 0, z: 0 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })

  it('rotation about Y only', () => {
    const p = part({ rotation: { x: 0, y: 90, z: 0 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })

  it('rotation about Z only', () => {
    const p = part({ rotation: { x: 0, y: 0, z: 90 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })

  it('combined rotation + translation', () => {
    const p = part({ position: { x: 5, y: 6, z: 7 }, rotation: { x: 30, y: 45, z: 60 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })
})

describe('applyMatrixToPoint', () => {
  it('matches THREE.Vector3.applyMatrix4 for a combined transform', () => {
    const p = part({ position: { x: 5, y: 6, z: 7 }, rotation: { x: 30, y: 45, z: 60 } })
    const m = composeWorldMatrix(p)
    const [x, y, z] = applyMatrixToPoint(m, 2, 3, 4)
    const v = new THREE.Vector3(2, 3, 4).applyMatrix4(new THREE.Matrix4().fromArray(Array.from(m)))
    expect(x).toBeCloseTo(v.x, 9)
    expect(y).toBeCloseTo(v.y, 9)
    expect(z).toBeCloseTo(v.z, 9)
  })
})

test('applyInverseToPoint undoes applyMatrixToPoint for a rotated, translated board', () => {
  const b: BoardPart = {
    kind: 'board',
    id: 'b',
    label: 'B',
    length: 100,
    width: 50,
    thickness: 20,
    material: '',
    color: '#fff',
    position: { x: 12, y: -7, z: 3 },
    rotation: { x: 10, y: 20, z: 30 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
  }
  const m = composeWorldMatrix(b)
  const [wx, wy, wz] = applyMatrixToPoint(m, 40, 15, 8)
  const [lx, ly, lz] = applyInverseToPoint(m, wx, wy, wz)
  expect(lx).toBeCloseTo(40, 6)
  expect(ly).toBeCloseTo(15, 6)
  expect(lz).toBeCloseTo(8, 6)
})

function comp(
  id: string,
  parentId: string | null,
  pos: [number, number, number],
  rot: [number, number, number],
): Component {
  return {
    id,
    kind: 'group',
    label: id,
    parentId,
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    rotationOrder: 'XYZ',
    visible: true,
  }
}

function treePart(
  parentId: string | null,
  pos: [number, number, number],
  rot: [number, number, number],
): BoardPart {
  return part({
    id: 'p',
    label: 'p',
    length: 10,
    width: 10,
    thickness: 10,
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    parentId,
  })
}

// Mirrors how the viewport nests objects: degrees -> radians, Euler XYZ.
function object3d(pos: [number, number, number], rot: [number, number, number]): THREE.Object3D {
  const deg2rad = Math.PI / 180
  const o = new THREE.Object3D()
  o.position.set(pos[0], pos[1], pos[2])
  o.rotation.set(rot[0] * deg2rad, rot[1] * deg2rad, rot[2] * deg2rad, 'XYZ')
  return o
}

describe('multiplyMatrix', () => {
  it('matches THREE.Matrix4.multiply element-wise', () => {
    const a = new THREE.Matrix4().makeRotationX(0.4).setPosition(1, 2, 3)
    const b = new THREE.Matrix4().makeRotationZ(-0.7).setPosition(-4, 5, 6)
    const expected = a.clone().multiply(b)

    const got = multiplyMatrix(Float64Array.from(a.elements), Float64Array.from(b.elements))

    for (let i = 0; i < 16; i++) {
      expect(got[i]).toBeCloseTo(expected.elements[i], 10)
    }
  })
})

describe('resolveWorldMatrix', () => {
  it('is identical to composeWorldMatrix for a top-level part', () => {
    const p = treePart(null, [11, -22, 33], [10, 20, 30])
    const got = resolveWorldMatrix(p, componentsById([]))
    const base = composeWorldMatrix(p)
    for (let i = 0; i < 16; i++) expect(got[i]).toBe(base[i])
  })

  it('matches a nested THREE.Object3D chain three deep', () => {
    const a = comp('a', null, [100, 0, 0], [0, 0, 45])
    const b = comp('b', 'a', [0, 50, 0], [30, 0, 0])
    const p = treePart('b', [5, 6, 7], [0, 15, 0])

    const oa = object3d([100, 0, 0], [0, 0, 45])
    const ob = object3d([0, 50, 0], [30, 0, 0])
    const op = object3d([5, 6, 7], [0, 15, 0])
    oa.add(ob)
    ob.add(op)
    oa.updateMatrixWorld(true)

    const got = resolveWorldMatrix(p, componentsById([a, b]))
    for (let i = 0; i < 16; i++) {
      expect(got[i]).toBeCloseTo(op.matrixWorld.elements[i], 9)
    }
  })

  it('resolves a component itself, not only a part', () => {
    const a = comp('a', null, [10, 0, 0], [0, 0, 0])
    const b = comp('b', 'a', [0, 20, 0], [0, 0, 0])
    const got = resolveWorldMatrix(b, componentsById([a, b]))
    expect(got[12]).toBeCloseTo(10, 10)
    expect(got[13]).toBeCloseTo(20, 10)
  })

  // Both levels rotate about all three axes and translate along distinct, asymmetric vectors, so
  // neither a transposed rotation block nor a swapped multiply order can pass by coincidence.
  it('matches a two-deep THREE.Object3D chain with full rotation and translation at both levels', () => {
    const a = comp('a', null, [31, -17, 53], [23, -41, 67])
    const p = treePart('a', [-13, 29, 7], [-52, 11, -38])

    const oa = object3d([31, -17, 53], [23, -41, 67])
    const op = object3d([-13, 29, 7], [-52, 11, -38])
    oa.add(op)
    oa.updateMatrixWorld(true)

    const got = resolveWorldMatrix(p, componentsById([a]))
    for (let i = 0; i < 16; i++) {
      expect(got[i]).toBeCloseTo(op.matrixWorld.elements[i], 9)
    }
  })
})

describe('localDirToWorld', () => {
  it('applies an ancestor component rotation to the direction', () => {
    const cab = comp('a', null, [0, 0, 0], [0, 0, 90])
    const p = treePart('a', [0, 0, 0], [0, 0, 0])
    // local +X under a 90 degree yaw becomes world +Y
    const got = localDirToWorld(p, { x: 1, y: 0, z: 0 }, componentsById([cab]))
    expect(got.x).toBeCloseTo(0, 9)
    expect(got.y).toBeCloseTo(1, 9)
  })

  it('is unchanged for a top-level part', () => {
    const p = treePart(null, [0, 0, 0], [0, 0, 90])
    const got = localDirToWorld(p, { x: 1, y: 0, z: 0 }, componentsById([]))
    expect(got.x).toBeCloseTo(0, 9)
    expect(got.y).toBeCloseTo(1, 9)
  })

  it('ignores ancestor translation — a direction has no position', () => {
    const cab = comp('a', null, [500, -300, 20], [0, 0, 0])
    const p = treePart('a', [0, 0, 0], [0, 0, 0])
    const got = localDirToWorld(p, { x: 0, y: 0, z: 1 }, componentsById([cab]))
    expect(got.x).toBeCloseTo(0, 9)
    expect(got.y).toBeCloseTo(0, 9)
    expect(got.z).toBeCloseTo(1, 9)
  })
})
