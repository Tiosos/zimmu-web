import { describe, expect, it } from 'vitest'
import { carcaseBoxes, carcaseRoles, orientedPanel } from './carcaseRoles'
import type { LocalBox } from './carcaseRoles'
import { CARCASE_PRESETS } from './carcasePresets'
import { GRAIN_IN_PLANE, grainAxisOf, grainFieldFor } from './grain'
import type { CarcaseParams, ThicknessAxis } from './types'

// Distinct extents on every axis, so a wrong mapping cannot coincidentally match.
const BOX: LocalBox = { x0: 0, x1: 100, y0: 0, y1: 200, z0: 0, z1: 300 }
const EXTENT = { x: 100, y: 200, z: 300 } as const
const AXES: ThicknessAxis[] = ['x', 'y', 'z']

const PRESET_CASES = CARCASE_PRESETS.map((p) => [p.name, p.params] as const)

// The presets reach neither a ladder base, nor dividers, nor a multi-bay shelf. Without this the
// role coverage test below would pass while `grainAxisOf` had no answer for five roles.
const LADDER_WITH_DIVIDERS: CarcaseParams = {
  ...CARCASE_PRESETS[0].params,
  width: 1400,
  baseMode: 'ladder',
  dividers: [0.5],
  fixedShelves: 1,
}

describe('GRAIN_IN_PLANE agrees with orientedPanel', () => {
  // The whole point of stating grain in carcase axes: the board field it lands on is derived from
  // the same map orientedPanel uses. If someone changes orientedPanel's rotations without changing
  // this table, this is what catches it.
  it.each(AXES)('thickness on %s: the table names the axes orientedPanel actually used', (ax) => {
    const panel = orientedPanel(BOX, ax)
    expect(panel.length).toBe(EXTENT[GRAIN_IN_PLANE[ax].length])
    expect(panel.width).toBe(EXTENT[GRAIN_IN_PLANE[ax].width])
  })

  it.each(AXES)('thickness on %s: the thickness axis is not in the in-plane pair', (ax) => {
    expect(Object.values(GRAIN_IN_PLANE[ax])).not.toContain(ax)
  })
})

describe('every generated role states a grain direction', () => {
  it.each([...PRESET_CASES, ['ladder base with dividers', LADDER_WITH_DIVIDERS] as const])(
    '%s: no role is grain-free, and no grain runs along the thickness',
    (_name, params) => {
      const boxes = carcaseBoxes(params)
      expect(boxes.length).toBeGreaterThan(0)
      for (const b of boxes) {
        const axis = grainAxisOf(b.role)
        expect(axis).not.toBe(b.thicknessAxis)
        expect(grainFieldFor(b.thicknessAxis, axis)).not.toBe('free')
      }
    },
  )

  it('the cases above reach every role family the generator can emit', () => {
    const seen = new Set(
      [...PRESET_CASES.map(([, p]) => p), LADDER_WITH_DIVIDERS]
        .flatMap(carcaseBoxes)
        .map((b) => b.role.replace(/-\d+(-\d+)?$/, '')),
    )
    expect([...seen].sort()).toEqual([
      'back',
      'bottom',
      'divider',
      'ladder-back',
      'ladder-front',
      'ladder-left',
      'ladder-mid',
      'ladder-right',
      'left-side',
      'right-side',
      'shelf',
      'toe-kick',
      'top',
    ])
  })

  it('refuses a role it has no convention for, rather than inventing one', () => {
    expect(() => grainAxisOf('plinth')).toThrow(/no grain convention/)
  })
})

describe('for the presets only, grain agrees with longest-first', () => {
  // Deliberately scoped to CARCASE_PRESETS. This is NOT a property of the role table: a 1200x400
  // wall unit's back and a three-bay 900's shelf both run grain along their *shorter* dimension.
  // See the Correction section in the design doc. Asserting it as a law would pass here and be
  // believed.
  it.each(PRESET_CASES)('%s', (_name, params) => {
    for (const r of carcaseRoles(params)) {
      const grain = grainFieldFor(
        carcaseBoxes(params).find((b) => b.role === r.role)!.thicknessAxis,
        grainAxisOf(r.role),
      )
      const grainDim = grain === 'length' ? r.panel.length : r.panel.width
      const otherDim = grain === 'length' ? r.panel.width : r.panel.length
      expect(grainDim).toBeGreaterThanOrEqual(otherDim)
    }
  })

  it('a wide low wall unit runs its back grain along the shorter dimension', () => {
    const params: CarcaseParams = {
      ...CARCASE_PRESETS[1].params,
      width: 1200,
      height: 400,
      fixedShelves: 0,
    }
    const box = carcaseBoxes(params).find((b) => b.role === 'back')!
    const back = carcaseRoles(params).find((r) => r.role === 'back')!
    expect(grainFieldFor(box.thicknessAxis, grainAxisOf('back'))).toBe('length')
    expect(back.panel.length).toBeLessThan(back.panel.width)
  })

  it('a narrow bay runs its shelf grain along the shorter dimension', () => {
    const params: CarcaseParams = {
      ...CARCASE_PRESETS[0].params,
      width: 900,
      dividers: [1 / 3, 2 / 3],
    }
    const box = carcaseBoxes(params).find((b) => b.role === 'shelf-0-0')!
    const shelf = carcaseRoles(params).find((r) => r.role === 'shelf-0-0')!
    expect(grainFieldFor(box.thicknessAxis, grainAxisOf('shelf-0-0'))).toBe('length')
    expect(shelf.panel.length).toBeLessThan(shelf.panel.width)
  })
})
