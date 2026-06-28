import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { isNonBlank, changedFraction } from './canvas'

function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i++) {
    const o = i << 2
    png.data[o] = rgb[0]
    png.data[o + 1] = rgb[1]
    png.data[o + 2] = rgb[2]
    png.data[o + 3] = 255
  }
  return PNG.sync.write(png)
}

function twoTonePng(
  w: number,
  h: number,
  top: [number, number, number],
  bottom: [number, number, number],
): Buffer {
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) << 2
      const c = y < h / 2 ? top : bottom
      png.data[o] = c[0]
      png.data[o + 1] = c[1]
      png.data[o + 2] = c[2]
      png.data[o + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

describe('isNonBlank', () => {
  it('returns false for a uniform (single-color) image', () => {
    expect(isNonBlank(solidPng(64, 64, [20, 20, 30]))).toBe(false)
  })

  it('returns true for an image with two distinct color regions', () => {
    expect(isNonBlank(twoTonePng(64, 64, [20, 20, 30], [200, 160, 120]))).toBe(true)
  })
})

describe('changedFraction', () => {
  it('reports 0 for two identical frames', () => {
    const frame = twoTonePng(64, 64, [20, 20, 30], [200, 160, 120])
    expect(changedFraction(frame, frame)).toBe(0)
  })

  it('reports ~0 when colors differ only within a shared high-bit bucket (AA noise)', () => {
    // 200 and 207 both mask to 0xC0 under the 0xe0 high-bit comparison.
    const a = solidPng(64, 64, [200, 160, 120])
    const b = solidPng(64, 64, [207, 167, 127])
    expect(changedFraction(a, b)).toBe(0)
  })

  it('reports 1 when every pixel changes to a distinct color bucket', () => {
    const a = solidPng(64, 64, [20, 20, 30])
    const b = solidPng(64, 64, [200, 160, 120])
    expect(changedFraction(a, b)).toBe(1)
  })

  it('reports ~half when one of two equal regions changes', () => {
    const a = twoTonePng(64, 64, [20, 20, 30], [20, 20, 30])
    const b = twoTonePng(64, 64, [20, 20, 30], [200, 160, 120])
    expect(changedFraction(a, b)).toBeGreaterThan(0.4)
    expect(changedFraction(a, b)).toBeLessThan(0.6)
  })

  it('reports 1 for mismatched dimensions', () => {
    const a = solidPng(64, 64, [20, 20, 30])
    const b = solidPng(32, 32, [20, 20, 30])
    expect(changedFraction(a, b)).toBe(1)
  })
})
