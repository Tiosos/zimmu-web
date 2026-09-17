import { describe, it, expect } from 'vitest'
import { runsOf } from './runs'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { resolvePlacement } from './resolvePlacement'
import type { Anchor, CarcaseComponent, Component, Scene } from './types'

// Asymmetric on purpose, for the reason panelThickness.test.ts exists: a run of identical Base
// 600s survives almost every wrong rule. These differ in width AND depth.
const widths = { a: 600, b: 450, c: 800, d: 300 }
const depths = { a: 560, b: 500, c: 600, d: 400 }

const cab = (id: 'a' | 'b' | 'c' | 'd', anchor?: Anchor): CarcaseComponent => ({
  kind: 'carcase',
  id: `cmp_${id}`,
  label: id.toUpperCase(),
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: { ...CARCASE_PRESETS[0].params, width: widths[id], depth: depths[id] },
  ...(anchor === undefined ? {} : { anchor }),
})

const to = (id: string, face: Anchor['face']): Anchor => ({
  to: `cmp_${id}`,
  face,
  gap: 0,
  offset: { u: 0, v: 0 },
})

const sceneOf = (components: Component[]): Scene =>
  resolvePlacement({
    parts: [],
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
    components,
  })

const runIds = (s: Scene) => runsOf(s.components, s.materials).map((r) => r.members)

describe('runsOf', () => {
  it('puts a right-anchored chain in one run, in geometric order', () => {
    const s = sceneOf([cab('a'), cab('b', to('a', 'right')), cab('c', to('b', 'right'))])
    expect(runIds(s)).toEqual([['cmp_a', 'cmp_b', 'cmp_c']])
  })

  it('reads a run the same whichever end it was built from', () => {
    // B anchored to A's LEFT, so B lands to the left of A: geometric order is B then A.
    const s = sceneOf([cab('a'), cab('b', to('a', 'left'))])
    expect(runIds(s)).toEqual([['cmp_b', 'cmp_a']])
  })

  it('joins a target with a neighbour on each side into one run of three', () => {
    const s = sceneOf([cab('a'), cab('b', to('a', 'left')), cab('c', to('a', 'right'))])
    expect(runIds(s)).toEqual([['cmp_b', 'cmp_a', 'cmp_c']])
  })

  it('starts a new run at a front anchor', () => {
    const s = sceneOf([cab('a'), cab('b', to('a', 'right')), cab('c', to('b', 'front'))])
    expect(runIds(s)).toEqual([['cmp_a', 'cmp_b'], ['cmp_c']])
  })

  it('gives a free-placed cabinet a run of its own', () => {
    const s = sceneOf([cab('a'), cab('b')])
    expect(runIds(s)).toHaveLength(2)
  })

  it('ignores an anchor naming a component that is not there', () => {
    const s = sceneOf([cab('a', to('missing', 'right'))])
    expect(runIds(s)).toEqual([['cmp_a']])
  })

  it('ignores an anchor across a parent boundary', () => {
    const outside: CarcaseComponent = { ...cab('b', to('a', 'right')), parentId: 'cmp_group' }
    const s = sceneOf([cab('a'), outside])
    expect(runIds(s)).toEqual([['cmp_a'], ['cmp_b']])
  })

  it('terminates on a cycle rather than looping forever', () => {
    // resolvePlacement detaches both members of a 2-cycle, so what reaches runsOf is two free
    // cabinets — but runsOf must be total on the raw input too, which this asserts directly.
    const raw = [cab('a', to('b', 'right')), cab('b', to('a', 'right'))]
    expect(
      runsOf(raw, PRESET_MATERIALS)
        .flatMap((r) => r.members)
        .sort(),
    ).toEqual(['cmp_a', 'cmp_b'])
  })

  it('lists every carcase exactly once across all runs', () => {
    const s = sceneOf([cab('a'), cab('b', to('a', 'right')), cab('c'), cab('d', to('c', 'left'))])
    const all = runIds(s).flat()
    expect(all).toHaveLength(4)
    expect(new Set(all).size).toBe(4)
  })
})
