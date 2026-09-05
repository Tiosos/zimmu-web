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

// Fraction of sampled pixels whose (high-bit-masked) color differs between two
// equally-sized screenshots. The high-bit mask suppresses anti-aliasing noise so
// a steady scene reads ~0; new on-screen geometry produces a clear positive.
export function changedFraction(a: Buffer, b: Buffer): number {
  const pa = PNG.sync.read(a)
  const pb = PNG.sync.read(b)
  if (pa.width !== pb.width || pa.height !== pb.height) return 1
  const { width, height } = pa
  let changed = 0
  let sampled = 0
  const step = 4
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) << 2
      sampled++
      if (
        (pa.data[o] & 0xe0) !== (pb.data[o] & 0xe0) ||
        (pa.data[o + 1] & 0xe0) !== (pb.data[o + 1] & 0xe0) ||
        (pa.data[o + 2] & 0xe0) !== (pb.data[o + 2] & 0xe0)
      ) {
        changed++
      }
    }
  }
  return sampled === 0 ? 0 : changed / sampled
}

export type Match = (r: number, g: number, b: number) => boolean

// Counts pixels of a given hue. Deliberately not changedFraction(): that masks colour to its high
// bits to suppress AA noise, which also erases 1px anti-aliased wireframe, leaving the highlight
// smaller than the frame-to-frame churn of the dev-mode FPS overlay. Keying on the highlight's own
// colours ignores that overlay (cyan) entirely.
export function countPixels(pngBuffer: Buffer, match: Match): number {
  const { data, width, height } = PNG.sync.read(pngBuffer)
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) << 2
      if (match(data[o], data[o + 1], data[o + 2])) count++
    }
  }
  return count
}
