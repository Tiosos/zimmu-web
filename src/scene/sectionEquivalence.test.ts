import { describe, expect, it } from 'vitest'
import { carcaseBoxes, carcaseJoints, type LocalBox } from './carcaseRoles'
import { SWEEP } from './__fixtures__/sweep'
import baselineJson from './__fixtures__/stage-a-baseline.json?raw'

// Loaded as text: `resolveJsonModule` is off, and turning it on to reach one fixture would change
// how every module in the project resolves.
const baseline: { index: number; boxes: string[]; joints: string[] }[] = JSON.parse(baselineJson)

// Stage A's whole risk control. The section tree must reproduce, for every case in the sweep, the
// exact cabinet the pre-restructure parameters produced.
//
// Compared by *geometry*, never by role name: role keys change in this stage, so a name-keyed
// comparison could be satisfied by renaming something into place rather than by building the same
// cabinet. Both sides are derived; neither is a number anyone typed.
const boxKey = (b: { box: LocalBox; thicknessAxis: string }) =>
  [b.box.x0, b.box.x1, b.box.y0, b.box.y1, b.box.z0, b.box.z1, b.thicknessAxis]
    .map((n) => (typeof n === 'number' ? n.toFixed(6) : n))
    .join('|')

describe('the section tree reproduces the pre-restructure cabinet', () => {
  it('covers every baseline case', () => {
    expect(SWEEP).toHaveLength(baseline.length)
  })

  it.each(SWEEP.map((p, i) => [i, p] as const))('case %i: same boxes', (i, params) => {
    expect(carcaseBoxes(params).map(boxKey).sort()).toEqual(baseline[i].boxes)
  })

  it.each(SWEEP.map((p, i) => [i, p] as const))('case %i: same joints', (i, params) => {
    const byRole = new Map(carcaseBoxes(params).map((b) => [b.role, b]))
    const joints = carcaseJoints(params, '')
      .map((d) =>
        [
          d.kind,
          boxKey(byRole.get(d.housingRole)!),
          boxKey(byRole.get(d.housedRole)!),
          d.housingFace,
          d.housedEnd,
        ].join('#'),
      )
      .sort()
    expect(joints).toEqual(baseline[i].joints)
  })
})
