import { describe, expect, it } from 'vitest'
import {
  CUP_DEPTH,
  CUP_DIAMETER,
  CUP_EDGE_DISTANCE,
  HINGE_END_INSET,
  SLIDE_SCREW_SETBACK,
  cupRow,
  hingeCount,
  hingePositions,
  plateScrewRows,
  slideScrewRow,
} from './frontMachining'

describe('hingeCount', () => {
  // A stated table, not a formula: read off standard hardware guidance. The boundaries are what a
  // test can hold still — a door of exactly 900 takes two, 901 takes three.
  it.each([
    [400, 2],
    [900, 2],
    [901, 3],
    [1600, 3],
    [1601, 4],
    [2000, 4],
    [2001, 5],
  ])('a %i mm door takes %i hinges', (height, expected) => {
    expect(hingeCount(height)).toBe(expected)
  })
})

describe('hingePositions', () => {
  // First and last a fixed inset from each end, the rest evenly spaced — which is what makes the
  // row expressible as one HoleArrayCut with a uniform pitch rather than as n separate cuts.
  it('insets the first and last and spaces the rest evenly', () => {
    const row = hingePositions(1000)
    expect(row.count).toBe(3)
    expect(row.first).toBeCloseTo(HINGE_END_INSET, 9)
    expect(row.first + row.pitch * (row.count - 1)).toBeCloseTo(1000 - HINGE_END_INSET, 9)
  })

  // Two hinges is one pitch, and the arithmetic must not divide by zero on the way there.
  it('handles the two-hinge case', () => {
    const row = hingePositions(600)
    expect(row.count).toBe(2)
    expect(row.pitch).toBeCloseTo(600 - 2 * HINGE_END_INSET, 9)
  })

  // A door shorter than two insets cannot hold the row as stated. Pulling the insets in is the only
  // alternative to boring off the end of the door.
  it('never runs a hinge off the end of a short door', () => {
    for (const height of [120, 180, 200, 250, 400, 900, 2400]) {
      const row = hingePositions(height)
      expect(row.first, `h=${height}`).toBeGreaterThanOrEqual(0)
      expect(row.first + row.pitch * (row.count - 1), `h=${height}`).toBeLessThanOrEqual(height)
      expect(row.pitch, `h=${height}`).toBeGreaterThan(0)
    }
  })
})

describe('cupRow', () => {
  const door = { length: 600, width: 400, thickness: 18 }

  it('bores the back of the door, never the front', () => {
    // Board +Z is the door's back in *both* mounts — `orientedPanel` maps board z to carcase y and
    // puts the origin on the box min corner, so the outward face is board z = 0 whether the box is
    // y ∈ [−FT, 0] or y ∈ [0, FT]. Asserted here as the board face; the carcase-space check that
    // it points into the cabinet lives in the generator test, where a cabinet exists.
    expect(cupRow(door, 'left', 'f-1')!.face).toBe('+Z')
  })

  it('measures the cup centre from the hinged edge', () => {
    expect(cupRow(door, 'left', 'f-1')!.start.y).toBeCloseTo(CUP_EDGE_DISTANCE, 9)
    expect(cupRow(door, 'right', 'f-1')!.start.y).toBeCloseTo(400 - CUP_EDGE_DISTANCE, 9)
  })

  it('runs the row along the door height at the hinge positions', () => {
    const row = cupRow(door, 'left', 'f-1')!
    const expected = hingePositions(600)
    expect(row.axis).toBe('U') // board x, which is the door's height
    expect(row.count).toBe(expected.count)
    expect(row.pitch).toBeCloseTo(expected.pitch, 9)
    expect(row.start.x).toBeCloseTo(expected.first, 9)
  })

  it('is a blind bore, never through', () => {
    const row = cupRow(door, 'left', 'f-1')!
    expect(row.depth).toBe(CUP_DEPTH)
    expect(row.depth).toBeLessThan(door.thickness)
    expect(row.diameter).toBe(CUP_DIAMETER)
  })

  // A cup is 12.5 deep. In a 14 mm door that leaves 1.5 mm of face, which is a hole waiting to
  // burst through — the same reasoning that clamps a screw's pilot depth in `screw.ts`.
  it('bores nothing into a door too thin to take a cup', () => {
    expect(cupRow({ ...door, thickness: 14 }, 'left', 'f-1')).toBeNull()
    expect(cupRow({ ...door, thickness: 16 }, 'left', 'f-1')).not.toBeNull()
  })
})

describe('plateScrewRows', () => {
  const side = { length: 560, width: 720, thickness: 18 }

  it('gives each hinge its own two-screw row', () => {
    const rows = plateScrewRows(side, '+Z', [100, 400, 700], 'f-1')
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(r.count).toBe(2)
    expect(rows.map((r) => r.start.y)).toEqual([100, 400, 700])
  })

  // Three unrelated hole-array families share a carcase side. Stage D had to widen a key after one
  // row silently replaced another; this is the same guard one family further out.
  it('gives every row a distinct id', () => {
    const ids = plateScrewRows(side, '+Z', [100, 400, 700], 'f-1').map((r) => r.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('never bores through the panel', () => {
    for (const thickness of [12, 16, 18, 25]) {
      const [row] = plateScrewRows({ ...side, thickness }, '+Z', [100], 'f-1')
      expect(row.depth, `t=${thickness}`).toBeLessThan(thickness)
      expect(row.depth, `t=${thickness}`).toBeGreaterThan(0)
    }
  })

  // The row starts on the face OCCT drills from, which is the far side of the board for '+Z' and
  // the near side for '-Z' — the convention `carcaseHoleArrays` already follows.
  it('starts the row on the face it drills through', () => {
    expect(plateScrewRows(side, '+Z', [100], 'f-1')[0].start.z).toBe(18)
    expect(plateScrewRows(side, '-Z', [100], 'f-1')[0].start.z).toBe(0)
  })
})

describe('slideScrewRow', () => {
  it('runs along the depth from the front setback, and stays on the panel', () => {
    for (const length of [250, 300, 400, 560, 700]) {
      const row = slideScrewRow({ length, width: 720, thickness: 18 }, '+Z', 300, 'f-1')
      const last = row.start.x + row.pitch * (row.count - 1)
      expect(row.start.x, `d=${length}`).toBeCloseTo(SLIDE_SCREW_SETBACK, 9)
      expect(last, `d=${length}`).toBeLessThanOrEqual(length)
      expect(row.count, `d=${length}`).toBeGreaterThanOrEqual(2)
    }
  })
})
