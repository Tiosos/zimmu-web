import { describe, expect, it } from 'vitest'
import { regenerateDrawers } from './regenerateDrawers'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { splitSection } from './editSection'
import { setFrontOn } from './sectionInterior'
import type { Section } from './sectionTree'
import {
  BOTTOM_GROOVE_DEPTH,
  BOTTOM_GROOVE_UP,
  SIDE_MOUNT_CLEARANCE,
  UNDERMOUNT_HOLE_ABOVE_NOTCH,
  UNDERMOUNT_NOTCH_HEIGHT,
  UNDERMOUNT_NOTCH_WIDTH,
} from './drawerBox'
import { componentsById } from './componentTree'
import { grainAxisOf } from './grain'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'
import type {
  BoardPart,
  CarcaseParams,
  ComponentId,
  CutDef,
  DrawerComponent,
  Scene,
  Vec3,
} from './types'

const sceneOf = (params: CarcaseParams, components: DrawerComponent[] = []): Scene => ({
  parts: [],
  materials: { ...PRESET_MATERIALS },
  hardware: [],
  joints: [],
  components: [
    {
      kind: 'carcase',
      id: 'cmp_1' as ComponentId,
      label: 'Base A',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params,
    },
    ...components,
  ],
})

const drawersOf = (s: Scene): DrawerComponent[] =>
  s.components.filter((c): c is DrawerComponent => c.kind === 'drawer')

const childrenOf = (s: Section): Section[] => (s.content.kind === 'split' ? s.content.children : [])

const withParams = (s: Scene, params: CarcaseParams): Scene => ({
  ...s,
  components: s.components.map((c) => (c.kind === 'carcase' ? { ...c, params } : c)),
})

const BASE = CARCASE_PRESETS[0].params
const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const

const withFront = (front: Parameters<typeof setFrontOn>[2]): CarcaseParams => ({
  ...BASE,
  section: setFrontOn(BASE.section, BASE.section.id, front),
})

const oneDrawer = (): CarcaseParams => withFront({ kind: 'drawer-front' })

// Two bays side by side. Two bays are what distinguish "the opening that asked" from "the first
// opening" — a single-bay fixture cannot.
const twoBays = (
  left: Parameters<typeof setFrontOn>[2],
  right: Parameters<typeof setFrontOn>[2],
): CarcaseParams => {
  let section = splitSection(BASE.section, BASE.section.id, 'vertical', 'panel', 2)
  const kids = childrenOf(section)
  section = setFrontOn(section, kids[0].id, left)
  section = setFrontOn(section, kids[1].id, right)
  return { ...BASE, section }
}

// The same two sections, swapped so each keeps its id and changes its place.
const swapBays = (params: CarcaseParams): CarcaseParams => {
  const content = params.section.content
  if (content.kind !== 'split') throw new Error('fixture is not split')
  return {
    ...params,
    section: {
      ...params.section,
      content: { ...content, children: [...content.children].reverse() },
    },
  }
}

