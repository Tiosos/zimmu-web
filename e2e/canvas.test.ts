import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { isNonBlank } from './canvas'

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
