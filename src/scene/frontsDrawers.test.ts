import { expect, it } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { DEFAULT_FRAME, PRESET_MATERIALS } from './carcasePresets'
import { defaultInterior } from './sectionInterior'
import { applyPipeline } from './pipeline'
import {
  acceptFronts,
  emptyFrontsDraft,
  FRONT_CHOICES,
  frontChoice,
  frontTargets,
  frontsSignature,
  previewFronts,
  stageDrawer,
  stageFront,
} from './frontsDrawers'
import { splitSection } from './editSection'
import type { CarcaseComponent, DrawerComponent, FrameZone, Scene } from './types'
const own = (): CarcaseComponent => ({
  ...cabinet,
  id: 'cab',
  params: {
    ...cabinet.params,
    section: { ...cabinet.params.section, interior: defaultInterior(0) },
  },
})
const sceneOf = (c = own()): Scene =>
  applyPipeline({
    components: [c],
    parts: [],
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
  })
const ids = (s: Scene) => frontTargets(s, 'cab').map((t) => t.id)
const drawers = (s: Scene) =>
  s.components.filter((c): c is DrawerComponent => c.kind === 'drawer' && c.parentId === 'cab')
const fronts = (s: Scene) =>
  s.parts.filter((p) => p.parentId === 'cab' && p.role?.startsWith('front-'))
