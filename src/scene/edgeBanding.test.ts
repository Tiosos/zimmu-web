import { describe, expect, it } from 'vitest'
import {
  bandedEdgeLengths,
  cutPartOf,
  cutSizeOf,
  edgeCode,
  edgesOf,
  edgeRuleOf,
} from './edgeBanding'
import { orientedPanel } from './carcaseLayout'
import { applyMatrixToPoint, composeWorldMatrix } from '../geom/transform'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { DEFAULT_CARCASE_MATERIAL, PRESET_MATERIALS } from './carcasePresets'
import type { BoardPart, Component, ComponentId, MaterialDef } from './types'

const ABS: MaterialDef = { thickness: 1, use: 'edge' }
const materials = { ...PRESET_MATERIALS, 'ABS 1mm': ABS, 'ABS 2mm': { thickness: 2, use: 'edge' as const } }
const banded = { ...cabinet, params: { ...cabinet.params, edgeMaterial: 'ABS 1mm' } }
const byId = new Map<ComponentId, Component>([[banded.id, banded]])
const boards = partsOfCarcase(banded.params).filter((p): p is BoardPart => p.kind === 'board')
const role = (name: string): BoardPart => boards.find((p) => p.role === name)!

describe('the role rule', () => {
  it.each([
    ['left-side', 1],
    ['right-side', 1],
    ['top', 1],
    ['bottom', 1],
    ['division-x-0', 1],
    ['adj-shelf-a-0', 1],
    ['fixed-shelf-a-0', 1],
    ['back', 0],
    ['toe-kick', 0],
    ['stile-left', 0],
    ['rail-top', 0],
    ['box-front', 0],
  ])('%s bands %i direction(s)', (name, count) => {
    const rule = edgeRuleOf(name)
    expect(rule === 'all' ? 4 : rule.length).toBe(count)
  })

  it('bands every edge of a front', () => {
    expect(edgeRuleOf('front-a-0')).toBe('all')
  })
})

describe('direction to board edge', () => {
  // Independent of the implementation's normal rotation: build the real panel for each thickness
  // axis, take the midpoint of the edge the rule picked, carry it through the panel's own
  // placement, and require it to land on the box's front (min y) face.
  const box = { x0: 100, x1: 700, y0: 40, y1: 560, z0: 10, z1: 730 }
  it.each([
    ['z', 'bottom'],
    ['x', 'left-side'],
  ] as const)('puts the front edge of a thickness-%s panel on the min-y face (%s)', (axis, name) => {
    const panel = orientedPanel(box, axis)
    const part = { ...role(name), rotation: panel.rotation, position: panel.position,
      length: panel.length, width: panel.width, thickness: panel.thickness }
    const edges = edgesOf(part, byId, materials)
    const key = (['x0', 'x1', 'y0', 'y1'] as const).find((k) => edges[k] !== null)!
    const mid = {
      x0: [0, panel.width / 2, 0],
      x1: [panel.length, panel.width / 2, 0],
      y0: [panel.length / 2, 0, 0],
      y1: [panel.length / 2, panel.width, 0],
    }[key]
    const m = composeWorldMatrix({ position: panel.position, rotation: panel.rotation })
    expect(applyMatrixToPoint(m, mid[0], mid[1], mid[2])[1]).toBeCloseTo(box.y0, 6)
  })

  it('finds no front edge on a panel whose thickness runs front to back', () => {
    const part = { ...role('top'), rotation: orientedPanel(box, 'y').rotation }
    expect(edgesOf(part, byId, materials)).toEqual({ x0: null, x1: null, y0: null, y1: null })
  })

  it('flips a side and a bottom differently: side front is x0, bottom front is y0', () => {
    expect(edgesOf(role('left-side'), byId, materials)).toEqual({ x0: 'ABS 1mm', x1: null, y0: null, y1: null })
    expect(edgesOf(role('bottom'), byId, materials)).toEqual({ x0: null, x1: null, y0: 'ABS 1mm', y1: null })
  })
})

