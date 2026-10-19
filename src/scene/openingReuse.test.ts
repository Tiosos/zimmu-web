import { regenerateDrawers } from './regenerateDrawers'
import { expect, it } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS, DEFAULT_FRAME } from './carcasePresets'
import { defaultInterior } from './sectionInterior'
import { openingGeometry, openingLayout, openingLayoutErrors } from './openingLayouts'
import {
  clearOpening,
  copyOpening,
  equalizeNestedOpenings,
  lockOpeningSizes,
  mirrorOpening,
  openingLeaves,
  pasteOpening,
  repeatOpeningContents,
} from './openingReuse'
import type { Section, CarcaseParams } from './types'

const leaf = (id: string, hinge: 'left' | 'right' = 'left'): Section => ({
  id,
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
  front: { kind: 'door', leaves: 1, hinge },
  interior: defaultInterior(1),
})
function fixture(): CarcaseParams {
  return {
    ...cabinet.params,
    section: {
      id: 'root',
      size: { kind: 'equal' },
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'panel',
        children: [leaf('a'), { ...leaf('b', 'right'), size: { kind: 'percent', pct: 60 } }],
      },
    },
  }
}
const children = (root: Section) => {
  if (root.content.kind !== 'split') throw Error('split expected')
  return root.content.children
}

it('copies an immutable snapshot and ignores a stale selection', () => {
  const p = fixture()
  const snapshot = copyOpening(p.section, 'root')!
  children(p.section)[0].front = undefined
  expect(children(snapshot)[0].front).toMatchObject({ kind: 'door' })
  expect(copyOpening(p.section, 'missing')).toBeNull()
})
it('pastes nested structure with fresh descendants while preserving destination identity, size and cabinet settings', () => {
  const p = fixture()
  const source = copyOpening(p.section, 'root')!
  const next = pasteOpening(p, 'b', source, 'layout')
  const target = children(next.section)[1]
  expect(target.id).toBe('b')
  expect(target.size).toEqual({ kind: 'percent', pct: 60 })
  expect(children(target).map((c) => c.id)).not.toEqual(['a', 'b'])
  expect(children(next.section)[0]).toBe(children(p.section)[0])
  expect(next.width).toBe(p.width)
  expect(source).toEqual(p.section)
  expect(children(target)[0].front).toEqual(children(source)[0].front)
})
it.each(['front', 'shelving'] as const)(
  'pastes only %s and refuses partial group pastes',
  (mode) => {
    const p = fixture()
    const source = { ...leaf('copy'), front: undefined, interior: defaultInterior(3) }
    const next = pasteOpening(p, 'a', source, mode)
    const result = children(next.section)[0]
    if (mode === 'front') {
      expect(result.front).toBeUndefined()
      expect(result.interior).toBe(children(p.section)[0].interior)
    } else {
      expect(result.interior?.adjustable.shelves).toBe(3)
      expect(result.front).toBe(children(p.section)[0].front)
    }
    expect(pasteOpening(p, 'root', source, mode)).toBe(p)
    expect(pasteOpening(p, 'a', p.section, mode)).toBe(p)
  },
)
it('mirrors matching nested axes and single door handing, and is reversible', () => {
  const p = fixture()
  const nested = {
    ...p,
    section: {
      ...p.section,
      id: 'outer',
      content: {
        kind: 'split' as const,
        axis: 'horizontal' as const,
        division: 'panel' as const,
        children: [p.section, leaf('c')],
      },
    },
  }
  const horizontal = mirrorOpening(nested, 'outer', 'vertical')
  const inner = children(horizontal.section)[0]
  expect(children(inner).map((c) => c.id)).toEqual(['b', 'a'])
  expect(children(inner)[1].front).toMatchObject({ hinge: 'right' })
  const vertical = mirrorOpening(nested, 'outer', 'horizontal')
  expect(children(vertical.section).map((c) => c.id)).toEqual(['c', 'root'])
  expect(children(children(vertical.section)[1])[0].front).toMatchObject({ hinge: 'left' })
  expect(mirrorOpening(horizontal, 'outer', 'vertical')).toEqual(nested)
})
it.each(['fronts', 'shelving', 'contents'] as const)(
  'clears %s without changing divisions, IDs or sizes',
  (mode) => {
    const p = fixture()
    const next = clearOpening(p, 'root', mode)
    expect(children(next.section).map((c) => c.id)).toEqual(['a', 'b'])
    expect(children(next.section)[1].size).toEqual(children(p.section)[1].size)
    for (const node of openingLeaves(next.section)) {
      expect(node.front === undefined).toBe(mode !== 'shelving')
      expect(node.interior === undefined).toBe(mode !== 'fronts')
    }
    expect(clearOpening(next, 'root', mode)).toBe(next)
  },
)
it.each(['front', 'shelving'] as const)(
  'repeats %s only to leaf siblings and preserves source',
  (mode) => {
    const p = fixture()
    const source = children(p.section)[0]
    source.interior = defaultInterior(4)
    const next = repeatOpeningContents(p, 'a', mode)
    expect(children(next.section)[0]).toBe(source)
    const target = children(next.section)[1]
    if (mode === 'front') expect(target.front).toEqual(source.front)
    else expect(target.interior).toEqual(source.interior)
    expect(repeatOpeningContents(p, 'root', mode)).toBe(p)
    const mixed = pasteOpening(p, 'b', p.section, 'layout')
    if (mixed.section.content.kind !== 'split') throw Error('split expected')
    mixed.section.content.children.push(leaf('c', 'right'))
    expect(repeatOpeningContents(mixed, 'a', mode)).toBe(mixed)
  },
)
it('locks actual sizes using the resolved axis and equalizes every nested child while retaining the selected size', () => {
  const p = fixture()
  const tree = openingGeometry(p, PRESET_MATERIALS, [], cabinet.id).tree!
  const next = lockOpeningSizes(p, 'a', tree)
  for (const [index, child] of children(next.section).entries()) {
    expect(child.size.kind).toBe('fixed')
    if (child.size.kind === 'fixed') expect(child.size.mm).toBeCloseTo([218.4, 327.6][index])
  }
  expect(openingGeometry(next, PRESET_MATERIALS, [], cabinet.id).errors).toEqual([])
  const nested = pasteOpening(next, 'b', p.section, 'layout')
  const equal = equalizeNestedOpenings(nested, 'b')
  expect(children(equal.section)[0]).toBe(children(nested.section)[0])
  expect(children(equal.section)[1].size).toEqual(children(next.section)[1].size)
  expect(children(children(equal.section)[1]).every((c) => c.size.kind === 'equal')).toBe(true)
  expect(lockOpeningSizes(p, 'a', { ...tree, rects: new Map() })).toBe(p)
})
it('cleans only affected independent frame layouts for structural and front edits, preserving shelving frame layouts', () => {
  const base = fixture()
  const p = {
    ...base,
    frame: {
      ...DEFAULT_FRAME,
      layout: {
        a: { content: { kind: 'leaf' as const }, id: 'zone', size: { kind: 'equal' as const } },
        b: { content: { kind: 'leaf' as const }, id: 'zone', size: { kind: 'equal' as const } },
      },
    },
  }
  // The cleanup operates on section-keyed layouts regardless of their zone contents.
  const next = pasteOpening(p, 'a', leaf('source'), 'layout')
  expect(next.frame?.layout?.a).toBeUndefined()
  expect(next.frame?.layout?.b).toBe(p.frame.layout.b)
  expect(clearOpening(p, 'a', 'shelving').frame).toBe(p.frame)
  expect(clearOpening(p, 'a', 'fronts').frame?.layout?.a).toBeUndefined()
})
it('rejects copied drawer layouts that cannot fit their destination', () => {
  const p = fixture()
  const drawers = openingLayout(cabinet.params, cabinet.params.section.id, 'drawers')
  const next = pasteOpening({ ...p, height: 200 }, 'a', drawers.section, 'layout')
  expect(openingLayoutErrors(next, 'a', PRESET_MATERIALS, [], cabinet.id).join(' ')).toContain(
    'drawer boxes do not fit',
  )
})
it('returns the original cabinet for stale targets across every operation', () => {
  const p = fixture()
  const tree = openingGeometry(p, PRESET_MATERIALS, [], cabinet.id).tree!
  expect(pasteOpening(p, 'missing', p.section, 'layout')).toBe(p)
  expect(mirrorOpening(p, 'missing', 'vertical')).toBe(p)
  expect(clearOpening(p, 'missing', 'contents')).toBe(p)
  expect(repeatOpeningContents(p, 'missing', 'front')).toBe(p)
  expect(lockOpeningSizes(p, 'missing', tree)).toBe(p)
  expect(equalizeNestedOpenings(p, 'missing')).toBe(p)
})

