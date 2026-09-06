import { describe, expect, it } from 'vitest'
import {
  freshSectionIds,
  newSectionId,
  resolveSections,
  validateSection,
  type Rect,
  type Section,
  type SectionSize,
} from './sectionTree'

const OPENING: Rect = { x0: 0, x1: 1000, z0: 0, z1: 2000 }

function leaf(id: string, size: SectionSize = { kind: 'equal' }): Section {
  return { id, size, content: { kind: 'leaf' } }
}

describe('resolveSections', () => {
  it('a single leaf fills the opening and yields no divisions', () => {
    const root = leaf('a')
    const resolved = resolveSections(root, OPENING, () => 18)
    expect(resolved.rects.get('a')).toEqual(OPENING)
    expect(resolved.divisions).toEqual([])
  })

  it('two equal children of a vertical panel split at 18mm thickness', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a'), leaf('b')],
      },
    }
    const resolved = resolveSections(root, OPENING, () => 18)
    expect(resolved.rects.get('a')).toEqual({ x0: 0, x1: 491, z0: 0, z1: 2000 })
    expect(resolved.rects.get('b')).toEqual({ x0: 509, x1: 1000, z0: 0, z1: 2000 })
    expect(resolved.divisions).toHaveLength(1)
    expect(resolved.divisions[0]).toEqual({
      parentId: 'root',
      index: 0,
      axis: 'vertical',
      kind: 'panel',
      rect: { x0: 491, x1: 509, z0: 0, z1: 2000 },
    })
  })

  it('a horizontal split with fixed/equal/equal and division none stacks bottom-up', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'horizontal',
        division: 'none',
        children: [leaf('a', { kind: 'fixed', mm: 150 }), leaf('b'), leaf('c')],
      },
    }
    const resolved = resolveSections(root, OPENING, () => 18)
    expect(resolved.rects.get('a')).toEqual({ x0: 0, x1: 1000, z0: 0, z1: 150 })
    expect(resolved.rects.get('b')).toEqual({ x0: 0, x1: 1000, z0: 150, z1: 1075 })
    expect(resolved.rects.get('c')).toEqual({ x0: 0, x1: 1000, z0: 1075, z1: 2000 })
    expect(resolved.divisions).toEqual([])
  })

  it('percent children of a none split take their share', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [
          leaf('a', { kind: 'percent', pct: 25 }),
          leaf('b', { kind: 'percent', pct: 75 }),
        ],
      },
    }
    const resolved = resolveSections(root, OPENING, () => 18)
    expect(resolved.rects.get('a')).toEqual({ x0: 0, x1: 250, z0: 0, z1: 2000 })
    expect(resolved.rects.get('b')).toEqual({ x0: 250, x1: 1000, z0: 0, z1: 2000 })
  })

  // The asymmetric case a uniform fixture cannot catch: a thickness function that answers
  // differently per division index.
  it('an asymmetric thickness function on a three-child vertical panel split', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a'), leaf('b'), leaf('c')],
      },
    }
    const thicknessOf = (_parentId: string, i: number): number => (i === 0 ? 18 : 25)
    const resolved = resolveSections(root, OPENING, thicknessOf)

    const spanOf = (id: string): number => {
      const r = resolved.rects.get(id)!
      return r.x1 - r.x0
    }
    expect(spanOf('a')).toBeCloseTo(319, 6)
    expect(spanOf('b')).toBeCloseTo(319, 6)
    expect(spanOf('c')).toBeCloseTo(319, 6)

    expect(resolved.divisions.map((d) => d.rect.x1 - d.rect.x0)).toEqual([18, 25])
  })

  it('children plus divisions exactly fill their parent at any depth, no gap or overlap', () => {
    const innerId = newSectionId()
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [
          leaf('fixed-child', { kind: 'fixed', mm: 300 }),
          {
            id: innerId,
            size: { kind: 'equal' },
            content: {
              kind: 'split',
              axis: 'horizontal',
              division: 'panel',
              children: [leaf('inner-a'), leaf('inner-b'), leaf('inner-c')],
            },
          },
        ],
      },
    }
    const resolved = resolveSections(root, OPENING, () => 18)

    // Root's own children (fixed-child, inner split) plus root's divisions fill OPENING on x.
    const rootChildSpans = resolved.childRects('root').reduce((s, r) => s + (r.x1 - r.x0), 0)
    const rootDivisionSpans = resolved.divisions
      .filter((d) => d.parentId === 'root')
      .reduce((s, d) => s + (d.rect.x1 - d.rect.x0), 0)
    expect(rootChildSpans + rootDivisionSpans).toBeCloseTo(OPENING.x1 - OPENING.x0, 6)

    // The inner split's children plus its divisions fill the inner rect on z.
    const innerRect = resolved.rects.get(innerId)!
    const innerChildSpans = resolved.childRects(innerId).reduce((s, r) => s + (r.z1 - r.z0), 0)
    const innerDivisionSpans = resolved.divisions
      .filter((d) => d.parentId === innerId)
      .reduce((s, d) => s + (d.rect.z1 - d.rect.z0), 0)
    expect(innerChildSpans + innerDivisionSpans).toBeCloseTo(innerRect.z1 - innerRect.z0, 6)
  })
})

