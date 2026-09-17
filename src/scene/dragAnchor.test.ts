import { describe, it, expect } from 'vitest'
import { SNAP_MM, anchorForDrop } from './dragAnchor'
import { anchoredPosition } from './anchor'
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent } from './types'

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
const target = cab('cmp_t')
const dragged = cab('cmp_d')

describe('anchorForDrop', () => {
  it('anchors to the right face when dropped just past it', () => {
    const r = anchorForDrop(dragged, { x: W + 3, y: 0, z: 0 }, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.to).toBe('cmp_t')
    expect(r.anchor.face).toBe('right')
  })

  it('anchors to the left face when dropped just short of it', () => {
    const r = anchorForDrop(dragged, { x: -W - 4, y: 0, z: 0 }, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.face).toBe('left')
  })

  it('stays free when dropped beyond the snap distance', () => {
    const drop = { x: W + SNAP_MM + 1, y: 0, z: 0 }
    const r = anchorForDrop(dragged, drop, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
    if (r.kind !== 'free') return
    expect(r.position).toEqual(drop)
  })

  // The round trip is the real assertion: whatever anchor comes back, feeding it to
  // anchoredPosition must land the cabinet where the drop asked, to within the snap it applied.
  it('returns an anchor that resolves back to the drop position', () => {
    const r = anchorForDrop(dragged, { x: W + 2, y: 0, z: 0 }, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    const back = anchoredPosition(
      r.anchor,
      worldBoundsOf(target, PRESET_MATERIALS),
      localRotatedBoundsOf(dragged, PRESET_MATERIALS),
    )
    expect(back.x).toBeCloseTo(W, 6)
    expect(back.y).toBeCloseTo(0, 6)
  })

  it('snaps a near-flush depth offset to flush', () => {
    const r = anchorForDrop(dragged, { x: W + 2, y: 3, z: 0 }, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.offset.u).toBe(0)
  })

  it('keeps a deliberate offset that is past the snap', () => {
    const r = anchorForDrop(
      dragged,
      { x: W + 2, y: SNAP_MM + 40, z: 0 },
      [target],
      PRESET_MATERIALS,
    )
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.offset.u).toBeCloseTo(SNAP_MM + 40, 6)
  })

  it('never anchors a cabinet to itself', () => {
    const r = anchorForDrop(dragged, { x: 2, y: 0, z: 0 }, [dragged], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
  })

  it('ignores a candidate in another parent frame', () => {
    const elsewhere = cab('cmp_t', { parentId: 'cmp_group' })
    const r = anchorForDrop(dragged, { x: W + 2, y: 0, z: 0 }, [elsewhere], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
  })

  it('takes the nearer of two candidate faces', () => {
    const right = cab('cmp_r', { position: { x: W, y: 0, z: 0 } })
    // Dropped 1 mm past cmp_t's right face and further from cmp_r's left face — both within the
    // snap, and the first is nearer.
    const r = anchorForDrop(dragged, { x: W + 1, y: 0, z: 0 }, [target, right], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.to).toBe('cmp_t')
    expect(r.anchor.face).toBe('right')
  })
})
