import { PNG } from 'pngjs'

// Decodes a PNG screenshot and reports whether it contains more than one
// distinct (quantized) color. A freshly-cleared WebGL canvas is one uniform
// color; a rendered mesh produces several. The high-bit mask suppresses
// anti-aliasing noise. Sampling on a stride keeps it cheap.
export function isNonBlank(pngBuffer: Buffer): boolean {
  const { data, width, height } = PNG.sync.read(pngBuffer)
  const seen = new Set<string>()
  const step = 4
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) << 2
      const key = `${data[o] & 0xe0},${data[o + 1] & 0xe0},${data[o + 2] & 0xe0}`
      seen.add(key)
      if (seen.size > 1) return true
    }
  }
  return false
}
