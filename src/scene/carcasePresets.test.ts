import { describe, it, expect } from 'vitest'
import { CARCASE_PRESETS } from './carcasePresets'
import { carcaseRoles, validateCarcaseParams } from './carcaseRoles'

describe('CARCASE_PRESETS', () => {
  it.each(CARCASE_PRESETS.map((p) => [p.name, p] as const))(
    '%s validates with no errors',
    (_name, preset) => {
      expect(validateCarcaseParams(preset.params)).toEqual([])
    },
  )

  it.each(CARCASE_PRESETS.map((p) => [p.name, p] as const))(
    '%s generates panels',
    (_name, preset) => {
      expect(carcaseRoles(preset.params).length).toBeGreaterThan(0)
    },
  )

  it('names every preset uniquely', () => {
    const names = CARCASE_PRESETS.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
