import { describe, it, expect } from 'vitest'
import {
  CATALOGUE_ORDER,
  HARDWARE_CATALOGUE,
  RUNNER_NOMINALS,
  SCREW_KEY,
  SHELF_PIN_KEY,
  hingeKeyFor,
  runnerKeyFor,
} from './hardwareCatalogue'

describe('hardwareCatalogue', () => {
  it('gives every catalogue key a name and a unit', () => {
    for (const key of CATALOGUE_ORDER) {
      expect(HARDWARE_CATALOGUE[key].name.length, key).toBeGreaterThan(0)
      expect(HARDWARE_CATALOGUE[key].unit.length, key).toBeGreaterThan(0)
    }
    expect(CATALOGUE_ORDER.length).toBe(Object.keys(HARDWARE_CATALOGUE).length)
  })

  it('names a runner for every nominal, priced by the pair', () => {
    for (const n of RUNNER_NOMINALS) {
      expect(HARDWARE_CATALOGUE[`runner-${n}`].unit).toBe('pair')
    }
  })

  it('picks the largest nominal that fits the clear depth', () => {
    expect(runnerKeyFor(548)).toBe('runner-500') // a 560 mm Base, 12 mm captured back
    expect(runnerKeyFor(318)).toBe('runner-300') // a 330 mm Wall
    expect(runnerKeyFor(500)).toBe('runner-500') // exactly the nominal still fits
    expect(runnerKeyFor(499)).toBe('runner-450')
    expect(runnerKeyFor(1000)).toBe('runner-600') // never past the largest stocked length
  })

  it('lists no runner at all below the smallest nominal', () => {
    expect(runnerKeyFor(249)).toBeNull()
  })

  it('keys a hinge by the mount, because the bores cannot tell them apart', () => {
    expect(hingeKeyFor('overlay')).toBe('hinge-overlay')
    expect(hingeKeyFor('inset')).toBe('hinge-inset')
    expect(hingeKeyFor('overlay')).not.toBe(hingeKeyFor('inset'))
  })

  it('holds one screw and one pin, not a family of each', () => {
    expect(HARDWARE_CATALOGUE[SCREW_KEY].unit).toBe('pcs')
    expect(HARDWARE_CATALOGUE[SHELF_PIN_KEY].unit).toBe('pcs')
  })
})
