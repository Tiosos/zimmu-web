import { expect, it } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from './carcasePresets'
import { worldBoundsOf } from './carcaseWorldBounds'
import { resolvePlacement } from './resolvePlacement'
import { PLACEMENT_ALIGNMENTS } from './placementTools'
import {
  acceptLayout,
  layoutCabinets,
  layoutDraft,
  previewLayout,
  sortLayout,
  stageLayout,
} from './layoutTools'
import type { CarcaseComponent, Scene } from './types'
const c = (id: string, x = 0, y = 0, z = 0): CarcaseComponent => ({
  ...cabinet,
  id,
  label: id,
  position: { x, y, z },
})
const sceneOf = (
  components: CarcaseComponent[] = [c('a'), c('b', 1000, 900, 800), c('c', 3000, 3000, 3000)],
): Scene => ({ components, parts: [], joints: [], hardware: [], materials: PRESET_MATERIALS })
const ids = ['a', 'b', 'c']
const get = (s: Scene, id: string) =>
  s.components.find((item) => item.id === id) as CarcaseComponent
const box = (s: Scene, id: string) => worldBoundsOf(get(s, id), s.materials)
const bounds = (s: Scene, id: string, axis: 'x' | 'y' | 'z') => {
  const b = box(s, id)
  return axis === 'x' ? [b.x0, b.x1] : axis === 'y' ? [b.y0, b.y1] : [b.z0, b.z1]
}

