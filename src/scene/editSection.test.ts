import { describe, expect, it } from 'vitest'
import { setSectionSize, splitSection, unsplitSection } from './editSection'
import type { Section } from './sectionTree'

const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const
const SHELVES = {
  fixedShelves: 0,
  adjustable: {
    shelves: 2,
    count: 10,
    rows: 2 as 1 | 2,
    pitch: 32 as const,
    setback: 37,
    backSetback: 37,
  },
}

const leaf = (id: string): Section => ({ id, size: { kind: 'equal' }, content: { kind: 'leaf' } })

const childrenOf = (s: Section): Section[] => {
  if (s.content.kind !== 'split') throw new Error('expected a split')
  return s.content.children
}

describe('splitSection', () => {
  it('turns a leaf into a split with the requested axis, division and children', () => {
    const next = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    if (next.content.kind !== 'split') throw new Error('expected a split')
    expect(next.content.axis).toBe('vertical')
    expect(next.content.division).toBe('panel')
    expect(next.content.children).toHaveLength(2)
    for (const c of next.content.children) expect(c.content.kind).toBe('leaf')
  })

  it('gives every child a fresh id, distinct from its parent and each other', () => {
    const next = splitSection(leaf('a'), 'a', 'horizontal', 'panel', 3)
    const ids = childrenOf(next).map((c) => c.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).not.toContain('a')
    for (const id of ids) expect(id.startsWith('sec_')).toBe(true)
  })

  // A user who splits a doored bay in two should get two doored bays, not one silently undoored
  // one. Nothing they set is lost, and removing a door they did not want is one click.
  it('carries the front and the interior onto every child', () => {
    const doored: Section = { ...leaf('a'), front: DOOR, interior: SHELVES }
    const next = splitSection(doored, 'a', 'vertical', 'panel', 2)
    for (const c of childrenOf(next)) {
      expect(c.front).toEqual(DOOR)
      expect(c.interior).toEqual(SHELVES)
    }
  })

  // Only leaves are read, so a split section holding a front is a field nothing will ever look at —
  // and a field nothing looks at is one that will be wrong when something finally does.
  it('clears the parent’s own front and interior', () => {
    const doored: Section = { ...leaf('a'), front: DOOR, interior: SHELVES }
    const next = splitSection(doored, 'a', 'vertical', 'panel', 2)
    expect(next.front).toBeUndefined()
    expect(next.interior).toBeUndefined()
  })

  it('splits a section nested deep in the tree and leaves its siblings alone', () => {
    const root = splitSection(leaf('root'), 'root', 'vertical', 'panel', 2)
    const [first, second] = childrenOf(root)
    const next = splitSection(root, second.id, 'horizontal', 'panel', 2)
    expect(childrenOf(next)[0]).toEqual(first)
    expect(childrenOf(next)[1].content.kind).toBe('split')
  })

  // The id naming nothing is ordinary, not an error: a stale selection outlives the tree it names.
  it('leaves the tree alone when the id names nothing', () => {
    const root = leaf('a')
    expect(splitSection(root, 'nobody', 'vertical', 'panel', 2)).toEqual(root)
  })

  // `validateSection` already rejects a split with fewer than two children; refusing here keeps a
  // tree that cannot be built from ever existing, rather than building one and reporting it later.
  it('refuses to split into fewer than two', () => {
    const root = leaf('a')
    expect(splitSection(root, 'a', 'vertical', 'panel', 1)).toEqual(root)
  })

  // Splitting a section that is already split replaces its children. The alternative — nesting
  // another split inside it — is what the user gets by selecting a child and splitting that.
  it('replaces the children of a section that is already split', () => {
    const once = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    const twice = splitSection(once, 'a', 'horizontal', 'rail', 3)
    if (twice.content.kind !== 'split') throw new Error('expected a split')
    expect(twice.content.axis).toBe('horizontal')
    expect(twice.content.division).toBe('rail')
    expect(twice.content.children).toHaveLength(3)
  })
})

describe('unsplitSection', () => {
  it('collapses a split back to a leaf', () => {
    const root = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    const next = unsplitSection(root, 'a')
    expect(next.content.kind).toBe('leaf')
    expect(next.id).toBe('a')
  })

  // The mirror of the split rule, so split-then-unsplit returns a section carrying what it carried
  // rather than a bare one.
  it('adopts the first child’s front and interior', () => {
    const doored: Section = { ...leaf('a'), front: DOOR, interior: SHELVES }
    const split = splitSection(doored, 'a', 'vertical', 'panel', 2)
    const back = unsplitSection(split, 'a')
    expect(back.front).toEqual(DOOR)
    expect(back.interior).toEqual(SHELVES)
  })

  it('does nothing to a section that is already a leaf', () => {
    const root = leaf('a')
    expect(unsplitSection(root, 'a')).toEqual(root)
  })

  it('leaves the tree alone when the id names nothing', () => {
    const root = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    expect(unsplitSection(root, 'nobody')).toEqual(root)
  })
})

describe('setSectionSize', () => {
  it('sets one section’s size and no other', () => {
    const root = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    const [first, second] = childrenOf(root)
    const next = setSectionSize(root, first.id, { kind: 'fixed', mm: 300 })
    expect(childrenOf(next)[0].size).toEqual({ kind: 'fixed', mm: 300 })
    expect(childrenOf(next)[1].size).toEqual(second.size)
  })

  it('leaves the tree alone when the id names nothing', () => {
    const root = splitSection(leaf('a'), 'a', 'vertical', 'panel', 2)
    expect(setSectionSize(root, 'nobody', { kind: 'fixed', mm: 300 })).toEqual(root)
  })
})
