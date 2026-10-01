import { describe, expect, it } from 'vitest'
import { effectiveMaterialsOf } from './effectiveMaterials'

describe('effectiveMaterialsOf', () => {
  it('lets scene fields override library fields and keeps library-only fields', () => {
    const merged = effectiveMaterialsOf(
      { Ply: { costPerM2: 50, thickness: 18 }, Dowel: { costPerM: 2 } },
      { Ply: { thickness: 19 }, Only: { thickness: 3 } },
    )
    expect(merged.Ply).toEqual({ costPerM2: 50, thickness: 19 })
    expect(merged.Dowel).toEqual({ costPerM: 2 })
    expect(merged.Only).toEqual({ thickness: 3 })
  })
})
