import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildBinaryStl } from './stl'
import type { BoardPart, PartId } from '../scene/types'
import { componentsById } from '../scene/componentTree'

const NO_COMPONENTS = componentsById([])

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

// One triangle in the XY plane, CCW so the facet normal is +Z.
function oneTriangleGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

describe('buildBinaryStl', () => {
  it('empty scene -> 84-byte buffer, count 0', () => {
    const buf = buildBinaryStl([], new Map(), NO_COMPONENTS)
    expect(buf.byteLength).toBe(84)
    expect(new DataView(buf).getUint32(80, true)).toBe(0)
  })

  it('one triangle -> count 1, correct size, facet normal +Z', () => {
    const geos = new Map<PartId, THREE.BufferGeometry>([['p1', oneTriangleGeo()]])
    const buf = buildBinaryStl([part()], geos, NO_COMPONENTS)
    expect(buf.byteLength).toBe(84 + 50)
    const dv = new DataView(buf)
    expect(dv.getUint32(80, true)).toBe(1)
    expect(dv.getFloat32(84, true)).toBeCloseTo(0, 5)
    expect(dv.getFloat32(88, true)).toBeCloseTo(0, 5)
    expect(dv.getFloat32(92, true)).toBeCloseTo(1, 5)
    expect(dv.getFloat32(96, true)).toBeCloseTo(0, 5)
    expect(dv.getFloat32(100, true)).toBeCloseTo(0, 5)
    expect(dv.getFloat32(104, true)).toBeCloseTo(0, 5)
  })

  it('applies the part world translation to vertices', () => {
    const geos = new Map<PartId, THREE.BufferGeometry>([['p1', oneTriangleGeo()]])
    const buf = buildBinaryStl([part({ position: { x: 10, y: 20, z: 30 } })], geos, NO_COMPONENTS)
    const dv = new DataView(buf)
    expect(dv.getFloat32(96, true)).toBeCloseTo(10, 4)
    expect(dv.getFloat32(100, true)).toBeCloseTo(20, 4)
    expect(dv.getFloat32(104, true)).toBeCloseTo(30, 4)
  })

  it('sums triangles across parts', () => {
    const geos = new Map<PartId, THREE.BufferGeometry>([
      ['p1', oneTriangleGeo()],
      ['p2', oneTriangleGeo()],
    ])
    const buf = buildBinaryStl([part(), part({ id: 'p2' })], geos, NO_COMPONENTS)
    expect(new DataView(buf).getUint32(80, true)).toBe(2)
  })

  it('skips a part with no geometry entry', () => {
    const geos = new Map<PartId, THREE.BufferGeometry>([['p1', oneTriangleGeo()]])
    const buf = buildBinaryStl([part(), part({ id: 'missing' })], geos, NO_COMPONENTS)
    expect(new DataView(buf).getUint32(80, true)).toBe(1)
  })
})
