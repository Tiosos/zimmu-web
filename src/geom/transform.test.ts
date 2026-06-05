import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'
import type { Part } from '../scene/types'

function part(overrides: Partial<Part> = {}): Part {
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
