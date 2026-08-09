import { test, expect } from 'vitest'
import type { BoardPart, Part } from './types'
import { suggestJointsFor } from './suggestJoints'
import type { JointSuggestion } from './suggestJoints'
import { suggestionOutlines } from './suggestionOutline'

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
    ...over,
  }
}

// Perpendicular tee — offers dado and mortise-tenon on the same contact pair.
const teeH = board({ id: 'H', length: 200, width: 100, thickness: 20 })
const teeD = board({
  id: 'D',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 100, y: 30, z: 20 },
})

// Two crossing coplanar boards of equal thickness — offers a half-lap.
const lapA = board({ id: 'LA', length: 200, width: 40, thickness: 20 })
const lapB = board({
  id: 'LB',
  length: 40,
  width: 200,
  thickness: 20,
  position: { x: 80, y: -80, z: 0 },
})

// Flush box corner — offers a finger joint (alongside dado and mortise & tenon).
const cornerA = board({ id: 'CA', length: 200, width: 100, thickness: 18 })
const cornerB = board({
  id: 'CB',
  length: 150,
  width: 100,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 200, y: 0, z: 18 },
})

// Coplanar edge glue-up — offers tongue & groove.
const edgeG = board({ id: 'G', length: 200, width: 40, thickness: 18 })
const edgeE = board({
  id: 'E',
  length: 200,
  width: 40,
  thickness: 18,
  position: { x: 0, y: 40, z: 0 },
})

const parts: Part[] = [teeH, teeD, edgeG, edgeE]

function of(kind: JointSuggestion['kind'], selected: string, scope: Part[]) {
  const s = suggestJointsFor(selected, scope, []).find((x) => x.kind === kind)
  expect(s, `expected a ${kind} suggestion`).toBeDefined()
  return suggestionOutlines(s!, scope)
}

test('a dado previews the groove it would cut, not the whole housing face', () => {
  const [outline, ...rest] = of('dado', 'H', [teeH, teeD])
  // Default dado is profile 'plain' with no stops, so deriveJoint yields exactly one cut:
  // the groove on the housing board. Nothing is removed from the housed board.
  expect(rest).toHaveLength(0)
  // The groove is narrower than the 200mm housing face it sits on.
  const span = Math.hypot(
    outline.corners[0].x - outline.corners[1].x,
    outline.corners[0].y - outline.corners[1].y,
    outline.corners[0].z - outline.corners[1].z,
  )
  expect(span).toBeLessThan(200)
})

test('a mortise & tenon previews its pocket plus the tenon shoulders', () => {
  // computeTenonShoulders returns up to four strips, plus the mortise pocket — the case that
  // made a fixed pair of LineLoops in the viewport insufficient.
  expect(of('mortise-tenon', 'H', [teeH, teeD]).length).toBeGreaterThan(2)
})

// The regression guard for the whole exercise: these two are offered on the same contact pair and
// resolve to the same two faces, so before footprints their previews were pixel-for-pixel identical.
test('dado and mortise-tenon previews differ on the same pair of boards', () => {
  const dado = of('dado', 'H', [teeH, teeD])
  const mt = of('mortise-tenon', 'H', [teeH, teeD])
  expect(dado).not.toEqual(mt)
})

// deriveTongueGroove emits the groove on one board plus two shoulders on the other, so the
// preview is three outlines rather than the two mating faces it used to show.
test('a tongue & groove previews its groove and both tongue shoulders', () => {
  expect(of('tongue-groove', 'G', [edgeG, edgeE])).toHaveLength(3)
})

// A finger joint's end faces are plain rectangles that say nothing about the joint; the comb of
// slots is the whole point, and computeFingerCuts emits one cut per removed segment.
test('a finger joint previews its comb of slots, not two plain end faces', () => {
  expect(of('finger', 'CA', [cornerA, cornerB]).length).toBeGreaterThan(2)
})

// Every kind now previews cuts, so no suggestion should fall back to whole-face outlines.
test('no kind falls back to whole-face outlines', () => {
  const faceCounts = [
    of('halflap', 'LA', [lapA, lapB]).length,
    of('dado', 'H', [teeH, teeD]).length,
    of('mortise-tenon', 'H', [teeH, teeD]).length,
    of('finger', 'CA', [cornerA, cornerB]).length,
    of('tongue-groove', 'G', [edgeG, edgeE]).length,
  ]
  // Two outlines would be the signature of the old face-pair fallback for every kind at once.
  expect(faceCounts.every((n) => n > 0)).toBe(true)
  expect(faceCounts).not.toEqual([2, 2, 2, 2, 2])
})

// Half-lap has no mating face pair, so suggestionFaceRefs returns [] for it and hovering used to
// draw nothing at all — only the neighbour tint. Its lap cuts are the preview.
test('a half-lap previews its two lap cuts instead of nothing', () => {
  expect(of('halflap', 'LA', [lapA, lapB])).toHaveLength(2)
})

// halflap.ts stamps both lap cuts face '+Z' as a placeholder. If that were taken at face value both
// outlines would be drawn on the boards' top faces, when the lap removes the upper half of one
// board and the lower half of the other — so the two normals must oppose.
test('the two lap outlines sit on opposite sides, not both on top', () => {
  const [a, b] = of('halflap', 'LA', [lapA, lapB])
  const dot = a.normal.x * b.normal.x + a.normal.y * b.normal.y + a.normal.z * b.normal.z
  expect(dot).toBeCloseTo(-1, 6)
})

test('a suggestion naming a missing part yields nothing rather than throwing', () => {
  const s = suggestJointsFor('H', [teeH, teeD], []).find((x) => x.kind === 'dado')!
  expect(
    suggestionOutlines(
      s,
      parts.filter((p) => p.id !== 'D'),
    ),
  ).toEqual([])
})
