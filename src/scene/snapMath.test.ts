import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import {
  computeSnapDelta,
  computeSnapTransform,
  computeFaceCorners,
  computeLocalFaceCenter,
  faceAxes,
  defaultCutSize,
  isSnapFace,
} from './snapMath'
import type { BoardPart, CylinderPart, Face, FaceHit, Vec3 } from './types'

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
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: cx, y: cy, z: cz },
  }
}

// Board 100mm × 50mm × 25mm at identity (position 0,0,0, rotation 0,0,0, corner at local origin)
const BOARD: BoardPart = {
  kind: 'board',
  id: 'b1',
  label: 'Board 1',
  length: 100,
  width: 50,
  thickness: 25,
  material: '',
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}

function makeFace(nx: number, ny: number, nz: number): FaceHit {
  // faceCenter is irrelevant for computeFaceCorners — uses analytic derivation
  return {
    partId: 'b1',
    faceNormal: { x: nx, y: ny, z: nz },
    faceCenter: { x: 0, y: 0, z: 0 },
    localFaceNormal: { x: nx, y: ny, z: nz },
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: 0, y: 0, z: 0 },
  }
}

function expectVec3(actual: Vec3, x: number, y: number, z: number) {
  expect(actual.x).toBeCloseTo(x, 5)
  expect(actual.y).toBeCloseTo(y, 5)
  expect(actual.z).toBeCloseTo(z, 5)
}

// Cross product helper for winding-order tests (no Three.js import needed)
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}
function subV(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}
function dotV(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
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

describe('computeLocalFaceCenter', () => {
  it('face +X returns (length, width/2, thickness/2)', () => {
    const c = computeLocalFaceCenter({ x: 1, y: 0, z: 0 }, BOARD)
    expectVec3(c, 100, 25, 12.5)
  })
  it('face -X returns (0, width/2, thickness/2)', () => {
    const c = computeLocalFaceCenter({ x: -1, y: 0, z: 0 }, BOARD)
    expectVec3(c, 0, 25, 12.5)
  })
  it('face +Y returns (length/2, width, thickness/2)', () => {
    const c = computeLocalFaceCenter({ x: 0, y: 1, z: 0 }, BOARD)
    expectVec3(c, 50, 50, 12.5)
  })
  it('face -Y returns (length/2, 0, thickness/2)', () => {
    const c = computeLocalFaceCenter({ x: 0, y: -1, z: 0 }, BOARD)
    expectVec3(c, 50, 0, 12.5)
  })
  it('face +Z returns (length/2, width/2, thickness)', () => {
    const c = computeLocalFaceCenter({ x: 0, y: 0, z: 1 }, BOARD)
    expectVec3(c, 50, 25, 25)
  })
  it('face -Z returns (length/2, width/2, 0)', () => {
    const c = computeLocalFaceCenter({ x: 0, y: 0, z: -1 }, BOARD)
    expectVec3(c, 50, 25, 0)
  })
})

describe('computeFaceCorners', () => {
  it('throws for unsupported part kind', () => {
    const badPart = { ...BOARD, kind: 'cylinder' as never }
    expect(() => computeFaceCorners(makeFace(0, 0, 1), badPart)).toThrow(
      "computeFaceCorners: unsupported kind 'cylinder'",
    )
  })

  it('face +Z: returns 4 corners at Z=25 spanning full XY face', () => {
    const [c0, c1, c2, c3] = computeFaceCorners(makeFace(0, 0, 1), BOARD)
    // All corners at Z = 25
    expect(c0.z).toBeCloseTo(25)
    expect(c1.z).toBeCloseTo(25)
    expect(c2.z).toBeCloseTo(25)
    expect(c3.z).toBeCloseTo(25)
    // Corners span X=[0,100] and Y=[0,50]
    const xs = [c0.x, c1.x, c2.x, c3.x].sort((a, b) => a - b)
    const ys = [c0.y, c1.y, c2.y, c3.y].sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(0)
    expect(xs[3]).toBeCloseTo(100)
    expect(ys[0]).toBeCloseTo(0)
    expect(ys[3]).toBeCloseTo(50)
  })

  it('face +X: returns 4 corners at X=100 spanning full YZ face', () => {
    const [c0, c1, c2, c3] = computeFaceCorners(makeFace(1, 0, 0), BOARD)
    expect(c0.x).toBeCloseTo(100)
    expect(c1.x).toBeCloseTo(100)
    expect(c2.x).toBeCloseTo(100)
    expect(c3.x).toBeCloseTo(100)
    const ys = [c0.y, c1.y, c2.y, c3.y].sort((a, b) => a - b)
    const zs = [c0.z, c1.z, c2.z, c3.z].sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(0)
    expect(ys[3]).toBeCloseTo(50)
    expect(zs[0]).toBeCloseTo(0)
    expect(zs[3]).toBeCloseTo(25)
  })

  it('all 4 corners lie in the face plane (dot to normal ≈ 0)', () => {
    const normals: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]
    for (const [nx, ny, nz] of normals) {
      const fn = { x: nx, y: ny, z: nz }
      const corners = computeFaceCorners(
        {
          partId: 'b1',
          faceNormal: fn,
          faceCenter: fn,
          localFaceNormal: fn,
          localHitPoint: { x: 0, y: 0, z: 0 },
          hitPoint: { x: 0, y: 0, z: 0 },
        },
        BOARD,
      )
      const center = computeLocalFaceCenter(fn, BOARD)
      for (const corner of corners) {
        const d = dotV(subV(corner, center), fn)
        expect(Math.abs(d)).toBeLessThan(1e-4)
      }
    }
  })

  it('CCW winding: cross(c1-c0, c2-c0) points in same direction as faceNormal', () => {
    const normals: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]
    for (const [nx, ny, nz] of normals) {
      const fn = { x: nx, y: ny, z: nz }
      const [c0, c1, c2] = computeFaceCorners(
        {
          partId: 'b1',
          faceNormal: fn,
          faceCenter: fn,
          localFaceNormal: fn,
          localHitPoint: { x: 0, y: 0, z: 0 },
          hitPoint: { x: 0, y: 0, z: 0 },
        },
        BOARD,
      )
      const winding = cross(subV(c1, c0), subV(c2, c0))
      expect(dotV(winding, fn)).toBeGreaterThan(0)
    }
  })

  it('no bowtie: all 4 corners are distinct', () => {
    const normals: [number, number, number][] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]
    for (const [nx, ny, nz] of normals) {
      const fn = { x: nx, y: ny, z: nz }
      const corners = computeFaceCorners(
        {
          partId: 'b1',
          faceNormal: fn,
          faceCenter: fn,
          localFaceNormal: fn,
          localHitPoint: { x: 0, y: 0, z: 0 },
          hitPoint: { x: 0, y: 0, z: 0 },
        },
        BOARD,
      )
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const d = Math.hypot(
            corners[i].x - corners[j].x,
            corners[i].y - corners[j].y,
            corners[i].z - corners[j].z,
          )
          expect(d).toBeGreaterThan(0.01)
        }
      }
    }
  })

  it('non-zero position (10,20,30) shifts all corners by (10,20,30)', () => {
    const translated: BoardPart = {
      ...BOARD,
      position: { x: 10, y: 20, z: 30 },
    }
    const base = computeFaceCorners(makeFace(0, 0, 1), BOARD)
    const moved = computeFaceCorners(makeFace(0, 0, 1), translated)
    for (let i = 0; i < 4; i++) {
      expect(moved[i].x).toBeCloseTo(base[i].x + 10, 4)
      expect(moved[i].y).toBeCloseTo(base[i].y + 20, 4)
      expect(moved[i].z).toBeCloseTo(base[i].z + 30, 4)
    }
  })
})

