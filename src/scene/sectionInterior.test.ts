import { describe, expect, it } from 'vitest'
import { sectionInteriors, type AdjustableSpec, type InteriorSpec } from './sectionInterior'
import { resolveSections, type Rect, type Section } from './sectionTree'

const OPENING: Rect = { x0: 0, x1: 1000, z0: 0, z1: 2000 }

function spec(overrides: Partial<AdjustableSpec> = {}): InteriorSpec {
  return {
    adjustable: {
      shelves: 2,
      count: 4,
      rows: 1,
      pitch: 32,
      setback: 20,
      backSetback: 20,
      ...overrides,
    },
  }
}

function leaf(id: string, interior?: InteriorSpec): Section {
  return { id, size: { kind: 'equal' }, content: { kind: 'leaf' }, interior }
}

describe('sectionInteriors', () => {
  it('lists a lone leaf that asks for shelves, with the opening rect and shell bounds', () => {
    const root = leaf('a', spec())
    const tree = resolveSections(root, OPENING, () => 18)

    const result = sectionInteriors(root, tree)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      sectionId: 'a',
      rect: OPENING,
      bounds: {
        left: { kind: 'shell' },
        right: { kind: 'shell' },
        bottom: { kind: 'shell' },
        top: { kind: 'shell' },
      },
      spec: spec(),
    })
  })

  it('does not list a leaf that asks for nothing', () => {
    const withoutInterior = leaf('a')
    const withZeroSpec = leaf('b', spec({ shelves: 0, count: 0 }))
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [withoutInterior, withZeroSpec],
      },
    }
    const tree = resolveSections(root, OPENING, () => 18)

    expect(sectionInteriors(root, tree)).toEqual([])
  })

  it('never lists a split section, only its qualifying children', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [leaf('a', spec()), leaf('b')],
      },
    }
    const tree = resolveSections(root, OPENING, () => 18)

    const result = sectionInteriors(root, tree)

    expect(result.map((r) => r.sectionId)).toEqual(['a'])
  })

  it('lists every qualifying leaf at every depth of a nested tree', () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'none',
        children: [
          leaf('shallow', spec()),
          {
            id: 'nested',
            size: { kind: 'equal' },
            content: {
              kind: 'split',
              axis: 'horizontal',
              division: 'none',
              children: [leaf('deep-yes', spec({ shelves: 1, count: 0 })), leaf('deep-no')],
            },
          },
        ],
      },
    }
    const tree = resolveSections(root, OPENING, () => 18)

    const result = sectionInteriors(root, tree)

    expect(result.map((r) => r.sectionId).sort()).toEqual(['deep-yes', 'shallow'])
  })

  it("reports a child beside a partition's bounds as the division, not the shell", () => {
    const root: Section = {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a', spec()), leaf('b', spec())],
      },
    }
    const tree = resolveSections(root, OPENING, () => 18)

    const result = sectionInteriors(root, tree)
    const a = result.find((r) => r.sectionId === 'a')!
    const b = result.find((r) => r.sectionId === 'b')!

    expect(a.bounds.right).toEqual({ kind: 'division', parentId: 'root', index: 0 })
    expect(a.bounds.left).toEqual({ kind: 'shell' })
    expect(b.bounds.left).toEqual({ kind: 'division', parentId: 'root', index: 0 })
    expect(b.bounds.right).toEqual({ kind: 'shell' })
  })
})
