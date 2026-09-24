import { describe, it, expect } from 'vitest'
import { dropForCentre, gizmoCentreOf, positionForCentre } from './moveGizmo'
import { worldBoundsOf } from './carcaseWorldBounds'
import { SNAP_MM } from './dragAnchor'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent } from './types'

// Asymmetric on purpose: 600 wide against ~578 occupied depth and 870 tall, so a centre computed
// on the wrong axis is visible.
const cab = (id: string, over: Partial<CarcaseComponent> = {}): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
  ...over,
})

const W = CARCASE_PRESETS[0].params.width

describe('gizmoCentreOf', () => {
  it('sits at the centre of the occupied box, not at the origin', () => {
    const c = cab('cmp_a')
    const b = worldBoundsOf(c, PRESET_MATERIALS)
    const centre = gizmoCentreOf(c, PRESET_MATERIALS)
    expect(centre.x).toBeCloseTo((b.x0 + b.x1) / 2, 6)
    expect(centre.y).toBeCloseTo((b.y0 + b.y1) / 2, 6)
    expect(centre.z).toBeCloseTo((b.z0 + b.z1) / 2, 6)
    // The whole point: a cabinet's origin is its front-left-bottom corner, so the centre is not it.
    expect(centre.x).not.toBeCloseTo(c.position.x, 3)
  })

  it('moves with the cabinet', () => {
    const at = gizmoCentreOf(cab('cmp_a', { position: { x: 100, y: 20, z: 5 } }), PRESET_MATERIALS)
    const origin = gizmoCentreOf(cab('cmp_a'), PRESET_MATERIALS)
    expect(at.x).toBeCloseTo(origin.x + 100, 6)
    expect(at.y).toBeCloseTo(origin.y + 20, 6)
    expect(at.z).toBeCloseTo(origin.z + 5, 6)
  })

  // Rotations are stored in DEGREES (composeWorldMatrix multiplies by DEG2RAD). A test written in
  // radians turns a cabinet 1.57 degrees and passes for the wrong reason — stage 2 learned this.
  it('follows a turned cabinet', () => {
    const turned = cab('cmp_a', { rotation: { x: 0, y: 0, z: 90 } })
    const b = worldBoundsOf(turned, PRESET_MATERIALS)
    const centre = gizmoCentreOf(turned, PRESET_MATERIALS)
    expect(centre.x).toBeCloseTo((b.x0 + b.x1) / 2, 6)
    expect(centre.y).toBeCloseTo((b.y0 + b.y1) / 2, 6)
  })
})

describe('positionForCentre', () => {
  it('is the inverse of gizmoCentreOf', () => {
    const c = cab('cmp_a', { position: { x: 137, y: -42, z: 11 } })
    const back = positionForCentre(c, PRESET_MATERIALS, gizmoCentreOf(c, PRESET_MATERIALS))
    expect(back.x).toBeCloseTo(c.position.x, 6)
    expect(back.y).toBeCloseTo(c.position.y, 6)
    expect(back.z).toBeCloseTo(c.position.z, 6)
  })

  it('is the inverse for a turned cabinet too', () => {
    const c = cab('cmp_a', { position: { x: 137, y: -42, z: 11 }, rotation: { x: 0, y: 0, z: 90 } })
    const back = positionForCentre(c, PRESET_MATERIALS, gizmoCentreOf(c, PRESET_MATERIALS))
    expect(back.x).toBeCloseTo(c.position.x, 6)
    expect(back.y).toBeCloseTo(c.position.y, 6)
  })

  it('puts the centre where it was asked to', () => {
    const c = cab('cmp_a')
    const moved = {
      ...c,
      position: positionForCentre(c, PRESET_MATERIALS, { x: 900, y: 300, z: 400 }),
    }
    const centre = gizmoCentreOf(moved, PRESET_MATERIALS)
    expect(centre.x).toBeCloseTo(900, 6)
    expect(centre.y).toBeCloseTo(300, 6)
    expect(centre.z).toBeCloseTo(400, 6)
  })
})

describe('dropForCentre', () => {
  const target = cab('cmp_t')
  const dragged = cab('cmp_d')

  it('anchors when the dragged centre puts the cabinet against a face', () => {
    const flush = { ...dragged, position: { x: W, y: 0, z: 0 } }
    const centre = gizmoCentreOf(flush, PRESET_MATERIALS)
    const r = dropForCentre(dragged, centre, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.to).toBe('cmp_t')
    expect(r.anchor.face).toBe('right')
  })

  it('stays free far from every neighbour', () => {
    const far = { ...dragged, position: { x: 99999, y: 0, z: 0 } }
    const r = dropForCentre(
      dragged,
      gizmoCentreOf(far, PRESET_MATERIALS),
      [target],
      PRESET_MATERIALS,
    )
    expect(r.kind).toBe('free')
  })

  // Decision 2's payoff: z is the in-plane `v` axis for a left/right face, so a height within the
  // snap goes flush through the SAME rule rather than needing one of its own.
  it('snaps a near-flush height to flush', () => {
    const raised = { ...dragged, position: { x: W, y: 0, z: 3 } }
    const r = dropForCentre(
      dragged,
      gizmoCentreOf(raised, PRESET_MATERIALS),
      [target],
      PRESET_MATERIALS,
    )
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.offset.v).toBe(0)
  })

  it('keeps a deliberate height difference past the snap', () => {
    const high = { ...dragged, position: { x: W, y: 0, z: SNAP_MM + 40 } }
    const r = dropForCentre(
      dragged,
      gizmoCentreOf(high, PRESET_MATERIALS),
      [target],
      PRESET_MATERIALS,
    )
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.offset.v).toBeCloseTo(SNAP_MM + 40, 6)
  })

  it('never offers the dragged cabinet itself as a target', () => {
    const c = cab('cmp_d')
    const r = dropForCentre(c, gizmoCentreOf(c, PRESET_MATERIALS), [c], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
  })
})