describe('regenerateDrawers — component reconciliation', () => {
  it('creates one drawer per drawer-front opening', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0].parentId).toBe('cmp_1')
    expect(drawersOf(out)[0].sectionId).toBe(BASE.section.id)
    expect(drawersOf(out)[0].driven).toBe(true)
  })

  it('creates none for a door and none for a panel', () => {
    expect(drawersOf(regenerateDrawers(sceneOf(withFront(DOOR))))).toHaveLength(0)
    expect(drawersOf(regenerateDrawers(sceneOf(withFront({ kind: 'panel' }))))).toHaveLength(0)
  })

  // Every fixture in this file arrives with a front on every leaf, so nothing else reaches the
  // `front?.` with nothing to read — and a bare opening is the ordinary one, not an edge case: a
  // user splits a section long before deciding what covers it.
  it('creates none for an opening that wears nothing at all', () => {
    const bare = { ...BASE, section: { ...BASE.section, front: undefined } }
    expect(drawersOf(regenerateDrawers(sceneOf(bare)))).toHaveLength(0)
  })

  it('names the opening that asked, not the first one', () => {
    // Drawer on the RIGHT bay: `sectionOpenings` orders bottom-left first, so the first opening is
    // the door. A fixture with the drawer on the left would pass whether or not the id is read.
    const params = twoBays(DOOR, { kind: 'drawer-front' })
    const right = childrenOf(params.section)[1]
    const out = regenerateDrawers(sceneOf(params))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0].sectionId).toBe(right.id)
  })

  it('gives two drawer-front openings one drawer each', () => {
    const params = twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })
    const ids = childrenOf(params.section).map((s) => s.id)
    const out = regenerateDrawers(sceneOf(params))
    expect(
      drawersOf(out)
        .map((d) => d.sectionId)
        .sort(),
    ).toEqual([...ids].sort())
  })

  // Identity where nothing is generated, and identity of the COMPONENT list where something is: a
  // drawer comes back as the very object it was. Its boards do not, because every board is rebuilt
  // each pass — measured of `regenerateComponents`, which returns a fresh parts array for a carcase
  // whose panels have not moved. Value idempotence is the house standard for generated parts; the
  // board tests below assert it directly, ids included.
  it('is idempotent: a second pass returns the very same components', () => {
    const empty = regenerateDrawers(sceneOf(withFront(DOOR)))
    expect(regenerateDrawers(empty)).toBe(empty)

    const once = regenerateDrawers(
      sceneOf(twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })),
    )
    expect(regenerateDrawers(once).components).toBe(once.components)
  })

  it('preserves an existing driven drawer rather than replacing it', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const twice = regenerateDrawers(once)
    expect(drawersOf(twice)[0]).toBe(drawersOf(once)[0])
  })

  it('removes a drawer whose opening stopped wearing a drawer front', () => {
    const withDrawer = regenerateDrawers(sceneOf(oneDrawer()))
    expect(drawersOf(withDrawer)).toHaveLength(1)
    expect(drawersOf(regenerateDrawers(withParams(withDrawer, withFront(DOOR))))).toHaveLength(0)
  })

  // A detached drawer is the user's. The component-level mirror of the detached-part rule — kept
  // when its opening goes, and with the section id released, exactly as `regenerateOne` keeps a
  // detached part as `{ ...p, role: undefined }`.
  it('keeps a detached drawer whose opening is gone, with its section id released', () => {
    const withDrawer = regenerateDrawers(sceneOf(oneDrawer()))
    const detached = {
      ...withDrawer,
      components: withDrawer.components.map((c) =>
        c.kind === 'drawer' ? { ...c, driven: false } : c,
      ),
    }
    const out = regenerateDrawers(withParams(detached, withFront(DOOR)))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0].driven).toBe(false)
    expect(drawersOf(out)[0].sectionId).toBeNull()
  })

  // The two halves of the leftover rule read against one another, in one scene: the driven drawer
  // whose opening is gone is deleted, the detached one beside it is kept. A fixture holding only
  // one of them cannot tell "keeps detached leftovers" from "keeps all leftovers".
  it('drops a driven leftover and releases a detached one beside it', () => {
    const params = twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })
    const [leftId] = childrenOf(params.section).map((s) => s.id)
    const once = regenerateDrawers(sceneOf(params))
    const mixed = {
      ...once,
      components: once.components.map((c) =>
        c.kind === 'drawer' && c.sectionId === leftId ? { ...c, driven: false } : c,
      ),
    }
    const out = regenerateDrawers(withParams(mixed, twoBays(DOOR, DOOR)))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0]).toMatchObject({ driven: false, sectionId: null })
  })

  // The other half of the reconciliation rule, and the one this file used to assert backwards: a
  // detached drawer *satisfies* its opening and comes back by identity, so no driven drawer is
  // built beside it. Two five-board boxes in one bay is what the old rule produced — double-counted
  // in the cutting list and both drawn in 3D. Identity, not a count: returning an edited copy would
  // pass a length assertion and still be regeneration of the user's drawer.
  it('lets a detached drawer satisfy its opening, untouched', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const mine = { ...drawersOf(once)[0], driven: false }
    const out = regenerateDrawers(sceneOf(oneDrawer(), [mine]))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0]).toBe(mine)
  })

  // What releasing the section id buys. The shim rebuilds a tree's ids on every keystroke, but a
  // preset's do not move, so a drawer that kept a stale id would re-adopt the very opening it was
  // released from — silently, and carrying whatever parameters it had when the user detached it.
  it('does not let a released drawer reclaim an opening that reappears', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const released = { ...drawersOf(once)[0], driven: false, sectionId: null }
    const out = regenerateDrawers(sceneOf(oneDrawer(), [released]))
    expect(drawersOf(out)).toHaveLength(2)
    expect(drawersOf(out).find((d) => !d.driven)).toBe(released)
    expect(drawersOf(out).filter((d) => d.driven)).toHaveLength(1)
    expect(drawersOf(out).find((d) => d.driven)?.sectionId).toBe(BASE.section.id)
  })

  it('follows the section id when a section changes position', () => {
    const params = twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })
    const [leftId, rightId] = childrenOf(params.section).map((s) => s.id)
    const once = regenerateDrawers(sceneOf(params))

    // Mark the right-hand bay's drawer so it can be told from the left-hand one by its parameters.
    const marked = {
      ...once,
      components: once.components.map((c) =>
        c.kind === 'drawer' && c.sectionId === rightId
          ? { ...c, params: { ...c.params, boxHeight: 111 } }
          : c,
      ),
    }
    const out = regenerateDrawers(withParams(marked, swapBays(params)))

    expect(
      drawersOf(out)
        .map((d) => d.sectionId)
        .sort(),
    ).toEqual([leftId, rightId].sort())
    expect(drawersOf(out).find((d) => d.sectionId === rightId)?.params.boxHeight).toBe(111)
    expect(drawersOf(out).find((d) => d.sectionId === leftId)?.params.boxHeight).toBeNull()
  })

  // Array order is what the scene tree shows — `SceneTree` lists a cabinet's children by filtering
  // `components` — so the drawers come back in the openings' own order, bottom-left first, the
  // order `sectionOpenings` states. This is also the one claim that separates the element-wise
  // "nothing changed" check from a set-wise one: after a swap the list holds the same two drawer
  // objects, so equal length plus mutual membership calls the stale order unchanged and returns it.
  it('relists the drawers in the openings’ order after a swap', () => {
    const params = twoBays({ kind: 'drawer-front' }, { kind: 'drawer-front' })
    const [leftId, rightId] = childrenOf(params.section).map((s) => s.id)
    const once = regenerateDrawers(sceneOf(params))
    expect(drawersOf(once).map((d) => d.sectionId)).toEqual([leftId, rightId])

    const swapped = withParams(once, swapBays(params))
    const out = regenerateDrawers(swapped)
    expect(out).not.toBe(swapped)
    expect(drawersOf(out).map((d) => d.sectionId)).toEqual([rightId, leftId])
  })

  // `regenerateOne` preserves the last good parts rather than emptying a cabinet mid-keystroke; a
  // drawer carries per-drawer parameters, so deleting and recreating one would lose them for a
  // width of `6` typed on the way to `600`.
  it('keeps a cabinet’s drawers while its parameters do not resolve', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const out = regenerateDrawers(withParams(once, { ...oneDrawer(), width: 6 }))
    expect(drawersOf(out)[0]).toBe(drawersOf(once)[0])
  })

  // The detached half of the same rule, and the half the driven fixture above cannot see. A drawer
  // carried through an unresolvable cabinet has to be *claimed*, not merely listed: listed only, the
  // release pass below no longer sees it as spoken for and emits a second, section-id-released copy
  // of it — two components sharing one id, the very duplicate this rule exists to prevent. The
  // length is the claim; the identity is what separates “kept” from “rebuilt”.
  it('claims a detached drawer while its cabinet’s parameters do not resolve', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const detached = {
      ...once,
      components: once.components.map((c) => (c.kind === 'drawer' ? { ...c, driven: false } : c)),
    }
    const out = regenerateDrawers(withParams(detached, { ...oneDrawer(), width: 6 }))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0]).toBe(drawersOf(detached)[0])
  })
})

