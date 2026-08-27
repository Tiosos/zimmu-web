import { describe, expect, it } from 'vitest'
import { roleThicknessFor } from './resolveThickness'
import type { MaterialDef } from './types'

const MATERIALS: Record<string, MaterialDef> = {
  '18mm Ply': { thickness: 18 },
  '25mm Ply': { thickness: 25 },
  '12mm MDF': { thickness: 12 },
  Dowel: { costPerM: 2 }, // no thickness — not a sheet good
}

const slots = { carcaseMaterial: '18mm Ply', backMaterial: '12mm MDF' }

describe('roleThicknessFor', () => {
  it('gives every carcase role the carcase slot thickness', () => {
    const t = roleThicknessFor(slots, MATERIALS, new Map())
    expect(t('left-side')).toBe(18)
    expect(t('bottom')).toBe(18)
    expect(t('division-sec_a-0')).toBe(18)
  })

  it('gives the back its own slot thickness', () => {
    expect(roleThicknessFor(slots, MATERIALS, new Map())('back')).toBe(12)
  })

  it('a material override takes that material thickness', () => {
    const t = roleThicknessFor(slots, MATERIALS, new Map([['left-side', { material: '25mm Ply' }]]))
    expect(t('left-side')).toBe(25)
    expect(t('right-side')).toBe(18)
  })

  // The user's number wins over the material's, which is what "override to any number > 0" means.
  it('an explicit thickness override beats its own material', () => {
    const t = roleThicknessFor(
      slots,
      MATERIALS,
      new Map([['left-side', { material: '25mm Ply', thickness: 20 }]]),
    )
    expect(t('left-side')).toBe(20)
  })

  // Deliberately fatal, matching grainAxisOf: a silent zero collapses every panel derived from it
  // and the symptom appears far from the cause.
  it('throws for a material with no thickness', () => {
    expect(() =>
      roleThicknessFor({ ...slots, carcaseMaterial: 'Dowel' }, MATERIALS, new Map())('bottom'),
    ).toThrow(/no thickness/)
  })

  it('throws for a material that is not in the record at all', () => {
    expect(() =>
      roleThicknessFor({ ...slots, carcaseMaterial: 'Nope' }, MATERIALS, new Map())('bottom'),
    ).toThrow(/no thickness/)
  })
})
