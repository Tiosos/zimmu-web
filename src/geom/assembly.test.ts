import { describe, it, expect } from 'vitest'
import { cabinetSpaceBox, VIEWS, projectBox, culled, buildAssemblyViews } from './assembly'
import type { AssemblyView, CabinetBox } from './assembly'
import type {
  BoardPart,
  CarcaseComponent,
  CarcaseParams,
  Component,
  ComponentId,
  GroupComponent,
  Part,
} from '../scene/types'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { carcaseRoles } from '../scene/carcaseRoles'
import { roleThicknessFor } from '../scene/resolveThickness'
import { jointKindFor } from '../scene/resolveJointKind'

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

  // A panel whose face lands on the cut plane arrives a hair off it, because its position came out
  // of float arithmetic — a centre division in an even-width cabinet is exactly this. Without the
  // tolerance such a panel flips between culled and kept on noise a thousand times smaller than a
  // wood fibre.
  it('culls a part sitting within a whisker of the cut plane', () => {
    const onThePlane = box(params.width / 2 - 1e-13, 400, 0, 560, 0, 720)
    expect(culled(onThePlane, view('End'), params)).toBe(true)
  })
})

// A cabinet asymmetric in every axis. G1 taught this twice: a symmetric fixture passes every
// mutation. W != D != H separates the three planes from each other.
function lopsided(over: Partial<CarcaseParams> = {}): CarcaseParams {
  return { ...CARCASE_PRESETS[0].params, width: 600, height: 720, depth: 560, ...over }
}

// The parts a cabinet's parameters imply, built the way regenerateComponents builds them, so the
// projector is tested against what the app actually holds.
function partsOf(params: CarcaseParams): Part[] {
  const thicknessOf = roleThicknessFor(params, PRESET_MATERIALS, new Map())
  return carcaseRoles(params, thicknessOf, jointKindFor([], cabinet.id)).map((r, i) => ({
    kind: 'board',
    id: `board_${i}`,
    label: r.label,
    length: r.panel.length,
    width: r.panel.width,
    thickness: r.panel.thickness,
    grain: r.grain,
    material: '',
    color: '#888',
    position: r.panel.position,
    rotation: r.panel.rotation,
    rotationOrder: r.panel.rotationOrder,
    cuts: [],
    visible: true,
    parentId: cabinet.id,
    driven: true,
    role: r.role,
  }))
}

const withParams = (params: CarcaseParams): CarcaseComponent => ({ ...cabinet, params })

function viewsOf(params: CarcaseParams, materials = PRESET_MATERIALS) {
  const c = withParams(params)
  const ids = new Map<ComponentId, Component>([[c.id, c]])
  const [front, top, end] = buildAssemblyViews(partsOf(params), ids, c, materials)
  return { front, top, end }
}

const labels = (v: { parts: { label: string }[] }) => v.parts.map((p) => p.label)

describe('the assembled views', () => {
  it('gives each view the extent its own two axes imply', () => {
    const { front, top, end } = viewsOf(lopsided())
    expect([front.bounds.w, front.bounds.h]).toEqual([600, 720]) // W x H
    expect([top.bounds.w, top.bounds.h]).toEqual([600, 560]) // W x D
    expect([end.bounds.w, end.bounds.h]).toEqual([560, 720]) // D x H
  })

  // The whole reason the cull exists. Without it this count is 1.
  it('leaves more than one part visible in the End view', () => {
    expect(labels(viewsOf(lopsided()).end).length).toBeGreaterThan(1)
  })

  it('drops the near side from End and the top panel from Top, and nothing from Front', () => {
    const { front, top, end } = viewsOf(lopsided())
    expect(labels(end)).toContain('Left Side')
    expect(labels(end)).not.toContain('Right Side')
    expect(labels(top)).toContain('Bottom')
    expect(labels(top)).not.toContain('Top')
    expect(labels(front).sort()).toEqual(
      partsOf(lopsided())
        .map((p) => p.label)
        .sort(),
    )
  })

  // Task 2's quality review asked for this at the seam that consumes `corners`, which is the
  // outline path below.
  it('keeps eight corners per part', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    for (const part of partsOf(p)) {
      expect(cabinetSpaceBox(part, ids, c).corners).toHaveLength(8)
    }
  })
})

