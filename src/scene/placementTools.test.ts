import { expect, it } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from './carcasePresets'
import {
  acceptPlacement,
  alignPlacement,
  placementDraft,
  placementSignature,
  placementTargets,
  previewPlacement,
  turnPlacement,
} from './placementTools'
import { worldBoundsOf } from './carcaseWorldBounds'
import type { CarcaseComponent, Scene } from './types'
const a = (): CarcaseComponent => ({
  ...cabinet,
  id: 'a',
  label: 'A',
  position: { x: 0, y: 0, z: 0 },
})
const b = (): CarcaseComponent => ({
  ...cabinet,
  id: 'b',
  label: 'B',
  position: { x: 900, y: 700, z: 100 },
})
const sceneOf = (components: CarcaseComponent[] = [a(), b()]): Scene => ({
  components,
  parts: [],
  materials: PRESET_MATERIALS,
  joints: [],
  hardware: [],
})
it.each([
  ['left', 'x0'],
  ['right', 'x1'],
  ['front', 'y0'],
  ['back', 'y1'],
  ['bottom', 'z0'],
  ['top', 'z1'],
] as const)('aligns %s envelopes considering rotation, fronts and applied backs', (action, key) => {
  const own = { ...a(), rotation: { x: 0, y: 0, z: 90 } },
    target = { ...b(), params: { ...b().params, backMode: 'applied' as const } }
  const scene = sceneOf([own, target])
  const draft = alignPlacement(scene, 'a', placementDraft(own), 'b', action)
  const moved = { ...own, position: { x: Number(draft.x), y: Number(draft.y), z: Number(draft.z) } }
  expect(worldBoundsOf(moved, scene.materials)[key]).toBeCloseTo(
    worldBoundsOf(target, scene.materials)[key],
  )
  const axis = key[0]
  for (const untouched of ['x', 'y', 'z'] as const)
    if (untouched !== axis) expect(draft[untouched]).toBe(String(own.position[untouched]))
})
it.each(['x', 'y', 'z'] as const)('centres on %s and preserves the other axes', (axis) => {
  const own = a(),
    target = { ...b(), params: { ...b().params, width: 800, height: 900, depth: 400 } }
  const scene = sceneOf([own, target])
  const draft = alignPlacement(scene, 'a', placementDraft(own), 'b', `centre-${axis}`)
  const moved = { ...own, position: { x: Number(draft.x), y: Number(draft.y), z: Number(draft.z) } }
  const bounds = worldBoundsOf(moved, scene.materials),
    reference = worldBoundsOf(target, scene.materials)
  const middle = (box: typeof bounds) =>
    axis === 'x'
      ? (box.x0 + box.x1) / 2
      : axis === 'y'
        ? (box.y0 + box.y1) / 2
        : (box.z0 + box.z1) / 2
  expect(middle(bounds)).toBeCloseTo(middle(reference))
})
it('filters self, cross-parent and transitive anchored followers without looping on cycles', () => {
  const own = a(),
    follower = {
      ...b(),
      anchor: { to: 'a', face: 'right' as const, gap: 0, offset: { u: 0, v: 0 } },
    },
    nested = {
      ...b(),
      id: 'c',
      anchor: { to: 'b', face: 'right' as const, gap: 0, offset: { u: 0, v: 0 } },
    },
    other = { ...b(), id: 'd', parentId: 'group' },
    reference = { ...b(), id: 'e' }
  const scene = sceneOf([own, follower, nested, other, reference])
  expect(placementTargets(scene, 'a').map((c) => c.id)).toEqual(['e'])
  expect(() => alignPlacement(scene, 'a', placementDraft(own), 'b', 'left')).toThrow('independent')
  expect(() => alignPlacement(scene, 'a', placementDraft(own), 'd', 'left')).toThrow('parent')
  expect(() => placementTargets(scene, 'missing')).toThrow('no longer')
  const cycle = sceneOf([own, { ...follower, anchor: { ...follower.anchor, to: 'c' } }, nested])
  expect(placementTargets(cycle, 'a')).toHaveLength(2)
})
it('turns both ways, wraps and refuses unfinished rotations', () => {
  const draft = placementDraft(a())
  expect(turnPlacement(draft, -1).rz).toBe('270')
  expect(turnPlacement({ ...draft, rz: '270' }, 1).rz).toBe('0')
  expect(draft.rz).toBe('0')
  expect(() => turnPlacement({ ...draft, rz: '' }, 1)).toThrow('Complete')
})
it('requires explicit detach and resolves followers, retaining unrelated component identity', () => {
  const origin = { ...b(), id: 'origin' },
    own = {
      ...a(),
      anchor: { to: 'origin', face: 'right' as const, gap: 0, offset: { u: 0, v: 0 } },
    },
    follower = {
      ...b(),
      id: 'follower',
      anchor: { to: 'a', face: 'right' as const, gap: 0, offset: { u: 0, v: 0 } },
    }
  const scene = sceneOf([origin, own, follower])
  const draft = { ...placementDraft(own), x: '2000' }
  expect(previewPlacement(scene, 'a', draft).errors.join()).toContain('Detach')
  const preview = previewPlacement(scene, 'a', { ...draft, detach: true })
  expect(preview.errors).toEqual([])
  const next = acceptPlacement(scene, preview)!
  const moved = next.components.find((c) => c.id === 'a')!
  expect(moved.position.x).toBe(2000)
  expect(moved.kind === 'carcase' && moved.anchor).toBeUndefined()
  expect(next.components.find((c) => c.id === 'follower')?.position.x).toBe(2600)
  expect(next.components.find((c) => c.id === 'origin')).toBe(origin)
})
it('warns for positive-volume overlaps but allows touching and vertical separation', () => {
  const scene = sceneOf([a(), { ...b(), position: { x: 600, y: 0, z: 0 } }])
  const draft = placementDraft(a())
  expect(previewPlacement(scene, 'a', { ...draft, x: '10' }).overlaps).toHaveLength(1)
  expect(acceptPlacement(scene, previewPlacement(scene, 'a', { ...draft, x: '10' }))).not.toBeNull()
  expect(previewPlacement(scene, 'a', draft).overlaps).toHaveLength(0)
  expect(previewPlacement(scene, 'a', { ...draft, x: '10', z: '720' }).overlaps).toHaveLength(0)
})
it('rejects invalid or unchanged proposals and cannot accept stale or tampered snapshots', () => {
  const scene = sceneOf(),
    draft = placementDraft(a())
  const preview = previewPlacement(scene, 'a', { ...draft, x: '50' })
  expect(acceptPlacement(scene, previewPlacement(scene, 'a', draft))).toBeNull()
  for (const x of ['', 'NaN', 'Infinity'])
    expect(previewPlacement(scene, 'a', { ...draft, x }).errors.join()).toContain(
      'complete every field',
    )
  expect(
    acceptPlacement(
      { ...scene, components: [a(), { ...b(), position: { x: 1000, y: 0, z: 0 } }] },
      preview,
    ),
  ).toBeNull()
  expect(
    acceptPlacement(
      { ...scene, materials: { ...scene.materials, Extra: { thickness: 20 } } },
      preview,
    ),
  ).toBeNull()
  expect(acceptPlacement(scene, { ...preview, draft: { ...draft, x: '' } })).toBeNull()
  expect(acceptPlacement(scene, { ...preview, errors: ['Invalid preview'] })).toBeNull()
  expect(acceptPlacement(scene, { ...preview, changed: false })).toBeNull()
  expect(previewPlacement(scene, 'missing', draft).errors.join()).toContain('no longer')
})
it('ignores mesh-only changes, takes independent draft snapshots and preserves latest scene metadata', () => {
  const scene = sceneOf(),
    draft = { ...placementDraft(a()), x: '100' }
  const preview = previewPlacement(scene, 'a', draft)
  draft.x = '200'
  expect(preview.draft.x).toBe('100')
  expect(placementSignature({ ...scene, parts: [...scene.parts] })).toBe(placementSignature(scene))
  const changed = {
    ...scene,
    hardware: [
      {
        id: 'h',
        name: 'Manual',
        qty: 1,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        unitCost: 0,
        notes: '',
        linkedPartIds: [],
        linkedComponentIds: [],
      },
    ],
  }
  expect(acceptPlacement(changed, preview)?.hardware).toBe(changed.hardware)
})

it('rejects invalid cabinet geometry, non-finite sibling placement and overflowing occupied envelopes', () => {
  const draft = { ...placementDraft(a()), x: '50' }
  const invalid = sceneOf([a(), { ...b(), params: { ...b().params, width: 1 } }])
  expect(previewPlacement(invalid, 'a', draft).errors.join()).toContain('width must exceed')
  expect(
    previewPlacement(
      sceneOf([a(), { ...b(), position: { x: NaN, y: 0, z: 0 } }]),
      'a',
      draft,
    ).errors.join(),
  ).toContain('placement values must be finite')
  const enormous = { ...a(), params: { ...a().params, width: 1.6e308, depth: 1.6e308 } }
  expect(
    previewPlacement(sceneOf([enormous]), 'a', {
      ...placementDraft(enormous),
      rz: '45',
    }).errors.join(),
  ).not.toBe('')
  const far = {
    ...b(),
    position: { x: 1.7e308, y: 0, z: 0 },
    params: { ...b().params, width: 1.7e308 },
  }
  expect(() => alignPlacement(sceneOf([a(), far]), 'a', placementDraft(a()), 'b', 'right')).toThrow(
    'cannot be aligned',
  )
})
