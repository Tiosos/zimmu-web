import { describe, it, expect } from 'vitest'
import {
  computeEndTool,
  dowelSurfaceFromNormal,
  azimuthFromHit,
  computeAxialBoreTool,
  computeTransverseBoreTool,
} from './dowelCut'
import type { DowelEndCut, DowelBoreAxial, DowelBoreTransverse } from '../scene/types'

const dowel = { diameter: 8, length: 100 }
const RAD = Math.PI / 180

function endCut(over: Partial<DowelEndCut> = {}): DowelEndCut {
  return {
    kind: 'end',
    id: 'c1',
    label: 'End 1',
    end: '+Z',
    offset: 0,
    angle: 45,
    azimuth: 0,
    ...over,
  }
}

describe('computeEndTool', () => {
  it('+Z end: pivot and box sit at the top cap, square axis perpendicular to azimuth', () => {
    const t = computeEndTool(dowel, endCut({ end: '+Z', offset: 0, angle: 45, azimuth: 0 }))
    expect(t.pivot.z).toBeCloseTo(100)
    expect(t.boxOrigin.z).toBeCloseTo(100)
    // azimuth 0 ⇒ tilt faces +X ⇒ rotation axis is +Y
    expect(t.axisDir.x).toBeCloseTo(0)
    expect(t.axisDir.y).toBeCloseTo(1)
    expect(t.axisDir.z).toBeCloseTo(0)
    expect(t.angleRad).toBeCloseTo(45 * RAD)
  })

  it('offset moves the cut plane inward from the chosen end', () => {
    const t = computeEndTool(dowel, endCut({ end: '+Z', offset: 20, angle: 0 }))
    expect(t.pivot.z).toBeCloseTo(80)
  })

  it('-Z end flips the rotation sign and box direction', () => {
    const t = computeEndTool(dowel, endCut({ end: '-Z', offset: 10, angle: 45, azimuth: 0 }))
    expect(t.pivot.z).toBeCloseTo(10)
    expect(t.angleRad).toBeCloseTo(-45 * RAD)
    expect(t.boxOrigin.z).toBeLessThan(10) // box extends toward -Z
  })

  it('azimuth rotates the tilt axis in the XY plane', () => {
    const t = computeEndTool(dowel, endCut({ azimuth: 90 }))
    // azimuth 90 ⇒ tilt faces +Y ⇒ rotation axis is -X
    expect(t.axisDir.x).toBeCloseTo(-1)
    expect(t.axisDir.y).toBeCloseTo(0)
  })
})

describe('dowelSurfaceFromNormal', () => {
  it('classifies caps by the dominant Z component', () => {
    expect(dowelSurfaceFromNormal({ x: 0, y: 0, z: 1 })).toBe('cap+')
    expect(dowelSurfaceFromNormal({ x: 0, y: 0, z: -1 })).toBe('cap-')
  })
  it('classifies the lateral surface by a dominant radial component', () => {
    expect(dowelSurfaceFromNormal({ x: 1, y: 0, z: 0 })).toBe('lateral')
    expect(dowelSurfaceFromNormal({ x: 0.7, y: 0.7, z: 0.1 })).toBe('lateral')
  })
})

describe('azimuthFromHit', () => {
  it('returns degrees measured from +X', () => {
    expect(azimuthFromHit({ x: 4, y: 0, z: 50 })).toBeCloseTo(0)
    expect(azimuthFromHit({ x: 0, y: 4, z: 50 })).toBeCloseTo(90)
  })
})

describe('computeAxialBoreTool', () => {
  const base: DowelBoreAxial = {
    kind: 'bore-axial',
    id: 'c',
    label: 'Bore',
    end: '+Z',
    diameter: 3,
    depth: 20,
  }
  it('+Z drills downward along -Z, radius = diameter/2, on the axis', () => {
    const t = computeAxialBoreTool(dowel, base)
    expect(t.radius).toBeCloseTo(1.5)
    expect(t.dir).toMatchObject({ x: 0, y: 0, z: -1 })
    expect(t.basePoint.x).toBeCloseTo(0)
    expect(t.basePoint.y).toBeCloseTo(0)
  })
  it('through hole (depth ≥ length) makes the tool at least as long as the dowel', () => {
    const t = computeAxialBoreTool(dowel, { ...base, depth: 100 })
    expect(t.height).toBeGreaterThanOrEqual(dowel.length)
  })
  it('-Z drills upward along +Z', () => {
    const t = computeAxialBoreTool(dowel, { ...base, end: '-Z' })
    expect(t.dir).toMatchObject({ x: 0, y: 0, z: 1 })
  })
})

describe('computeTransverseBoreTool', () => {
  const base: DowelBoreTransverse = {
    kind: 'bore-transverse',
    id: 'c',
    label: 'Bore',
    position: 50,
    azimuth: 0,
    diameter: 3,
    depth: 8,
  }
  it('enters radially inward from the azimuth side at the given height', () => {
    const t = computeTransverseBoreTool(dowel, base)
    expect(t.basePoint.z).toBeCloseTo(50)
    expect(t.basePoint.x).toBeGreaterThan(dowel.diameter / 2) // outside the surface
    expect(t.dir).toMatchObject({ x: -1, y: 0, z: 0 })
  })
  it('through hole (depth ≥ diameter) spans the full diameter', () => {
    const t = computeTransverseBoreTool(dowel, { ...base, depth: 8 })
    expect(t.height).toBeGreaterThanOrEqual(dowel.diameter)
  })
})
