import { describe, it, expect } from 'vitest'
import { nearestCarcase } from './nearestCarcase'
import { componentsById } from './componentTree'
import { CARCASE_PRESETS } from './carcasePresets'
import type { Component, Part } from './types'

const carcase: Component = {
  kind: 'carcase',
  id: 'cmp_cab',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

const group: Component = {
  kind: 'group',
  id: 'cmp_grp',
  label: 'Inner',
  parentId: 'cmp_cab',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
}

const partUnder = (parentId: string | null): Part => ({
  kind: 'board',
  id: 'board_1',
  label: 'B',
  length: 100,
  width: 50,
  thickness: 18,
  grain: 'length',
  material: '',
  color: '#888888',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId,
  driven: false,
})

describe('nearestCarcase', () => {
  const byId = componentsById([carcase, group])

  it('finds the carcase when it is the immediate parent', () => {
    expect(nearestCarcase(partUnder('cmp_cab'), byId)?.id).toBe('cmp_cab')
  })

  // The whole point. `ancestorsOf(...)[0]` answers 'cmp_grp' here, which is what both BOM
  // consumers do today and why a nested part is attributed to the wrong thing.
  it('skips a non-carcase ancestor and keeps walking up', () => {
    expect(nearestCarcase(partUnder('cmp_grp'), byId)?.id).toBe('cmp_cab')
  })

  // 'nearest', not 'outermost': a carcase can be reparented under another carcase, and the two
  // answers differ only here. Returning the last carcase in the chain passes every other case.
  it('answers the innermost carcase when carcases nest', () => {
    const outer: Component = { ...carcase, id: 'cmp_outer' }
    const inner: Component = { ...carcase, id: 'cmp_inner', parentId: 'cmp_outer' }
    const nested = componentsById([outer, inner])
    expect(nearestCarcase(partUnder('cmp_inner'), nested)?.id).toBe('cmp_inner')
  })

  it('is null for a top-level part', () => {
    expect(nearestCarcase(partUnder(null), byId)).toBeNull()
  })

  it('is null when no ancestor is a carcase', () => {
    const orphanGroup: Component = { ...group, id: 'cmp_lone', parentId: null }
    const only = componentsById([orphanGroup])
    expect(nearestCarcase(partUnder('cmp_lone'), only)).toBeNull()
  })
})