describe('faceAxes', () => {
  it('+X: depth=x, u=y, v=z', () => {
    const a = faceAxes('+X')
    expect(a.depth).toBe('x')
    expect(a.u).toBe('y')
    expect(a.v).toBe('z')
  })
  it('-X: depth=x, u=y, v=z', () => {
    const a = faceAxes('-X')
    expect(a.depth).toBe('x')
    expect(a.u).toBe('y')
    expect(a.v).toBe('z')
  })
  it('+Y: depth=y, u=x, v=z', () => {
    const a = faceAxes('+Y')
    expect(a.depth).toBe('y')
    expect(a.u).toBe('x')
    expect(a.v).toBe('z')
  })
  it('-Y: depth=y, u=x, v=z', () => {
    const a = faceAxes('-Y')
    expect(a.depth).toBe('y')
    expect(a.u).toBe('x')
    expect(a.v).toBe('z')
  })
  it('+Z: depth=z, u=x, v=y', () => {
    const a = faceAxes('+Z')
    expect(a.depth).toBe('z')
    expect(a.u).toBe('x')
    expect(a.v).toBe('y')
  })
  it('-Z: depth=z, u=x, v=y', () => {
    const a = faceAxes('-Z')
    expect(a.depth).toBe('z')
    expect(a.u).toBe('x')
    expect(a.v).toBe('y')
  })
})

