import { describe, it, expect } from 'vitest'
import { cabinetSpaceBox, VIEWS, projectBox, culled } from './assembly'
import type { CabinetBox } from './assembly'
import type {
  BoardPart,
  CarcaseComponent,
  Component,
  ComponentId,
  GroupComponent,
} from '../scene/types'
import { CARCASE_PRESETS } from '../scene/carcasePresets'

const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'cmp_1',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

function board(over: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'board_1',
    label: 'Left Side',
    length: 560,
    width: 720,
    thickness: 18,
    grain: 'length',
    material: '',
    color: '#c8a',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: cabinet.id,
    driven: true,
    ...over,
  }
}

describe('cabinetSpaceBox', () => {
  it('puts an unrotated board at its own position', () => {
    const b = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), byId, cabinet)
    expect(b.min).toEqual({ x: 10, y: 20, z: 30 })
    expect(b.max).toEqual({ x: 570, y: 740, z: 48 })
    expect(b.axisAligned).toBe(true)
  })

  // The carcase generator only ever emits rotations of 0 or ±90, so every driven panel is an
  // axis-aligned box in cabinet space even though most of them are "rotated".
  it('calls a 90-degree rotated board axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 90, z: 90 } }), byId, cabinet)
    expect(b.axisAligned).toBe(true)
  })

  // The mutation this exists for: a `rotation === 0` test would call this NOT axis-aligned and
  // silently exempt the part from occlusion, while its box is a perfectly ordinary rectangle.
  it('calls a 180-degree rotated board axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 0, z: 180 } }), byId, cabinet)
    expect(b.axisAligned).toBe(true)
    expect(b.max.x - b.min.x).toBeCloseTo(560, 6)
    expect(b.max.y - b.min.y).toBeCloseTo(720, 6)
  })

  it('calls a 30-degree rotated board not axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 0, z: 30 } }), byId, cabinet)
    expect(b.axisAligned).toBe(false)
  })

  // The cabinet may sit anywhere in the scene. Its own projection must not move when it does.
  it('is unchanged by moving and rotating the cabinet itself', () => {
    const moved: CarcaseComponent = {
      ...cabinet,
      position: { x: 1000, y: -400, z: 90 },
      rotation: { x: 0, y: 0, z: 90 },
    }
    const movedById = new Map<ComponentId, Component>([[moved.id, moved]])
    const a = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), byId, cabinet)
    const b = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), movedById, moved)
    expect(b.min.x).toBeCloseTo(a.min.x, 6)
    expect(b.min.y).toBeCloseTo(a.min.y, 6)
    expect(b.min.z).toBeCloseTo(a.min.z, 6)
    expect(b.max.x).toBeCloseTo(a.max.x, 6)
  })

  it('gives a cylinder the box its diameter and length imply', () => {
    const dowel = {
      kind: 'cylinder' as const,
      id: 'board_2',
      label: 'Dowel 1',
      diameter: 8,
      length: 40,
      material: '',
      color: '#ca8',
      position: { x: 100, y: 100, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: cabinet.id,
      driven: false,
    }
    const b = cabinetSpaceBox(dowel, byId, cabinet)
    expect(b.min).toEqual({ x: 96, y: 96, z: 0 })
    expect(b.max).toEqual({ x: 104, y: 104, z: 40 })
    // A cylinder is never an occluder: its box is not its shape.
    expect(b.axisAligned).toBe(false)
  })

  // A board can be axis-aligned in its OWN frame and not in the cabinet's: its rotation is zero,
  // but a group between it and the cabinet is turned 45 degrees. This is the case that separates
  // "read the corners" from "read the rotation" — every other fixture here is a multiple of 90,
  // which a rotation-based test gets right by luck.
  it('is not axis-aligned when an intervening group is rotated', () => {
    const group: GroupComponent = {
      kind: 'group',
      id: 'cmp_2',
      label: 'Skewed',
      parentId: cabinet.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 45 },
      rotationOrder: 'XYZ',
      visible: true,
    }
    const nested = new Map<ComponentId, Component>([
      [cabinet.id, cabinet],
      [group.id, group],
    ])
    const b = cabinetSpaceBox(board({ parentId: group.id }), nested, cabinet)
    expect(b.axisAligned).toBe(false)
  })
})

