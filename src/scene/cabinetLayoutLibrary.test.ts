import { expect, it } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { openingLayout } from './openingLayouts'
import {
  appendLayouts,
  LAYOUT_FILE_LIMIT,
  layoutSummary,
  parseLayoutLibrary,
  parseLayoutSection,
  savedLayout,
  serializeLayoutLibrary,
} from './cabinetLayoutLibrary'

const item = () =>
  savedLayout(
    'Kitchen drawers',
    openingLayout(cabinet.params, cabinet.params.section.id, 'drawers').section,
    cabinet.params,
  )
const document = (value: unknown) =>
  JSON.stringify({ format: 'zimmu-cabinet-layouts', version: 1, layouts: [value] })
it('round-trips named layout snapshots without capturing dimensions as settings, materials or drawer overrides', () => {
  const params = structuredClone(cabinet.params)
  const section = openingLayout(params, params.section.id, 'drawers').section
  const entry = savedLayout('Kitchen drawers', section, params)
  expect(parseLayoutLibrary(serializeLayoutLibrary([entry]))).toEqual([entry])
  expect(entry.source).toEqual({ width: 600, height: 720, depth: 560 })
  expect(Object.keys(entry).sort()).toEqual([
    'createdAt',
    'id',
    'name',
    'section',
    'source',
    'updatedAt',
  ])
  const before = JSON.stringify(entry.section)
  section.content = { kind: 'leaf' }
  expect(JSON.stringify(entry.section)).toBe(before)
  expect(layoutSummary(entry.section)).toBe('3 openings · 0 doors · 3 drawer fronts · 0 shelves')
})
it('copies incoming entries into new identities and unique names without replacing existing entries', () => {
  const entry = item()
  const merged = appendLayouts([entry], [entry, entry])
  expect(merged[0]).toBe(entry)
  expect(merged.map((e) => e.name)).toEqual([
    'Kitchen drawers',
    'Kitchen drawers (2)',
    'Kitchen drawers (3)',
  ])
  expect(new Set(merged.map((e) => e.id)).size).toBe(3)
  expect(merged[1].section).toEqual(entry.section)
  expect(merged[1].section).not.toBe(entry.section)
})
it('accepts only supported document versions and bounded libraries and files', () => {
  expect(() => parseLayoutLibrary('{}')).toThrow('Unsupported')
  expect(() =>
    parseLayoutLibrary(
      JSON.stringify({ format: 'zimmu-cabinet-layouts', version: 2, layouts: [] }),
    ),
  ).toThrow('Unsupported')
  expect(() => parseLayoutLibrary(' '.repeat(LAYOUT_FILE_LIMIT + 1))).toThrow('512 KiB')
  expect(() => appendLayouts(Array.from({ length: 100 }, item), [item()])).toThrow('100 layouts')
  expect(() =>
    parseLayoutLibrary(
      JSON.stringify({
        format: 'zimmu-cabinet-layouts',
        version: 1,
        layouts: Array.from({ length: 101 }, item),
      }),
    ),
  ).toThrow('100 layouts')
  expect(() =>
    parseLayoutLibrary(
      JSON.stringify({
        format: 'zimmu-cabinet-layouts',
        version: 1,
        layouts: [item(), { ...item(), id: 'duplicate' }, { ...item(), id: 'duplicate' }],
      }),
    ),
  ).toThrow('unique')
})
it.each([
  (x: Record<string, unknown>) => {
    x.name = ' '
  },
  (x: Record<string, unknown>) => {
    x.name = 'x'.repeat(81)
  },
  (x: Record<string, unknown>) => {
    x.createdAt = -1
  },
  (x: Record<string, unknown>) => {
    x.source = { width: 0, height: 720, depth: 560 }
  },
  (x: Record<string, unknown>) => {
    x.source = { width: null, height: 720, depth: 560 }
  },
])('rejects malformed metadata without accepting a partial document', (change) => {
  const entry = { ...item() }
  change(entry)
  expect(() => parseLayoutLibrary(document(entry))).toThrow()
})
it('rejects unknown tree enums, invalid numeric sizes and malformed fronts/pin patterns', () => {
  const leaf = () => ({
    ...structuredClone(cabinet.params.section),
    interior: undefined,
    front: undefined,
  })
  for (const size of [
    { kind: 'fixed', mm: 0 },
    { kind: 'percent', pct: 101 },
    { kind: 'fixed', mm: NaN },
    { kind: 'other' },
  ])
    expect(() => parseLayoutSection({ ...leaf(), size })).toThrow()
  for (const front of [
    { kind: 'other' },
    { kind: 'door', leaves: 3, hinge: 'left' },
    { kind: 'door', leaves: 1, hinge: 'top' },
  ])
    expect(() => parseLayoutSection({ ...leaf(), front })).toThrow()
  for (const adjustable of [
    { shelves: -1, count: 8, rows: 2, pitch: 32, setback: 37, backSetback: 37 },
    { shelves: 1.5, count: 8, rows: 2, pitch: 32, setback: 37, backSetback: 37 },
    { shelves: 1, count: 8, rows: 3, pitch: 32, setback: 37, backSetback: 37 },
    { shelves: 1, count: 8, rows: 2, pitch: 64, setback: 37, backSetback: 37 },
  ])
    expect(() =>
      parseLayoutSection({ ...leaf(), interior: { fixedShelves: 0, adjustable } }),
    ).toThrow()
  expect(() =>
    parseLayoutSection({
      ...leaf(),
      content: {
        kind: 'split',
        axis: 'vertical',
        division: 'rail',
        children: [
          { ...leaf(), id: 'a' },
          { ...leaf(), id: 'b' },
        ],
      },
    }),
  ).toThrow('rail')
  expect(() =>
    parseLayoutSection({
      ...leaf(),
      content: { kind: 'split', axis: 'diagonal', division: 'panel', children: [leaf(), leaf()] },
    }),
  ).toThrow('division')
  expect(() =>
    parseLayoutSection({
      ...leaf(),
      content: { kind: 'split', axis: 'vertical', division: 'panel', children: [leaf(), leaf()] },
    }),
  ).toThrow('unique')
})
it('bounds tree depth and node count, refuses split-owned contents and drops unrecognized fields', () => {
  const leaf = () => ({
    ...cabinet.params.section,
    front: undefined,
    interior: undefined,
    id: crypto.randomUUID(),
  })
  let deep = leaf()
  for (let i = 0; i < 18; i++)
    deep = {
      ...leaf(),
      content: { kind: 'split', axis: 'horizontal', division: 'none', children: [deep, leaf()] },
    }
  expect(() => parseLayoutSection(deep)).toThrow('16 nested')
  const build = (depth: number): typeof deep =>
    depth
      ? {
          ...leaf(),
          content: {
            kind: 'split',
            axis: 'vertical',
            division: 'none',
            children: Array.from({ length: 8 }, () => build(depth - 1)),
          },
        }
      : leaf()
  expect(() => parseLayoutSection(build(3))).toThrow('256 openings')
  expect(() => parseLayoutSection({ ...build(1), front: { kind: 'drawer-front' } })).toThrow('leaf')
  expect(parseLayoutSection({ ...leaf(), unexpected: 'ignored' })).not.toHaveProperty('unexpected')
})
it('summarizes paired doors and both shelf types', () => {
  const p = openingLayout(cabinet.params, cabinet.params.section.id, 'double-door')
  expect(layoutSummary(p.section)).toContain('2 doors')
  expect(layoutSummary(p.section)).toContain('1 shelves')
})