describe('defaultCutSize', () => {
  it('+X/-X: depth axis (x) = 10, u/v = 20', () => {
    const s = defaultCutSize('+X')
    expect(s.x).toBe(10)
    expect(s.y).toBe(20)
    expect(s.z).toBe(20)
    expect(defaultCutSize('-X')).toEqual(s)
  })
  it('+Y/-Y: depth axis (y) = 10, u/v = 20', () => {
    const s = defaultCutSize('+Y')
    expect(s.x).toBe(20)
    expect(s.y).toBe(10)
    expect(s.z).toBe(20)
    expect(defaultCutSize('-Y')).toEqual(s)
  })
  it('+Z/-Z: depth axis (z) = 10, u/v = 20', () => {
    const s = defaultCutSize('+Z')
    expect(s.x).toBe(20)
    expect(s.y).toBe(20)
    expect(s.z).toBe(10)
    expect(defaultCutSize('-Z')).toEqual(s)
  })
  it('depth axis matches faceAxes().depth for all faces', () => {
    const faces: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']
    for (const f of faces) {
      const axes = faceAxes(f)
      const size = defaultCutSize(f)
      expect(size[axes.depth]).toBe(10)
      expect(size[axes.u]).toBe(20)
      expect(size[axes.v]).toBe(20)
    }
  })
})