const boardsOf = (s: Scene, drawerId: string): BoardPart[] =>
  s.parts.filter((p): p is BoardPart => p.kind === 'board' && p.parentId === drawerId)

describe('regenerateDrawers — the boards', () => {
  it('emits five boards, one per role', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const roles = boardsOf(out, drawer.id)
      .map((b) => b.role)
      .sort()
    expect(roles).toEqual(['box-back', 'box-bottom', 'box-front', 'box-left', 'box-right'])
  })

  it('parents every board to the drawer, not to the cabinet', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    expect(boardsOf(out, drawer.id)).toHaveLength(5)
    expect(out.parts.filter((p) => p.parentId === 'cmp_1')).toHaveLength(0)
  })

  it('runs the sides the full depth and fits the front and back between them', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const boards = boardsOf(out, drawer.id)
    const left = boards.find((b) => b.role === 'box-left')!
    const front = boards.find((b) => b.role === 'box-front')!
    const t = left.thickness
    // A 564 mm clear opening takes the side clearance off each side; the front then sits between
    // the two sides. Both expectations are built from the fixture's own numbers, not from the
    // function under test.
    //
    // The span between the sides is the front's WIDTH, not its length: `orientedPanel` runs a
    // board's length along the first in-plane carcase axis of its thickness axis, which is carcase
    // y (the depth) for a side and carcase z (the height) for a front. So a front is a tall board
    // cut to the box's height, exactly as it is on the bench.
    expect(front.width).toBeCloseTo(564 - 2 * SIDE_MOUNT_CLEARANCE - 2 * t, 6)
    expect(front.length).toBeCloseTo(left.width, 6)
    // Base 600 is 560 deep with a 12 mm captured back, so 548 clear, which picks the 500 nominal.
    expect(left.length).toBe(500)
  })

  // Four, because a side-mount back is grooved like the other three. An undermount back is notched
  // instead and is grooved by nothing, which the undermount block below pins at three.
  it('grooves all four walls of a side-mount box for the bottom', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const grooved = boardsOf(out, drawer.id).filter((b) =>
      b.cuts.some((c) => c.id.startsWith('groove_')),
    )
    expect(grooved).toHaveLength(4)
    expect(grooved.every((b) => b.role !== 'box-bottom')).toBe(true)
  })

  // The groove is a slot as wide as the board it captures and as deep into the face as the groove
  // figure — not a through-cut, which would saw the side in two along its length.
  it('cuts the groove as a slot, not through the side', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const boards = boardsOf(out, drawer.id)
    const left = boards.find((b) => b.role === 'box-left')!
    const bottom = boards.find((b) => b.role === 'box-bottom')!
    const groove = left.cuts.find((c) => c.id.startsWith('groove_'))!
    if (groove.kind !== 'box') throw new Error('the bottom groove is a box cut')
    expect(groove.size.z).toBe(BOTTOM_GROOVE_DEPTH)
    expect(groove.size.z).toBeLessThan(left.thickness)
    expect(groove.size.y).toBe(bottom.thickness)
    expect(groove.size.x).toBe(left.length)
    expect(groove.position.y).toBe(BOTTOM_GROOVE_UP)
  })

  it('sizes the bottom from the groove rather than from a sixth number', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const boards = boardsOf(out, drawer.id)
    const bottom = boards.find((b) => b.role === 'box-bottom')!
    const left = boards.find((b) => b.role === 'box-left')!
    const front = boards.find((b) => b.role === 'box-front')!
    // Inside width plus twice the groove depth, derived here from the other boards rather than by
    // calling the function under test.
    //
    // The bottom is a thickness-on-z panel, so its LENGTH runs carcase x — the box's width — and
    // its width runs carcase y, the depth. The mirror of the front's swap above, and the reason
    // these two figures read the other way round from the boards they are derived from.
    expect(bottom.length).toBeCloseTo(front.width + 2 * BOTTOM_GROOVE_DEPTH, 6)
    expect(bottom.width).toBeCloseTo(left.length - 2 * front.thickness + 2 * BOTTOM_GROOVE_DEPTH, 6)
  })

  it('emits no boards at all when the cabinet is too shallow for a runner', () => {
    const shallow = { ...oneDrawer(), depth: 200 }
    const out = regenerateDrawers(sceneOf(shallow))
    const drawer = drawersOf(out)[0]
    expect(drawer).toBeDefined()
    expect(boardsOf(out, drawer.id)).toHaveLength(0)
  })

  // The other way a box is refused: `drawerBoxMetrics` declines a degenerate opening as readily as
  // a missing runner, and a decline is a decline whichever guard made it.
  it('emits no boards at all when the box parameters are degenerate', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const flat = {
      ...once,
      components: once.components.map((c) =>
        c.kind === 'drawer' ? { ...c, params: { ...c.params, boxHeight: 0 } } : c,
      ),
    }
    const out = regenerateDrawers(flat)
    expect(boardsOf(out, drawersOf(out)[0].id)).toHaveLength(0)
  })

  // A driven board is the generator's and is replaced outright: the second pass has to overwrite a
  // hand-edited length, or a stale figure survives every regeneration that follows it.
  it('replaces a driven board rather than keeping its edited size', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(once)[0]
    const edited = {
      ...once,
      parts: once.parts.map((p) => (p.role === 'box-left' ? { ...p, length: 999 } : p)),
    }
    const again = regenerateDrawers(edited)
    const left = boardsOf(again, drawer.id).find((b) => b.role === 'box-left')!
    expect(left.length).toBe(500)
    // Reconciled, not recreated: the id is what the selection and the geometry cache are keyed on.
    expect(left.id).toBe(boardsOf(once, drawer.id).find((b) => b.role === 'box-left')!.id)
  })

  it('leaves a detached board alone', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(once)[0]
    const detached = {
      ...once,
      parts: once.parts.map((p) =>
        p.parentId === drawer.id && p.role === 'box-left'
          ? { ...p, driven: false, length: 999 }
          : p,
      ),
    }
    const again = regenerateDrawers(detached)
    const left = boardsOf(again, drawer.id).find((b) => b.role === 'box-left')!
    expect(left.length).toBe(999)
  })

  // A detached DRAWER's boards are ordinarily driven, so the per-board rule above cannot save them:
  // the drawer someone detached to stop this pass touching it is skipped whole, before a single
  // board is read.
  it('regenerates nothing under a detached drawer', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(once)[0]
    const mine = {
      ...once,
      components: once.components.map((c) => (c.kind === 'drawer' ? { ...c, driven: false } : c)),
      parts: once.parts.map((p) => (p.role === 'box-left' ? { ...p, length: 999 } : p)),
    }
    const again = regenerateDrawers(mine)
    expect(boardsOf(again, drawer.id).find((b) => b.role === 'box-left')!.length).toBe(999)
    expect(boardsOf(again, drawer.id)).toHaveLength(5)
  })

  // The board-level half of "keeps a cabinet's drawers while its parameters do not resolve". The
  // drawer is carried over with nowhere to put a box, and its boards are carried with it: emptying
  // a box for a width of `6` typed on the way to `600` is the same defect one level down, and the
  // component-level test above cannot see it.
  it('keeps a drawer\u2019s boards while its cabinet\u2019s parameters do not resolve', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(once)[0]
    const out = regenerateDrawers(withParams(once, { ...oneDrawer(), width: 6 }))
    expect(boardsOf(out, drawer.id)).toEqual(boardsOf(once, drawer.id))
  })

  // Value, not identity: every board is rebuilt each pass, exactly as `regenerateComponents`
  // rebuilds every carcase panel. What has to hold is that nothing moves — ids included, since a
  // fresh id on every pass would invalidate the geometry cache and the selection with it.
  it('is idempotent: a second pass emits the very same boards', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const twice = regenerateDrawers(once)
    expect(twice.parts).toEqual(once.parts)
    expect(twice.parts.map((p) => p.id)).toEqual(once.parts.map((p) => p.id))
  })
})

