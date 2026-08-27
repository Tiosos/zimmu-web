import { describe, expect, it } from 'vitest'
import { legacyToSection } from './migrateSections'
import { resolveSections, type Rect, type Section } from './sectionTree'

// A cabinet the v12 divider rules accept, so the migrated tree can be checked against the geometry
// `carcaseBoxes` used to produce from the same numbers.
const W = 600
const T = 18
const OPENING: Rect = { x0: T, x1: W - T, z0: T, z1: 700 }

function shape(s: Section): unknown {
  if (s.content.kind === 'leaf') return { size: s.size }
  return {
    size: s.size,
    axis: s.content.axis,
    division: s.content.division,
    children: s.content.children.map(shape),
  }
}

describe('legacyToSection', () => {
  it('a plain cabinet is a single leaf', () => {
    expect(shape(legacyToSection([], 0, W, T))).toEqual({ size: { kind: 'equal' } })
  })

  it('one divider becomes a vertical split of two panelled bays', () => {
    expect(shape(legacyToSection([0.5], 0, W, T))).toEqual({
      size: { kind: 'equal' },
      axis: 'vertical',
      division: 'panel',
      children: [{ size: { kind: 'percent', pct: 50 } }, { size: { kind: 'percent', pct: 50 } }],
    })
  })

  it('fixed shelves split each bay horizontally', () => {
    expect(shape(legacyToSection([], 2, W, T))).toEqual({
      size: { kind: 'equal' },
      axis: 'horizontal',
      division: 'panel',
      children: [
        { size: { kind: 'equal' } },
        { size: { kind: 'equal' } },
        { size: { kind: 'equal' } },
      ],
    })
  })

  it('dividers and shelves nest, shelves inside bays', () => {
    const root = legacyToSection([0.5], 1, W, T)
    if (root.content.kind !== 'split') throw new Error('unreachable')
    expect(root.content.axis).toBe('vertical')
    expect(root.content.children).toHaveLength(2)
    for (const bay of root.content.children) {
      if (bay.content.kind !== 'split') throw new Error('unreachable')
      expect(bay.content.axis).toBe('horizontal')
      expect(bay.content.children).toHaveLength(2)
    }
  })

  it('gives every section a distinct id', () => {
    const ids: string[] = []
    const walk = (s: Section) => {
      ids.push(s.id)
      if (s.content.kind === 'split') s.content.children.forEach(walk)
    }
    walk(legacyToSection([0.25, 0.5, 0.75], 3, W, T))
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The fractions are cumulative positions, not widths: [0.25, 0.5] means bays of 25%, 25%, 50%.
  // Asserted through the resolved geometry rather than through the percentages, because a section
  // percentage is a share of the *clear* span while a v12 divider is centred on a fraction of the
  // *gross* width. The same three bays are therefore not 25/25/50 of the tree's span, and a
  // conversion that wrote those numbers down would move every divider.
  it('turns cumulative divider positions into the bays v12 described', () => {
    const tree = resolveSections(legacyToSection([0.25, 0.5], 0, W, T), OPENING, () => T)
    expect(tree.divisions.map((d) => [d.rect.x0, d.rect.x1])).toEqual([
      [W * 0.25 - T / 2, W * 0.25 + T / 2],
      [W * 0.5 - T / 2, W * 0.5 + T / 2],
    ])
  })

  it('puts a lone divider exactly where the v12 generator centred it', () => {
    const tree = resolveSections(legacyToSection([0.4], 0, W, T), OPENING, () => T)
    expect(tree.divisions).toHaveLength(1)
    // 40% of 600 is 240, and the divider straddles it.
    expect(tree.divisions[0].rect.x0).toBeCloseTo(231, 9)
    expect(tree.divisions[0].rect.x1).toBeCloseTo(249, 9)
  })
})
