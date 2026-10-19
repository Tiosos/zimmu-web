import { expect, it } from 'vitest'
import { CARCASE_PRESETS, PRESET_MATERIALS, DEFAULT_FRAME } from './carcasePresets'
import {
  equalizeOpenings,
  findOpening,
  openingGeometry,
  openingLayoutErrors,
  openingLayout,
  openingParent,
  OPENING_LAYOUTS,
  reorderOpening,
  reverseOpenings,
} from './openingLayouts'
import { setSectionSize, splitSection } from './editSection'
import { regenerateComponents } from './regenerateComponents'
import { regenerateDrawers } from './regenerateDrawers'
import { roleThicknessFor } from './resolveThickness'
import { carcaseRoles } from './carcaseRoles'
import type { CarcaseParams, Scene, Section } from './types'

const base = CARCASE_PRESETS[0].params
const children = (s: Section) => {
  if (s.content.kind !== 'split') throw new Error('expected split')
  return s.content.children
}
const sceneOf = (params: CarcaseParams): Scene => ({
  parts: [],
  joints: [],
  hardware: [],
  materials: { ...PRESET_MATERIALS },
  components: [
    {
      id: 'cabinet',
      label: 'Cabinet',
      kind: 'carcase',
      params,
      parentId: null,
      visible: true,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
    },
  ],
})

it('reorders and equalizes selected siblings without losing IDs, contents, sizes or unrelated branches', () => {
  const root = splitSection(base.section, base.section.id, 'vertical', 'panel', 3)
  const [a, b, c] = children(root)
  const sized = setSectionSize(root, a.id, { kind: 'fixed', mm: 150 })
  const moved = reorderOpening(sized, b.id, -1)
  expect(children(moved).map((item) => item.id)).toEqual([b.id, a.id, c.id])
  expect(children(moved)[0]).toBe(b)
  expect(children(moved)[1].size).toEqual({ kind: 'fixed', mm: 150 })
  expect(reorderOpening(sized, a.id, -1)).toBe(sized)
  expect(reorderOpening(sized, c.id, 1)).toBe(sized)
  expect(reorderOpening(sized, 'missing', 1)).toBe(sized)
  expect(children(reverseOpenings(sized, root.id)).map((item) => item.id)).toEqual([
    c.id,
    b.id,
    a.id,
  ])
  const equal = equalizeOpenings(sized, root.id)
  expect(children(equal).every((item) => item.size.kind === 'equal')).toBe(true)
  expect(children(equal).map((item) => item.id)).toEqual([a.id, b.id, c.id])
  expect(equalizeOpenings(equal, root.id)).toBe(equal)
  expect(equalizeOpenings(root, a.id)).toBe(root)
  expect(reverseOpenings(root, 'missing')).toBe(root)
  expect(findOpening(root, b.id)).toBe(b)
  expect(openingParent(root, b.id)).toBe(root)
})

it.each(OPENING_LAYOUTS)(
  'builds $label with valid panel geometry and fresh child identities while preserving its root and cabinet settings',
  ({ id }) => {
    const first = openingLayout(base, base.section.id, id)
    const second = openingLayout(base, base.section.id, id)
    expect(first.section.id).toBe(base.section.id)
    expect(first.section.size).toBe(base.section.size)
    expect({ ...first, section: base.section }).toEqual(base)
    expect(openingGeometry(first, PRESET_MATERIALS, [], 'cabinet').errors).toEqual([])
    if (first.section.content.kind === 'split') {
      expect(new Set(children(first.section).map((item) => item.id)).size).toBe(
        children(first.section).length,
      )
      expect(
        children(first.section).every(
          (item) => !children(second.section).some((other) => other.id === item.id),
        ),
      ).toBe(true)
      expect(first.section.front).toBeUndefined()
      expect(first.section.interior).toBeUndefined()
    }
    expect(openingLayout(base, 'missing', id)).toBe(base)
  },
)

it('generates three actual drawer boxes for the stack, one top drawer above a doored shelved opening, and the correct shelf/door counts', () => {
  const stack = openingLayout(base, base.section.id, 'drawers')
  const generated = regenerateComponents(regenerateDrawers(sceneOf(stack)))
  expect(generated.components.filter((c) => c.kind === 'drawer')).toHaveLength(3)
  expect(
    generated.parts.filter((p) => p.role?.startsWith('front-') && p.parentId === 'cabinet'),
  ).toHaveLength(3)
  expect(generated.parts.filter((p) => p.role?.startsWith('adj-shelf-'))).toHaveLength(0)
  const mixed = openingLayout(base, base.section.id, 'drawer-door')
  const [lower, upper] = children(mixed.section)
  expect(lower.front).toEqual({ kind: 'door', leaves: 1, hinge: 'left' })
  expect(lower.interior?.adjustable.shelves).toBe(1)
  expect(upper.size).toEqual({ kind: 'fixed', mm: 140 })
  const mixedScene = regenerateComponents(regenerateDrawers(sceneOf(mixed)))
  expect(mixedScene.components.filter((c) => c.kind === 'drawer')).toHaveLength(1)
  const thickness = roleThicknessFor(base, PRESET_MATERIALS, new Map())
  for (const [id, shelves, fronts] of [
    ['shelves', 3, 0],
    ['single-door', 1, 1],
    ['double-door', 1, 2],
  ] as const) {
    const params = openingLayout(base, base.section.id, id)
    const roles = carcaseRoles(params, thickness, () => undefined)
    expect(roles.filter((role) => role.role.startsWith('adj-shelf-'))).toHaveLength(shelves)
    expect(roles.filter((role) => role.role.startsWith('front-'))).toHaveLength(fronts)
  }
})

