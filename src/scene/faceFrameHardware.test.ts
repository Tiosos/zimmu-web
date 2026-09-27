import { describe, expect, it } from 'vitest'
import { blumFaceFrameHingeFor } from './faceFrameHardware'

describe('blumFaceFrameHingeFor', () => {
  it('uses 38B face-mount for the large overlay an outer Zimmu stile creates', () => {
    const h = blumFaceFrameHingeFor('overlay', 42.5)!
    expect(h.family).toBe('38B')
    expect(h.partNumber).toBe('38B355BF22')
    expect(h.cupDepth).toBe(11)
    expect(h.plate).toEqual({
      kind: 'face-mount',
      pilotDiameter: (5 / 64) * 25.4,
      pitch: 40,
      innerEdgeOffset: 16.5,
    })
  })

  it('selects a stocked 39C by actual mid-stile overlay, within Blum side adjustment', () => {
    // 56 mm mid stile, half overlay, 3 mm reveal -> 28 - 1.5 = 26.5 mm.
    const h = blumFaceFrameHingeFor('half-overlay', 26.5)!
    expect(h.family).toBe('39C')
    expect(h.partNumber).toBe('39C355B.16')
    expect(h.nominalOverlay).toBeCloseTo(25.4, 9)
    expect(h.cupDepth).toBe(13)
  })

  it('selects 38N for the half-overlay of a 44 mm outer stile', () => {
    // 44 / 2 - 3 / 2 = 20.5 mm; 3/4 in is 19.05 and Blum gives ±1.5 mm side adjustment.
    const h = blumFaceFrameHingeFor('half-overlay', 20.5)!
    expect(h.family).toBe('38N')
    expect(h.partNumber).toBe('38N355B.12')
    expect(h.nominalOverlay).toBeCloseTo(19.05, 9)
  })

  it('keeps the default 38 mm outer half-overlay inside the 38N adjustment range', () => {
    const h = blumFaceFrameHingeFor('half-overlay', 17.5)!
    expect(h.family).toBe('38N')
    expect(h.partNumber).toBe('38N355B.12')
  })

  it('uses the dedicated inset face-frame adapter', () => {
    const h = blumFaceFrameHingeFor('inset', 0)!
    expect(h.family).toBe('CLIP-inset')
    expect(h.key).toBe('hinge-blum-clip-inset-175h5030-21')
    expect(h.plate).toEqual({
      kind: 'inset-adapter',
      adapterPartNumber: '175H5030.21',
      pilotDiameter: 3,
      pitch: 32,
      frontOffset: 10,
      angle: 12,
    })
  })

  it('declines a physical overlay no stocked/adjustable application covers', () => {
    expect(blumFaceFrameHingeFor('overlay', 22)).toBeNull()
  })
})
