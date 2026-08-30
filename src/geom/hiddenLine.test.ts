import { describe, it, expect } from 'vitest'
import { subtractIntervals, type Span } from './hiddenLine'

const s = (a: number, b: number): Span => ({ a, b })

describe('subtractIntervals', () => {
  it('returns the whole span when nothing is subtracted', () => {
    expect(subtractIntervals(s(0, 10), [])).toEqual([s(0, 10)])
  })

  it('ignores a hole entirely outside the span', () => {
    expect(subtractIntervals(s(0, 10), [s(20, 30)])).toEqual([s(0, 10)])
    expect(subtractIntervals(s(0, 10), [s(-30, -20)])).toEqual([s(0, 10)])
  })

  // A butt joint puts an occluder's edge exactly on the span's. Emitting a zero-length span there
  // renders as a stray dot on every joint in the cabinet.
  it('emits nothing for a hole that only touches an endpoint', () => {
    expect(subtractIntervals(s(0, 10), [s(10, 20)])).toEqual([s(0, 10)])
    expect(subtractIntervals(s(0, 10), [s(-10, 0)])).toEqual([s(0, 10)])
  })

  it('returns empty when the hole covers the span exactly', () => {
    expect(subtractIntervals(s(0, 10), [s(0, 10)])).toEqual([])
  })

  it('returns empty when the hole covers more than the span', () => {
    expect(subtractIntervals(s(0, 10), [s(-5, 15)])).toEqual([])
  })

  it('splits into two when the hole is strictly inside', () => {
    expect(subtractIntervals(s(0, 10), [s(4, 6)])).toEqual([s(0, 4), s(6, 10)])
  })

  it('trims from the start and from the end', () => {
    expect(subtractIntervals(s(0, 10), [s(-5, 3)])).toEqual([s(3, 10)])
    expect(subtractIntervals(s(0, 10), [s(7, 15)])).toEqual([s(0, 7)])
  })

  it('merges overlapping holes rather than double-cutting', () => {
    expect(subtractIntervals(s(0, 10), [s(2, 5), s(4, 8)])).toEqual([s(0, 2), s(8, 10)])
  })

  // The caller collects occluders in whatever order it walks the parts. Sorting is the function's
  // job, not the caller's — a caller that forgot would get a silently wrong drawing.
  it('does not care what order the holes arrive in', () => {
    expect(subtractIntervals(s(0, 10), [s(7, 8), s(2, 3)])).toEqual([s(0, 2), s(3, 7), s(8, 10)])
  })

  // Panel edges come out of float arithmetic. Two that should coincide can differ by ~1e-13, and
  // without a tolerance that leaves a hairline sliver of "visible" edge along every butt joint.
  it('treats a sub-epsilon remainder as nothing', () => {
    expect(subtractIntervals(s(0, 10), [s(1e-13, 10)])).toEqual([])
    expect(subtractIntervals(s(0, 10), [s(0, 10 - 1e-13)])).toEqual([])
  })

  it('is the complement of itself, which is how hidden edges are found', () => {
    const span = s(0, 10)
    const visible = subtractIntervals(span, [s(4, 6)])
    expect(subtractIntervals(span, visible)).toEqual([s(4, 6)])
  })
})