it('rejects malformed or excessive divisions and leaf contents before importing', () => {
  const leaf = () => ({
    ...structuredClone(cabinet.params.section),
    front: undefined,
    interior: undefined,
    id: crypto.randomUUID(),
  })
  const split = (children: unknown, division: unknown = 'panel') => ({
    ...leaf(),
    content: { kind: 'split', axis: 'horizontal', division, children },
  })
  for (const children of [[], [leaf()], Array.from({ length: 9 }, leaf), {}])
    expect(() => parseLayoutSection(split(children))).toThrow('division')
  expect(() => parseLayoutSection(split([leaf(), leaf()], 'unknown'))).toThrow('division')
  expect(() => parseLayoutSection({ ...leaf(), content: { kind: 'unknown' } })).toThrow('content')
  expect(() => parseLayoutSection(null)).toThrow('object')
  expect(() => parseLayoutSection({ ...leaf(), id: ' ' })).toThrow('characters')
  expect(() =>
    parseLayoutSection(
      split([
        { ...leaf(), size: { kind: 'percent', pct: 60 } },
        { ...leaf(), size: { kind: 'percent', pct: 60 } },
      ]),
    ),
  ).toThrow('percentages')
  const interior = {
    fixedShelves: 0,
    adjustable: { shelves: 1, count: 8, rows: 2, pitch: 32, setback: 37, backSetback: 37 },
  }
  for (const changes of [
    { fixedShelves: 33 },
    { fixedShelves: -1 },
    { adjustable: { ...interior.adjustable, shelves: 33 } },
    { adjustable: { ...interior.adjustable, count: 1001 } },
    { adjustable: { ...interior.adjustable, setback: -1 } },
    { adjustable: { ...interior.adjustable, backSetback: Infinity } },
  ])
    expect(() => parseLayoutSection({ ...leaf(), interior: { ...interior, ...changes } })).toThrow()
})
it('accepts supported fronts and full interior data while refusing non-array libraries', () => {
  const source = structuredClone(cabinet.params.section)
  for (const front of [
    { kind: 'door', leaves: 1, hinge: 'right' },
    { kind: 'door', leaves: 2, hinge: 'left' },
    { kind: 'false-front' },
    { kind: 'panel' },
    { kind: 'drawer-front' },
  ])
    expect(parseLayoutSection({ ...source, front }).front).toEqual(front)
  expect(parseLayoutSection(source)).toEqual(source)
  expect(() =>
    parseLayoutLibrary(
      JSON.stringify({ format: 'zimmu-cabinet-layouts', version: 1, layouts: {} }),
    ),
  ).toThrow('100 layouts')
  expect(() => parseLayoutLibrary('null')).toThrow('object')
})
