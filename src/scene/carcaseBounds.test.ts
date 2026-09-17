import { describe, it, expect } from 'vitest'
import { carcaseBounds } from './carcaseBounds'
import type { CarcaseParams, MaterialDef } from './types'
import { roleThicknessFor, type PartOverrides } from './resolveThickness'
import type { Section } from './sectionTree'
import { newSectionId } from './sectionTree'

const MATERIALS: Record<string, MaterialDef> = {
  Ply18: { costPerM2: 40, thickness: 18 },
  Ply6: { costPerM2: 20, thickness: 6 },
  Oak20: { costPerM2: 90, thickness: 20 },
}

const NO_OVERRIDES = new Map<string, PartOverrides>()

const bareLeaf = (): Section => ({
  id: newSectionId(),
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
})

const doorLeaf = (): Section => ({
  id: newSectionId(),
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
  front: { kind: 'door', leaves: 1, hinge: 'left' },
})

// Deliberately asymmetric: width, depth and height all differ, so a rule that reads one dimension
// where it means another cannot pass.
const params = (over: Partial<CarcaseParams> = {}): CarcaseParams => ({
  width: 600,
  height: 720,
  depth: 560,
  carcaseMaterial: 'Ply18',
  backMaterial: 'Ply6',
  frontMaterial: 'Oak20',
  hasTop: true,
  backMode: 'captured',
  baseMode: 'none',
  toeKickHeight: 100,
  toeKickSetback: 50,
  frontMount: 'overlay',
  frontReveal: 3,
  section: bareLeaf(),
  jointMethod: 'butt-screw',
  ...over,
})

const boundsOf = (p: CarcaseParams) =>
  carcaseBounds(p, roleThicknessFor(p, MATERIALS, NO_OVERRIDES))

describe('carcaseBounds', () => {
  it('is the plain box when nothing protrudes', () => {
    expect(boundsOf(params())).toEqual({ x0: 0, x1: 600, y0: 0, y1: 560, z0: 0, z1: 720 })
  })

  it('an applied back reaches behind the carcase depth', () => {
    // Ply6 back, applied: the box grows by exactly the back's own thickness, at the back only.
    expect(boundsOf(params({ backMode: 'applied' })).y1).toBe(566)
  })

  it('a captured back does not', () => {
    expect(boundsOf(params({ backMode: 'captured' })).y1).toBe(560)
  })

  it('an overlay front reaches in front of y = 0', () => {
    expect(boundsOf(params({ section: doorLeaf() })).y0).toBe(-20)
  })

  it('an inset front does not — it sits inside the carcase', () => {
    expect(boundsOf(params({ section: doorLeaf(), frontMount: 'inset' })).y0).toBe(0)
  })

  // The overlay rule is about material, not about the mount setting: a cabinet with no fronts has
  // nothing in front of y = 0 however it is mounted.
  it('an overlay cabinet with no fronts reaches nowhere in front', () => {
    expect(boundsOf(params({ section: bareLeaf(), frontMount: 'overlay' })).y0).toBe(0)
  })

  // The case that rules out anchoring on the structural shell. The shell starts at floorZ = 100;
  // the toe kick fills the 100 mm below it, so the cabinet reaches the ground.
  it('a toe-kick cabinet reaches the floor, not its carcase bottom', () => {
    expect(boundsOf(params({ baseMode: 'toe-kick', toeKickHeight: 100 })).z0).toBe(0)
  })

  it('a ladder base reaches the floor too', () => {
    expect(boundsOf(params({ baseMode: 'ladder', toeKickHeight: 120 })).z0).toBe(0)
  })

  it('width and height are the params, untouched', () => {
    const b = boundsOf(params({ width: 900, height: 2100 }))
    expect([b.x0, b.x1, b.z1]).toEqual([0, 900, 2100])
  })
})