it.each(FRONT_CHOICES)(
  'builds %s fronts with actual generated geometry and hardware changes',
  (choice) => {
    const s = sceneOf(),
      before = JSON.stringify(s),
      d = stageFront(s, 'cab', emptyFrontsDraft(), ids(s), choice),
      p = previewFronts(s, 'cab', d)
    expect(p.errors).toEqual([])
    expect(frontTargets(p.scene!, 'cab').map((t) => frontChoice(t.front))).toEqual([choice])
    expect(fronts(p.scene!).length).toBe(choice === 'double-door' ? 2 : choice === 'none' ? 0 : 1)
    expect(drawers(p.scene!).length).toBe(choice === 'drawer-front' ? 1 : 0)
    if (choice === 'drawer-front') {
      expect(p.hardware.length).toBeGreaterThan(0)
      expect(p.boards.some((b) => b.key.endsWith(':box-left'))).toBe(true)
      expect(
        p.scene!.parts.filter((part) => part.parentId === drawers(p.scene!)[0].id),
      ).toHaveLength(5)
    }
    expect(JSON.stringify(s)).toBe(before)
  },
)
it('stages multiple openings and retains unselected interiors and manual finishing boards', () => {
  const c = own()
  c.params = {
    ...c.params,
    section: splitSection(c.params.section, c.params.section.id, 'vertical', 'panel', 2),
  }
  let s = sceneOf(c)
  const manual = {
    ...s.parts[0],
    id: 'manual',
    role: undefined,
    driven: false,
    label: 'Worktop',
    cuts: [],
    operations: [],
  }
  s = { ...s, parts: [...s.parts, manual] }
  const t = ids(s),
    d = stageFront(s, 'cab', emptyFrontsDraft(), [t[0]], 'drawer-front'),
    next = acceptFronts(s, previewFronts(s, 'cab', d))!
  expect(frontChoice(frontTargets(next, 'cab')[1].front)).toBe(
    frontChoice(frontTargets(s, 'cab')[1].front),
  )
  expect(next.parts.find((p) => p.id === 'manual')).toEqual(manual)
  const both = stageFront(s, 'cab', d, t, 'double-door')
  expect(fronts(previewFronts(s, 'cab', both).scene!)).toHaveLength(4)
})
it('supports independent frame-zone fronts and drawer settings without changing structural layout', () => {
  const c = own(),
    sectionId = c.params.section.id
  const zone: FrameZone = {
    id: 'zone-root',
    size: { kind: 'equal' },
    content: {
      kind: 'split',
      axis: 'vertical',
      children: [
        {
          id: 'zone-left',
          size: { kind: 'equal' },
          front: { kind: 'door', leaves: 1, hinge: 'left' },
          content: { kind: 'leaf' },
        },
        { id: 'zone-right', size: { kind: 'equal' }, content: { kind: 'leaf' } },
      ],
    },
  }
  c.params = { ...c.params, frame: { ...DEFAULT_FRAME, layout: { [sectionId]: zone } } }
  const s = sceneOf(c),
    targets = frontTargets(s, 'cab')
  expect(targets).toHaveLength(2)
  expect(targets.every((t) => t.frame)).toBe(true)
  let d = stageFront(s, 'cab', emptyFrontsDraft(), [targets[1].id], 'drawer-front')
  d = stageDrawer(s, 'cab', d, [targets[1].id], { kind: 'height', value: '100' })
  const p = previewFronts(s, 'cab', d)
  expect(p.errors).toEqual([])
  const next = p.scene!.components.find((c) => c.id === 'cab') as CarcaseComponent
  expect(next.params.section).toEqual(c.params.section)
  expect(frontChoice(frontTargets(p.scene!, 'cab')[0].front)).toBe('left-door')
  expect(drawers(p.scene!)[0].frameOpeningId).toBe('zone-right')
  expect(drawers(p.scene!)[0].params.boxHeight).toBe(100)
})
it('supports structural double doors with pair stiles as a single logical selection', () => {
  const c = own()
  c.params = {
    ...c.params,
    frame: { ...DEFAULT_FRAME, pairStile: true },
    section: { ...c.params.section, front: { kind: 'door', leaves: 2, hinge: 'left' } },
  }
  const s = sceneOf(c)
  expect(ids(s)).toHaveLength(1)
  const p = previewFronts(s, 'cab', stageFront(s, 'cab', emptyFrontsDraft(), ids(s), 'right-door'))
  expect(p.errors).toEqual([])
  expect(fronts(p.scene!)).toHaveLength(1)
  expect(
    p.boards.some(
      (row) => row.key.includes('stile-pair-') && row.before !== '—' && row.after === '—',
    ),
  ).toBe(true)
})
it('accumulates family, custom/automatic height, material and side-mount offset edits', () => {
  const s = sceneOf(),
    t = ids(s)
  let d = stageFront(s, 'cab', emptyFrontsDraft(), t, 'drawer-front')
  d = stageDrawer(s, 'cab', d, t, { kind: 'height', value: '120' })
  d = stageDrawer(s, 'cab', d, t, { kind: 'material', value: '18mm Ply' })
  d = stageDrawer(s, 'cab', d, t, { kind: 'offset', value: '40' })
  let p = previewFronts(s, 'cab', d)
  expect(p.errors).toEqual([])
  expect(drawers(p.scene!)[0].params).toEqual({
    family: 'side-mount',
    boxHeight: 120,
    runnerOffset: 40,
    material: '18mm Ply',
  })
  d = stageDrawer(s, 'cab', d, t, { kind: 'family', value: 'undermount' })
  expect(d.drawers[t[0]].runnerOffset).toBeUndefined()
  p = previewFronts(s, 'cab', d)
  expect(p.errors).toEqual([])
  expect(drawers(p.scene!)[0].params.family).toBe('undermount')
  expect(() => stageDrawer(s, 'cab', d, t, { kind: 'offset', value: '30' })).toThrow(
    'only for side-mount',
  )
  d = stageDrawer(s, 'cab', d, t, { kind: 'height', value: null })
  d = stageDrawer(s, 'cab', d, t, { kind: 'material', value: '' })
  expect(drawers(previewFronts(s, 'cab', d).scene!)[0].params.boxHeight).toBeNull()
  expect(drawers(previewFronts(s, 'cab', d).scene!)[0].params.material).toBe('')
  d = stageDrawer(s, 'cab', d, t, { kind: 'family', value: 'side-mount' })
  expect(drawers(previewFronts(s, 'cab', d).scene!)[0].params.family).toBe('side-mount')
})
it('edits existing drawer parameters and compares stable board owners instead of new UUIDs', () => {
  const base = sceneOf(),
    s = previewFronts(
      base,
      'cab',
      stageFront(base, 'cab', emptyFrontsDraft(), ids(base), 'drawer-front'),
    ).scene!
  const d = stageDrawer(s, 'cab', emptyFrontsDraft(), ids(s), { kind: 'height', value: '100' })
  const p = previewFronts(s, 'cab', d)
  expect(p.errors).toEqual([])
  expect(drawers(p.scene!)[0].id).toBe(drawers(s)[0].id)
  expect(p.boards.length).toBeGreaterThan(0)
  const fresh = stageFront(base, 'cab', emptyFrontsDraft(), ids(base), 'drawer-front')
  expect(previewFronts(base, 'cab', fresh).boards).toEqual(previewFronts(base, 'cab', fresh).boards)
})
it('locks detached fronts, drawer components and box boards while preserving other openings', () => {
  const s = sceneOf()
  const detachedFront = {
    ...s,
    parts: s.parts.map((p) => (p.role?.startsWith('front-') ? { ...p, driven: false } : p)),
  }
  expect(frontTargets(detachedFront, 'cab')[0].locked).toBe(true)
  expect(() =>
    stageFront(detachedFront, 'cab', emptyFrontsDraft(), ids(detachedFront), 'none'),
  ).toThrow('Detached')
  const withDrawer = previewFronts(
      s,
      'cab',
      stageFront(s, 'cab', emptyFrontsDraft(), ids(s), 'drawer-front'),
    ).scene!,
    drawer = drawers(withDrawer)[0]
  const detached = {
    ...withDrawer,
    components: withDrawer.components.map((c) =>
      c.id === drawer.id ? { ...drawer, driven: false } : c,
    ),
  }
  expect(() =>
    stageDrawer(detached, 'cab', emptyFrontsDraft(), ids(detached), {
      kind: 'height',
      value: '100',
    }),
  ).toThrow('Detached')
  const detachedBoard = {
    ...withDrawer,
    parts: withDrawer.parts.map((p) => (p.parentId === drawer.id ? { ...p, driven: false } : p)),
  }
  expect(frontTargets(detachedBoard, 'cab')[0].locked).toBe(true)
})
it('rejects invalid selections and drawer actions on mixed or non-drawer openings', () => {
  const s = sceneOf(),
    t = ids(s),
    d = emptyFrontsDraft()
  expect(() => stageFront(s, 'cab', d, [], 'none')).toThrow('distinct')
  expect(() => stageFront(s, 'cab', d, [t[0], t[0]], 'none')).toThrow('distinct')
  expect(() => stageFront(s, 'cab', d, ['missing'], 'none')).toThrow('available')
  expect(() => frontTargets(s, 'missing')).toThrow('available')
  expect(() => stageFront(s, 'cab', d, t, 'bad' as 'none')).toThrow('supported')
  expect(() => stageDrawer(s, 'cab', d, t, { kind: 'height', value: '100' })).toThrow(
    'only drawer-front',
  )
  expect(previewFronts(s, 'cab', { fronts: { missing: 'none' }, drawers: {} }).scene).toBeNull()
})
it('rejects blank/nonfinite/negative parameters and invalid materials/families without changing drafts', () => {
  const s = sceneOf(),
    t = ids(s),
    d = stageFront(s, 'cab', emptyFrontsDraft(), t, 'drawer-front'),
    before = JSON.stringify(d)
  for (const value of ['', 'Infinity', 'NaN'])
    expect(() => stageDrawer(s, 'cab', d, t, { kind: 'height', value })).toThrow('finite number')
  expect(() => stageDrawer(s, 'cab', d, t, { kind: 'height', value: '0' })).toThrow('positive')
  expect(() => stageDrawer(s, 'cab', d, t, { kind: 'offset', value: '-1' })).toThrow(
    'zero or greater',
  )
  expect(() => stageDrawer(s, 'cab', d, t, { kind: 'material', value: 'missing' })).toThrow(
    'panel material',
  )
  expect(() =>
    stageDrawer(s, 'cab', d, t, { kind: 'family', value: 'bad' as 'side-mount' }),
  ).toThrow('Unsupported')
  expect(JSON.stringify(d)).toBe(before)
})
it('rejects excessive custom height, missing runner fit and shelf interference, permitting a box below a shelf', () => {
  const s = sceneOf(),
    t = ids(s),
    d = stageFront(s, 'cab', emptyFrontsDraft(), t, 'drawer-front')
  expect(
    previewFronts(
      s,
      'cab',
      stageDrawer(s, 'cab', d, t, { kind: 'height', value: '9999' }),
    ).errors.join(),
  ).toContain('exceeds')
  expect(
    previewFronts(
      s,
      'cab',
      stageDrawer(s, 'cab', d, t, { kind: 'offset', value: '9999' }),
    ).errors.join(),
  ).toContain('does not fit')
  const shallow = own()
  shallow.params = { ...shallow.params, depth: 150 }
  const short = sceneOf(shallow)
  expect(
    previewFronts(
      short,
      'cab',
      stageFront(short, 'cab', emptyFrontsDraft(), ids(short), 'drawer-front'),
    ).errors.join(),
  ).toContain('does not fit')
  const shelved = sceneOf({ ...own(), params: cabinet.params }),
    target = ids(shelved),
    drawer = stageFront(shelved, 'cab', emptyFrontsDraft(), target, 'drawer-front')
  expect(previewFronts(shelved, 'cab', drawer).errors.join()).toContain('intersects a shelf')
  expect(
    previewFronts(
      shelved,
      'cab',
      stageDrawer(shelved, 'cab', drawer, target, { kind: 'height', value: '100' }),
    ).errors,
  ).toEqual([])
})
it('rejects malformed preview patches, source geometry and nonfinite placement', () => {
  const s = sceneOf(),
    t = ids(s),
    d = stageFront(s, 'cab', emptyFrontsDraft(), t, 'drawer-front')
  for (const patch of [
    { boxHeight: Infinity },
    { boxHeight: -1 },
    { runnerOffset: NaN },
    { material: 'missing' },
  ])
    expect(previewFronts(s, 'cab', { ...d, drawers: { [t[0]]: patch } }).scene).toBeNull()
  expect(
    previewFronts(s, 'cab', { fronts: { [t[0]]: 'bad' as 'none' }, drawers: {} }).errors.join(),
  ).toContain('supported')
  expect(
    previewFronts(s, 'cab', { fronts: {}, drawers: { [t[0]]: { boxHeight: 100 } } }).errors.join(),
  ).toContain('require a drawer-front')
  expect(
    previewFronts(s, 'cab', {
      ...d,
      drawers: { [t[0]]: { family: 'undermount', runnerOffset: 20 } },
    }).errors.join(),
  ).toContain('only for side-mount')
  const bad = {
    ...s,
    components: s.components.map((c) =>
      c.kind === 'carcase' ? { ...c, params: { ...c.params, width: -1 } } : c,
    ),
  }
  expect(previewFronts(bad, 'cab', d).errors.join()).toContain('width must exceed')
  const moved = {
    ...s,
    components: s.components.map((c) => ({ ...c, position: { x: NaN, y: 0, z: 0 } })),
  }
  expect(previewFronts(moved, 'cab', d).errors.join()).toContain('placement must be finite')
})
it('guards snapshots, stale/noop/invalid acceptance and cached scene tampering while retaining latest metadata', () => {
  const s = sceneOf(),
    t = ids(s),
    d = stageFront(s, 'cab', emptyFrontsDraft(), t, 'drawer-front'),
    p = previewFronts(s, 'cab', d)
  d.fronts[t[0]] = 'none'
  const current = { ...s, hardware: [{ id: 'latest' }] as Scene['hardware'] },
    next = acceptFronts(current, { ...p, scene: s })!
  expect(drawers(next)).toHaveLength(1)
  expect(next.hardware).toBe(current.hardware)
  const settings = stageDrawer(
    s,
    'cab',
    stageFront(s, 'cab', emptyFrontsDraft(), t, 'drawer-front'),
    t,
    { kind: 'height', value: '100' },
  )
  const held = previewFronts(s, 'cab', settings)
  settings.drawers[t[0]].boxHeight = 200
  expect(drawers(acceptFronts(s, held)!)[0].params.boxHeight).toBe(100)
  expect(acceptFronts(s, { ...p, errors: ['bad'] })).toBeNull()
  expect(acceptFronts(s, { ...p, changed: false })).toBeNull()
  expect(acceptFronts(s, previewFronts(s, 'cab', emptyFrontsDraft()))).toBeNull()
  const noop = stageFront(
    s,
    'cab',
    emptyFrontsDraft(),
    t,
    frontChoice(frontTargets(s, 'cab')[0].front),
  )
  expect(previewFronts(s, 'cab', noop).changed).toBe(false)
  expect(acceptFronts({ ...s, materials: {} }, p)).toBeNull()
  expect(
    acceptFronts(
      { ...s, components: s.components.map((c) => ({ ...c, position: { ...c.position, x: 10 } })) },
      p,
    ),
  ).toBeNull()
  const meshes = { ...s, parts: s.parts.map((p) => ({ ...p, mesh: undefined })) }
  expect(frontsSignature(meshes)).toBe(frontsSignature(s))
  expect(acceptFronts(meshes, p)).not.toBeNull()
  expect(acceptFronts(s, { ...p, draft: emptyFrontsDraft() })).toBeNull()
  expect(acceptFronts(s, { ...p, draft: { fronts: { bad: 'none' }, drawers: {} } })).toBeNull()
})

