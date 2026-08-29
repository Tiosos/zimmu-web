import { describe, expect, it } from 'vitest'
import { carcaseBoxes as boxesOf, carcaseRoles as rolesOf, orientedPanel } from './carcaseRoles'
import type { LocalBox, RoleBox } from './carcaseRoles'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { roleThicknessFor } from './resolveThickness'
import { jointKindFor } from './resolveJointKind'
import { GRAIN_IN_PLANE, grainAxisOf, grainFieldFor } from './grain'
import { legacyToSection } from './migrateSections'
import type { CarcaseParams, ThicknessAxis } from './types'
import { LADDER_WITH_DIVIDERS, SWEEP } from './__fixtures__/sweep'

// Every cabinet here is built from the materials the presets name, which is what the sweep spreads.
const carcaseBoxes = (p: CarcaseParams) =>
  boxesOf(p, roleThicknessFor(p, PRESET_MATERIALS, new Map()))
const carcaseRoles = (p: CarcaseParams) =>
  rolesOf(p, roleThicknessFor(p, PRESET_MATERIALS, new Map()), jointKindFor([], ''))

// Distinct extents on every axis, so a wrong mapping cannot coincidentally match.
const BOX: LocalBox = { x0: 0, x1: 100, y0: 0, y1: 200, z0: 0, z1: 300 }
const EXTENT = { x: 100, y: 200, z: 300 } as const
const AXES: ThicknessAxis[] = ['x', 'y', 'z']

const PRESET_CASES = CARCASE_PRESETS.map((p) => [p.name, p.params] as const)

// Which way a box's parent section was split, which is what `grainAxisOf` needs from a division
// role and cannot read off the string.
const splitOf = (b: RoleBox): 'vertical' | 'horizontal' =>
  b.thicknessAxis === 'x' ? 'vertical' : 'horizontal'

// A role like `division-sec_…-1` or `ladder-mid-0` is one instance of a family; the grain
// convention is stated per family, so that is the unit coverage is measured in. A division's family
// is the kind of panel it is — the section id in its role is an identity, not a family.
function familyOf(b: RoleBox): string {
  if (b.role.startsWith('division-')) return splitOf(b) === 'vertical' ? 'partition' : 'shelf'
  // Same argument, same shape: an adjustable shelf's role carries the section it sits in, and
  // stripping only the trailing index would leave that identity in the family name.
  if (b.role.startsWith('adj-shelf-')) return 'adj-shelf'
  return b.role.replace(/-\d+$/, '')
}

function familiesReached(cases: CarcaseParams[]): string[] {
  return [...new Set(cases.flatMap(carcaseBoxes).map(familyOf))].sort()
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
  // Over the whole sweep, not a fixture: `grainAxisOf` has to be total across every role the
  // generator can emit under any valid parameters, and a parameter combination nobody thought of
  // is exactly the one that would throw in front of a user.
  it('grainAxisOf answers for every role the generator can emit, and never along the thickness', () => {
    const boxes = SWEEP.flatMap(carcaseBoxes)
    expect(boxes.length).toBeGreaterThan(0)
    for (const b of boxes) {
      const axis = grainAxisOf(b.role, splitOf(b))
      expect(axis, b.role).not.toBe(b.thicknessAxis)
      expect(grainFieldFor(b.thicknessAxis, axis), b.role).not.toBe('free')
    }
  })

  it('every case in the sweep is a valid carcase', () => {
    for (const params of SWEEP) expect(carcaseBoxes(params).length).toBeGreaterThan(0)
  })

  // Both sides come from `carcaseBoxes`. An earlier version compared against a hand-typed list of
  // twelve families and was wrong — `ladder-mid` is a thirteenth — which is the whole argument for
  // not typing one.
  it('the named fixtures reach every role family the sweep does', () => {
    expect(familiesReached([...PRESET_CASES.map(([, p]) => p), LADDER_WITH_DIVIDERS])).toEqual(
      familiesReached(SWEEP),
    )
  })

  it('refuses a role it has no convention for, rather than inventing one', () => {
    expect(() => grainAxisOf('plinth')).toThrow(/no grain convention/)
  })

  // A partition runs its grain up and a shelf runs it across, and the role names neither — so a
  // caller that cannot say which it has must not be given a guess.
  it('refuses a division role that does not say which way its section was split', () => {
    expect(() => grainAxisOf('division-sec_root-0')).toThrow(/needs its split axis/)
  })

  // The plan and the baseline both assume 96. A sweep that silently changed size would make the
  // equivalence test cover less than it claims.
  it('the sweep is 96 cases', () => {
    expect(SWEEP).toHaveLength(96)
  })
})

describe('for the presets only, grain agrees with longest-first', () => {
  // Deliberately scoped to CARCASE_PRESETS. This is NOT a property of the role table: a 1200x400
  // wall unit's back and a three-bay 900's shelf both run grain along their *shorter* dimension.
  // See the Correction section in the design doc. Asserting it as a law would pass here and be
  // believed.
  it.each(PRESET_CASES)('%s', (_name, params) => {
    for (const r of carcaseRoles(params)) {
      const box = carcaseBoxes(params).find((b) => b.role === r.role)!
      const grain = grainFieldFor(box.thicknessAxis, grainAxisOf(r.role, splitOf(box)))
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
      section: legacyToSection([], 0, 1200, 18),
    }
    const box = carcaseBoxes(params).find((b) => b.role === 'back')!
    const back = carcaseRoles(params).find((r) => r.role === 'back')!
    expect(grainFieldFor(box.thicknessAxis, grainAxisOf('back'))).toBe('length')
    expect(back.panel.length).toBeLessThan(back.panel.width)
  })

  it('a narrow bay runs its shelf grain along the shorter dimension', () => {
    // Preset 0 carries one fixed shelf; three bays across a 900 makes each of them narrow.
    const params: CarcaseParams = {
      ...CARCASE_PRESETS[0].params,
      width: 900,
      section: legacyToSection([1 / 3, 2 / 3], 1, 900, 18),
    }
    const box = carcaseBoxes(params).find(
      (b) => b.role.startsWith('division-') && b.thicknessAxis === 'z',
    )!
    const shelf = carcaseRoles(params).find((r) => r.role === box.role)!
    expect(grainFieldFor(box.thicknessAxis, grainAxisOf(box.role, splitOf(box)))).toBe('length')
    expect(shelf.panel.length).toBeLessThan(shelf.panel.width)
  })
})
