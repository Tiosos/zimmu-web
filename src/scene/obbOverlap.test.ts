import { test, expect } from 'vitest'
import type { BoardPart } from './types'
import { obbOverlap } from './obbOverlap'

const board = (o: Partial<BoardPart>): BoardPart => ({
  kind: 'board',
  id: 'p',
  label: 'B',
  length: 200,
  width: 20,
  thickness: 20,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
  ...o,
})

test('axis-aligned overlapping boards overlap', () => {
  const a = board({ id: 'A', length: 100, width: 100, thickness: 20 })
  const b = board({
    id: 'B',
    length: 100,
    width: 100,
    thickness: 20,
    position: { x: 0, y: 0, z: 18 },
  })
  expect(obbOverlap(a, b)).toBe(true)
})

test('axis-aligned separated boards do not overlap', () => {
  const a = board({ id: 'A' })
  const b = board({ id: 'B', position: { x: 0, y: 500, z: 0 } })
  expect(obbOverlap(a, b)).toBe(false)
})

test('boards a hair apart still count as overlapping, a clear gap does not', () => {
  const base = board({ id: 'BASE', length: 200, width: 100, thickness: 20 })
  const near = board({
    id: 'N',
    length: 200,
    width: 100,
    thickness: 18,
    position: { x: 0, y: 0, z: 20.5 },
  })
  const far = board({
    id: 'F',
    length: 200,
    width: 100,
    thickness: 18,
    position: { x: 0, y: 0, z: 25 },
  })
  expect(obbOverlap(base, near)).toBe(true)
  expect(obbOverlap(base, far)).toBe(false)
})

// The reason this test exists. A thin bar rotated 45° about Z has a large square AABB, but its body
// only fills the diagonal. A small board tucked into the AABB's empty off-diagonal corner overlaps
// the bar's *bounding box* yet not the bar itself — the exact false positive worldAabb produces and
// obbOverlap must reject. Calibrated numerically: at (110, 0) the AABB test returns true here.
test('a board in the empty corner of a rotated bar AABB does not overlap the bar', () => {
  const bar = board({
    id: 'BAR',
    length: 200,
    width: 20,
    thickness: 20,
    rotation: { x: 0, y: 0, z: 45 },
  })
  const corner = board({
    id: 'S',
    length: 20,
    width: 20,
    thickness: 20,
    position: { x: 110, y: 0, z: 0 },
  })
  expect(obbOverlap(bar, corner)).toBe(false)
})

// The complement: a rotated bar that genuinely passes through another board must still register, so
// the test above is catching a real geometric miss rather than a blanket rejection of rotated boards.
test('a rotated bar crossing a board does overlap', () => {
  const plate = board({ id: 'P', length: 200, width: 200, thickness: 20 })
  const bar = board({
    id: 'BAR',
    length: 200,
    width: 20,
    thickness: 20,
    rotation: { x: 0, y: 0, z: 45 },
    position: { x: 60, y: 20, z: 0 },
  })
  expect(obbOverlap(plate, bar)).toBe(true)
})

test('overlap is symmetric', () => {
  const bar = board({
    id: 'BAR',
    length: 200,
    width: 20,
    thickness: 20,
    rotation: { x: 0, y: 0, z: 45 },
  })
  const corner = board({
    id: 'S',
    length: 20,
    width: 20,
    thickness: 20,
    position: { x: 110, y: 0, z: 0 },
  })
  expect(obbOverlap(corner, bar)).toBe(obbOverlap(bar, corner))
})
