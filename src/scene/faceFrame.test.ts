import { describe, it, expect } from 'vitest'
import { faceFrameGeometry } from './faceFrame'
import { splitSection } from './editSection'
import { newSectionId, resolveSections } from './sectionTree'
import type { Rect, Section } from './sectionTree'
import type { FaceFrameParams } from './types'

// Asymmetric on purpose: every frame width differs, so using an outer width for a mid member (or
// swapping stile/rail widths) cannot survive the fixtures.
const FRAME: FaceFrameParams = {
  stileWidth: 44,
  railWidth: 32,
  midStileWidth: 56,
  midRailWidth: 38,
}

// A base unit above a 100 mm toe kick.
const OUTER: Rect = { x0: 0, x1: 600, z0: 100, z1: 720 }
// The same cabinet's 18 mm carcase opening. Mid members align to divisions resolved HERE, not to a
// second solve inside the smaller face-frame opening.
const CARCASE_OPENING: Rect = { x0: 18, x1: 582, z0: 118, z1: 702 }

const leaf = (id = newSectionId(), front?: Section['front']): Section => ({
  id,
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
  ...(front === undefined ? {} : { front }),
})

const treeOf = (root: Section) => resolveSections(root, CARCASE_OPENING, () => 18)

const geometry = (root: Section) =>
  faceFrameGeometry(root, OUTER, FRAME, root.content.kind === 'split' ? treeOf(root) : undefined)

const rectOf = (g: ReturnType<typeof faceFrameGeometry>, role: string): Rect => {
  expect(g).not.toBeNull()
  const m = g!.members.find((x) => x.role === role)
  expect(m, `no member ${role}`).toBeDefined()
  return m!.rect
}

