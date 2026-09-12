import { describe, it, expect } from 'vitest'
import {
  BOTTOM_GROOVE_DEPTH,
  BOTTOM_GROOVE_UP,
  BOX_HEIGHT_UNDER_FRONT,
  SIDE_MOUNT_CLEARANCE,
  SIDE_MOUNT_RUNNER_OFFSET,
  UNDERMOUNT_DEDUCTION_THICK,
  UNDERMOUNT_DEDUCTION_THIN,
  UNDERMOUNT_THIN_MAX_THICKNESS,
  defaultDrawerParams,
  drawerBoxMetrics,
} from './drawerBox'
import type { Rect } from './sectionTree'

// The SECTION's own rectangle — the clear opening — not the front cell. A 564 mm clear span
// between 18 mm sides, 500 mm above the floor, 200 mm tall.
const rect: Rect = { x0: 18, x1: 582, z0: 500, z1: 700 }

// One cabinet behind every side-mount case: 560 clear, an 18 mm overlay front, 18 mm drawer sides.
// Each test spreads over the single field it is about, so the variation is the only thing on screen.
const baseCtx = { clearDepth: 560, frontThickness: 18, inset: false, sideThickness: 18 }

describe('defaultDrawerParams', () => {
  // Nothing else pins this. The offset test passes an explicit 40, so the default could seed 0 and
  // every metrics test below still passed — the one figure in the file no test exercised in place.
  // Derived from the constant, so changing the figure still needs no test edit.
  it('seeds a drawer with the stated runner offset and no explicit height', () => {
    expect(defaultDrawerParams('side-mount')).toEqual({
      family: 'side-mount',
      boxHeight: null,
      runnerOffset: SIDE_MOUNT_RUNNER_OFFSET,
      material: '',
    })
  })

  // The family is the only thing the argument decides, and every other test asks for side-mount —
  // so a version ignoring its argument passed all of them.
  it('carries the family it was asked for', () => {
    expect(defaultDrawerParams('undermount').family).toBe('undermount')
  })
})

describe('drawerBoxMetrics — side-mount', () => {
  const params = defaultDrawerParams('side-mount')

  it('takes the side clearance off each side of the opening', () => {
    const m = drawerBoxMetrics(rect, params, baseCtx)!
    // Derived from the opening and the constant, not by calling the function under test.
    expect(m.box.x0).toBe(18 + SIDE_MOUNT_CLEARANCE)
    expect(m.box.x1).toBe(582 - SIDE_MOUNT_CLEARANCE)
    // Not `toBe`: the two sides reassociate the same constant and IEEE754 does not agree with
    // itself across that. 9 places still separates 12.7 from any neighbouring figure.
    expect(m.box.x1 - m.box.x0).toBeCloseTo(564 - 2 * SIDE_MOUNT_CLEARANCE, 9)
  })

  // The other half of the family split. Undermount fixes the box's interior, so its outside width
  // moves with the side material; side-mount fixes the gap, so its outside width must not. Every
  // other test here runs one thickness, so a shared rule reading the interior would pass them all.
  it('keeps its width when the drawer side material changes', () => {
    const thin = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: 12 })!
    const thick = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: 25 })!
    expect(thin.box.x0).toBe(thick.box.x0)
    expect(thin.box.x1).toBe(thick.box.x1)
  })

  it('takes its depth from the runner nominal, not from the cabinet depth', () => {
    const m = drawerBoxMetrics(rect, params, baseCtx)!
    // 560 clear picks the 550 nominal; the box is 550 deep, not 560.
    expect(m.box.y1 - m.box.y0).toBe(550)
  })

  it('starts at the carcase face for an overlay front and behind it for an inset one', () => {
    const overlay = drawerBoxMetrics(rect, params, baseCtx)!
    const inset = drawerBoxMetrics(rect, params, { ...baseCtx, inset: true })!
    expect(overlay.box.y0).toBe(0)
    expect(inset.box.y0).toBe(18)
  })

  it('derives its height from the front when the parameter is null', () => {
    const m = drawerBoxMetrics(rect, params, baseCtx)!
    expect(m.box.z1 - m.box.z0).toBe(200 - BOX_HEIGHT_UNDER_FRONT)
    expect(m.box.z0).toBe(500)
  })

  it('uses an explicit height over the derived one', () => {
    const m = drawerBoxMetrics(rect, { ...params, boxHeight: 120 }, baseCtx)!
    expect(m.box.z1 - m.box.z0).toBe(120)
  })

  it('clamps an over-tall explicit height to the opening', () => {
    const m = drawerBoxMetrics(rect, { ...params, boxHeight: 5000 }, baseCtx)!
    expect(m.box.z1 - m.box.z0).toBe(200)
  })

  it('puts the runner the parameter’s distance above the box bottom, in carcase space', () => {
    const m = drawerBoxMetrics(rect, { ...params, runnerOffset: 40 }, baseCtx)!
    expect(m.runnerZ).toBe(m.box.z0 + 40)
  })

  it('grooves the bottom, and the groove is where the constants say', () => {
    const m = drawerBoxMetrics(rect, params, baseCtx)!
    expect(m.groove).toEqual({ up: BOTTOM_GROOVE_UP, depth: BOTTOM_GROOVE_DEPTH })
  })

  it('declines entirely when no runner fits', () => {
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, clearDepth: 200 })
    expect(m).toBeNull()
  })
})