describe('computeSnapTransform', () => {
  function expectSnapped(
    result: { position: Vec3; rotation: Vec3 },
    sourceFace: FaceHit,
    targetFaceCenter: Vec3,
    targetFaceNormal: Vec3,
    sourcePart: BoardPart,
  ) {
    // Invariant 1: source face centre coincides with target face centre after transform
    const snappedPart: BoardPart = {
      ...sourcePart,
      position: result.position,
      rotation: result.rotation,
    }
    const corners = computeFaceCorners(sourceFace, snappedPart)
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
    const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4
    expect(cx).toBeCloseTo(targetFaceCenter.x, 3)
    expect(cy).toBeCloseTo(targetFaceCenter.y, 3)
    expect(cz).toBeCloseTo(targetFaceCenter.z, 3)

    // Invariant 2: source face normal is anti-parallel to target face normal after transform
    const DEG2RAD = Math.PI / 180
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        result.rotation.x * DEG2RAD,
        result.rotation.y * DEG2RAD,
        result.rotation.z * DEG2RAD,
        sourcePart.rotationOrder,
      ),
    )
    const ln = new THREE.Vector3(
      sourceFace.localFaceNormal.x,
      sourceFace.localFaceNormal.y,
      sourceFace.localFaceNormal.z,
    ).applyQuaternion(q)
    const dotNormals = ln.dot(
      new THREE.Vector3(targetFaceNormal.x, targetFaceNormal.y, targetFaceNormal.z),
    )
    expect(dotNormals).toBeCloseTo(-1, 3)
  }

  it('90° alignment: source +X to target +Y — rotates -90° around Z, faces flush', () => {
    // BOARD at (0,0,0) 100×50×25mm. +X face centre is at (100, 25, 12.5).
    // Target at (200,0,0), +Y face centre at (250, 50, 12.5).
    // Q_normal rotates +X → -Y (anti-parallel to +Y), which is -90° around Z.
    // After rotation the +X local face maps to world: center at (0,0,0)+rotation applied to (100,25,12.5).
    // At -90° Z: x→y, y→-x. Local centre (100,25,12.5) → world (25,-100,12.5) before translation.
    // newPosition = (0,0,0) + (250,50,12.5) - (25,-100,12.5) = (225,150,0).
    const srcFace: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 1, y: 0, z: 0 },
      localFaceNormal: { x: 1, y: 0, z: 0 },
      faceCenter: { x: 100, y: 25, z: 12.5 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 100, y: 25, z: 12.5 },
    }
    const tgtFace: FaceHit = {
      partId: 'b2',
      faceNormal: { x: 0, y: 1, z: 0 },
      localFaceNormal: { x: 0, y: 1, z: 0 },
      faceCenter: { x: 250, y: 50, z: 12.5 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 250, y: 50, z: 12.5 },
    }
    const result = computeSnapTransform(srcFace, tgtFace, BOARD)

    expect(result.rotation.x).toBeCloseTo(0, 3)
    expect(result.rotation.y).toBeCloseTo(0, 3)
    expect(result.rotation.z).toBeCloseTo(-90, 3)

    expect(result.position.x).toBeCloseTo(225, 3)
    expect(result.position.y).toBeCloseTo(150, 3)
    expect(result.position.z).toBeCloseTo(0, 3)

    expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
  })

  it('180° flip: source +Z to target +Z — flips 180°, faces flush', () => {
    // Euler decomposition for a 180° flip is not unique, so only assert geometric invariants.
    const srcFace: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 50, y: 25, z: 25 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 50, y: 25, z: 25 },
    }
    const tgtFace: FaceHit = {
      partId: 'b2',
      faceNormal: { x: 0, y: 0, z: 1 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 50, y: 25, z: 125 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 50, y: 25, z: 125 },
    }
    const result = computeSnapTransform(srcFace, tgtFace, BOARD)
    expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
  })

  it('anti-parallel degenerate: source +Z, target -Z — rotation unchanged, position matches computeSnapDelta', () => {
    // Already anti-parallel: Q_normal ≈ identity, roll snap rounds to 0°, rotation stays (0,0,0).
    // Position shifts by the same delta computeSnapDelta returns: (0,0,75).
    const srcFace: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 50, y: 25, z: 25 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 50, y: 25, z: 25 },
    }
    const tgtFace: FaceHit = {
      partId: 'b2',
      faceNormal: { x: 0, y: 0, z: -1 },
      localFaceNormal: { x: 0, y: 0, z: -1 },
      faceCenter: { x: 50, y: 25, z: 100 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 50, y: 25, z: 100 },
    }
    const result = computeSnapTransform(srcFace, tgtFace, BOARD)

    expect(result.rotation.x).toBeCloseTo(0, 3)
    expect(result.rotation.y).toBeCloseTo(0, 3)
    expect(result.rotation.z).toBeCloseTo(0, 3)

    const delta = computeSnapDelta(srcFace, tgtFace)
    expect(result.position.x).toBeCloseTo(BOARD.position.x + delta.x, 3)
    expect(result.position.y).toBeCloseTo(BOARD.position.y + delta.y, 3)
    expect(result.position.z).toBeCloseTo(BOARD.position.z + delta.z, 3)

    expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
  })

  it('pre-rotated source (90°Z): +Z to target -Z — rotation preserved, position updated', () => {
    // Exercises Q_current ≠ identity. Source BOARD rotated 90° around Z.
    // +Z world normal is unaffected by Z-rotation, so normals are already anti-parallel.
    // World face center of +Z at 90°Z: rotate local (50,25,25) by R_z90 → (-25,50,25).
    // Q_normal ≈ identity, Q_roll ≈ identity → rotation unchanged at (0,0,90).
    // newPosition = (0,0,0) + (50,25,100) - (-25,50,25) = (75,-25,75).
    const BOARD_ROTATED: BoardPart = { ...BOARD, rotation: { x: 0, y: 0, z: 90 } }
    const srcFace: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: -25, y: 50, z: 25 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: -25, y: 50, z: 25 },
    }
    const tgtFace: FaceHit = {
      partId: 'b2',
      faceNormal: { x: 0, y: 0, z: -1 },
      localFaceNormal: { x: 0, y: 0, z: -1 },
      faceCenter: { x: 50, y: 25, z: 100 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 50, y: 25, z: 100 },
    }
    const result = computeSnapTransform(srcFace, tgtFace, BOARD_ROTATED)

    expect(result.rotation.x).toBeCloseTo(0, 3)
    expect(result.rotation.y).toBeCloseTo(0, 3)
    expect(result.rotation.z).toBeCloseTo(90, 3)

    expect(result.position.x).toBeCloseTo(75, 3)
    expect(result.position.y).toBeCloseTo(-25, 3)
    expect(result.position.z).toBeCloseTo(75, 3)

    expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD_ROTATED)
  })
})

describe('isSnapFace', () => {
  const dowel: CylinderPart = {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 10,
    length: 100,
    material: '',
    color: '#c19a6b',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
  }

  it('board: any axis-aligned face is snappable', () => {
    expect(isSnapFace(BOARD, { x: 1, y: 0, z: 0 })).toBe(true)
    expect(isSnapFace(BOARD, { x: 0, y: -1, z: 0 })).toBe(true)
    expect(isSnapFace(BOARD, { x: 0, y: 0, z: 1 })).toBe(true)
  })

  it('dowel: a cap (±Z local normal) is snappable', () => {
    expect(isSnapFace(dowel, { x: 0, y: 0, z: 1 })).toBe(true)
    expect(isSnapFace(dowel, { x: 0, y: 0, z: -1 })).toBe(true)
  })

  it('dowel: a lateral (radial) face is not snappable', () => {
    expect(isSnapFace(dowel, { x: 1, y: 0, z: 0 })).toBe(false)
    expect(isSnapFace(dowel, { x: 0.707, y: 0.707, z: 0 })).toBe(false)
  })
})