describe('validateSection', () => {
  it('accepts a valid tree', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a'), leaf('b')],
      },
    }
    expect(validateSection(root)).toEqual([])
  })

  it('rejects a split with one child', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: { kind: 'split', axis: 'vertical', division: 'panel', children: [leaf('a')] },
    }
    expect(validateSection(root)).toContain('a split needs at least two sections')
  })

  it('rejects a fixed size of zero', () => {
    const root = leaf('a', { kind: 'fixed', mm: 0 })
    expect(validateSection(root)).toContain('a fixed section size must be positive')
  })

  it('rejects percentages summing over 100 within one split', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [
          leaf('a', { kind: 'percent', pct: 60 }),
          leaf('b', { kind: 'percent', pct: 60 }),
        ],
      },
    }
    expect(validateSection(root)).toContain('section percentages must not exceed 100')
  })

  it('rejects a rail division on a vertical split', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'rail',
        children: [leaf('a'), leaf('b')],
      },
    }
    expect(validateSection(root)).toContain('a rail division needs a horizontal split')
  })

  it('rejects duplicate ids', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('dup'), leaf('dup')],
      },
    }
    expect(validateSection(root)).toContain('section ids must be unique')
  })

  it('collects more than one distinct problem rather than stopping at the first', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'rail',
        children: [leaf('a', { kind: 'fixed', mm: -5 }), leaf('b')],
      },
    }
    const errors = validateSection(root)
    expect(errors).toContain('a fixed section size must be positive')
    expect(errors).toContain('a rail division needs a horizontal split')
    expect(errors.length).toBeGreaterThan(1)
  })
})