it('rejects invalid manual board geometry and notices drawer parameter changes without mesh changes', () => {
  const s = sceneOf(),
    t = ids(s),
    d = stageFront(s, 'cab', emptyFrontsDraft(), t, 'drawer-front')
  const manual = {
    ...s.parts[0],
    id: 'bad-manual',
    role: undefined,
    driven: false,
    length: -1,
    cuts: [],
    operations: [],
  }
  expect(previewFronts({ ...s, parts: [...s.parts, manual] }, 'cab', d).errors.join()).toContain(
    'Proposed board geometry',
  )
  const p = previewFronts(s, 'cab', d),
    current = p.scene!,
    row = drawers(current)[0]
  const edit = stageDrawer(current, 'cab', emptyFrontsDraft(), ids(current), {
      kind: 'height',
      value: '100',
    }),
    preview = previewFronts(current, 'cab', edit)
  const changed = {
    ...current,
    components: current.components.map((c) =>
      c.id === row.id ? { ...row, params: { ...row.params, boxHeight: 200 } } : c,
    ),
  }
  expect(acceptFronts(changed, preview)).toBeNull()
})

it('checks shelf interference in cabinet coordinates after cabinet movement and rotation', () => {
  const c = {
    ...own(),
    params: cabinet.params,
    position: { x: 1200, y: 500, z: 150 },
    rotation: { x: 0, y: 0, z: 90 },
  }
  const s = sceneOf(c),
    t = ids(s),
    d = stageFront(s, 'cab', emptyFrontsDraft(), t, 'drawer-front')
  expect(previewFronts(s, 'cab', d).errors.join()).toContain('intersects a shelf')
  expect(
    previewFronts(s, 'cab', stageDrawer(s, 'cab', d, t, { kind: 'height', value: '100' })).errors,
  ).toEqual([])
})

it('limits board-change summaries to the edited cabinet when the pipeline also generates another cabinet', () => {
  const s = sceneOf()
  s.components.push({ ...own(), id: 'other', position: { x: 900, y: 0, z: 0 } })
  const p = previewFronts(s, 'cab', stageFront(s, 'cab', emptyFrontsDraft(), ids(s), 'double-door'))
  expect(p.errors).toEqual([])
  expect(p.scene!.parts.some((part) => part.parentId === 'other')).toBe(true)
  expect(p.boards.every((row) => !row.key.includes('other'))).toBe(true)
})