it('replaces only the chosen subtree and removes independent frame layouts only for replaced sections', () => {
  const root = splitSection(base.section, base.section.id, 'vertical', 'panel', 2)
  const [a, b] = children(root)
  const zone = {
    id: 'zone',
    size: { kind: 'equal' as const },
    content: { kind: 'leaf' as const },
    front: { kind: 'door' as const, leaves: 1 as const, hinge: 'left' as const },
  }
  const params = {
    ...base,
    section: root,
    frame: { ...DEFAULT_FRAME, layout: { [a.id]: zone, [b.id]: { ...zone, id: 'other' } } },
  }
  const next = openingLayout(params, a.id, 'drawers')
  expect(children(next.section)[1]).toBe(b)
  expect(next.frame?.layout?.[a.id]).toBeUndefined()
  expect(next.frame?.layout?.[b.id]).toBe(params.frame.layout[b.id])
  expect(next.frame?.stileWidth).toBe(DEFAULT_FRAME.stileWidth)
  expect(openingLayout(params, root.id, 'single-door').frame?.layout).toBeUndefined()
})

it('refuses impossible or nonfinite layouts and reports missing material thickness instead of throwing', () => {
  const short = { ...base, height: 190 }
  expect(
    openingGeometry(
      openingLayout(short, short.section.id, 'drawer-door'),
      PRESET_MATERIALS,
      [],
      'cabinet',
    ).errors.length,
  ).toBeGreaterThan(0)
  expect(
    openingGeometry({ ...base, width: Number.NaN }, PRESET_MATERIALS, [], 'cabinet').errors.length,
  ).toBeGreaterThan(0)
  expect(openingGeometry(base, {}, [], 'cabinet').errors.join(' ')).toContain('thickness')
  expect(
    openingGeometry(
      { ...base, frontMaterial: 'Missing' },
      PRESET_MATERIALS,
      [],
      'cabinet',
    ).errors.join(' '),
  ).toContain('Missing')
})

it('rejects fractional, nonfinite, out-of-range split counts and vertical rails before changing the tree', () => {
  for (const count of [1, 2.5, 9, Infinity, NaN])
    expect(splitSection(base.section, base.section.id, 'vertical', 'panel', count)).toBe(
      base.section,
    )
  expect(splitSection(base.section, base.section.id, 'vertical', 'rail', 2)).toBe(base.section)
  const eight = splitSection(base.section, base.section.id, 'horizontal', 'none', 8)
  expect(children(eight)).toHaveLength(8)
})

it.each(CARCASE_PRESETS.flatMap((preset) => OPENING_LAYOUTS.map((layout) => ({ preset, layout }))))(
  'validates $layout.label for $preset.name',
  ({ preset, layout }) => {
    const next = openingLayout(preset.params, preset.params.section.id, layout.id)
    expect(openingLayoutErrors(next, next.section.id, PRESET_MATERIALS, [], 'cabinet')).toEqual([])
  },
)

it.each(OPENING_LAYOUTS)('preserves a supported face frame for $label', ({ id }) => {
  const framed = { ...base, frame: { ...DEFAULT_FRAME } }
  const next = openingLayout(framed, base.section.id, id)
  expect(next.frame).toEqual(framed.frame)
  expect(openingLayoutErrors(next, next.section.id, PRESET_MATERIALS, [], 'cabinet')).toEqual([])
})

it('reports a frame whose middle member consumes the selected bays', () => {
  const params = {
    ...base,
    section: splitSection(base.section, base.section.id, 'vertical', 'panel', 2),
    frame: { ...DEFAULT_FRAME, midStileWidth: 1000 },
  }
  expect(openingGeometry(params, PRESET_MATERIALS, [], 'cabinet').errors.join(' ')).toContain(
    'face frame',
  )
})

it.each([
  { level: 'root', axis: 'vertical' as const },
  { level: 'root', axis: 'horizontal' as const },
  { level: 'nested', axis: 'vertical' as const },
  { level: 'nested', axis: 'horizontal' as const },
])(
  'rejects fixed children outside their $level $axis containing opening even when every child has positive size',
  ({ level, axis }) => {
    let section = splitSection(base.section, base.section.id, axis, 'panel', 2)
    let parent = section
    if (level === 'nested') {
      const id = children(section)[0].id
      section = splitSection(section, id, axis, 'none', 2)
      parent = findOpening(section, id)!
    }
    for (const child of children(parent))
      section = setSectionSize(section, child.id, {
        kind: 'fixed',
        mm: level === 'root' ? 400 : 160,
      })
    const params = { ...base, section }
    expect(openingGeometry(params, PRESET_MATERIALS, [], 'cabinet').errors.join(' ')).toContain(
      'sections do not fit',
    )
  },
)

it.each([
  { height: 200, depth: 560 },
  { height: 720, depth: 150 },
])(
  'blocks new drawers that cannot fit height $height or depth $depth even when the fronts fit',
  ({ height, depth }) => {
    const params = openingLayout({ ...base, height, depth }, base.section.id, 'drawers')
    expect(openingGeometry(params, PRESET_MATERIALS, [], 'cabinet').errors).toEqual([])
    expect(
      openingLayoutErrors(params, params.section.id, PRESET_MATERIALS, [], 'cabinet').join(' '),
    ).toContain('drawer boxes do not fit')
  },
)

it('reports a stale opening selection during layout preview validation', () => {
  expect(openingLayoutErrors(base, 'missing', PRESET_MATERIALS, [], 'cabinet').join(' ')).toContain(
    'no longer available',
  )
})