it.each(['x', 'y', 'z'] as const)(
  'arranges %s occupied envelopes with unequal sizes and preserves off-axis coordinates',
  (axis) => {
    const s = sceneOf()
    s.components[1] = {
      ...c('b', 1000, 900, 800),
      rotation: { x: 0, y: 0, z: 90 },
      params: { ...cabinet.params, backMode: 'applied', width: 800 },
    }
    const before = layoutDraft(s, ids)
    const staged = stageLayout(s, before, { kind: 'run', axis, gap: '37' })
    const next = acceptLayout(s, previewLayout(s, staged))!
    expect(get(next, 'a').position).toEqual(get(s, 'a').position)
    for (let i = 1; i < ids.length; i++) {
      expect(bounds(next, ids[i], axis)[0] - bounds(next, ids[i - 1], axis)[1]).toBeCloseTo(37)
      for (const other of ['x', 'y', 'z'] as const)
        if (other !== axis)
          expect(get(next, ids[i]).position[other]).toBe(get(s, ids[i]).position[other])
    }
    expect(before.positions.b).toEqual({ x: 1000, y: 900, z: 800 })
  },
)
it.each(PLACEMENT_ALIGNMENTS)('aligns %s to the first selected occupied envelope', (alignment) => {
  const s = sceneOf()
  s.components[1] = { ...c('b', 1000, 900, 800), rotation: { x: 0, y: 0, z: 90 } }
  const staged = stageLayout(s, layoutDraft(s, ids), { kind: 'align', alignment })
  const next = previewLayout(s, staged).scene!
  const axis =
    alignment === 'left' || alignment === 'right' || alignment === 'centre-x'
      ? 'x'
      : alignment === 'front' || alignment === 'back' || alignment === 'centre-y'
        ? 'y'
        : 'z'
  const metric = (id: string) => {
    const [lo, hi] = bounds(next, id, axis)
    return alignment.startsWith('centre')
      ? (lo + hi) / 2
      : ['right', 'back', 'top'].includes(alignment)
        ? hi
        : lo
  }
  for (const id of ids) {
    expect(metric(id)).toBeCloseTo(metric('a'))
    for (const other of ['x', 'y', 'z'] as const)
      if (other !== axis) expect(get(next, id).position[other]).toBe(get(s, id).position[other])
  }
  expect(get(next, 'a').position).toEqual(get(s, 'a').position)
})
it.each(['x', 'y', 'z'] as const)(
  'distributes equal free gaps on %s in geometric order while fixing endpoints',
  (axis) => {
    const s = sceneOf()
    s.components[1] = {
      ...get(s, 'b'),
      params: { ...cabinet.params, width: 800, depth: 400, height: 900 },
    }
    const staged = stageLayout(s, layoutDraft(s, ['c', 'a', 'b']), { kind: 'distribute', axis })
    const next = previewLayout(s, staged).scene!
    const gap1 = bounds(next, 'b', axis)[0] - bounds(next, 'a', axis)[1],
      gap2 = bounds(next, 'c', axis)[0] - bounds(next, 'b', axis)[1]
    expect(gap1).toBeGreaterThan(0)
    expect(gap1).toBeCloseTo(gap2)
    expect(get(next, 'a').position).toEqual(get(s, 'a').position)
    expect(get(next, 'c').position).toEqual(get(s, 'c').position)
    for (const other of ['x', 'y', 'z'] as const)
      if (other !== axis) expect(get(next, 'b').position[other]).toBe(get(s, 'b').position[other])
  },
)
it('accumulates moves and runs without mutating input or trusting the cached proposed scene', () => {
  const s = sceneOf()
  let d = layoutDraft(s, ['a', 'b'])
  d = stageLayout(s, d, { kind: 'move', offset: { x: '10', y: '20', z: '30' } })
  d = stageLayout(s, d, { kind: 'run', axis: 'x', gap: '5' })
  expect(d.positions.a).toEqual({ x: 10, y: 20, z: 30 })
  expect(d.positions.b.x).toBe(615)
  const p = previewLayout(s, d)
  d.positions.a.x = 9999
  const latest = { ...s, hardware: [{ id: 'latest' }] as Scene['hardware'] }
  const next = acceptLayout(latest, { ...p, scene: s })!
  expect(get(next, 'a').position.x).toBe(10)
  expect(next.hardware).toBe(latest.hardware)
  expect(get(s, 'a').position.x).toBe(0)
  expect(get(next, 'c')).toBe(get(s, 'c'))
})
it('sorts staged envelopes stably along every axis and limits available cabinets to siblings', () => {
  const s = sceneOf()
  s.components.push({ ...c('other'), parentId: 'group' })
  expect(layoutCabinets(s, null).map((c) => c.id)).toEqual(ids)
  for (const axis of ['x', 'y', 'z'] as const)
    expect(sortLayout(s, layoutDraft(s, ['c', 'b', 'a']), axis).ids).toEqual(ids)
  const d = layoutDraft(s, ['a', 'b'])
  d.positions.a.x = 5000
  expect(sortLayout(s, d, 'x').ids).toEqual(['b', 'a'])
  d.positions.a.x = Infinity
  expect(() => sortLayout(s, d, 'x')).toThrow('finite')
})
it('detaches selected anchors from resolved positions and keeps unselected followers linked', () => {
  const s = sceneOf()
  const anchor = { to: 'a', face: 'right' as const, gap: 10, offset: { u: 0, v: 0 } }
  s.components[1] = { ...get(s, 'b'), anchor }
  s.components[2] = { ...get(s, 'c'), anchor: { ...anchor, to: 'b' } }
  let d = layoutDraft(s, ['b'])
  expect(d.positions.b.x).toBe(610)
  expect(previewLayout(s, d).errors.join()).toContain('Detach')
  expect(() => stageLayout(s, d, { kind: 'move', offset: { x: '100', y: '0', z: '0' } })).toThrow(
    'Detach',
  )
  d = stageLayout(s, { ...d, detach: true }, { kind: 'move', offset: { x: '100', y: '0', z: '0' } })
  const next = acceptLayout(s, previewLayout(s, d))!
  expect(get(next, 'b').anchor).toBeUndefined()
  expect(get(next, 'b').position.x).toBe(710)
  expect(get(next, 'c').anchor?.to).toBe('b')
  expect(get(next, 'c').position.x).toBe(1320)
  const both = stageLayout(
    s,
    { ...layoutDraft(s, ['a', 'b']), detach: true },
    { kind: 'move', offset: { x: '100', y: '0', z: '0' } },
  )
  expect(get(previewLayout(s, both).scene!, 'b').position.x).toBe(710)
  expect(resolvePlacement(s).components).not.toEqual(s.components)
})
it('warns only about positive 3D overlap, permits intentional apply, and accepts touching', () => {
  const s = sceneOf([c('a'), c('b', 600)])
  expect(previewLayout(s, layoutDraft(s, ['a'])).overlaps).toHaveLength(0)
  let d = stageLayout(s, layoutDraft(s, ['b']), {
    kind: 'move',
    offset: { x: '-100', y: '0', z: '0' },
  })
  const p = previewLayout(s, d)
  expect(p.overlaps).toHaveLength(1)
  expect(acceptLayout(s, p)).not.toBeNull()
  d = stageLayout(s, d, { kind: 'move', offset: { x: '0', y: '0', z: '2000' } })
  expect(previewLayout(s, d).overlaps).toHaveLength(0)
})
it('rejects empty, duplicate, missing and cross-parent selections atomically', () => {
  const s = sceneOf()
  s.components.push({ ...c('other'), parentId: 'group' })
  expect(() => layoutDraft(s, [])).toThrow('distinct')
  expect(() => layoutDraft(s, ['a', 'a'])).toThrow('distinct')
  expect(() => layoutDraft(s, ['missing'])).toThrow('available')
  expect(() => layoutDraft(s, ['a', 'other'])).toThrow('parent')
  const d = layoutDraft(s, ['a'])
  d.ids.push('missing')
  expect(previewLayout(s, d).scene).toBeNull()
})
it('rejects incomplete, negative, overflowing and impossible operations without changing the draft', () => {
  const s = sceneOf(),
    d = layoutDraft(s, ids),
    snapshot = JSON.stringify(d)
  expect(() => stageLayout(s, d, { kind: 'run', axis: 'x', gap: '-1' })).toThrow('zero')
  for (const raw of ['', 'Infinity', 'NaN']) {
    expect(() => stageLayout(s, d, { kind: 'run', axis: 'x', gap: raw })).toThrow('Complete every')
    expect(() => stageLayout(s, d, { kind: 'move', offset: { x: raw, y: '0', z: '0' } })).toThrow(
      'Complete every',
    )
  }
  const huge = layoutDraft(s, ids)
  huge.positions.a.x = 1e308
  expect(() =>
    stageLayout(s, huge, { kind: 'move', offset: { x: '1e308', y: '0', z: '0' } }),
  ).toThrow('resulting position')
  const tight = sceneOf([c('a'), c('b', 100), c('c', 200)])
  expect(() =>
    stageLayout(tight, layoutDraft(tight, ids), { kind: 'distribute', axis: 'x' }),
  ).toThrow('span')
  expect(() => stageLayout(s, layoutDraft(s, ['a']), { kind: 'run', axis: 'x', gap: '0' })).toThrow(
    'two',
  )
  expect(() =>
    stageLayout(s, layoutDraft(s, ['a', 'b']), { kind: 'distribute', axis: 'x' }),
  ).toThrow('three')
  expect(JSON.stringify(d)).toBe(snapshot)
})
it('rejects invalid positions and sibling geometry or transforms', () => {
  const s = sceneOf(),
    d = layoutDraft(s, ['a'])
  delete d.positions.a
  expect(previewLayout(s, d).errors.join()).toContain('Every selected position')
  for (const value of [Infinity, NaN]) {
    const d = layoutDraft(s, ['a'])
    d.positions.a.z = value
    expect(previewLayout(s, d).scene).toBeNull()
  }
  const bad = sceneOf()
  get(bad, 'b').params = { ...cabinet.params, width: -1 }
  expect(previewLayout(bad, layoutDraft(bad, ['a'])).errors.length).toBeGreaterThan(0)
  const badRotation = sceneOf()
  get(badRotation, 'b').rotation = { x: NaN, y: 0, z: 0 }
  expect(previewLayout(badRotation, layoutDraft(badRotation, ['a'])).scene).toBeNull()
})
it('refuses stale, invalid, noop and tampered acceptance but ignores mesh-only changes', () => {
  const s = sceneOf(),
    d = stageLayout(s, layoutDraft(s, ['a']), {
      kind: 'move',
      offset: { x: '100', y: '0', z: '0' },
    }),
    p = previewLayout(s, d)
  expect(acceptLayout({ ...s, parts: [...s.parts] }, p)).not.toBeNull()
  expect(acceptLayout(s, { ...p, errors: ['invalid'] })).toBeNull()
  expect(acceptLayout(s, { ...p, changed: false })).toBeNull()
  expect(acceptLayout(s, previewLayout(s, layoutDraft(s, ['a'])))).toBeNull()
  expect(acceptLayout({ ...s, materials: {} }, p)).toBeNull()
  const changed = sceneOf()
  get(changed, 'b').position.x = 999
  expect(acceptLayout(changed, p)).toBeNull()
  expect(
    acceptLayout(s, { ...p, draft: { ...p.draft, positions: { a: { x: NaN, y: 0, z: 0 } } } }),
  ).toBeNull()
  expect(acceptLayout(s, { ...p, draft: layoutDraft(s, ['a']) })).toBeNull()
})

it('rejects an operation when resolving an unselected follower overflows', () => {
  const s = sceneOf([c('a'), c('follower')])
  get(s, 'follower').anchor = { to: 'a', face: 'right', gap: 1e308, offset: { u: 0, v: 0 } }
  const draft = layoutDraft(s, ['a'])
  expect(previewLayout(s, draft).errors).toEqual([])
  expect(() =>
    stageLayout(s, draft, { kind: 'move', offset: { x: '1e308', y: '0', z: '0' } }),
  ).toThrow('finite')
})