describe('occlusion', () => {
  const partNamed = (v: AssemblyView, label: string) => v.parts.find((p) => p.label === label)!

  // An overlay door lands ON the carcase face, so it hides what is behind it. That is what overlay
  // means, and it is the case the whole hidden-line machinery exists for.
  it('hides the carcase behind an overlay door in the Front view', () => {
    const { front } = viewsOf(lopsided({ frontMount: 'overlay' }))
    // The shelf, not the bottom panel. A Base 600's door spans z[101.5, 718.5] while its bottom
    // spans z[100, 118], so 1.5 mm of the bottom genuinely shows below the door and asserting it
    // fully hidden would be asserting a cabinet that does not exist. The shelf at z[310, 328],
    // x[20, 580] sits wholly inside the door's rectangle and wholly behind it.
    const shelf = front.parts.find((q) => q.label.startsWith('Adj Shelf'))!
    expect(shelf.hidden.length).toBeGreaterThan(0)
    expect(shelf.solid).toEqual([])
  })

  // …and the sliver that does show is itself worth pinning: an occluder must not swallow an edge
  // it only partly covers.
  it('leaves the strip of the bottom panel that shows below the door', () => {
    const { front } = viewsOf(lopsided({ frontMount: 'overlay' }))
    const bottom = partNamed(front, 'Bottom')
    expect(bottom.hidden.length).toBeGreaterThan(0)
    expect(bottom.solid.length).toBeGreaterThan(0)

    // Per-edge, not per-part. The door spans z[101.5, 718.5] and this edge lies at z=100, so the
    // door does not cross it at all and it must survive whole. Asserting only that the panel has
    // *some* solid left would still pass if this edge went dark and another survived instead.
    const alongBottom = bottom.solid.filter(
      (s) => Math.abs(s.y1 - 100) < 1e-6 && Math.abs(s.y2 - 100) < 1e-6,
    )
    expect(alongBottom).toHaveLength(1)
    expect(alongBottom[0].x2 - alongBottom[0].x1).toBeCloseTo(564, 6)
  })

  // An inset door sits BETWEEN the sides, so it hides neither of them — and their rectangles do not
  // even overlap. A comparator that read "nearer" as "overlapping in depth" would hide them.
  it('does not hide the sides behind an inset door', () => {
    const { front } = viewsOf(lopsided({ frontMount: 'inset' }))
    expect(partNamed(front, 'Left Side').solid.length).toBeGreaterThan(0)
  })

  // Nothing is in front of the frontmost part, so every edge of it is solid.
  it('leaves the nearest part entirely solid', () => {
    const { front } = viewsOf(lopsided({ frontMount: 'overlay' }))
    const door = front.parts.find((p) => p.label.startsWith('Door'))!
    expect(door.hidden).toEqual([])
    expect(door.solid.length).toBe(4)
  })

  // Top looks DOWN, so nearer is larger z. Dropping that inversion makes the bottom panel occlude
  // the top one instead of the other way round.
  it('orders Top by height, nearest first', () => {
    const { top } = viewsOf(lopsided())
    const zs = top.parts.map((p) => p.depthMin)
    expect([...zs].sort((a, b) => a - b)).toEqual(zs)
  })

  // Handed to this task by Task 3's quality review: `Math.min(d0,d1)`/`Math.max(d0,d1)` were not
  // pinned to the near and far edge of *this* box — plain `d0`/`d1` passed, because the only depth
  // test compared two well-separated boxes, where either endpoint preserves the ordering.
  it('reports a single box’s own near and far edges, not an arbitrary endpoint', () => {
    const { top } = viewsOf(lopsided())
    const bottom = top.parts.find((q) => q.label === 'Bottom')!
    // Top looks down, so oriented depth is -z and the bottom panel z[100,118] comes out [-118,-100].
    expect(bottom.depthMin).toBeCloseTo(-118, 6)
    expect(bottom.depthMax).toBeCloseTo(-100, 6)
  })

  it('reports every part solid plus hidden equal to its whole perimeter', () => {
    const { front } = viewsOf(lopsided())
    for (const p of front.parts) {
      const total = [...p.solid, ...p.hidden].reduce(
        (n, s) => n + Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1),
        0,
      )
      const perimeter = p.rects.reduce((n, r) => n + 2 * (r.w + r.h), 0)
      expect(total).toBeCloseTo(perimeter, 4)
    }
  })

  // The one rule this task is about, and no fixture above falsifies its DIRECTION: every pair in a
  // real cabinet either fails the rect-overlap test or is cleanly separated in depth, so
  // `Q.depthMax <= P.depthMin` and its reverse agree on all of them. Two slabs driven through each
  // other tell them apart, and the answer is the stated one — genuine interpenetration is reachable
  // only by moving a detached part by hand, and neither part then occludes the other.
  it('lets two interpenetrating parts occlude each other in neither direction', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const near = board({
      id: 'board_a',
      label: 'Slab A',
      length: 100,
      width: 100,
      thickness: 10,
      position: { x: 0, y: 0, z: 0 },
    })
    const far = board({
      id: 'board_b',
      label: 'Slab B',
      length: 100,
      width: 100,
      thickness: 10,
      position: { x: 0, y: 50, z: 0 },
    })
    // Identical Front rectangles, depths [0,100] and [50,150] — overlapping, not separated.
    const [front] = buildAssemblyViews([near, far], ids, c, PRESET_MATERIALS)
    for (const part of front.parts) {
      expect(part.hidden).toEqual([])
      expect(part.solid).toHaveLength(4)
    }
  })

  // hullOf and the whole non-axis-aligned path are unreached by every other fixture here, because
  // carcaseRoles only ever emits axis-aligned boards. A skewed part is reachable — a user can
  // rotate a detached one — and the rule has two halves: it is drawn as its own outline, and it
  // takes no part in occlusion in either direction.
  it('draws a skewed part as its own outline and lets it occlude nothing', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    const skew = board({
      id: 'board_skew',
      label: 'Skew',
      length: 100,
      width: 100,
      thickness: 10,
      rotation: { x: 0, y: 0, z: 30 },
      position: { x: 200, y: 200, z: 200 },
    })
    // Wholly inside the skewed part's bounding rectangle in Front, and wholly behind it in depth —
    // so it would be hidden if a skewed part were allowed to occlude.
    const behind = board({
      id: 'board_behind',
      label: 'Behind',
      length: 50,
      width: 50,
      thickness: 5,
      position: { x: 200, y: 400, z: 202 },
    })
    const [front] = buildAssemblyViews([skew, behind], ids, c, PRESET_MATERIALS)

    const s = front.parts.find((q) => q.label === 'Skew')!
    expect(s.outline).toBeDefined()
    expect(s.outline!.length).toBeGreaterThan(2)
    expect(s.hidden).toEqual([])

    expect(front.parts.find((q) => q.label === 'Behind')!.hidden).toEqual([])
  })

  // A pair the depth filter admits and the geometry must then reject: the near board really is
  // wholly in front, and only its position in the view plane says it hides nothing. There is no
  // rectangle pre-filter to do that — `splitEdge` reaches the same answer per edge, which is why
  // the pre-filter could be deleted.
  it('does not occlude a part that is nearer but somewhere else entirely', () => {
    const p = lopsided()
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    // Front rects x[0,100] and x[200,300] — disjoint. Depths [0,10] and [100,110] — cleanly
    // ordered, so the near board passes the depth filter and nothing but the geometry stops it.
    const near = board({
      id: 'board_n',
      label: 'Near',
      length: 100,
      width: 10,
      thickness: 100,
      position: { x: 0, y: 0, z: 0 },
    })
    const far = board({
      id: 'board_f',
      label: 'Far',
      length: 100,
      width: 10,
      thickness: 100,
      position: { x: 200, y: 100, z: 0 },
    })
    const [front] = buildAssemblyViews([near, far], ids, c, PRESET_MATERIALS)
    for (const part of front.parts) {
      expect(part.hidden).toEqual([])
      expect(part.solid).toHaveLength(4)
    }
  })
})

