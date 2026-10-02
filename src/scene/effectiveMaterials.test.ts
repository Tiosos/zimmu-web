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

  it('never takes `use` from the library', () => {
    const merged = effectiveMaterialsOf(
      { Shared: { thickness: 1, use: 'edge', costPerM: 2 } },
      { Shared: { thickness: 18, costPerM2: 40 } },
    )
    expect(merged.Shared.use).toBeUndefined()
    expect(merged.Shared.costPerM).toBe(2)
    expect(effectiveMaterialsOf({ Only: { use: 'edge' } }, {}).Only.use).toBeUndefined()
  })

  it('keeps `use` from the scene definition', () => {
    const merged = effectiveMaterialsOf(
      { ABS: { costPerM: 2 } },
      { ABS: { thickness: 1, use: 'edge' } },
    )
    expect(merged.ABS).toEqual({ costPerM: 2, thickness: 1, use: 'edge' })
  })
})
