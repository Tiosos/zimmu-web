import { describe, expect, it } from 'vitest'
import {
  defaultInterior,
  sectionInteriors,
  sectionOpenings,
  setInterior,
  type AdjustableSpec,
  type InteriorSpec,
} from './sectionInterior'
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

describe('sectionOpenings', () => {
  // A vertical split into two bays, the left one shelved above a fixed shelf. Three leaves, of
  // which `sectionInteriors` would list exactly one.
  const tree = (): Section => ({
    id: 'root',
    size: { kind: 'equal' },
    content: {
      kind: 'split',
      axis: 'vertical',
      division: 'panel',
      children: [
        {
          id: 'left',
          size: { kind: 'equal' },
          content: {
            kind: 'split',
            axis: 'horizontal',
            division: 'panel',
            children: [leaf('lower'), leaf('upper', spec())],
          },
        },
        leaf('right'),
      ],
    },
  })

  const openingsOf = (root: Section) =>
    sectionOpenings(root, resolveSections(root, OPENING, () => 18))

  // The difference from `sectionInteriors`, and the whole reason this exists: an opening with no
  // shelving is exactly the one a user wants to give some.
  it('lists every leaf, shelved or not', () => {
    expect(openingsOf(tree()).map((o) => o.sectionId)).toEqual(['lower', 'upper', 'right'])
  })

  it('carries the spec of a leaf that has one and nothing for a leaf that does not', () => {
    const byId = new Map(openingsOf(tree()).map((o) => [o.sectionId, o.spec]))
    expect(byId.get('upper')).toEqual(spec())
    expect(byId.get('lower')).toBeUndefined()
    expect(byId.get('right')).toBeUndefined()
  })

  it('never lists a split section, which holds no interior of its own', () => {
    const ids = openingsOf(tree()).map((o) => o.sectionId)
    expect(ids).not.toContain('root')
    expect(ids).not.toContain('left')
  })

  // Bottom-left first, reading up then across — the order the user sees them in, not the order the
  // tree happens to be written in. A picker numbered by tree order would put "Opening 2" somewhere
  // different depending on how the same cabinet was built.
  it('orders openings left to right, bottom to top', () => {
    const rects = openingsOf(tree()).map((o) => o.rect)
    expect(rects[0].z0).toBeLessThan(rects[1].z0)
    expect(rects[0].x0).toBe(rects[1].x0)
    expect(rects[2].x0).toBeGreaterThan(rects[0].x0)
  })
})

describe('setInterior', () => {
  const root: Section = {
    id: 'root',
    size: { kind: 'equal' },
    content: {
      kind: 'split',
      axis: 'horizontal',
      division: 'panel',
      children: [leaf('a'), leaf('b', spec())],
    },
  }

  it('puts a spec on the section named and on no other', () => {
    const next = setInterior(root, 'a', spec({ shelves: 5 }))
    if (next.content.kind !== 'split') throw new Error('structure changed')
    expect(next.content.children[0].interior).toEqual(spec({ shelves: 5 }))
    expect(next.content.children[1].interior).toEqual(spec())
  })

  it('replaces a spec the section already had', () => {
    const next = setInterior(root, 'b', spec({ count: 99 }))
    if (next.content.kind !== 'split') throw new Error('structure changed')
    expect(next.content.children[1].interior).toEqual(spec({ count: 99 }))
  })

  it('leaves the tree alone when the id names nothing', () => {
    expect(setInterior(root, 'nobody', spec())).toEqual(root)
  })

  // The split itself can carry one, and the generator will ignore it — only leaves are listed. The
  // guard belongs where a section is chosen, not here, so this states what the function does.
  it('touches structure not at all', () => {
    const next = setInterior(root, 'a', spec())
    expect(next.id).toBe(root.id)
    expect(next.content.kind).toBe('split')
  })
})

describe('defaultInterior', () => {
  // The one statement of what a cabinet means by "shelving" before anyone has said otherwise: the
  // presets and the panel both read it, so a preset cannot drift from what the panel creates.
  it('states a 32 mm system with two rows', () => {
    expect(defaultInterior(0).adjustable).toEqual({
      shelves: 0,
      count: 10,
      rows: 2,
      pitch: 32,
      setback: 37,
      backSetback: 37,
    })
  })

  it('takes the shelf count from its argument', () => {
    expect(defaultInterior(3).adjustable.shelves).toBe(3)
  })
})