it('locks height rather than width for horizontal groups and retains paired door handing', () => {
  const p = fixture()
  if (p.section.content.kind !== 'split') throw Error('split expected')
  p.section.content.axis = 'horizontal'
  const pair = children(p.section)[0]
  pair.front = { kind: 'door', leaves: 2, hinge: 'left' }
  const tree = openingGeometry(p, PRESET_MATERIALS, [], cabinet.id).tree!
  const locked = lockOpeningSizes(p, 'a', tree)
  const size = children(locked.section)[0].size
  expect(size.kind).toBe('fixed')
  if (size.kind === 'fixed') expect(size.mm).toBeCloseTo((584 - 18) * 0.4)
  expect(children(mirrorOpening(p, 'root', 'vertical').section)[0].front).toEqual(pair.front)
})

it('preserves existing drawer configuration during validation instead of checking replacement defaults', () => {
  const p = openingLayout(cabinet.params, cabinet.params.section.id, 'drawers')
  const generated = regenerateDrawers({
    materials: PRESET_MATERIALS,
    parts: [],
    components: [{ ...cabinet, params: p }],
    joints: [],
    hardware: [],
  })
  const drawers = generated.components.filter((c) => c.kind === 'drawer')
  expect(
    openingLayoutErrors(p, p.section.id, PRESET_MATERIALS, generated.parts, cabinet.id, drawers),
  ).toEqual([])
  const invalid = drawers.map((drawer) => ({
    ...drawer,
    params: { ...drawer.params, boxHeight: 1 },
  }))
  expect(
    openingLayoutErrors(
      p,
      p.section.id,
      PRESET_MATERIALS,
      generated.parts,
      cabinet.id,
      invalid,
    ).join(' '),
  ).toContain('drawer boxes do not fit')
})
