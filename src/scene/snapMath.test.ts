import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import {
  computeSnapDelta,
  computeSnapTransform,
  computeFaceCorners,
  computeLocalFaceCenter,
  computeDowelLocalFaceCenter,
  computeDowelSnapTransform,
  faceAxes,
  defaultCutSize,
  isSnapFace,
} from './snapMath'
import type { BoardPart, Component, CylinderPart, Face, FaceHit, Part, Vec3 } from './types'
import { componentsById } from './componentTree'
import { resolveWorldMatrix } from '../geom/transform'

const NO_COMPONENTS = componentsById([])

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
  grain: 'free' as const,
  material: '',
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
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
    expect(() => computeFaceCorners(makeFace(0, 0, 1), badPart, NO_COMPONENTS)).toThrow(
      "computeFaceCorners: unsupported kind 'cylinder'",
    )
  })

  it('face +Z: returns 4 corners at Z=25 spanning full XY face', () => {
    const [c0, c1, c2, c3] = computeFaceCorners(makeFace(0, 0, 1), BOARD, NO_COMPONENTS)
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
    const [c0, c1, c2, c3] = computeFaceCorners(makeFace(1, 0, 0), BOARD, NO_COMPONENTS)
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
        NO_COMPONENTS,
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
        NO_COMPONENTS,
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
        NO_COMPONENTS,
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
    const base = computeFaceCorners(makeFace(0, 0, 1), BOARD, NO_COMPONENTS)
    const moved = computeFaceCorners(makeFace(0, 0, 1), translated, NO_COMPONENTS)
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
    const corners = computeFaceCorners(sourceFace, snappedPart, NO_COMPONENTS)
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
    const result = computeSnapTransform(srcFace, tgtFace, BOARD, NO_COMPONENTS)

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
    const result = computeSnapTransform(srcFace, tgtFace, BOARD, NO_COMPONENTS)
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
    const result = computeSnapTransform(srcFace, tgtFace, BOARD, NO_COMPONENTS)

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
    const result = computeSnapTransform(srcFace, tgtFace, BOARD_ROTATED, NO_COMPONENTS)

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
    parentId: null,
    driven: false,
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

describe('computeDowelLocalFaceCenter', () => {
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
    parentId: null,
    driven: false,
  }

  it('+Z cap center is (0, 0, length)', () => {
    expectVec3(computeDowelLocalFaceCenter({ x: 0, y: 0, z: 1 }, dowel), 0, 0, 100)
  })

  it('-Z cap center is (0, 0, 0)', () => {
    expectVec3(computeDowelLocalFaceCenter({ x: 0, y: 0, z: -1 }, dowel), 0, 0, 0)
  })
})

describe('computeDowelSnapTransform', () => {
  const DOWEL: CylinderPart = {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 10,
    length: 100,
    material: '',
    color: '#c19a6b',
    position: { x: 0, y: 0, z: 0 }, // base at origin, +Z cap at (0,0,100)
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
  }

  function eulerToQuat(rotation: { x: number; y: number; z: number }): THREE.Quaternion {
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
        'XYZ',
      ),
    )
  }

  // helper: build a cap FaceHit for the source dowel
  function capFace(partId: string, lz: 1 | -1, worldNormal: Vec3): FaceHit {
    return {
      partId,
      faceNormal: worldNormal,
      faceCenter: { x: 0, y: 0, z: 0 },
      localFaceNormal: { x: 0, y: 0, z: lz },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 0, y: 0, z: 0 },
    }
  }

  it('cap-to-board-face (coaxial=false): +Z cap seats at the clicked hitPoint, opposing target normal', () => {
    const source = capFace('d1', 1, { x: 0, y: 0, z: 1 })
    const target: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 999, y: 999, z: 50 }, // deliberately != hitPoint to prove we use hitPoint
      localFaceNormal: { x: 0, y: 0, z: 1 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 10, y: 20, z: 50 },
    }
    const { position, rotation } = computeDowelSnapTransform(source, target, DOWEL, false, NO_COMPONENTS)

    const q = eulerToQuat(rotation)
    const capNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(capNormal.z).toBeCloseTo(-1, 5)

    const capLocal = new THREE.Vector3(0, 0, DOWEL.length).applyQuaternion(q)
    expectVec3(
      { x: position.x + capLocal.x, y: position.y + capLocal.y, z: position.z + capLocal.z },
      10,
      20,
      50,
    )
  })

  it('cap-to-cap (coaxial=true): cap seats at target faceCenter, not hitPoint', () => {
    const source = capFace('d1', 1, { x: 0, y: 0, z: 1 })
    const target: FaceHit = {
      partId: 'd2',
      faceNormal: { x: 0, y: 0, z: -1 },
      faceCenter: { x: 5, y: 6, z: 200 },
      localFaceNormal: { x: 0, y: 0, z: -1 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 1, y: 2, z: 200 },
    }
    const { position, rotation } = computeDowelSnapTransform(source, target, DOWEL, true, NO_COMPONENTS)
    const q = eulerToQuat(rotation)
    const capLocal = new THREE.Vector3(0, 0, DOWEL.length).applyQuaternion(q)
    expectVec3(
      { x: position.x + capLocal.x, y: position.y + capLocal.y, z: position.z + capLocal.z },
      5,
      6,
      200,
    )
  })

  it('-Z cap source: seats the (0,0,0) cap at the hitPoint', () => {
    const source = capFace('d1', -1, { x: 0, y: 0, z: -1 })
    const target: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 0, y: 0, z: 0 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 7, y: 8, z: 30 },
    }
    const { position, rotation } = computeDowelSnapTransform(source, target, DOWEL, false, NO_COMPONENTS)
    const q = eulerToQuat(rotation)
    expectVec3(position, 7, 8, 30)
    const capNormal = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
    expect(capNormal.z).toBeCloseTo(-1, 5)
  })

  it('pre-rotated source: recomputes the cap normal from the dowel rotation', () => {
    const rotated: CylinderPart = { ...DOWEL, rotation: { x: 90, y: 0, z: 0 } }
    // sourceFace.faceNormal is deliberately WRONG to prove it is ignored.
    const source = capFace('d1', 1, { x: 1, y: 0, z: 0 })
    const target: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 1, z: 0 },
      faceCenter: { x: 0, y: 0, z: 0 },
      localFaceNormal: { x: 0, y: 1, z: 0 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 0, y: 100, z: 0 },
    }
    const { rotation } = computeDowelSnapTransform(source, target, rotated, false, NO_COMPONENTS)
    const q = eulerToQuat(rotation)
    const capNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(capNormal.y).toBeCloseTo(-1, 5)
  })

  it('antiparallel/degenerate target: still seats the cap opposing the target', () => {
    // Source +Z cap points +Z (world). Target normal also +Z, so srcWorldNormal and
    // negTgt = (0,0,-1) are antiparallel — exercises setFromUnitVectors' 180° flip.
    const source = capFace('d1', 1, { x: 0, y: 0, z: 1 })
    const target: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 0, y: 0, z: 0 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 3, y: 4, z: 70 },
    }
    const { position, rotation } = computeDowelSnapTransform(source, target, DOWEL, false, NO_COMPONENTS)
    const q = eulerToQuat(rotation)
    const capNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(capNormal.z).toBeCloseTo(-1, 5)
    const capLocal = new THREE.Vector3(0, 0, DOWEL.length).applyQuaternion(q)
    expectVec3(
      { x: position.x + capLocal.x, y: position.y + capLocal.y, z: position.z + capLocal.z },
      3,
      4,
      70,
    )
  })
})

