import { test, expect } from 'vitest'
import type { BoardPart, BoxCut, Face, Vec3 } from './types'
import { cutFootprintCorners } from './cutFootprint'
import { defaultDadoJoint, defaultMortiseTenonJoint } from './defaultJoint'
import { computeDadoGroove } from '../geom/dado'
import { computeMortisePocket } from '../geom/mortisetenon'
import { componentsById } from './componentTree'

const NO_COMPONENTS = componentsById([])

function board(over: Partial<BoardPart>): BoardPart {
  return {
    kind: 'board',
    id: 'X',
    label: 'X',
    length: 100,
    width: 40,
    thickness: 18,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...over,
  }
}

function cut(face: Face, position: Vec3, size: Vec3): BoxCut {
  return { kind: 'box', id: 'c1', label: 'c', face, position, size }
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

test('maps a +Z cut onto the board top face in local axis order', () => {
  const b = board({})
  const corners = cutFootprintCorners(b, cut('+Z', { x: 10, y: 5, z: 8 }, { x: 20, y: 10, z: 10 }), NO_COMPONENTS)
  // faceAxes('+Z') = { depth: 'z', u: 'x', v: 'y' }; the plane is the board top, z = thickness.
  expect(corners).toEqual([
    { x: 10, y: 5, z: 18 },
    { x: 30, y: 5, z: 18 },
    { x: 30, y: 15, z: 18 },
    { x: 10, y: 15, z: 18 },
  ])
})

test('a negative face sits on the zero plane, spanning that face two axes', () => {
  const b = board({})
  const corners = cutFootprintCorners(b, cut('-X', { x: 0, y: 5, z: 2 }, { x: 5, y: 10, z: 6 }), NO_COMPONENTS)
  // faceAxes('-X') = { depth: 'x', u: 'y', v: 'z' }; the plane is x = 0.
  expect(corners).toEqual([
    { x: 0, y: 5, z: 2 },
    { x: 0, y: 15, z: 2 },
    { x: 0, y: 15, z: 8 },
    { x: 0, y: 5, z: 8 },
  ])
})

test('corners are wound around the perimeter, not across the diagonal', () => {
  const corners = cutFootprintCorners(
    board({}),
    cut('+Z', { x: 10, y: 5, z: 8 }, { x: 20, y: 10, z: 10 }),
    NO_COMPONENTS,
  )
  // A bow tie would make the two "sides" the diagonal instead: adjacent corners must differ
  // along exactly one in-plane axis each, and opposite sides must be equal length.
  expect(dist(corners[0], corners[1])).toBeCloseTo(20, 9)
  expect(dist(corners[1], corners[2])).toBeCloseTo(10, 9)
  expect(dist(corners[2], corners[3])).toBeCloseTo(20, 9)
  expect(dist(corners[3], corners[0])).toBeCloseTo(10, 9)
})

test('board rotation and offset move the footprint rigidly', () => {
  const c = cut('+Z', { x: 10, y: 5, z: 8 }, { x: 20, y: 10, z: 10 })
  const flat = cutFootprintCorners(board({}), c, NO_COMPONENTS)
  const moved = cutFootprintCorners(
    board({ rotation: { x: 0, y: -90, z: 0 }, position: { x: 200, y: -30, z: 18 } }),
    c,
    NO_COMPONENTS,
  )
  // A rigid transform preserves every side length; only placement changes.
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    expect(dist(moved[i], moved[j])).toBeCloseTo(dist(flat[i], flat[j]), 9)
  }
  expect(moved).not.toEqual(flat)
})

// The reason this module exists. Dado and mortise-tenon are offered on the same contact pair and
// resolve to the same two FACES, so face outlines cannot tell them apart (see suggestJoints.test).
// Their footprints differ: the groove runs clear across the housing board, the pocket is inset.
test('a dado footprint spans the housing board where a mortise footprint does not', () => {
  const housing = board({ id: 'H', length: 200, width: 100, thickness: 20 })
  const housed = board({
    id: 'D',
    length: 80,
    width: 40,
    thickness: 18,
    rotation: { x: 0, y: -90, z: 0 },
    position: { x: 100, y: 30, z: 20 },
  })

  const groove = computeDadoGroove(
    housing,
    housed,
    defaultDadoJoint(housing, housed, '+Z', '-X', 'j_dado', 'Dado 1', NO_COMPONENTS),
  )
  const pocket = computeMortisePocket(
    housing,
    housed,
    defaultMortiseTenonJoint(
      housing,
      housed,
      '+Z',
      '-X',
      'j_mt',
      'Mortise & tenon 1',
      NO_COMPONENTS,
    ),
  )

  // Side lengths of the footprint rectangle, ascending. Which local axis each side falls on
  // depends on how deriveDadoAxes picks the run axis, so compare lengths rather than axes.
  const sides = (c: BoxCut) => {
    const [c0, c1, c2] = cutFootprintCorners(housing, c, NO_COMPONENTS)
    return [dist(c0, c1), dist(c1, c2)].sort((a, b) => a - b)
  }
  // The groove runs clear across the 100mm width of the housing board. The mortise pocket is
  // inset on both axes — it reaches neither the 200mm length nor the 100mm width.
  expect(sides(groove)[1]).toBeCloseTo(100, 6)
  expect(sides(pocket)[1]).toBeLessThan(100)

  // And the two footprints are genuinely different rectangles — the whole point.
  expect(cutFootprintCorners(housing, groove, NO_COMPONENTS)).not.toEqual(cutFootprintCorners(housing, pocket, NO_COMPONENTS))
})