describe('faceFrameGeometry', () => {
  it('emits four members for a single-opening cabinet', () => {
    const g = geometry(leaf())
    expect(g).not.toBeNull()
    expect(g!.members.map((m) => m.role).sort()).toEqual([
      'rail-bottom',
      'rail-top',
      'stile-left',
      'stile-right',
    ])
  })

  it('runs the stiles full height and fits the rails between them', () => {
    const g = geometry(leaf())
    expect(rectOf(g, 'stile-left')).toEqual({ x0: 0, x1: 44, z0: 100, z1: 720 })
    expect(rectOf(g, 'stile-right')).toEqual({ x0: 556, x1: 600, z0: 100, z1: 720 })
    expect(rectOf(g, 'rail-top')).toEqual({ x0: 44, x1: 556, z0: 688, z1: 720 })
  })

  it('starts at the rectangle it was given, not at zero', () => {
    expect(rectOf(geometry(leaf()), 'stile-left').z0).toBe(100)
    expect(rectOf(geometry(leaf()), 'rail-bottom')).toEqual({
      x0: 44,
      x1: 556,
      z0: 100,
      z1: 132,
    })
  })

  it('leaves an opening inside the frame', () => {
    const g = geometry(leaf())!
    const rect = [...g.openings.values()][0]
    expect(rect).toEqual({ x0: 44, x1: 556, z0: 132, z1: 688 })
    expect(rect.z0).toBe(rectOf(g, 'rail-bottom').z1)
    expect(rect.z1).toBe(rectOf(g, 'rail-top').z0)
    expect(rect.x0).toBe(rectOf(g, 'stile-left').x1)
    expect(rect.x1).toBe(rectOf(g, 'stile-right').x0)
  })

  it('keys the opening by the section it belongs to', () => {
    const root = leaf()
    expect([...geometry(root)!.openings.keys()]).toEqual([root.id])
  })

  it('answers null for a frameless cabinet', () => {
    expect(faceFrameGeometry(leaf(), OUTER, undefined)).toBeNull()
  })

  it('declines when the outer members leave no opening', () => {
    expect(faceFrameGeometry(leaf(), { ...OUTER, x1: 80 }, FRAME)).toBeNull()
    expect(faceFrameGeometry(leaf(), { ...OUTER, z1: 150 }, FRAME)).toBeNull()
    expect(faceFrameGeometry(leaf(), { ...OUTER, x1: 88 }, FRAME)).toBeNull()
    expect(faceFrameGeometry(leaf(), { ...OUTER, z1: 164 }, FRAME)).toBeNull()
  })

  it('declines a zero-width outer member', () => {
    expect(faceFrameGeometry(leaf(), OUTER, { ...FRAME, stileWidth: 0 })).toBeNull()
  })

  it('requires resolved carcase geometry for a split rather than guessing', () => {
    const root = leaf('root')
    const split = splitSection(root, root.id, 'vertical', 'panel', 2)
    expect(faceFrameGeometry(split, OUTER, FRAME)).toBeNull()
  })

  it('centres a mid stile on the carcase partition and uses the mid-stile width', () => {
    const root = leaf('root')
    const split = splitSection(root, root.id, 'vertical', 'panel', 2)
    const g = geometry(split)!
    const role = `stile-${root.id}-0`
    // The 18 mm partition is x 291..309, centred at 300. The mid stile is 56, not outer 44.
    expect(rectOf(g, role)).toEqual({ x0: 272, x1: 328, z0: 132, z1: 688 })
    const [left, right] = split.content.kind === 'split' ? split.content.children : []
    expect(g.openings.get(left.id)).toEqual({ x0: 44, x1: 272, z0: 132, z1: 688 })
    expect(g.openings.get(right.id)).toEqual({ x0: 328, x1: 556, z0: 132, z1: 688 })
  })

  it('centres a mid rail on the carcase division and uses the mid-rail width', () => {
    const root = leaf('root')
    const split = splitSection(root, root.id, 'horizontal', 'panel', 2)
    const g = geometry(split)!
    const role = `rail-${root.id}-0`
    // The 18 mm division is z 401..419, centred at 410. The mid rail is 38, not outer 32.
    expect(rectOf(g, role)).toEqual({ x0: 44, x1: 556, z0: 391, z1: 429 })
  })

  it('clips a nested member to its parent framed opening', () => {
    const root = leaf('root')
    const horizontal = splitSection(root, root.id, 'horizontal', 'panel', 2)
    expect(horizontal.content.kind).toBe('split')
    if (horizontal.content.kind !== 'split') return
    const top = horizontal.content.children[1]
    const mixed = splitSection(horizontal, top.id, 'vertical', 'panel', 2)
    const g = geometry(mixed)!
    const rail = rectOf(g, `rail-${root.id}-0`)
    const stile = rectOf(g, `stile-${top.id}-0`)
    // The nested stile starts above the parent rail; it does not cross the lower opening.
    expect(stile.z0).toBe(rail.z1)
    expect(stile.z1).toBe(688)
    expect(stile.x1 - stile.x0).toBe(FRAME.midStileWidth)
    expect(g.openings.size).toBe(3)
  })

  it('emits no member for division:none and keeps the resolved boundary', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [leaf('left'), leaf('right')],
      },
    }
    const g = geometry(root)!
    expect(g.members).toHaveLength(4)
    expect(g.openings.get('left')?.x1).toBe(300)
    expect(g.openings.get('right')?.x0).toBe(300)
  })

  it('declines when a mid member consumes its parent opening', () => {
    const root = leaf('root')
    const split = splitSection(root, root.id, 'vertical', 'panel', 2)
    expect(
      faceFrameGeometry(split, OUTER, { ...FRAME, midStileWidth: 600 }, treeOf(split)),
    ).toBeNull()
  })

  it('gives a drawer-front leaf the same clear frame opening as any other leaf', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [
          leaf('door', { kind: 'door', leaves: 1, hinge: 'left' }),
          leaf('drawer', { kind: 'drawer-front' }),
        ],
      },
    }
    const g = faceFrameGeometry(root, OUTER, FRAME, treeOf(root))
    expect(g).not.toBeNull()
    expect(g!.openings.get('drawer')).toEqual({ x0: 328, x1: 556, z0: 132, z1: 688 })
  })

  it('resolves a drawer-over-pair face layout without structural divisions', () => {
    const root = leaf('one')
    const frame: FaceFrameParams = {
      ...FRAME,
      layout: {
        one: {
          id: 'zone-root',
          size: { kind: 'equal' },
          content: {
            kind: 'split',
            axis: 'horizontal',
            children: [
              {
                id: 'zone-lower',
                size: { kind: 'equal' },
                content: {
                  kind: 'split',
                  axis: 'vertical',
                  children: [
                    {
                      id: 'door-left',
                      size: { kind: 'equal' },
                      front: { kind: 'door', leaves: 1, hinge: 'left' },
                      content: { kind: 'leaf' },
                    },
                    {
                      id: 'door-right',
                      size: { kind: 'equal' },
                      front: { kind: 'door', leaves: 1, hinge: 'right' },
                      content: { kind: 'leaf' },
                    },
                  ],
                },
              },
              {
                id: 'drawer-top',
                size: { kind: 'fixed', mm: 140 },
                front: { kind: 'drawer-front' },
                content: { kind: 'leaf' },
              },
            ],
          },
        },
      },
    }
    const g = faceFrameGeometry(root, OUTER, frame)!
    expect(g.openings).toEqual(new Map([['one', { x0: 44, x1: 556, z0: 132, z1: 688 }]]))
    expect(rectOf(g, 'rail-zone-zone-root-0')).toEqual({
      x0: 44,
      x1: 556,
      z0: 510,
      z1: 548,
    })
    expect(rectOf(g, 'stile-zone-zone-lower-0')).toEqual({
      x0: 272,
      x1: 328,
      z0: 132,
      z1: 510,
    })
    expect(g.frontOpenings.get('drawer-top')?.rect).toEqual({
      x0: 44,
      x1: 556,
      z0: 548,
      z1: 688,
    })
    expect(g.frontOpenings.get('door-left')?.rect).toEqual({
      x0: 44,
      x1: 272,
      z0: 132,
      z1: 510,
    })
    expect(g.frontOpenings.get('door-right')?.rect).toEqual({
      x0: 328,
      x1: 556,
      z0: 132,
      z1: 510,
    })
  })

  it('declines a frame-zone layout whose fixed children do not fit', () => {
    const root = leaf('one')
    expect(
      faceFrameGeometry(root, OUTER, {
        ...FRAME,
        layout: {
          one: {
            id: 'bad',
            size: { kind: 'equal' },
            content: {
              kind: 'split',
              axis: 'horizontal',
              children: [
                { id: 'a', size: { kind: 'fixed', mm: 400 }, content: { kind: 'leaf' } },
                { id: 'b', size: { kind: 'fixed', mm: 400 }, content: { kind: 'leaf' } },
              ],
            },
          },
        },
      }),
    ).toBeNull()
  })

  it('adds a frame-only pair stile without creating a structural section', () => {
    const root = leaf('pair', { kind: 'door', leaves: 2, hinge: 'left' })
    const g = faceFrameGeometry(root, OUTER, { ...FRAME, pairStile: true })!
    expect(g.openings.size).toBe(1)
    expect(g.openings.get('pair')).toEqual({ x0: 44, x1: 556, z0: 132, z1: 688 })
    expect(rectOf(g, 'stile-pair-pair')).toEqual({ x0: 272, x1: 328, z0: 132, z1: 688 })
    expect(g.leafOpenings.get('pair|0')).toEqual({ x0: 44, x1: 272, z0: 132, z1: 688 })
    expect(g.leafOpenings.get('pair|1')).toEqual({ x0: 328, x1: 556, z0: 132, z1: 688 })
  })

  it('keeps legacy pair geometry when the independent pair stile is absent', () => {
    const root = leaf('pair', { kind: 'door', leaves: 2, hinge: 'left' })
    const legacy = faceFrameGeometry(root, OUTER, FRAME)!
    const explicitOff = faceFrameGeometry(root, OUTER, { ...FRAME, pairStile: false })!
    expect(legacy).toEqual(explicitOff)
    expect(legacy.members.some((m) => m.role === 'stile-pair-pair')).toBe(false)
    expect(legacy.leafOpenings.size).toBe(0)
  })

  it('declines a pair stile that consumes the framed opening', () => {
    const root = leaf('pair', { kind: 'door', leaves: 2, hinge: 'left' })
    expect(
      faceFrameGeometry(root, OUTER, { ...FRAME, pairStile: true, midStileWidth: 600 }),
    ).toBeNull()
  })

  it('accepts a leaf wearing a door', () => {
    expect(geometry(leaf('door', { kind: 'door', leaves: 1, hinge: 'left' }))).not.toBeNull()
  })

  it('is idempotent', () => {
    const root = leaf('root')
    const split = splitSection(root, root.id, 'vertical', 'panel', 2)
    expect(geometry(split)).toEqual(geometry(split))
  })
})