const DEG = Math.PI / 180

function cabinet(id: string, position: Vec3, rotation: Vec3): Component {
  return {
    id,
    kind: 'group',
    label: id,
    parentId: null,
    position,
    rotation,
    rotationOrder: 'XYZ',
    visible: true,
  }
}

// The pose a nested node resolves to, expressed as a top-level (parentId: null) placement.
function worldPose(node: Part, byId: Map<string, Component>): { position: Vec3; rotation: Vec3 } {
  const m = new THREE.Matrix4().fromArray(resolveWorldMatrix(node, byId))
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  m.decompose(p, q, s)
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  return {
    position: { x: p.x, y: p.y, z: p.z },
    rotation: { x: e.x / DEG, y: e.y / DEG, z: e.z / DEG },
  }
}

// A FaceHit as the raycaster would report it: world normal and world face centre derived from
// the part's resolved world matrix, so the fixture stays physically consistent when nested.
function worldFaceHit(part: BoardPart, localFaceNormal: Vec3, byId: Map<string, Component>) {
  const m = new THREE.Matrix4().fromArray(resolveWorldMatrix(part, byId))
  const n = new THREE.Vector3(localFaceNormal.x, localFaceNormal.y, localFaceNormal.z)
    .transformDirection(m)
    .normalize()
  const lc = computeLocalFaceCenter(localFaceNormal, part)
  const c = new THREE.Vector3(lc.x, lc.y, lc.z).applyMatrix4(m)
  const hit: FaceHit = {
    partId: part.id,
    faceNormal: { x: n.x, y: n.y, z: n.z },
    localFaceNormal,
    faceCenter: { x: c.x, y: c.y, z: c.z },
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: c.x, y: c.y, z: c.z },
  }
  return hit
}

