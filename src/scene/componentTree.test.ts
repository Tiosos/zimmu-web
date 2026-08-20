import { describe, it, expect } from 'vitest'
import type { Component, BoardPart } from './types'
import {
  componentsById,
  ancestorsOf,
  descendantIds,
  wouldCycle,
  promoteOrphans,
  breakComponentCycles,
  isNodeVisible,
} from './componentTree'

function cmp(id: string, parentId: string | null): Component {
  return {
    id,
    kind: 'group',
    label: id,
    parentId,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
  }
}

function board(id: string, parentId: string | null): BoardPart {
  return {
    kind: 'board',
    id,
    label: id,
    length: 100,
    width: 50,
    thickness: 18,
    material: '',
    color: '#c8a97e',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId,
    driven: false,
  }
}

describe('componentsById', () => {
  it('indexes every component by id', () => {
    const map = componentsById([cmp('a', null), cmp('b', 'a')])
    expect(map.get('b')?.parentId).toBe('a')
    expect(map.size).toBe(2)
  })
})

describe('ancestorsOf', () => {
  it('returns root-last ancestors of a nested part', () => {
    const map = componentsById([cmp('a', null), cmp('b', 'a')])
    expect(ancestorsOf(board('p', 'b'), map).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('returns empty for a top-level part', () => {
    expect(ancestorsOf(board('p', null), componentsById([]))).toEqual([])
  })

  it('stops rather than looping when the chain is cyclic', () => {
    const map = componentsById([cmp('a', 'b'), cmp('b', 'a')])
    expect(() => ancestorsOf(board('p', 'a'), map)).toThrow(/depth/i)
  })
})

describe('descendantIds', () => {
  it('collects nested components and parts', () => {
    const components = [cmp('a', null), cmp('b', 'a'), cmp('c', null)]
    const parts = [board('p1', 'b'), board('p2', 'c')]
    const got = descendantIds('a', components, parts)
    expect(got.componentIds).toEqual(['b'])
    expect(got.partIds).toEqual(['p1'])
  })
})

describe('wouldCycle', () => {
  it('rejects reparenting a component into its own descendant', () => {
    const components = [cmp('a', null), cmp('b', 'a')]
    expect(wouldCycle(components, 'a', 'b')).toBe(true)
  })

  it('rejects reparenting a component into itself', () => {
    expect(wouldCycle([cmp('a', null)], 'a', 'a')).toBe(true)
  })

  it('allows an unrelated reparent', () => {
    const components = [cmp('a', null), cmp('b', null)]
    expect(wouldCycle(components, 'b', 'a')).toBe(false)
  })
})

describe('promoteOrphans', () => {
  it('promotes a part whose parentId does not resolve, never dropping it', () => {
    const scene = {
      parts: [board('p', 'ghost')],
      materials: {},
      hardware: [],
      joints: [],
      components: [],
    }
    const out = promoteOrphans(scene)
    expect(out.parts).toHaveLength(1)
    expect(out.parts[0].parentId).toBeNull()
  })

  it('promotes a component whose parent is gone', () => {
    const scene = {
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('b', 'ghost')],
    }
    expect(promoteOrphans(scene).components[0].parentId).toBeNull()
  })

  it('leaves a well-formed tree untouched by identity', () => {
    const scene = {
      parts: [board('p', 'a')],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('a', null)],
    }
    expect(promoteOrphans(scene)).toBe(scene)
  })
})

describe('breakComponentCycles', () => {
  it('roots a two-component cycle so the tree becomes walkable', () => {
    const scene = {
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('a', 'b'), cmp('b', 'a')],
    }
    const out = breakComponentCycles(scene)
    expect(() => ancestorsOf(out.components[0], componentsById(out.components))).not.toThrow()
    expect(out.components.some((c) => c.parentId === null)).toBe(true)
  })

  it('roots a three-component cycle', () => {
    const scene = {
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('a', 'c'), cmp('b', 'a'), cmp('c', 'b')],
    }
    const out = breakComponentCycles(scene)
    const byId = componentsById(out.components)
    for (const c of out.components) {
      expect(() => ancestorsOf(c, byId)).not.toThrow()
    }
  })

  it('never drops a component', () => {
    const scene = {
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('a', 'b'), cmp('b', 'a')],
    }
    expect(breakComponentCycles(scene).components).toHaveLength(2)
  })

  it('leaves an acyclic tree untouched by identity', () => {
    const scene = {
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('a', null), cmp('b', 'a'), cmp('c', 'b')],
    }
    expect(breakComponentCycles(scene)).toBe(scene)
  })

  it('leaves a self-parented component walkable', () => {
    const scene = {
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
      components: [cmp('a', 'a')],
    }
    const out = breakComponentCycles(scene)
    expect(out.components[0].parentId).toBeNull()
  })
})

describe('isNodeVisible', () => {
  it('is true for a visible top-level part', () => {
    expect(isNodeVisible(board('p', null), componentsById([]))).toBe(true)
  })

  it('is false for a part hidden in its own right', () => {
    expect(isNodeVisible({ ...board('p', null), visible: false }, componentsById([]))).toBe(false)
  })

  it('is false for a visible part inside a hidden component', () => {
    const hidden = { ...cmp('a', null), visible: false }
    expect(isNodeVisible(board('p', 'a'), componentsById([hidden]))).toBe(false)
  })

  it('is false when any ancestor in the chain is hidden, not just the nearest', () => {
    const outer = { ...cmp('a', null), visible: false }
    const inner = cmp('b', 'a')
    expect(isNodeVisible(board('p', 'b'), componentsById([outer, inner]))).toBe(false)
  })

  it('is true when every ancestor is visible', () => {
    expect(isNodeVisible(board('p', 'b'), componentsById([cmp('a', null), cmp('b', 'a')]))).toBe(
      true,
    )
  })

  it('applies to a component itself, not only a part', () => {
    const outer = { ...cmp('a', null), visible: false }
    expect(isNodeVisible(cmp('b', 'a'), componentsById([outer, cmp('b', 'a')]))).toBe(false)
  })
})
