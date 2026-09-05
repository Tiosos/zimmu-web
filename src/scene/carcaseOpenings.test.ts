import { describe, it, expect } from 'vitest'
import { carcaseOpenings } from './carcaseOpenings'
import { PRESET_MATERIALS } from './carcasePresets'
import { legacyToSection } from './migrateSections'
import { seedInteriors, defaultInterior } from './sectionInterior'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import type { CarcaseComponent } from './types'

// Two bays, because a one-opening fixture cannot tell "the opening that owns this" from "every
// opening" — and all three presets resolve to exactly one.
const SECTION = seedInteriors(legacyToSection([0.5], 0, 600, 18), defaultInterior(2))
const TWO_BAY: CarcaseComponent = { ...cabinet, params: { ...cabinet.params, section: SECTION } }
const PARTS = partsOfCarcase(TWO_BAY.params)
const BAYS = SECTION.content.kind === 'split' ? SECTION.content.children.map((c) => c.id) : []

describe('carcaseOpenings', () => {
  it('files each opening’s parts under it, and everything else under the carcase', () => {
    const groups = carcaseOpenings(TWO_BAY, PARTS, PRESET_MATERIALS)
    expect(groups).not.toBeNull()
    expect(groups!.sections.map((s) => s.sectionId)).toEqual(BAYS)
    for (const [i, node] of groups!.sections.entries()) {
      expect(node.parts.map((p) => p.role).sort()).toEqual([
        `adj-shelf-${BAYS[i]}-0`,
        `adj-shelf-${BAYS[i]}-1`,
      ])
    }
    // The divider names the section that was split, so it belongs to neither bay.
    expect(groups!.carcase.some((p) => p.role?.startsWith('division-'))).toBe(true)
  })

  // The contract the two React callers both lean on. A material stating no thickness makes
  // `roleThicknessFor`'s resolver throw, and `openingRect` is where it surfaces — so the guard has
  // to answer `null` rather than let it out. A width too small for its own panels would not test
  // this: that is a validation error the arithmetic below it propagates without complaint.
  it('answers null for a cabinet it cannot resolve, rather than throwing', () => {
    const broken = { ...TWO_BAY, params: { ...TWO_BAY.params, carcaseMaterial: 'Unobtanium' } }
    expect(carcaseOpenings(broken, PARTS, PRESET_MATERIALS)).toBeNull()
  })

  // Section ids and role keys are shared by every cabinet built from one preset, so a caller
  // handing over the whole scene must not have another cabinet's parts land in this one's bays.
  it('ignores parts belonging to another cabinet', () => {
    const foreign = PARTS.map((p) => ({ ...p, id: `${p.id}_x`, parentId: 'cmp_other' }))
    const groups = carcaseOpenings(TWO_BAY, [...PARTS, ...foreign], PRESET_MATERIALS)
    expect(groups!.sections.flatMap((s) => s.parts).every((p) => p.parentId === cabinet.id)).toBe(
      true,
    )
    expect(groups!.carcase.every((p) => p.parentId === cabinet.id)).toBe(true)
  })
})
