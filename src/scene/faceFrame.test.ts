import { describe, it, expect } from 'vitest'
import { faceFrameGeometry } from './faceFrame'
import { splitSection } from './editSection'
import { newSectionId } from './sectionTree'
import type { Rect, Section } from './sectionTree'
import type { FaceFrameParams } from './types'

// Asymmetric on purpose, for the reason panelThickness.test.ts exists: a frame whose stiles and
// rails are the same width survives almost every wrong rule. 44 and 32 differ, and differ from
// every figure in the rectangle below.
const FRAME: FaceFrameParams = {
  stileWidth: 44,
  railWidth: 32,
  midStileWidth: 56,
  midRailWidth: 38,
}

// A base unit above a 100 mm toe kick: z0 is NOT 0, which is what catches a frame that runs to
// the ground over the kick.
const OUTER: Rect = { x0: 0, x1: 600, z0: 100, z1: 720 }

const leaf = (): Section => ({
  id: newSectionId(),
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
})

const rectOf = (g: ReturnType<typeof faceFrameGeometry>, role: string): Rect => {
  expect(g).not.toBeNull()
  const m = g!.members.find((x) => x.role === role)
  expect(m, `no member ${role}`).toBeDefined()
  return m!.rect
}

describe('faceFrameGeometry', () => {
  it('emits four members for a single-opening cabinet', () => {
    const g = faceFrameGeometry(leaf(), OUTER, FRAME)
    expect(g).not.toBeNull()
    expect(g!.members.map((m) => m.role).sort()).toEqual([
      'rail-bottom',
      'rail-top',
      'stile-left',
      'stile-right',
    ])
  })

  it('runs the stiles full height and fits the rails between them', () => {
    const g = faceFrameGeometry(leaf(), OUTER, FRAME)
    const left = rectOf(g, 'stile-left')
    const right = rectOf(g, 'stile-right')
    const top = rectOf(g, 'rail-top')

    expect(left).toEqual({ x0: 0, x1: 44, z0: 100, z1: 720 })
    expect(right).toEqual({ x0: 556, x1: 600, z0: 100, z1: 720 })
    // A rail stops at the stiles; it does not run the cabinet's full width.
    expect(top.x0).toBe(44)
    expect(top.x1).toBe(556)
    expect(top).toEqual({ x0: 44, x1: 556, z0: 688, z1: 720 })
  })

  // The outer rectangle is `floorZ`, which already accounts for the kick. Pinning the floor here
  // catches a frame that computes its own and gets the base mode wrong.
  it('starts at the rectangle it was given, not at zero', () => {
    expect(rectOf(faceFrameGeometry(leaf(), OUTER, FRAME), 'stile-left').z0).toBe(100)
    expect(rectOf(faceFrameGeometry(leaf(), OUTER, FRAME), 'rail-bottom')).toEqual({
      x0: 44,
      x1: 556,
      z0: 100,
      z1: 132,
    })
  })

  it('leaves an opening inside the frame', () => {
    const g = faceFrameGeometry(leaf(), OUTER, FRAME)!
    expect(g.openings.size).toBe(1)
    const rect = [...g.openings.values()][0]
    expect(rect).toEqual({ x0: 44, x1: 556, z0: 132, z1: 688 })
    // The opening meets the members exactly — no gap, no overlap.
    expect(rect.z0).toBe(rectOf(g, 'rail-bottom').z1)
    expect(rect.z1).toBe(rectOf(g, 'rail-top').z0)
    expect(rect.x0).toBe(rectOf(g, 'stile-left').x1)
    expect(rect.x1).toBe(rectOf(g, 'stile-right').x0)
  })

  it('keys the opening by the section it belongs to', () => {
    const root = leaf()
    expect([...faceFrameGeometry(root, OUTER, FRAME)!.openings.keys()]).toEqual([root.id])
  })

  // `frame === undefined` IS frameless, the same rule anchors use for detached.
  it('answers null for a frameless cabinet', () => {
    expect(faceFrameGeometry(leaf(), OUTER, undefined)).toBeNull()
  })

  // Declines rather than guessing, exactly as a drawer with no runner emits no boards.
  it('declines when the stiles leave no opening', () => {
    expect(faceFrameGeometry(leaf(), { ...OUTER, x1: 80 }, FRAME)).toBeNull()
  })

  it('declines when the rails leave no opening', () => {
    expect(faceFrameGeometry(leaf(), { ...OUTER, z1: 150 }, FRAME)).toBeNull()
  })

  // The boundary itself. Negative openings fail `<` and `<=` alike, so only an opening of exactly
  // zero tells them apart — 88 wide leaves 44 + 44 of stile and nothing between them.
  it('declines an opening of exactly zero', () => {
    expect(faceFrameGeometry(leaf(), { ...OUTER, x1: 88 }, FRAME)).toBeNull()
    expect(faceFrameGeometry(leaf(), { ...OUTER, z1: 164 }, FRAME)).toBeNull()
  })

  it('declines a zero-width member', () => {
    expect(faceFrameGeometry(leaf(), OUTER, { ...FRAME, stileWidth: 0 })).toBeNull()
  })

  // Stage 1 only. Divisions arrive in stage 2; until then a split cabinet is refused rather than
  // given a frame that ignores its own partitions.
  it('declines a cabinet whose tree splits', () => {
    const root = leaf()
    const split = splitSection(root, root.id, 'vertical', 'panel', 2)
    expect(faceFrameGeometry(split, OUTER, FRAME)).toBeNull()
  })

  // Also stage 1 only, and a SEPARATE branch: a drawer is a leaf, so the split guard above does
  // not catch it. Stage 3 sizes a drawer box to the framed opening; until then the cabinet
  // declines rather than emitting a box that passes through a frame nobody measured it against.
  it('declines a leaf wearing a drawer front', () => {
    const root: Section = { ...leaf(), front: { kind: 'drawer-front' } }
    expect(faceFrameGeometry(root, OUTER, FRAME)).toBeNull()
  })

  it('accepts a leaf wearing a door', () => {
    const root: Section = { ...leaf(), front: { kind: 'door', leaves: 1, hinge: 'left' } }
    expect(faceFrameGeometry(root, OUTER, FRAME)).not.toBeNull()
  })

  it('is idempotent', () => {
    const root = leaf()
    expect(faceFrameGeometry(root, OUTER, FRAME)).toEqual(faceFrameGeometry(root, OUTER, FRAME))
  })
})