describe('boundsOf', () => {
  it('a lone leaf is bounded by the shell on all four sides', () => {
    const resolved = resolveSections(leaf('a'), OPENING, () => 18)
    expect(resolved.boundsOf('a')).toEqual({
      left: { kind: 'shell' },
      right: { kind: 'shell' },
      bottom: { kind: 'shell' },
      top: { kind: 'shell' },
    })
  })

  it('two vertical siblings share the division between them and meet the shell outward', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a'), leaf('b')],
      },
    }
    const resolved = resolveSections(root, OPENING, () => 18)
    expect(resolved.boundsOf('a')).toEqual({
      left: { kind: 'shell' },
      right: { kind: 'division', parentId: 'root', index: 0 },
      bottom: { kind: 'shell' },
      top: { kind: 'shell' },
    })
    expect(resolved.boundsOf('b')).toEqual({
      left: { kind: 'division', parentId: 'root', index: 0 },
      right: { kind: 'shell' },
      bottom: { kind: 'shell' },
      top: { kind: 'shell' },
    })
  })

  it('the middle of a three-way horizontal split is bounded by a division below and above', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'horizontal',
        division: 'panel',
        children: [leaf('a'), leaf('b'), leaf('c')],
      },
    }
    const resolved = resolveSections(root, OPENING, () => 18)
    expect(resolved.boundsOf('b')).toEqual({
      left: { kind: 'shell' },
      right: { kind: 'shell' },
      bottom: { kind: 'division', parentId: 'root', index: 0 },
      top: { kind: 'division', parentId: 'root', index: 1 },
    })
  })

  it('a nested section inherits the bounds its ancestors do not supply', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [
          {
            id: 'bay',
            size: { kind: 'equal' },
            content: {
              kind: 'split',
              axis: 'horizontal',
              division: 'panel',
              children: [leaf('lower'), leaf('upper')],
            },
          },
          leaf('right-bay'),
        ],
      },
    }
    const resolved = resolveSections(root, OPENING, () => 18)
    expect(resolved.boundsOf('upper')).toEqual({
      left: { kind: 'shell' },
      right: { kind: 'division', parentId: 'root', index: 0 },
      bottom: { kind: 'division', parentId: 'bay', index: 0 },
      top: { kind: 'shell' },
    })
  })

  it('a split with no division leaves its children bounded by the shell', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [leaf('a'), leaf('b')],
      },
    }
    const resolved = resolveSections(root, OPENING, () => 18)
    expect(resolved.boundsOf('a').right).toEqual({ kind: 'shell' })
    expect(resolved.boundsOf('b').left).toEqual({ kind: 'shell' })
  })
})

describe('freshSectionIds', () => {
  // A preset's tree is built once at module evaluation, so two cabinets added from one preset would
  // otherwise share every section id — and role keys carry those ids, so both cabinets would name
  // the same openings and the same `front-{sectionId}-0` boards.
  const tree: Section = {
    id: 'sec_root',
    size: { kind: 'equal' },
    interior: { adjustable: { shelves: 2, count: 10, rows: 1, setback: 37, backSetback: 37 } },
    front: { kind: 'door', leaves: 2, hinge: 'left' },
    content: {
      kind: 'split',
      axis: 'vertical',
      division: 'panel',
      children: [leaf('sec_a'), leaf('sec_b')],
    },
  } as Section

  const idsOf = (s: Section): string[] => [
    s.id,
    ...(s.content.kind === 'split' ? s.content.children.flatMap(idsOf) : []),
  ]

  it('replaces every id in the tree, root and children alike', () => {
    const fresh = freshSectionIds(tree)
    const before = idsOf(tree)
    const after = idsOf(fresh)
    expect(after).toHaveLength(before.length)
    // No id survives, and none is reused within the new tree either.
    expect(after.filter((id) => before.includes(id))).toEqual([])
    expect(new Set(after).size).toBe(after.length)
  })

  it('carries size, interior, front and shape through untouched', () => {
    const fresh = freshSectionIds(tree)
    expect(fresh.size).toEqual(tree.size)
    expect(fresh.interior).toEqual(tree.interior)
    expect(fresh.front).toEqual(tree.front)
    expect(fresh.content.kind).toBe('split')
    if (fresh.content.kind !== 'split' || tree.content.kind !== 'split') throw new Error('shape')
    expect(fresh.content.axis).toBe(tree.content.axis)
    expect(fresh.content.division).toBe(tree.content.division)
    expect(fresh.content.children).toHaveLength(2)
  })

  it('leaves the tree it was handed alone', () => {
    const before = JSON.parse(JSON.stringify(tree))
    freshSectionIds(tree)
    expect(tree).toEqual(before)
  })

  // Two cabinets from one preset is the case this exists for, so it is the case asserted.
  it('gives two cabinets built from one tree no id in common', () => {
    const a = idsOf(freshSectionIds(tree))
    const b = idsOf(freshSectionIds(tree))
    expect(a.filter((id) => b.includes(id))).toEqual([])
  })
})
