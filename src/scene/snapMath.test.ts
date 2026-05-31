import { describe, it, expect } from 'vitest'
import { computeSnapDelta } from './snapMath'
import type { FaceHit } from './types'

function face(
  partId: string,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number,
): FaceHit {
  return {
    partId,
    faceCenter: { x: cx, y: cy, z: cz },
    faceNormal: { x: nx, y: ny, z: nz },
    localFaceNormal: { x: nx, y: ny, z: nz },
  }
}

describe('computeSnapDelta', () => {
  // Note: computeSnapDelta is pure math — it does not apply the parallel-normal guard.
  // The guard lives in useSnap.onFaceClick.

  it('anti-parallel normals 100mm apart — source moves +100 in Z', () => {
    const src = face('a', 0, 0, 0, 0, 0, 1)
    const tgt = face('b', 0, 0, 100, 0, 0, -1)
    const d = computeSnapDelta(src, tgt)
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(0)
    expect(d.z).toBeCloseTo(100)
  })

  it('already flush — returns zero delta', () => {
    const src = face('a', 0, 0, 25, 0, 0, 1)
    const tgt = face('b', 0, 0, 25, 0, 0, -1)
    const d = computeSnapDelta(src, tgt)
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(0)
    expect(d.z).toBeCloseTo(0)
  })

  it('past flush (overlap) — negative delta brings back', () => {
    const src = face('a', 0, 0, 10, 0, 0, 1)
    const tgt = face('b', 0, 0, 0, 0, 0, 1)
    const d = computeSnapDelta(src, tgt)
    expect(d.z).toBeCloseTo(-10)
  })

  it('lateral offset is ignored — only normal component matters', () => {
    const src = face('a', 50, 30, 0, 0, 0, 1)
    const tgt = face('b', 0, 0, 100, 0, 0, -1)
    const d = computeSnapDelta(src, tgt)
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(0)
    expect(d.z).toBeCloseTo(100)
  })

  it('X-axis faces 75mm apart', () => {
    const src = face('a', 0, 0, 0, 1, 0, 0)
    const tgt = face('b', 75, 0, 0, -1, 0, 0)
    const d = computeSnapDelta(src, tgt)
    expect(d.x).toBeCloseTo(75)
    expect(d.y).toBeCloseTo(0)
    expect(d.z).toBeCloseTo(0)
  })

  it('parallel normals (same direction) — formula still works, guard is callers job', () => {
    const src = face('a', 0, 0, 0, 0, 0, 1)
    const tgt = face('b', 0, 0, 100, 0, 0, 1)
    const d = computeSnapDelta(src, tgt)
    expect(d.z).toBeCloseTo(100)
  })
})