describe('drawerBoxMetrics — undermount', () => {
  const params = defaultDrawerParams('undermount')

  it('fixes the inside width, not the gap either side', () => {
    const side = 15
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: side })!
    expect(m.box.x1 - m.box.x0 - 2 * side).toBe(564 - UNDERMOUNT_DEDUCTION_THIN)
  })

  it('takes the larger deduction above the thin-material limit', () => {
    const side = 18
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: side })!
    expect(m.box.x1 - m.box.x0 - 2 * side).toBe(564 - UNDERMOUNT_DEDUCTION_THICK)
  })

  // The limit is inclusive, and this is the only case that exercises it — every other test here
  // runs 12, 15 or 18. Relaxing `<=` to `<` in `undermountSpan` fails here and nowhere else.
  it('counts the thin-material limit itself as thin', () => {
    const side = UNDERMOUNT_THIN_MAX_THICKNESS
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: side })!
    expect(m.box.x1 - m.box.x0 - 2 * side).toBe(564 - UNDERMOUNT_DEDUCTION_THIN)
  })

  // The point of the whole section: undermount is NOT side-mount with a different constant. Both
  // thicknesses are thin ones on purpose — straddling the limit, the deduction alone would move the
  // outside width, and a rule that ignored the side material entirely would still pass.
  it('moves the outside width with the side thickness, unlike a per-side rule', () => {
    const thin = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: 12 })!
    const thicker = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: 15 })!
    expect(thin.box.x1 - thin.box.x0).not.toBe(thicker.box.x1 - thicker.box.x0)
  })

  // Nothing else says where the box sits: every other assertion here reads a width, so a box shoved
  // hard against one side of the opening passes them all — and hits the carcase.
  it('centres the box in the opening', () => {
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: 15 })!
    expect(m.box.x0 - rect.x0).toBe(rect.x1 - m.box.x1)
  })

  // The one guard on the stated deduction itself: the assertions above are derived from it, so they
  // move with it however wrong it goes. Thin sides leave the widest outside clearance, so 12 mm is
  // the binding case — even there an undermount box must want less room than a side-mount's gap.
  it('needs less room either side than a side-mount does', () => {
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: 12 })!
    const perSide = (564 - (m.box.x1 - m.box.x0)) / 2
    expect(perSide).toBeLessThan(SIDE_MOUNT_CLEARANCE)
  })

  it('has no groove and sits the runner at the box bottom', () => {
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: 15 })!
    expect(m.groove).toBeNull()
    expect(m.runnerZ).toBe(m.box.z0)
  })

  // Undermount adds 2 x sideThickness back to a fixed interior, so thick stock outgrows the
  // opening it is meant to sit in. The module already declines when no runner fits the depth; a
  // box wider than its hole is the same kind of "cannot be built" and gets the same answer.
  // Derived from the deduction rather than hardcoded, so the case follows the stated figure —
  // floor + 1, not ceil, which for an even deduction lands on the boundary that still builds.
  it('declines when the box would be wider than the opening', () => {
    const tooThick = Math.floor(UNDERMOUNT_DEDUCTION_THICK / 2) + 1
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: tooThick })
    expect(m).toBeNull()
  })

  // The boundary is what this pins, not the width: `not.toBeNull()` is the assertion about the
  // rule, and relaxing `>` to `>=` in the guard fails here and nowhere else. The width is an
  // identity — `span - D + 2 * (D / 2)` is `span` for every D — so it cannot pin the deduction
  // figure and is not meant to. What it does catch is the outside width losing its
  // `2 * sideThickness` term, which would leave a box a whole deduction narrower than the opening
  // it exactly fills here.
  it('still builds a box with exactly zero slack', () => {
    const exact = UNDERMOUNT_DEDUCTION_THICK / 2
    const m = drawerBoxMetrics(rect, params, { ...baseCtx, sideThickness: exact })
    expect(m).not.toBeNull()
    expect(m!.box.x1 - m!.box.x0).toBeCloseTo(rect.x1 - rect.x0, 9)
  })

  // The thick-material deduction must be the larger of the two — the whole reason there are two.
  // Every other assertion here derives from whichever figure it expects, so swapping the pair
  // survives all of them. It is also what keeps the zero-slack case above honest: derived from the
  // thick deduction, it returns null and fails loudly rather than quietly taking the thin branch,
  // should the thin limit ever rise past half the thick deduction.
  it('deducts more for thick material than for thin', () => {
    expect(UNDERMOUNT_DEDUCTION_THICK).toBeGreaterThan(UNDERMOUNT_DEDUCTION_THIN)
  })
})