interface Aabb {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

// Carcase-local extents read off the generated board itself — position and rotation together — the
// same way `regenerateComponents.test.ts` reads a carcase panel's. Never off whichever board
// dimension a role's orientation happens to put on x: that mapping is the thing under test.
const extentsOf = (m: Float64Array, lo: number[], hi: number[]): Aabb => {
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const cx of [lo[0], hi[0]])
    for (const cy of [lo[1], hi[1]])
      for (const cz of [lo[2], hi[2]]) {
        const [wx, wy, wz] = applyMatrixToPoint(m, cx, cy, cz)
        min.x = Math.min(min.x, wx)
        min.y = Math.min(min.y, wy)
        min.z = Math.min(min.z, wz)
        max.x = Math.max(max.x, wx)
        max.y = Math.max(max.y, wy)
        max.z = Math.max(max.z, wz)
      }
  return { min, max }
}

const roleOf = (s: Scene, role: string): BoardPart =>
  s.parts.find((p): p is BoardPart => p.kind === 'board' && p.role === role)!

const boxOf = (s: Scene, role: string): Aabb => {
  const p = roleOf(s, role)
  const m = resolveWorldMatrix(p, componentsById(s.components))
  return extentsOf(m, [0, 0, 0], [p.length, p.width, p.thickness])
}