// A Base 600's real dimensions, so the numbers below are the ones a cabinet actually produces.
const params = CARCASE_PRESETS[0].params // 600 wide, 720 high, 560 deep

const box = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): CabinetBox => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
  axisAligned: true,
  corners: [],
})

// The real roles, so a mistake shows up as a cabinet part in the wrong place rather than as an
// abstract number.
const LEFT_SIDE = box(0, 18, 0, 560, 0, 720)
const RIGHT_SIDE = box(582, 600, 0, 560, 0, 720)
const BACK = box(18, 582, 548, 560, 118, 702)
const TOP_PANEL = box(18, 582, 0, 560, 702, 720)
const BOTTOM = box(18, 582, 0, 560, 100, 118)

const view = (label: 'Front' | 'Top' | 'End') => VIEWS.find((v) => v.label === label)!

describe('the three planes', () => {
  it('names the views Front, Top and End in that order', () => {
    expect(VIEWS.map((v) => v.label)).toEqual(['Front', 'Top', 'End'])
  })

  // W != D != H, so a view that took the wrong axis for u or v is visible in the extent alone.
  it('maps each view to its own two axes', () => {
    expect(projectBox(LEFT_SIDE, view('Front'), params).rect).toEqual({ x: 0, y: 0, w: 18, h: 720 })
    expect(projectBox(LEFT_SIDE, view('Top'), params).rect).toEqual({ x: 0, y: 0, w: 18, h: 560 })
  })

  // End looks from +x, so screen-right is -y and the cabinet's FRONT lands on the right. The back
  // panel is the clearest witness: it sits at the far left of the view, not the far right.
  it('puts the cabinet’s front on the right of the End view', () => {
    const back = projectBox(BACK, view('End'), params).rect
    expect(back.x).toBeCloseTo(0, 6)
    expect(back.w).toBeCloseTo(12, 6)
  })

  // Depth is emitted pre-oriented so smaller always means nearer. Top looks DOWN, so a high part
  // must come out with a smaller depth than a low one — the inversion is resolved here, once, and
  // no consumer carries a per-view sign.
  it('orients depth so that smaller is nearer in every view', () => {
    const frontNear = projectBox(box(0, 600, -18, 0, 0, 720), view('Front'), params)
    const frontFar = projectBox(LEFT_SIDE, view('Front'), params)
    expect(frontNear.depthMin).toBeLessThan(frontFar.depthMin)

    expect(projectBox(TOP_PANEL, view('Top'), params).depthMin).toBeLessThan(
      projectBox(BOTTOM, view('Top'), params).depthMin,
    )

    expect(projectBox(RIGHT_SIDE, view('End'), params).depthMin).toBeLessThan(
      projectBox(LEFT_SIDE, view('End'), params).depthMin,
    )
  })
})

describe('the near-half cull', () => {
  // Pure hidden-line removal of a closed box is one solid rectangle: measured on a Base 600's End
  // view, six of seven parts are completely hidden by the near side. Top and End are therefore
  // sections, cut at the parameter midpoint.
  it('culls the near side from End and keeps the far one', () => {
    expect(culled(RIGHT_SIDE, view('End'), params)).toBe(true)
    expect(culled(LEFT_SIDE, view('End'), params)).toBe(false)
  })

  it('culls the top panel from Top and keeps the bottom', () => {
    expect(culled(TOP_PANEL, view('Top'), params)).toBe(true)
    expect(culled(BOTTOM, view('Top'), params)).toBe(false)
  })

  // A part crossing the plane is drawn whole — that is what makes the section need no
  // partial-cutting geometry.
  it('keeps a part that straddles the cut plane', () => {
    expect(culled(LEFT_SIDE, view('Top'), params)).toBe(false) // z 0..720 spans the H/2 plane
    expect(culled(BACK, view('End'), params)).toBe(false) // x 18..582 spans the W/2 plane
  })

  // Front is a view, not a section. An elevation that dropped its door would be useless, and the
  // door is the nearest thing in it.
  it('never culls anything from Front', () => {
    for (const b of [LEFT_SIDE, RIGHT_SIDE, BACK, TOP_PANEL, BOTTOM]) {
      expect(culled(b, view('Front'), params)).toBe(false)
    }
    expect(culled(box(0, 600, -18, 0, 100, 718), view('Front'), params)).toBe(false)
  })
})
