import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { computeMitreTool, mitreFaceOutline } from './mitre'
import type { Point2D } from './mitre'
import type { MitreCut } from '../scene/types'

const board = { length: 200, width: 100, thickness: 25 }

function mitre(partial: Partial<MitreCut>): MitreCut {
  return { kind: 'mitre', id: 'm1', label: 'Mitre', end: '+X', axis: 'Z', angle: 45, ...partial }
}

// Where does the rotated cut plane cross the board at the far (short-point) edge?
// The plane passes through the pivot; its normal is the inner-face normal rotated
// by the tool's axis/angle. Solve n·(P − pivot) = 0 for x at the far edge.
function shortPointX(m: MitreCut): number {
  const t = computeMitreTool(board, m)
  const n = new THREE.Vector3(1, 0, 0).applyAxisAngle(
    new THREE.Vector3(t.axisDir.x, t.axisDir.y, t.axisDir.z),
    t.angleRad,
  )
  const vMax = m.axis === 'Z' ? board.width : board.thickness
  const far = m.axis === 'Z' ? { y: vMax, z: 0 } : { y: 0, z: vMax }
  const rhs = n.y * (far.y - t.pivot.y) + n.z * (far.z - t.pivot.z)
  return t.pivot.x - rhs / n.x
}

function expectPoly(actual: Point2D[], expected: Point2D[]): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i].x, 5)
    expect(p.y).toBeCloseTo(expected[i].y, 5)
  })
}

describe('computeMitreTool', () => {
  it('+X flat 45° pulls the short point back by W·tan(45) = W', () => {
    expect(shortPointX(mitre({ end: '+X', axis: 'Z', angle: 45 }))).toBeCloseTo(100, 5) // 200 - 100
  })

  it('-X flat 45° pushes the short point in by W', () => {
    expect(shortPointX(mitre({ end: '-X', axis: 'Z', angle: 45 }))).toBeCloseTo(100, 5) // 0 + 100
  })

  it('+X bevel 45° pulls the short point back by T', () => {
    expect(shortPointX(mitre({ end: '+X', axis: 'Y', angle: 45 }))).toBeCloseTo(175, 5) // 200 - 25
  })

  it('-X bevel 45° pushes the short point in by T', () => {
    expect(shortPointX(mitre({ end: '-X', axis: 'Y', angle: 45 }))).toBeCloseTo(25, 5) // 0 + 25
  })

  it('30° flat uses tan(30) drop', () => {
    const drop = 100 * Math.tan((30 * Math.PI) / 180)
    expect(shortPointX(mitre({ end: '+X', axis: 'Z', angle: 30 }))).toBeCloseTo(200 - drop, 5)
  })

  it('axisDir tracks the mitre axis', () => {
    expect(computeMitreTool(board, mitre({ axis: 'Z' })).axisDir).toEqual({ x: 0, y: 0, z: 1 })
    expect(computeMitreTool(board, mitre({ axis: 'Y' })).axisDir).toEqual({ x: 0, y: 1, z: 0 })
  })
})

describe('mitreFaceOutline', () => {
  it('+X flat clips the top-right (short) corner in the Face view', () => {
    expectPoly(mitreFaceOutline(board, [mitre({ end: '+X', axis: 'Z', angle: 45 })], 'Face'), [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])
  })

  it('-X flat clips the top-left corner', () => {
    expectPoly(mitreFaceOutline(board, [mitre({ end: '-X', axis: 'Z', angle: 45 })], 'Face'), [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
    ])
  })

  it('both ends clip both top corners', () => {
    const ms = [
      mitre({ id: 'a', end: '+X', axis: 'Z', angle: 45 }),
      mitre({ id: 'b', end: '-X', axis: 'Z', angle: 45 }),
    ]
    expectPoly(mitreFaceOutline(board, ms, 'Face'), [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ])
  })

  it('bevel mitres do not affect the Face view', () => {
    expectPoly(mitreFaceOutline(board, [mitre({ axis: 'Y' })], 'Face'), [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ])
  })

  it('Edge view uses thickness as the spanning dimension', () => {
    expectPoly(mitreFaceOutline(board, [mitre({ end: '+X', axis: 'Y', angle: 45 })], 'Edge'), [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 175, y: 25 },
      { x: 0, y: 25 },
    ])
  })
})
