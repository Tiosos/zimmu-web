import { describe, it, expect } from 'vitest'
import { rotatedBounds, translatedBounds, anchoredPosition } from './anchor'
import type { Bounds3 } from './carcaseBounds'
import type { Anchor } from './types'

const NO_ROT = { x: 0, y: 0, z: 0 }
const TURNED = { x: 0, y: 0, z: 90 }

// A Base 600: 600 wide, 560 deep, 720 high. Asymmetric on every axis on purpose.
const base = (w = 600, d = 560, h = 720): Bounds3 => ({ x0: 0, x1: w, y0: 0, y1: d, z0: 0, z1: h })

const close = (b: Bounds3): number[] =>
  [b.x0, b.x1, b.y0, b.y1, b.z0, b.z1].map((n) => Math.round(n * 1e6) / 1e6)

describe('rotatedBounds', () => {
  it('is the box itself at zero rotation', () => {
    expect(close(rotatedBounds(base(), NO_ROT))).toEqual([0, 600, 0, 560, 0, 720])
  })

  // Turned 90° about z the footprint transposes AND moves: local +y goes to world −x, so the box
  // now hangs off the negative x side of its own origin.
  it('transposes and shifts the footprint at 90 degrees', () => {
    expect(close(rotatedBounds(base(), TURNED))).toEqual([-560, 0, 0, 600, 0, 720])
  })

  it('leaves height alone under a z rotation', () => {
    const b = rotatedBounds(base(), TURNED)
    expect([b.z0, b.z1]).toEqual([0, 720])
  })
})

describe('translatedBounds', () => {
  it('shifts every edge by the position', () => {
    expect(close(translatedBounds(base(), { x: 10, y: -20, z: 5 }))).toEqual([
      10, 610, -20, 540, 5, 725,
    ])
  })
})

describe('anchoredPosition', () => {
  const anchor = (over: Partial<Anchor> = {}): Anchor => ({
    to: 'cmp_target',
    face: 'right',
    gap: 0,
    offset: { u: 0, v: 0 },
    ...over,
  })

  it('butts a cabinet against the target right side', () => {
    const target = base()
    const own = rotatedBounds(base(800), NO_ROT)
    expect(anchoredPosition(anchor(), target, own)).toEqual({ x: 600, y: 0, z: 0 })
  })

  it('a gap pushes it further out along the normal', () => {
    const p = anchoredPosition(anchor({ gap: 12 }), base(), rotatedBounds(base(), NO_ROT))
    expect(p.x).toBe(612)
  })

  it('the left face puts it on the other side, clear of the target', () => {
    // Its own far edge lands on the target's near edge, so an 800-wide cabinet starts at -800.
    const p = anchoredPosition(anchor({ face: 'left' }), base(), rotatedBounds(base(800), NO_ROT))
    expect(p.x).toBe(-800)
  })

  // The gap term appears in both branches of anchoredPosition's ternary, but every other gap test
  // here anchors on 'right' — the positive branch. Without this case, deleting `- anchor.gap` from
  // the negative branch alone passes the whole suite.
  it('a gap pushes it further out along the normal on the negative side too', () => {
    const p = anchoredPosition(
      anchor({ face: 'left', gap: 12 }),
      base(),
      rotatedBounds(base(800), NO_ROT),
    )
    expect(p.x).toBe(-812)
  })

  it('offsets slide it within the face, from the target minimum corner', () => {
    const p = anchoredPosition(
      anchor({ offset: { u: 25, v: 1400 } }),
      base(),
      rotatedBounds(base(), NO_ROT),
    )
    // u is depth (y) and v is height (z) for a left/right face.
    expect(p).toEqual({ x: 600, y: 25, z: 1400 })
  })

  // THE CORNER. A blind cabinet 900 wide; a 600 return cabinet turned 90° anchored to its FRONT.
  // Reproduces the arithmetic in the spec exactly: the return run lands at x = 560, y = -600, so it
  // occupies world x ∈ [0, 560] with its back on the side wall and y ∈ [-600, 0] clear of the blind
  // unit. A rule that met the target's front with the anchored cabinet's own BACK cannot produce
  // this — the two planes are perpendicular.
  it('lands a turned cabinet against a blind unit front', () => {
    const blind = base(900)
    const own = rotatedBounds(base(600), TURNED)
    const p = anchoredPosition(anchor({ face: 'front' }), blind, own)
    expect(p.x).toBeCloseTo(560)
    expect(p.y).toBeCloseTo(-600)
    expect(p.z).toBeCloseTo(0)
  })

  it('and the turned cabinet then occupies the space the corner arithmetic predicts', () => {
    const own = rotatedBounds(base(600), TURNED)
    const p = anchoredPosition(anchor({ face: 'front' }), base(900), own)
    expect(close(translatedBounds(own, p))).toEqual([0, 560, -600, 0, 0, 720])
  })

  it('puts a back-to-back island behind the target', () => {
    const p = anchoredPosition(anchor({ face: 'back' }), base(), rotatedBounds(base(), NO_ROT))
    expect(p.y).toBe(560)
  })

  // The front/back in-plane axes are (x, z) — width, then height — a different pair from
  // left/right's (y, z), not a reversal of it (a reversal would be (z, y)). A table that swapped
  // them would still satisfy every other test here, since none of them anchors on front/back with a
  // nonzero offset.
  it('offsets a front/back anchor along width and height, not depth', () => {
    const p = anchoredPosition(
      anchor({ face: 'back', offset: { u: 50, v: 300 } }),
      base(),
      rotatedBounds(base(), NO_ROT),
    )
    expect(p).toEqual({ x: 50, y: 560, z: 300 })
  })

  // Occupied bounds in, occupied bounds out: an applied back is already inside the target box, so
  // the neighbour clears the back rather than interpenetrating it.
  it('clears a target applied back because the bounds already carry it', () => {
    const withBack: Bounds3 = { ...base(), y1: 566 }
    const p = anchoredPosition(anchor({ face: 'back' }), withBack, rotatedBounds(base(), NO_ROT))
    expect(p.y).toBe(566)
  })
})