const grooveBoxOf = (s: Scene, role: string): Aabb => {
  const p = roleOf(s, role)
  const c = p.cuts.find((x) => x.id.startsWith('groove_'))!
  if (c.kind !== 'box') throw new Error('the bottom groove is a box cut')
  const m = resolveWorldMatrix(p, componentsById(s.components))
  return extentsOf(
    m,
    [c.position.x, c.position.y, c.position.z],
    [c.position.x + c.size.x, c.position.y + c.size.y, c.position.z + c.size.z],
  )
}

describe('regenerateDrawers — where the boards go', () => {
  const built = (): Scene => regenerateDrawers(sceneOf(oneDrawer()))

  // The test that would have caught five coincident boards in a cabinet corner. Every figure here
  // is a RELATION between two boards, so a pile satisfies none of them — and the two absolute ones
  // pin the box to its own opening rather than to the origin.
  it('places the five boards as one box', () => {
    const s = built()
    const left = boxOf(s, 'box-left')
    const right = boxOf(s, 'box-right')
    const front = boxOf(s, 'box-front')
    const back = boxOf(s, 'box-back')
    const bottom = boxOf(s, 'box-bottom')
    const t = roleOf(s, 'box-left').thickness

    // Base 600: an 18 mm side, then the side-mount clearance, then the box.
    expect(left.min.x).toBeCloseTo(18 + SIDE_MOUNT_CLEARANCE, 6)
    // 100 mm of toe kick and an 18 mm bottom below the opening the box sits in.
    expect(left.min.z).toBeCloseTo(BASE.toeKickHeight + 18, 6)

    // Two sides, one inside width apart, each one board thick.
    expect(left.max.x - left.min.x).toBeCloseTo(t, 6)
    expect(right.min.x - left.max.x).toBeCloseTo(front.max.x - front.min.x, 6)
    // Front and back span exactly that gap, and stand one inside depth apart.
    expect(front.min.x).toBeCloseTo(left.max.x, 6)
    expect(front.max.x).toBeCloseTo(right.min.x, 6)
    expect(back.min.y - front.max.y).toBeCloseTo(left.max.y - left.min.y - 2 * t, 6)
    // The sides run the box's full depth and the front and back close its ends.
    expect(front.min.y).toBeCloseTo(left.min.y, 6)
    expect(back.max.y).toBeCloseTo(left.max.y, 6)
    // All four walls stand on one floor and rise to one height.
    for (const w of [right, front, back]) {
      expect(w.min.z).toBeCloseTo(left.min.z, 6)
      expect(w.max.z).toBeCloseTo(left.max.z, 6)
    }
    // The bottom lands in the grooves: one groove depth into all four walls, its underside the
    // groove height above the box floor.
    expect(bottom.min.z).toBeCloseTo(left.min.z + BOTTOM_GROOVE_UP, 6)
    expect(bottom.min.x).toBeCloseTo(left.max.x - BOTTOM_GROOVE_DEPTH, 6)
    expect(bottom.max.x).toBeCloseTo(right.min.x + BOTTOM_GROOVE_DEPTH, 6)
    expect(bottom.min.y).toBeCloseTo(front.max.y - BOTTOM_GROOVE_DEPTH, 6)
    expect(bottom.max.y).toBeCloseTo(back.min.y + BOTTOM_GROOVE_DEPTH, 6)
  })

  // Every groove has to be cut in the face that looks at the bottom it captures. The two pairs of
  // walls sit on opposite ends of their own thickness axis, so the inner face is board +Z on one of
  // each pair and board −Z on the other — a single face for all four puts two of the grooves on the
  // outside of the box, where they are a decorative rebate and hold nothing.
  it('cuts every groove in the wall that faces the box, not the face that shows', () => {
    const s = built()
    const walls: [string, 'x' | 'y'][] = [
      ['box-left', 'x'],
      ['box-right', 'x'],
      ['box-front', 'y'],
      ['box-back', 'y'],
    ]
    const centre = { x: 0, y: 0 }
    const l = boxOf(s, 'box-left')
    const r = boxOf(s, 'box-right')
    const f = boxOf(s, 'box-front')
    const b = boxOf(s, 'box-back')
    centre.x = (l.min.x + r.max.x) / 2
    centre.y = (f.min.y + b.max.y) / 2

    for (const [role, axis] of walls) {
      const wall = boxOf(s, role)
      const groove = grooveBoxOf(s, role)
      const inner = wall.max[axis] < centre[axis] ? wall.max[axis] : wall.min[axis]
      // Flush with the inner face and only as deep as the groove figure. Cut in the outer face
      // instead, the same slot is BOTTOM_GROOVE_DEPTH wide and this distance is the rest of the
      // wall's thickness.
      const toInner = Math.min(
        Math.abs(groove.min[axis] - inner),
        Math.abs(groove.max[axis] - inner),
      )
      expect(toInner, role).toBeCloseTo(0, 6)
      expect(groove.max[axis] - groove.min[axis], role).toBeCloseTo(BOTTOM_GROOVE_DEPTH, 6)
    }
  })

  // The same slot, at the same height, on all four walls — which is a different pair of board axes
  // on the front and back than on the sides. The bottom lands in all four or in none.
  it('puts all four grooves at one height, across the whole span of their wall', () => {
    const s = built()
    const bottom = boxOf(s, 'box-bottom')
    for (const role of ['box-left', 'box-right', 'box-front', 'box-back']) {
      const groove = grooveBoxOf(s, role)
      expect(groove.min.z, role).toBeCloseTo(bottom.min.z, 6)
      expect(groove.max.z, role).toBeCloseTo(bottom.max.z, 6)
    }
    // A side's groove runs the box's depth; a front's runs its width.
    const side = grooveBoxOf(s, 'box-left')
    const front = grooveBoxOf(s, 'box-front')
    expect(side.max.y - side.min.y).toBeCloseTo(roleOf(s, 'box-left').length, 6)
    expect(front.max.x - front.min.x).toBeCloseTo(roleOf(s, 'box-front').width, 6)
  })

  // Derived through `grainAxisOf` + `grainFieldFor`, never written on the boards. The convention is
  // one statement — grain along each board's horizontal run — and it lands on a different board
  // FIELD for the front and back than for the sides, which is exactly what a hardcoded `'length'`
  // on all five gets wrong.
  it('derives each board’s grain field rather than stating one for all five', () => {
    const s = built()
    const grainOf = (role: string): string => roleOf(s, role).grain
    expect(grainOf('box-left')).toBe('length')
    expect(grainOf('box-right')).toBe('length')
    expect(grainOf('box-front')).toBe('width')
    expect(grainOf('box-back')).toBe('width')
    expect(grainOf('box-bottom')).toBe('length')
  })

  // Grain is stated in carcase axes, so the claim worth pinning is the DIRECTION, not the field:
  // every board runs its grain horizontally, and the sides run it the other way from the front.
  it('runs every board’s grain along its own horizontal run', () => {
    for (const role of ['box-left', 'box-right']) expect(grainAxisOf(role)).toBe('y')
    for (const role of ['box-front', 'box-back', 'box-bottom']) expect(grainAxisOf(role)).toBe('x')
  })
})