describe('computeSnapTransform under a transformed ancestor', () => {
  const SRC_FACE: FaceHit = {
    partId: 'b1',
    faceNormal: { x: 1, y: 0, z: 0 },
    localFaceNormal: { x: 1, y: 0, z: 0 },
    faceCenter: { x: 100, y: 25, z: 12.5 },
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: 100, y: 25, z: 12.5 },
  }
  const TGT_FACE: FaceHit = {
    partId: 'b2',
    faceNormal: { x: 0, y: 1, z: 0 },
    localFaceNormal: { x: 0, y: 1, z: 0 },
    faceCenter: { x: 250, y: 50, z: 12.5 },
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: 250, y: 50, z: 12.5 },
  }

  it('returns a parent-local placement, not a world one', () => {
    // A cabinet translated 500mm in x. Whatever world placement the snap computes, the value
    // written back to part.position must be 500 less, because the parent supplies that 500.
    const cab = cabinet('cab', { x: 500, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const nested: BoardPart = { ...BOARD, parentId: cab.id }

    const flat = computeSnapTransform(SRC_FACE, TGT_FACE, BOARD, NO_COMPONENTS)
    const under = computeSnapTransform(SRC_FACE, TGT_FACE, nested, componentsById([cab]))

    expect(under.position.x).toBeCloseTo(flat.position.x - 500, 6)
    expect(under.position.y).toBeCloseTo(flat.position.y, 6)
    expect(under.position.z).toBeCloseTo(flat.position.z, 6)
    expect(under.rotation.x).toBeCloseTo(flat.rotation.x, 6)
    expect(under.rotation.y).toBeCloseTo(flat.rotation.y, 6)
    expect(under.rotation.z).toBeCloseTo(flat.rotation.z, 6)
  })

  it('unwinds an ancestor rotation from the returned rotation', () => {
    // A cabinet yawed 90 degrees and moved off-origin. Snapping a nested board must land the board
    // in exactly the world pose that snapping an unparented board at the same resolved world pose
    // lands in — reconstructing parent ∘ returned-local is the check, because the returned Euler
    // triple is only defined up to equivalent representations.
    const cab = cabinet('cab', { x: 500, y: -200, z: 30 }, { x: 0, y: 0, z: 90 })
    const byId = componentsById([cab])
    const nested: BoardPart = {
      ...BOARD,
      parentId: cab.id,
      position: { x: 40, y: -15, z: 6 },
      rotation: { x: 5, y: -12, z: 25 },
    }
    const flatEquivalent: BoardPart = { ...BOARD, ...worldPose(nested, byId) }

    const srcFace = worldFaceHit(nested, { x: 1, y: 0, z: 0 }, byId)

    const under = computeSnapTransform(srcFace, TGT_FACE, nested, byId)
    const flat = computeSnapTransform(srcFace, TGT_FACE, flatEquivalent, NO_COMPONENTS)

    const worldFromNested = resolveWorldMatrix({ ...nested, ...under }, byId)
    const worldFromFlat = resolveWorldMatrix({ ...flatEquivalent, ...flat }, NO_COMPONENTS)
    for (let i = 0; i < 16; i++) expect(worldFromNested[i]).toBeCloseTo(worldFromFlat[i], 6)
  })

  it('returns exactly the pre-component-tree values for a top-level part', () => {
    // Captured from the implementation before the parent-frame round-trip existed. A top-level
    // part's ancestor frame is the identity, so the conversion must be a no-op to the last bit.
    const board: BoardPart = {
      ...BOARD,
      position: { x: 13, y: -7, z: 4 },
      rotation: { x: 10, y: 20, z: 30 },
    }
    const result = computeSnapTransform(SRC_FACE, TGT_FACE, board, NO_COMPONENTS)

    expect(result.position.x).toBe(182.341064082917)
    expect(result.position.y).toBe(123.90886216668437)
    expect(result.position.z).toBe(39.72128732801056)
    expect(result.rotation.x).toBe(20.35477568127951)
    expect(result.rotation.y).toBe(10.488699968639276)
    expect(result.rotation.z).toBe(-63.863726395189516)
  })
})

