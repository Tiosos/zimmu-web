import { describe, it, expect } from 'vitest'
import { BLIND_CLEARANCE, blindWidthOf, cornerWarnings } from './blindCorner'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { splitSection } from './editSection'
import { setFrontOn } from './sectionInterior'
import type { Anchor, CarcaseComponent, CarcaseParams, Component } from './types'

const base = CARCASE_PRESETS[0].params

// A blind unit: one carcase split in two, the left leaf wearing a door and the right leaf nothing.
// splitSection(root, id, axis, division, count) — 'vertical' puts the children side by side and
// 'panel' makes a real partition between them.
function blindParams(width: number): CarcaseParams {
  const split = splitSection(base.section, base.section.id, 'vertical', 'panel', 2)
  if (split.content.kind !== 'split') throw new Error('fixture did not split')
  const [accessible, blind] = split.content.children
  let tree = setFrontOn(split, accessible.id, { kind: 'door', leaves: 1, hinge: 'left' })
  tree = setFrontOn(tree, blind.id, undefined)
  return { ...base, width, section: tree }
}

const cab = (
  id: string,
  params: CarcaseParams,
  over: Partial<CarcaseComponent> = {},
): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params,
  ...over,
})

const frontAnchor = (to: string): Anchor => ({ to, face: 'front', gap: 0, offset: { u: 0, v: 0 } })

const warn = (cs: Component[]) => cornerWarnings(cs, PRESET_MATERIALS)

describe('blindWidthOf', () => {
  it('counts only the leaf wearing no door', () => {
    const w = blindWidthOf(cab('cmp_b', blindParams(1200)), PRESET_MATERIALS)
    expect(w).not.toBeNull()
    // Half of a 1200 cabinet, less the sides and the partition it shares.
    expect(w!).toBeGreaterThan(500)
    expect(w!).toBeLessThan(600)
  })

  it('counts nothing when every leaf wears a door', () => {
    const allDoors = {
      ...base,
      section: setFrontOn(base.section, base.section.id, {
        kind: 'door' as const,
        leaves: 1 as const,
        hinge: 'left' as const,
      }),
    }
    expect(blindWidthOf(cab('cmp_t', allDoors), PRESET_MATERIALS)).toBe(0)
  })
})

describe('cornerWarnings', () => {
  it('says nothing when the blind portion is wide enough', () => {
    const blind = cab('cmp_blind', blindParams(1200))
    const ret = cab('cmp_ret', { ...base, depth: 400 }, {
      rotation: { x: 0, y: 0, z: 90 },
      anchor: frontAnchor('cmp_blind'),
    })
    expect(warn([blind, ret])).toEqual([])
  })

  it('flags a blind portion narrower than the return depth', () => {
    const blind = cab('cmp_blind', blindParams(700))
    const ret = cab('cmp_ret', { ...base, depth: 560 }, {
      rotation: { x: 0, y: 0, z: 90 },
      anchor: frontAnchor('cmp_blind'),
    })
    const w = warn([blind, ret])
    expect(w).toHaveLength(1)
    expect(w[0].cabinetId).toBe('cmp_ret')
    expect(w[0].targetId).toBe('cmp_blind')
    expect(w[0].required).toBeGreaterThan(w[0].available)
  })

  it('ignores a left or right anchor — a straight run has no blind portion', () => {
    const blind = cab('cmp_blind', blindParams(700))
    const ret = cab('cmp_ret', { ...base, depth: 560 }, {
      anchor: { ...frontAnchor('cmp_blind'), face: 'right' },
    })
    expect(warn([blind, ret])).toEqual([])
  })

  it('ignores a free-placed cabinet', () => {
    expect(warn([cab('cmp_blind', blindParams(700)), cab('cmp_ret', base)])).toEqual([])
  })

  it('flags a front anchor onto a cabinet with no blind leaf', () => {
    const allDoors = {
      ...base,
      section: setFrontOn(base.section, base.section.id, {
        kind: 'door' as const,
        leaves: 1 as const,
        hinge: 'left' as const,
      }),
    }
    const target = cab('cmp_t', allDoors)
    const ret = cab('cmp_ret', { ...base, depth: 560 }, {
      rotation: { x: 0, y: 0, z: 90 },
      anchor: frontAnchor('cmp_t'),
    })
    const w = warn([target, ret])
    expect(w).toHaveLength(1)
    expect(w[0].available).toBe(0)
  })

  // The depth is the RETURN cabinet's, not the blind unit's. A fixture where both are the preset
  // depth cannot tell the two apart, so the return is deliberately shallower than its target.
  it('measures the return cabinet depth, not the target depth', () => {
    const blind = cab('cmp_blind', { ...blindParams(700), depth: 900 })
    const shallow = cab('cmp_ret', { ...base, depth: 300 }, {
      rotation: { x: 0, y: 0, z: 90 },
      anchor: frontAnchor('cmp_blind'),
    })
    expect(warn([blind, shallow])).toEqual([])
  })

  it('ignores an anchor naming a component that is not there', () => {
    expect(warn([cab('cmp_ret', base, { anchor: frontAnchor('cmp_missing') })])).toEqual([])
  })

  it('states the clearance as a number the rule reads', () => {
    expect(BLIND_CLEARANCE).toBeGreaterThanOrEqual(0)
  })
})