describe('effective edges', () => {
  it('bands all four edges of a door', () => {
    const door: BoardPart = { ...role('left-side'), role: 'front-a-0' }
    expect(Object.values(edgesOf(door, byId, materials))).toEqual(['ABS 1mm', 'ABS 1mm', 'ABS 1mm', 'ABS 1mm'])
  })

  it('bands nothing without a cabinet edge material', () => {
    const plain = new Map<ComponentId, Component>([[cabinet.id, cabinet]])
    expect(edgesOf(role('left-side'), plain, materials)).toEqual({ x0: null, x1: null, y0: null, y1: null })
  })

  it.each([['a missing material', 'Ghost'], ['a panel material', DEFAULT_CARCASE_MATERIAL]])(
    'bands nothing automatically when the cabinet edge material is %s',
    (_name, edgeMaterial) => {
      const c = { ...cabinet, params: { ...cabinet.params, edgeMaterial } }
      const map = new Map<ComponentId, Component>([[c.id, c]])
      const side = role('left-side')
      const edges = edgesOf(side, map, materials)
      expect(edges).toEqual({ x0: null, x1: null, y0: null, y1: null })
      expect(cutSizeOf(side, edges, materials).problem).toBeUndefined()
    },
  )

  it('lets an explicit null beat the rule and an explicit material beat the default', () => {
    const side = { ...role('left-side'), edgeBanding: { x0: null, y1: 'ABS 2mm' } }
    expect(edgesOf(side, byId, materials)).toEqual({ x0: null, x1: null, y0: null, y1: 'ABS 2mm' })
  })

  it('follows only explicit edges on a detached board', () => {
    const detached = { ...role('left-side'), driven: false, edgeBanding: { y0: 'ABS 1mm' } }
    expect(edgesOf(detached, byId, materials)).toEqual({ x0: null, x1: null, y0: 'ABS 1mm', y1: null })
  })

  it('reports no edges at all on a mitred board', () => {
    const mitred = { ...role('left-side'), cuts: [{ id: 'm', kind: 'mitre', label: 'Mitre' }] } as unknown as BoardPart
    expect(edgesOf(mitred, byId, materials)).toEqual({ x0: null, x1: null, y0: null, y1: null })
  })
})

describe('cut size', () => {
  const part = (over: Partial<BoardPart> = {}): BoardPart => ({ ...role('bottom'), length: 564, width: 520, ...over })
  const e = (x0: string | null, x1: string | null, y0: string | null, y1: string | null) => ({ x0, x1, y0, y1 })

  it('subtracts each banded edge from the dimension it runs across', () => {
    expect(cutSizeOf(part(), e(null, null, 'ABS 1mm', null), materials)).toMatchObject({ length: 564, width: 519 })
    expect(cutSizeOf(part(), e('ABS 1mm', 'ABS 1mm', null, null), materials)).toMatchObject({ length: 562, width: 520 })
    expect(cutSizeOf(part(), e('ABS 1mm', 'ABS 1mm', 'ABS 1mm', 'ABS 1mm'), materials)).toMatchObject({ length: 562, width: 518 })
  })

  it('uses each edge its own thickness', () => {
    expect(cutSizeOf(part(), e('ABS 1mm', 'ABS 2mm', null, null), materials).length).toBe(561)
  })

  it('reports a problem rather than a clamped size when nothing is left', () => {
    const r = cutSizeOf(part({ width: 2 }), e(null, null, 'ABS 1mm', 'ABS 1mm'), materials)
    expect(r.width).toBe(0)
    expect(r.problem).toMatch(/zero or negative/)
  })

  it('reports a problem for an edge material with no thickness', () => {
    const r = cutSizeOf(part(), e(null, null, 'Ghost', null), materials)
    expect(r.problem).toMatch(/Ghost/)
  })
})

describe('shop code and run lengths', () => {
  const all = { x0: 'ABS 1mm', x1: 'ABS 1mm', y0: 'ABS 1mm', y1: null }
  it('counts long and short edges in cutlist orientation', () => {
    expect(edgeCode(all, false)).toBe('1L2S')
    expect(edgeCode(all, true)).toBe('2L1S')
    expect(edgeCode({ x0: null, x1: null, y0: null, y1: null }, false)).toBe('')
  })

  it('sums run lengths per edge material in finished dimensions', () => {
    const part = { ...role('bottom'), length: 564, width: 520 }
    expect(bandedEdgeLengths(part, { x0: 'ABS 1mm', x1: null, y0: 'ABS 2mm', y1: null })).toEqual([
      { material: 'ABS 1mm', mm: 520 },
      { material: 'ABS 2mm', mm: 564 },
    ])
  })
})

describe('cutPartOf', () => {
  it('shrinks the part and shifts through-cuts by the banded x0 and y0 thickness', () => {
    const cut = { id: 'c', kind: 'box', label: 'N', position: { x: 10, y: 20, z: -1 }, size: { x: 5, y: 5, z: 40 } }
    const part = { ...role('bottom'), length: 564, width: 520, cuts: [cut] } as unknown as BoardPart
    const banded2 = { ...part, edgeBanding: { x0: 'ABS 2mm', y0: 'ABS 1mm' } }
    const out = cutPartOf(banded2, byId, materials)
    expect(out.length).toBe(562)
    expect(out.width).toBe(519)
    const moved = out.cuts[0] as unknown as { position: { x: number; y: number } }
    expect([moved.position.x, moved.position.y]).toEqual([8, 19])
  })

  it('returns the finished part unchanged when there is a problem', () => {
    const part = { ...role('bottom'), width: 2, edgeBanding: { y0: 'ABS 1mm', y1: 'ABS 1mm' } }
    expect(cutPartOf(part, byId, materials)).toBe(part)
  })
})
