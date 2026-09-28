import { describe, expect, it } from 'vitest'
import {
  findShelfInsertionPath,
  type AccessObstacle,
  type InteriorAccessAperture,
} from './interiorAccess'
import type { LocalBox } from './carcaseLayout'

const frameAround = (
  aperture: InteriorAccessAperture,
  depth = 20,
  outer = { x0: 0, x1: 120, z0: 0, z1: 120 },
): AccessObstacle[] => [
  {
    role: 'frame-left',
    box: { x0: outer.x0, x1: aperture.rect.x0, y0: -depth, y1: 0, z0: outer.z0, z1: outer.z1 },
  },
  {
    role: 'frame-right',
    box: { x0: aperture.rect.x1, x1: outer.x1, y0: -depth, y1: 0, z0: outer.z0, z1: outer.z1 },
  },
  {
    role: 'frame-bottom',
    box: { x0: aperture.rect.x0, x1: aperture.rect.x1, y0: -depth, y1: 0, z0: outer.z0, z1: aperture.rect.z0 },
  },
  {
    role: 'frame-top',
    box: { x0: aperture.rect.x0, x1: aperture.rect.x1, y0: -depth, y1: 0, z0: aperture.rect.z1, z1: outer.z1 },
  },
]

const cabinetAround = (): AccessObstacle[] => [
  { role: 'left', box: { x0: -20, x1: 0, y0: 0, y1: 130, z0: 0, z1: 120 } },
  { role: 'right', box: { x0: 120, x1: 140, y0: 0, y1: 130, z0: 0, z1: 120 } },
  { role: 'bottom', box: { x0: 0, x1: 120, y0: 0, y1: 130, z0: -20, z1: 0 } },
  { role: 'top', box: { x0: 0, x1: 120, y0: 0, y1: 130, z0: 120, z1: 140 } },
  { role: 'back', box: { x0: 0, x1: 120, y0: 120, y1: 140, z0: 0, z1: 120 } },
]

describe('rigid shelf insertion', () => {
  it('returns a straight witnessed path when the shelf clears the aperture flat', () => {
    const aperture = { id: 'wide', rect: { x0: 10, x1: 110, z0: 10, z1: 110 } }
    const shelf: LocalBox = { x0: 20, x1: 100, y0: 10, y1: 110, z0: 50, z1: 60 }
    const path = findShelfInsertionPath(
      shelf,
      [aperture],
      [...cabinetAround(), ...frameAround(aperture)],
      20,
    )
    expect(path?.kind).toBe('straight')
    expect(path?.apertureId).toBe('wide')
    expect(path?.poses.length).toBeGreaterThan(20)
    expect(path?.poses.at(-1)).toEqual({
      center: { x: 60, y: 60, z: 55 },
      rotation: { x: 0, y: 0, z: 0 },
    })
  })

  it('finds an angled path when straight insertion is too wide', () => {
    const aperture = { id: 'narrow', rect: { x0: 20, x1: 100, z0: 10, z1: 110 } }
    const shelf: LocalBox = { x0: 10, x1: 110, y0: 10, y1: 110, z0: 50, z1: 60 }
    const path = findShelfInsertionPath(
      shelf,
      [aperture],
      [...cabinetAround(), ...frameAround(aperture)],
      20,
    )
    expect(path?.kind).toBe('rotated')
    expect(path?.apertureId).toBe('narrow')
    expect(path?.poses.some((pose) => Math.abs(pose.rotation.y) >= 30)).toBe(true)
  })

  it('inserts at the target height when a fixed shelf blocks the aperture centre', () => {
    const aperture = { id: 'wide', rect: { x0: 10, x1: 110, z0: 10, z1: 110 } }
    const shelf: LocalBox = { x0: 20, x1: 100, y0: 10, y1: 110, z0: 25, z1: 35 }
    const fixedShelf: AccessObstacle = {
      role: 'fixed-shelf',
      box: { x0: 0, x1: 120, y0: 0, y1: 120, z0: 55, z1: 65 },
    }
    const path = findShelfInsertionPath(
      shelf,
      [aperture],
      [...cabinetAround(), ...frameAround(aperture), fixedShelf],
      20,
    )
    expect(path?.kind).toBe('straight')
    expect(path?.poses.every((pose) => pose.center.z === 30)).toBe(true)
    expect(path?.poses.at(-1)?.center).toEqual({ x: 60, y: 60, z: 30 })
  })

  it('declines an aperture too small for the rigid shelf in any sampled orientation', () => {
    const aperture = { id: 'tiny', rect: { x0: 40, x1: 80, z0: 40, z1: 80 } }
    const shelf: LocalBox = { x0: 10, x1: 110, y0: 10, y1: 110, z0: 50, z1: 60 }
    expect(
      findShelfInsertionPath(
        shelf,
        [aperture],
        [...cabinetAround(), ...frameAround(aperture)],
        20,
      ),
    ).toBeNull()
  })

  it('rejects a route blocked by fixed structure behind an otherwise usable aperture', () => {
    const aperture = { id: 'wide', rect: { x0: 10, x1: 110, z0: 10, z1: 110 } }
    const shelf: LocalBox = { x0: 20, x1: 100, y0: 70, y1: 110, z0: 50, z1: 60 }
    const barrier: AccessObstacle = {
      role: 'fixed-barrier',
      box: { x0: 0, x1: 120, y0: 35, y1: 45, z0: 0, z1: 120 },
    }
    expect(
      findShelfInsertionPath(
        shelf,
        [aperture],
        [...cabinetAround(), ...frameAround(aperture), barrier],
        20,
      ),
    ).toBeNull()
  })

  it('returns the same witnessed maneuver on repeated solves', () => {
    const aperture = { id: 'narrow', rect: { x0: 20, x1: 100, z0: 10, z1: 110 } }
    const shelf: LocalBox = { x0: 10, x1: 110, y0: 10, y1: 110, z0: 50, z1: 60 }
    const obstacles = [...cabinetAround(), ...frameAround(aperture)]
    expect(findShelfInsertionPath(shelf, [aperture], obstacles, 20)).toEqual(
      findShelfInsertionPath(shelf, [aperture], obstacles, 20),
    )
  })

  it('cannot jump through a thin barrier between sampled poses', () => {
    const aperture = { id: 'wide', rect: { x0: 10, x1: 110, z0: 10, z1: 110 } }
    const shelf: LocalBox = { x0: 20, x1: 100, y0: 105, y1: 106, z0: 25, z1: 35 }
    const barrier: AccessObstacle = {
      role: 'thin-barrier',
      box: { x0: -20, x1: 140, y0: 50, y1: 50.1, z0: -20, z1: 140 },
    }
    expect(findShelfInsertionPath(
      shelf,
      [aperture],
      [...cabinetAround(), ...frameAround(aperture), barrier],
      20,
    )).toBeNull()
  })
})