describe('computeDowelSnapTransform under a transformed ancestor', () => {
  const DOWEL_AT_ORIGIN: CylinderPart = {
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
    parentId: null,
    driven: false,
  }
  const SRC_CAP: FaceHit = {
    partId: 'd1',
    faceNormal: { x: 0, y: 0, z: 1 },
    localFaceNormal: { x: 0, y: 0, z: 1 },
    faceCenter: { x: 0, y: 0, z: 0 },
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: 0, y: 0, z: 0 },
  }
  const TGT: FaceHit = {
    partId: 'b1',
    faceNormal: { x: 0, y: 0, z: 1 },
    localFaceNormal: { x: 0, y: 0, z: 1 },
    faceCenter: { x: 999, y: 999, z: 50 },
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: 10, y: 20, z: 50 },
  }

  it('returns a parent-local placement, not a world one', () => {
    const cab = cabinet('cab', { x: 500, y: 0, z: 0 }, { x: 0, y: 0, z: 0 })
    const nested: CylinderPart = { ...DOWEL_AT_ORIGIN, parentId: cab.id }

    const flat = computeDowelSnapTransform(SRC_CAP, TGT, DOWEL_AT_ORIGIN, false, NO_COMPONENTS)
    const under = computeDowelSnapTransform(SRC_CAP, TGT, nested, false, componentsById([cab]))

    expect(under.position.x).toBeCloseTo(flat.position.x - 500, 6)
    expect(under.position.y).toBeCloseTo(flat.position.y, 6)
    expect(under.position.z).toBeCloseTo(flat.position.z, 6)
  })

  it('unwinds an ancestor rotation from the returned rotation', () => {
    const cab = cabinet('cab', { x: 120, y: -60, z: 15 }, { x: 0, y: 0, z: 90 })
    const byId = componentsById([cab])
    const nested: CylinderPart = {
      ...DOWEL_AT_ORIGIN,
      parentId: cab.id,
      position: { x: 8, y: 9, z: 10 },
      rotation: { x: 15, y: -25, z: 40 },
    }
    const flatEquivalent: CylinderPart = { ...DOWEL_AT_ORIGIN, ...worldPose(nested, byId) }

    const under = computeDowelSnapTransform(SRC_CAP, TGT, nested, false, byId)
    const flat = computeDowelSnapTransform(SRC_CAP, TGT, flatEquivalent, false, NO_COMPONENTS)

    const worldFromNested = resolveWorldMatrix({ ...nested, ...under }, byId)
    const worldFromFlat = resolveWorldMatrix({ ...flatEquivalent, ...flat }, NO_COMPONENTS)
    for (let i = 0; i < 16; i++) expect(worldFromNested[i]).toBeCloseTo(worldFromFlat[i], 6)
  })

  it('returns exactly the pre-component-tree values for a top-level dowel', () => {
    const dowel: CylinderPart = {
      ...DOWEL_AT_ORIGIN,
      position: { x: 3, y: 4, z: 5 },
      rotation: { x: 15, y: -25, z: 40 },
    }
    const result = computeDowelSnapTransform(SRC_CAP, TGT, dowel, false, NO_COMPONENTS)

    expect(result.position.x).toBe(9.99999999999998)
    expect(result.position.y).toBe(19.999999999999982)
    expect(result.position.z).toBe(149.9999999999999)
    expect(result.rotation.x).toBe(-180)
    expect(result.rotation.y).toBe(1.1171717023948288e-14)
    expect(result.rotation.z).toBe(158.592418383134)
  })
})