import { legacyToSection } from '../scene/migrateSections'
import { splitSection } from '../scene/editSection'

describe('dimensions', () => {
  const dim = (v: { dims: { side: string; ring: number; label: string }[] }, side: string) =>
    v.dims.filter((d) => d.side === side)

  it('dimensions the whole cabinet on every view', () => {
    const { front, top, end } = viewsOf(lopsided())
    expect(dim(front, 'below')[0].label).toBe('600')
    expect(dim(front, 'right')[0].label).toBe('720')
    expect(dim(top, 'below')[0].label).toBe('600')
    expect(dim(top, 'right')[0].label).toBe('560')
    expect(dim(end, 'below')[0].label).toBe('560')
    expect(dim(end, 'right')[0].label).toBe('720')
  })

  // Two bays of a 600 on 18 mm stock: 600 - 2*18 = 564 clear, less an 18 mm partition, halved.
  it('chains the openings across the top of the Front view', () => {
    const p = lopsided({ section: legacyToSection([0.5], 0, 600, 18) })
    expect(dim(viewsOf(p).front, 'above').map((d) => d.label)).toEqual(['273', '273'])
  })

  // An uneven tree is what separates "read the resolved rectangles" from "read the tree's
  // percentages": with equal bays the two agree.
  it('chains uneven bays at their resolved sizes', () => {
    const p = lopsided({ section: legacyToSection([0.25], 0, 600, 18) })
    const chain = dim(viewsOf(p).front, 'above').map((d) => Number(d.label))
    expect(chain).toHaveLength(2)
    expect(chain[0]).toBeLessThan(chain[1])
    expect(chain[0] + chain[1] + 18).toBe(564)
  })

  // Two leaves stacked in one bay share that bay's x-span. Without the dedupe the chain would
  // dimension the same 564 mm twice, one line on top of the other.
  it('dimensions a shared span once, however many leaves sit in it', () => {
    const root = legacyToSection([], 0, 600, 18)
    const split = splitSection(root, root.id, 'horizontal', 'panel', 2)
    const across = dim(viewsOf(lopsided({ section: split })).front, 'above')
    expect(across).toHaveLength(1)
    expect(across[0].label).toBe('564')
  })

  it('puts the toe kick on its own ring so it cannot collide with the opening chain', () => {
    const { front } = viewsOf(lopsided())
    const left = dim(front, 'left')
    const kick = left.find((d) => d.label === '100')
    expect(kick).toBeDefined()
    expect(kick!.ring).toBe(2)
    expect(left.filter((d) => d.ring === 1).every((d) => d.label !== '100')).toBe(true)
  })

  // The claim is not that two dimensions never share a side and a ring — a chain is by nature
  // several entries laid end to end on one — but that two on the same side and ring never
  // *overlap*. That is what "collision prevented by construction" means. Keying on the exact span
  // instead, as an earlier version did, catches only an exact duplicate and lets two families
  // quietly land on top of each other.
  it('never lets two dimensions on one side and ring overlap', () => {
    const twoBays = lopsided({ section: legacyToSection([0.5], 0, 600, 18) })
    for (const v of Object.values(viewsOf(twoBays))) {
      const byRing = new Map<string, { start: number; end: number }[]>()
      for (const d of v.dims) {
        const key = `${d.side}:${d.ring}`
        const span = { start: Math.min(d.start, d.end), end: Math.max(d.start, d.end) }
        for (const other of byRing.get(key) ?? []) {
          const overlaps = span.start < other.end - 1e-6 && other.start < span.end - 1e-6
          expect(
            overlaps,
            `${v.label} ${key}: ${span.start}..${span.end} overlaps ${other.start}..${other.end}`,
          ).toBe(false)
        }
        byRing.set(key, [...(byRing.get(key) ?? []), span])
      }
    }
  })

  // The override-before-layout rule: a 25 mm left side makes the clear opening 564 - 7 = 557 wide.
  // Passing an empty override map instead reads 564 and draws an opening the boards do not have.
  it('reads per-part thickness overrides in the opening chain', () => {
    const p = lopsided()
    const base = partsOf(p)
    const parts = base.map((part) =>
      part.kind === 'board' && part.role === 'left-side'
        ? { ...part, overrides: { thickness: 25 } }
        : part,
    )
    const c = withParams(p)
    const ids = new Map<ComponentId, Component>([[c.id, c]])
    // PRESET_MATERIALS, not a thicker fixture: `roleThicknessFor` returns an explicit override
    // before it ever consults the materials map, so the override alone is what this asserts.
    const [front] = buildAssemblyViews(parts, ids, c, PRESET_MATERIALS)
    expect(front.dims.filter((d) => d.side === 'above')[0].label).toBe('557')
  })
})
