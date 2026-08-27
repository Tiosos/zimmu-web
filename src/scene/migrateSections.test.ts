import { describe, expect, it } from 'vitest'
import { legacyToSection } from './migrateSections'
import type { Section } from './sectionTree'

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
    expect(shape(legacyToSection([], 0))).toEqual({ size: { kind: 'equal' } })
  })

  it('one divider becomes a vertical split of two panelled bays', () => {
    expect(shape(legacyToSection([0.5], 0))).toEqual({
      size: { kind: 'equal' },
      axis: 'vertical',
      division: 'panel',
      children: [{ size: { kind: 'percent', pct: 50 } }, { size: { kind: 'percent', pct: 50 } }],
    })
  })

  it('fixed shelves split each bay horizontally', () => {
    expect(shape(legacyToSection([], 2))).toEqual({
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
    const root = legacyToSection([0.5], 1)
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
    walk(legacyToSection([0.25, 0.5, 0.75], 3))
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The fractions are cumulative positions, not widths: [0.25, 0.5] means bays of 25%, 25%, 50%.
  it('turns cumulative divider positions into bay widths', () => {
    const root = legacyToSection([0.25, 0.5], 0)
    if (root.content.kind !== 'split') throw new Error('unreachable')
    expect(root.content.children.map((c) => c.size)).toEqual([
      { kind: 'percent', pct: 25 },
      { kind: 'percent', pct: 25 },
      { kind: 'percent', pct: 50 },
    ])
  })
})
