import { describe, it, expect } from 'vitest'
import {
  BOTTOM_GROOVE_DEPTH,
  BOTTOM_GROOVE_UP,
  BOX_HEIGHT_UNDER_FRONT,
  SIDE_MOUNT_CLEARANCE,
  defaultDrawerParams,
  drawerBoxMetrics,
} from './drawerBox'
import type { Rect } from './sectionTree'

// The SECTION's own rectangle — the clear opening — not the front cell. A 564 mm clear span
// between 18 mm sides, 500 mm above the floor, 200 mm tall.
const rect: Rect = { x0: 18, x1: 582, z0: 500, z1: 700 }

describe('drawerBoxMetrics — side-mount', () => {
  const params = defaultDrawerParams('side-mount')

  it('takes the side clearance off each side of the opening', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 560, frontThickness: 18, inset: false })!
    // Derived from the opening and the constant, not by calling the function under test.
    expect(m.box.x0).toBe(18 + SIDE_MOUNT_CLEARANCE)
    expect(m.box.x1).toBe(582 - SIDE_MOUNT_CLEARANCE)
    // Not `toBe`: the two sides reassociate the same constant and IEEE754 does not agree with
    // itself across that. 9 places still separates 12.7 from any neighbouring figure.
    expect(m.box.x1 - m.box.x0).toBeCloseTo(564 - 2 * SIDE_MOUNT_CLEARANCE, 9)
  })

  it('takes its depth from the runner nominal, not from the cabinet depth', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 560, frontThickness: 18, inset: false })!
    // 560 clear picks the 550 nominal; the box is 550 deep, not 560.
    expect(m.box.y1 - m.box.y0).toBe(550)
  })

  it('starts at the carcase face for an overlay front and behind it for an inset one', () => {
    const overlay = drawerBoxMetrics(rect, params, {
      clearDepth: 560,
      frontThickness: 18,
      inset: false,
    })!
    const inset = drawerBoxMetrics(rect, params, {
      clearDepth: 560,
      frontThickness: 18,
      inset: true,
    })!
    expect(overlay.box.y0).toBe(0)
    expect(inset.box.y0).toBe(18)
  })

  it('derives its height from the front when the parameter is null', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 560, frontThickness: 18, inset: false })!
    expect(m.box.z1 - m.box.z0).toBe(200 - BOX_HEIGHT_UNDER_FRONT)
    expect(m.box.z0).toBe(500)
  })

  it('uses an explicit height over the derived one', () => {
    const m = drawerBoxMetrics(
      rect,
      { ...params, boxHeight: 120 },
      { clearDepth: 560, frontThickness: 18, inset: false },
    )!
    expect(m.box.z1 - m.box.z0).toBe(120)
  })

  it('clamps an over-tall explicit height to the opening', () => {
    const m = drawerBoxMetrics(
      rect,
      { ...params, boxHeight: 5000 },
      { clearDepth: 560, frontThickness: 18, inset: false },
    )!
    expect(m.box.z1 - m.box.z0).toBe(200)
  })

  it('puts the runner the parameter’s distance above the box bottom, in carcase space', () => {
    const m = drawerBoxMetrics(
      rect,
      { ...params, runnerOffset: 40 },
      { clearDepth: 560, frontThickness: 18, inset: false },
    )!
    expect(m.runnerZ).toBe(m.box.z0 + 40)
  })

  it('grooves the bottom, and the groove is where the constants say', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 560, frontThickness: 18, inset: false })!
    expect(m.groove).toEqual({ up: BOTTOM_GROOVE_UP, depth: BOTTOM_GROOVE_DEPTH })
  })

  it('declines entirely when no runner fits', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 200, frontThickness: 18, inset: false })
    expect(m).toBeNull()
  })
})