// The far end of a bore, in carcase space. `makeHoleArrayCut` drills INTO the board, away from the
// face the cut names, so the direction is the opposite of that face's own normal — restated here in
// the test rather than read out of the generator, which is the whole point of following a named
// face into carcase space instead of asserting its letters.
const DRILL_FROM: Record<string, number> = { '+Z': -1, '-Z': 1 }

describe('regenerateDrawers — the undermount box', () => {
  const undermount = (s: Scene): Scene => ({
    ...s,
    components: s.components.map((c) =>
      c.kind === 'drawer' ? { ...c, params: { ...c.params, family: 'undermount' as const } } : c,
    ),
  })

  // Built by flipping the family on a drawer that already exists, so the two families are compared
  // through the same cabinet, the same opening and the same reconciliation path.
  const built = (): Scene => regenerateDrawers(undermount(regenerateDrawers(sceneOf(oneDrawer()))))

  const backCut = (s: Scene, id: string): CutDef => {
    const found = roleOf(s, 'box-back').cuts.find((c) => c.id === id)
    if (found === undefined) throw new Error(`no cut ${id} on the back`)
    return found
  }

  const notchBoxOf = (s: Scene, i: number): Aabb => {
    const c = backCut(s, `notch_${i}`)
    if (c.kind !== 'box') throw new Error('a runner notch is a box cut')
    const m = resolveWorldMatrix(roleOf(s, 'box-back'), componentsById(s.components))
    return extentsOf(
      m,
      [c.position.x, c.position.y, c.position.z],
      [c.position.x + c.size.x, c.position.y + c.size.y, c.position.z + c.size.z],
    )
  }

  const boreOf = (s: Scene, i: number): { start: Vec3; tip: Vec3 } => {
    const c = backCut(s, `locate_${i}`)
    if (c.kind !== 'hole-array') throw new Error('a locating hole is a hole array')
    const m = resolveWorldMatrix(roleOf(s, 'box-back'), componentsById(s.components))
    const at = (x: number, y: number, z: number): Vec3 => {
      const [wx, wy, wz] = applyMatrixToPoint(m, x, y, z)
      return { x: wx, y: wy, z: wz }
    }
    return {
      start: at(c.start.x, c.start.y, c.start.z),
      tip: at(c.start.x, c.start.y, c.start.z + DRILL_FROM[c.face] * c.depth),
    }
  }

  // The correction to the plan, which had this family grooving nothing at all. A TANDEM box IS
  // grooved: the bottom is captured in the sides and the front and carried by the runner from
  // underneath. Only the back is different, because the locking devices need it notched.
  it('grooves the sides and front, and notches the back', () => {
    const s = built()
    const boards = boardsOf(s, drawersOf(s)[0].id)
    const grooved = boards
      .filter((b) => b.cuts.some((c) => c.id.startsWith('groove_')))
      .map((b) => b.role)
      .sort()
    expect(grooved).toEqual(['box-front', 'box-left', 'box-right'])
    const notched = boards
      .filter((b) => b.cuts.some((c) => c.id.startsWith('notch_')))
      .map((b) => b.role)
    expect(notched).toEqual(['box-back'])
  })

  it('notches the back for the locking device, and only the back', () => {
    const s = built()
    const back = roleOf(s, 'box-back')
    // Two locking devices, one at each end of the back.
    expect(back.cuts.filter((c) => c.id.startsWith('notch_'))).toHaveLength(2)
    expect(back.cuts.some((c) => c.id.startsWith('groove_'))).toBe(false)
  })

  it('bores a locating hole above each notch', () => {
    const s = built()
    expect(roleOf(s, 'box-back').cuts.filter((c) => c.kind === 'hole-array')).toHaveLength(2)
  })

  it('still emits five boards', () => {
    const s = built()
    expect(boardsOf(s, drawersOf(s)[0].id)).toHaveLength(5)
  })

  // The axes the plan had swapped. The back is a thickness-on-y panel, so `orientedPanel` runs its
  // HEIGHT along board x and its span across the box along board y — a notch written the way it
  // reads on the bench comes out 35 mm tall and 12.7 mm wide, which these two figures separate.
  it('cuts each notch as tall as the stated height and as wide as the stated width', () => {
    const s = built()
    const back = boxOf(s, 'box-back')
    for (const i of [0, 1]) {
      const n = notchBoxOf(s, i)
      // Carcase z is the height of the cabinet, so this is the notch's height.
      expect(n.max.z - n.min.z, `notch ${i}`).toBeCloseTo(UNDERMOUNT_NOTCH_HEIGHT, 6)
      // Carcase x runs across the box, so this is its width.
      expect(n.max.x - n.min.x, `notch ${i}`).toBeCloseTo(UNDERMOUNT_NOTCH_WIDTH, 6)
      // Open at the bottom edge of the back: a locking device reaches it from underneath.
      expect(n.min.z, `notch ${i}`).toBeCloseTo(back.min.z, 6)
    }
  })

  it('puts one notch at each end of the back', () => {
    const s = built()
    const back = boxOf(s, 'box-back')
    expect(notchBoxOf(s, 0).min.x).toBeCloseTo(back.min.x, 6)
    expect(notchBoxOf(s, 1).max.x).toBeCloseTo(back.max.x, 6)
  })

  // A notch is a cut-out, not a rebate: it clears the back's whole thickness. Built oversize on
  // both faces, the convention every cut here follows so OCCT never resolves a coplanar face.
  it('cuts each notch through the back’s thickness', () => {
    const s = built()
    const back = boxOf(s, 'box-back')
    for (const i of [0, 1]) {
      const n = notchBoxOf(s, i)
      expect(n.min.y, `notch ${i}`).toBeLessThan(back.min.y)
      expect(n.max.y, `notch ${i}`).toBeGreaterThan(back.max.y)
    }
  })

  // The bore is in the face that looks into the box — the back sits at the box's MAX y, so that is
  // its min-y face, and `minSide` is what says so. Followed into carcase space rather than asserted
  // as a pair of letters: a face name that agrees only with its own table would drill out of the
  // board, and the tip is what catches it.
  it('bores the locating hole into the face that looks into the box, above its notch', () => {
    const s = built()
    const back = boxOf(s, 'box-back')
    const front = boxOf(s, 'box-front')
    for (const i of [0, 1]) {
      const n = notchBoxOf(s, i)
      const bore = boreOf(s, i)
      expect(bore.start.y, `bore ${i}`).toBeCloseTo(back.min.y, 6)
      // Nearer the front of the box than the back's other face is: the inner face, geometrically.
      expect(Math.abs(bore.start.y - front.max.y), `bore ${i}`).toBeLessThan(
        Math.abs(back.max.y - front.max.y),
      )
      // And the bore runs from there INTO the material rather than out of it.
      expect(bore.tip.y, `bore ${i}`).toBeGreaterThan(back.min.y)
      expect(bore.tip.y, `bore ${i}`).toBeLessThanOrEqual(back.max.y)
      // Above the notch it serves, not inside it, and centred on its width.
      expect(bore.start.z, `bore ${i}`).toBeGreaterThan(n.max.z)
      expect(bore.start.z, `bore ${i}`).toBeCloseTo(
        back.min.z + UNDERMOUNT_NOTCH_HEIGHT + UNDERMOUNT_HOLE_ABOVE_NOTCH,
        6,
      )
      expect(bore.start.x, `bore ${i}`).toBeCloseTo((n.min.x + n.max.x) / 2, 6)
    }
  })

  // The plan asserted the bottom's width against the front's LENGTH, which after Task 8b is the box
  // height and not a depth at all. The claim worth pinning is the one the notched back changes: the
  // bottom sits in three grooves and passes under the fourth wall, so it grows by a groove depth on
  // three edges and by a whole wall thickness on the fourth.
  it('adds a groove depth on three edges of the bottom, and a back on the fourth', () => {
    const s = built()
    const bottom = roleOf(s, 'box-bottom')
    const left = roleOf(s, 'box-left')
    const front = roleOf(s, 'box-front')
    // The bottom is a thickness-on-z panel: its LENGTH runs carcase x, across the box, and its
    // WIDTH runs carcase y, the box's depth. The front's width is the inside width, and the side's
    // length is the box's full depth.
    expect(bottom.length).toBeCloseTo(front.width + 2 * BOTTOM_GROOVE_DEPTH, 6)
    // Off the box's full depth only the FRONT's thickness is lost, and a groove depth of that comes
    // back. The wall thickness and the groove depth are different figures, so this separates a
    // bottom running under the back from one stopping in a groove the back does not have.
    expect(bottom.width).toBeCloseTo(left.length - front.thickness + BOTTOM_GROOVE_DEPTH, 6)
  })

  // The same claim as a difference, which no arithmetic slip can satisfy by accident: the two
  // families cut the same bottom across the box and differ along it by what the fourth edge does —
  // one groove depth given up, one board thickness gained.
  it('reaches a wall thickness past where a side-mount’s bottom stops', () => {
    const sm = roleOf(regenerateDrawers(sceneOf(oneDrawer())), 'box-bottom')
    const um = roleOf(built(), 'box-bottom')
    expect(um.width).toBeCloseTo(sm.width - BOTTOM_GROOVE_DEPTH + um.thickness, 6)
  })

  // How a TANDEM box is assembled, and the reason the bottom runs the full depth: the back stands
  // ON it and is screwed down to it. The absolute figure is the groove height AND the bottom's
  // thickness, not the bottom's thickness alone — the bottom still sits in its groove rather than
  // on the box floor, and the two families share that groove figure.
  it('stands the back on the bottom rather than beside it', () => {
    const s = built()
    const floor = boxOf(s, 'box-left').min.z
    const bottom = boxOf(s, 'box-bottom')
    const back = boxOf(s, 'box-back')
    expect(back.min.z).toBeCloseTo(bottom.max.z, 6)
    expect(back.min.z).toBeCloseTo(floor + BOTTOM_GROOVE_UP + roleOf(s, 'box-bottom').thickness, 6)
    // Raised, not moved: it still closes the box to the top.
    expect(back.max.z).toBeCloseTo(boxOf(s, 'box-left').max.z, 6)
    // And shorter by exactly what it was raised by. A back is a thickness-on-y panel, so its LENGTH
    // is the height — the field Task 8b put the box's height on.
    expect(roleOf(s, 'box-back').length).toBeCloseTo(boxOf(s, 'box-left').max.z - back.min.z, 6)
  })

  it('runs the bottom under the back, the whole depth of the box', () => {
    const s = built()
    const bottom = boxOf(s, 'box-bottom')
    const back = boxOf(s, 'box-back')
    // Under it and out to its far face: the box's full depth, which is what the sides measure.
    expect(bottom.max.y).toBeGreaterThan(back.min.y)
    expect(bottom.max.y).toBeCloseTo(back.max.y, 6)
    expect(bottom.max.y).toBeCloseTo(boxOf(s, 'box-left').max.y, 6)
  })

  // The two families now differ in the back as well as in the bottom, and the difference is the
  // thing to pin: a change that collapsed them would satisfy any single-family assertion. Both
  // halves are read here, because the back's height and the bottom's depth move independently in
  // the generator and a mutation can undo either one alone.
  it('leaves a side-mount box grooved, floor to floor, exactly as it was', () => {
    const sm = regenerateDrawers(sceneOf(oneDrawer()))
    const um = built()
    const t = roleOf(sm, 'box-bottom').thickness
    // Side-mount: the back is grooved like the other three walls, so it stands on the box floor.
    expect(boxOf(sm, 'box-back').min.z).toBeCloseTo(boxOf(sm, 'box-left').min.z, 6)
    expect(boxOf(um, 'box-back').min.z).toBeCloseTo(
      boxOf(um, 'box-left').min.z + BOTTOM_GROOVE_UP + t,
      6,
    )
    // Side-mount: the bottom stops a groove depth inside the back. Undermount: it passes under it.
    expect(boxOf(sm, 'box-bottom').max.y).toBeCloseTo(
      boxOf(sm, 'box-back').min.y + BOTTOM_GROOVE_DEPTH,
      6,
    )
    expect(boxOf(um, 'box-bottom').max.y).toBeCloseTo(boxOf(um, 'box-back').max.y, 6)
  })

  // The notch rides with the board it is cut in, so raising the back raised it in CARCASE space
  // too — by the groove height and the bottom's thickness, from the box floor to the bottom's upper
  // face. That is the height a locking device has to reach the back at once the bottom runs beneath
  // it, and it is pinned absolutely rather than against the back's own edge: a notch measured only
  // against its own board cannot tell where the hardware is.
  it('cuts each notch at the height the raised back presents to the runner', () => {
    const s = built()
    const floor = boxOf(s, 'box-left').min.z
    const sill = floor + BOTTOM_GROOVE_UP + roleOf(s, 'box-bottom').thickness
    for (const i of [0, 1]) {
      const n = notchBoxOf(s, i)
      expect(n.min.z, `notch ${i}`).toBeCloseTo(sill, 6)
      expect(n.max.z, `notch ${i}`).toBeCloseTo(sill + UNDERMOUNT_NOTCH_HEIGHT, 6)
    }
  })

  it('is idempotent: a second pass emits the very same boards', () => {
    const once = built()
    const twice = regenerateDrawers(once)
    expect(twice.parts).toEqual(once.parts)
    expect(twice.parts.map((p) => p.id)).toEqual(once.parts.map((p) => p.id))
  })
})
