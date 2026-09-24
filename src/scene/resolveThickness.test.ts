import { describe, expect, it } from 'vitest'
import { materialForRole, roleThicknessFor } from './resolveThickness'
import type { MaterialDef } from './types'

const MATERIALS: Record<string, MaterialDef> = {
  '18mm Ply': { thickness: 18 },
  '25mm Ply': { thickness: 25 },
  '12mm MDF': { thickness: 12 },
  'Hardwood 20mm': { thickness: 20 },
  Dowel: { costPerM: 2 }, // no thickness — not a sheet good
}

const slots = {
  carcaseMaterial: '18mm Ply',
  backMaterial: '12mm MDF',
  frontMaterial: '25mm Ply',
  frameMaterial: 'Hardwood 20mm',
}

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

  // Three slots, three answers from one resolver. A front is a family rather than a name — its role
  // carries the section it covers and which leaf it is — so a `startsWith` is what tells them apart.
  it('draws a front on the front slot, not the carcase slot', () => {
    const t = roleThicknessFor(slots, MATERIALS, new Map())
    expect(t('front-sec_a-0')).toBe(25)
    expect(t('front-sec_a-1')).toBe(25)
    expect(t('left-side')).toBe(18)
    expect(t('back')).toBe(12)
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

describe('the frame slot', () => {
  // 20 is no other slot's thickness, so a frame member resolving to any other slot fails here.
  it('resolves a frame member to the frame slot', () => {
    const t = roleThicknessFor(slots, MATERIALS, new Map())
    expect(t('stile-left')).toBe(20)
    expect(t('stile-right')).toBe(20)
    expect(t('rail-top')).toBe(20)
    expect(t('rail-bottom')).toBe(20)
  })

  // A family, not a name — the same rule `front-` follows — so stage 2's mid members resolve
  // without touching the resolver again.
  it('resolves a mid member by family', () => {
    expect(materialForRole(slots, new Map(), 'stile-mid-1')).toBe('Hardwood 20mm')
    expect(materialForRole(slots, new Map(), 'rail-mid-1')).toBe('Hardwood 20mm')
  })

  it('moves nothing else', () => {
    expect(materialForRole(slots, new Map(), 'left-side')).toBe('18mm Ply')
    expect(materialForRole(slots, new Map(), 'back')).toBe('12mm MDF')
    expect(materialForRole(slots, new Map(), 'front-sec_a-0')).toBe('25mm Ply')
  })

  it('still lets a part override its frame material', () => {
    const overrides = new Map([['stile-left', { material: '25mm Ply' }]])
    expect(materialForRole(slots, overrides, 'stile-left')).toBe('25mm Ply')
    expect(roleThicknessFor(slots, MATERIALS, overrides)('stile-left')).toBe(25)
  })
})
