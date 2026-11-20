import { describe, expect, it } from 'vitest'
import { cutWebs } from './cutWebs'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import type { BoxCut, HoleArrayCut, MitreCut } from './types'

const boardOf = (): ManufacturingBoard => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board')
  scene.parts.forEach((p) => {
    p.cuts = []
  })
  return manufacturingParts(scene.parts, scene.materials, scene.components)[0] as ManufacturingBoard
}

// The manual board is 560 × 720 × 18. A default dado occupies x [100, 160], y [100, 300],
// z [12, 18]; `b` starts 2 mm to its right, which is a 2 mm web on x alone.
const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box',
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z',
  position: { x: 100, y: 100, z: 12 },
  size: { x: 60, y: 200, z: 6 },
  ...overrides,
})
const other = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  ...box({ id: 'bottom', label: 'Bottom dado', position: { x: 162, y: 100, z: 12 } }),
  ...overrides,
})

const hole = (overrides: Partial<HoleArrayCut> = {}): HoleArrayCut => ({
  kind: 'hole-array',
  id: 'row',
  label: 'Shelf pins',
  face: '+Z',
  axis: 'U',
  start: { x: 200, y: 380, z: 18 },
  pitch: 32,
  count: 5,
  diameter: 5,
  depth: 12,
  ...overrides,
})

const messages = (board: ManufacturingBoard) => cutWebs(board).map((i) => i.message)

describe('cut webs', () => {
  it('reports two dados that leave a 2 mm web', () => {
    const board = boardOf()
    board.cuts = [box(), other()]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.00 mm with cut "Bottom dado" [bottom], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('is silent at the threshold and above it', () => {
    for (const gap of [3, 3.5, 40]) {
      const board = boardOf()
      board.cuts = [box(), other({ position: { x: 160 + gap, y: 100, z: 12 } })]
      expect(cutWebs(board)).toEqual([])
    }
  })

  it('is silent for dados that touch, which the overlap pass owns', () => {
    const board = boardOf()
    board.cuts = [box(), other({ position: { x: 160, y: 100, z: 12 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('measures a diagonal web as the three-axis distance', () => {
    const board = boardOf()
    // 2 mm in x and 2 mm in y: sqrt(8) = 2.828…, printed truncated as 2.82.
    board.cuts = [box(), other({ position: { x: 162, y: 302, z: 12 } })]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.82 mm with cut "Bottom dado" [bottom], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('never prints the threshold it says the web is below', () => {
    const board = boardOf()
    // 2.999 mm rounds to 3.00, which would read as "3.00 mm, thinner than the 3.00 mm minimum".
    board.cuts = [box(), other({ position: { x: 162.999, y: 100, z: 12 } })]
    expect(messages(board)[0]).toContain('leaves a web of 2.99 mm')
  })

  it('leaves a box at or below the exporter minimum alone', () => {
    const board = boardOf()
    board.cuts = [box(), other({ size: { x: 0.05, y: 200, z: 6 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('leaves a box with non-finite geometry to the geometry review', () => {
    const board = boardOf()
    board.cuts = [box(), other({ position: { x: Number.NaN, y: 100, z: 12 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('does nothing for round stock', () => {
    const scene = manufacturingProject()
    const round = scene.parts.find((p) => p.kind === 'cylinder')!
    expect(cutWebs(manufacturingParts([round], scene.materials, scene.components)[0])).toEqual([])
  })

  it('does nothing for a bevelled edge, which stays unassessed', () => {
    const board = boardOf()
    const mitre: MitreCut = { kind: 'mitre', id: 'bevel', label: 'Bevel', end: '+X', axis: 'Z', angle: 45 }
    board.cuts = [box(), mitre]
    expect(cutWebs(board)).toEqual([])
  })

  it('anchors each finding on the earlier cut and orders by it', () => {
    const board = boardOf()
    // 'toe' is far from 'dado' in y, so the only two thin pairs are toe×third and dado×third.
    // Walking (i, j) order therefore emits toe's finding before dado's, and both anchor on the
    // cut that comes first in `cuts`.
    board.cuts = [
      box({ id: 'toe', label: 'Toe notch', position: { x: 100, y: 100, z: 12 } }),
      box({ id: 'dado', label: 'Shelf dado', position: { x: 100, y: 400, z: 12 } }),
      box({ id: 'third', label: 'Third dado', position: { x: 162, y: 250, z: 12 } }),
    ]
    expect(cutWebs(board).map((i) => i.operation.id)).toEqual(['toe', 'dado'])
  })

  it('carries the anchor cut operation, with its component and joint provenance', () => {
    const board = boardOf()
    board.cuts = [
      box({ sourceJointId: 'joint-a', sourceComponentId: 'component-a' }),
      other(),
    ]
    expect(cutWebs(board)[0].operation).toEqual({
      id: 'dado',
      label: 'Shelf dado',
      kind: 'box',
      sourceComponentId: 'component-a',
      sourceJointId: 'joint-a',
    })
  })

  it('reports a hole that leaves a 2 mm web beside a dado', () => {
    const board = boardOf()
    // The dado ends at x = 195.5; the first hole is centred at x = 200 with radius 2.5, so its wall
    // is 2 mm from the dado's.
    board.cuts = [box({ position: { x: 175.5, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }), hole()]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.00 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('measures a blind hole against a shallow groove in depth', () => {
    const board = boardOf()
    // The hole is drilled 3 mm from the +Z face, so it occupies z [15, 18]; the groove stops at
    // z = 12.5, leaving 2.5 mm of solid material between them.
    board.cuts = [
      box({ position: { x: 190, y: 350, z: 6.5 }, size: { x: 20, y: 60, z: 6 } }),
      hole({ depth: 3 }),
    ]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.50 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('measures a through hole from the stock face, not from its nominal depth', () => {
    const board = boardOf()
    // 30 mm of travel on an 18 mm board stops at the back face. A box recorded beyond that face
    // therefore leaves 1 mm, not the 12 mm an unclipped depth would claim (which would report a
    // meeting and silence the pair entirely).
    board.cuts = [
      box({ position: { x: 190, y: 350, z: -5 }, size: { x: 20, y: 60, z: 4 } }),
      hole({ depth: 30 }),
    ]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 1.00 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('names the drilling first when the row comes first', () => {
    const board = boardOf()
    board.cuts = [hole(), box({ position: { x: 175.5, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } })]
    expect(messages(board)).toEqual([
      'Drilling "Shelf pins" [row]: leaves a web of 2.00 mm with cut "Shelf dado" [dado], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('is silent when the hole breaks into the dado, which the drilling pass owns', () => {
    const board = boardOf()
    board.cuts = [box({ position: { x: 190, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }), hole()]
    expect(cutWebs(board)).toEqual([])
  })

  it('is silent for a row that cannot describe holes', () => {
    const board = boardOf()
    board.cuts = [
      box({ position: { x: 175.5, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }),
      hole({ diameter: 0 }),
    ]
    expect(cutWebs(board)).toEqual([])
  })

  it('still measures the hole beyond a hole that meets the box', () => {
    const board = boardOf()
    // The box occupies x [190, 210]. Hole 0 sits at x = 200, inside it; hole 1 sits at x = 214.5,
    // so its wall is 214.5 - 210 - 2.5 = 2 mm from the box's. The pair must be reported even
    // though its neighbour meets the box — the touching hole belongs to the drilling pass, but
    // the far hole's web is this pass's, and yielding the whole pair would hide it.
    board.cuts = [
      box({ position: { x: 190, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }),
      hole({ start: { x: 200, y: 380, z: 18 }, pitch: 14.5, count: 2 }),
    ]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.00 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('reports two parallel rows that leave a 2 mm wall', () => {
    const board = boardOf()
    // Both rows run along x with radius 2.5 and their centres 7 mm apart across y, so the walls
    // are 7 - 5 = 2 mm apart.
    board.cuts = [hole(), hole({ id: 'row-b', label: 'Shelf pins B', start: { x: 200, y: 387, z: 18 } })]
    expect(messages(board)).toEqual([
      'Drilling "Shelf pins" [row]: leaves a web of 2.00 mm with drilling "Shelf pins B" [row-b], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('reports two perpendicular rows whose nearest holes are outside the summed radii', () => {
    const board = boardOf()
    // Row A's holes advance along x at y = 380 and are bored along z, so hole 4's centreline runs
    // from (328, 380, 6) to (328, 380, 18). Row B is bored along y with 340 mm of travel from
    // y = 720, so its axial interval is y [380, 720]; its single hole sits at x = 334, z = 10. The
    // nearest points are (328, 380, 10) and (334, 380, 10) — 6 mm apart — so the walls are 1 mm
    // apart.
    //
    // The pair is deliberately just outside the summed radii (5 mm) and just inside the web
    // threshold (3 mm beyond it), which is the only place the `margin` argument to `candidateRange`
    // decides the answer: with margin 0 the window around x = 334 is [329, 339] and hole 4 at
    // x = 328 is not in it, so the pair is never examined and nothing is reported.
    board.cuts = [
      hole(),
      hole({
        id: 'fixing',
        label: 'Fixing dowel',
        face: '+Y',
        axis: 'U',
        start: { x: 334, y: 720, z: 10 },
        pitch: 0,
        count: 1,
        depth: 340,
      }),
    ]
    expect(messages(board)).toEqual([
      'Drilling "Shelf pins" [row]: leaves a web of 1.00 mm with drilling "Fixing dowel" [fixing], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('is silent for two rows that meet, which the drilling pass owns', () => {
    const board = boardOf()
    board.cuts = [hole(), hole({ id: 'row-b', label: 'Shelf pins B', start: { x: 200, y: 385, z: 18 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('yields the whole pair when one hole meets the other row', () => {
    const board = boardOf()
    // Row B is bored along y from y = 720 down to y = 380, so its centrelines reach row A's plane.
    // Its hole 0 sits at x = 329, one millimetre from row A's hole 4 at x = 328: the two meet, and
    // the drilling pass names that meeting. Its hole 1 sits at x = 334, six millimetres away, which
    // leaves a 1 mm web. A per-*hole* rule would skip the touching pair and report the 1 mm; the
    // per-pair rule collapses the whole pair to a meeting and reports nothing, because the 1 mm is
    // a pitch artefact of the crossing rather than a design decision.
    board.cuts = [
      hole(),
      hole({
        id: 'fixing',
        label: 'Fixing dowel',
        face: '+Y',
        axis: 'U',
        start: { x: 329, y: 720, z: 10 },
        pitch: 5,
        count: 2,
        depth: 340,
      }),
    ]
    expect(cutWebs(board)).toEqual([])
  })

  it('is silent for rows that are further apart than the minimum', () => {
    const board = boardOf()
    board.cuts = [hole(), hole({ id: 'row-b', label: 'Shelf pins B', start: { x: 200, y: 400, z: 18 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('never pairs a hole with the rest of its own row', () => {
    const board = boardOf()
    // Pitch 7 with diameter 5 leaves a 2 mm wall between adjacent holes — inside the threshold, so
    // an implementation that expanded a row into one cut per hole would report it. A row is one
    // cut and is paired only against other cuts; the walls between its own holes are
    // `drilling-intersection`'s business (pitch against diameter), never a web.
    board.cuts = [hole({ pitch: 7, count: 5 })]
    expect(cutWebs(board)).toEqual([])
  })

  it('answers a huge row by arithmetic, not by enumerating it', () => {
    const board = boardOf()
    // Two parallel rows of a billion holes each, 7 mm apart across y. Every hole pair leaves a
    // 2 mm web, and both candidate windows are a billion holes wide, so the cap is reached: the
    // window's first pair is reported instead. Without the cap this test would enumerate 10^18
    // pairs and never finish — which is what the mutation table's last row checks.
    board.cuts = [
      hole({ count: 1_000_000_000, pitch: 32, start: { x: 0, y: 380, z: 18 } }),
      hole({
        id: 'row-b',
        label: 'Shelf pins B',
        count: 1_000_000_000,
        pitch: 32,
        start: { x: 0, y: 387, z: 18 },
      }),
    ]
    expect(cutWebs(board).map((i) => i.operation.id)).toEqual(['row'])
  })

  it('finds a thin web beyond a flanking hole that touches the box on a narrow pitch', () => {
    const board = boardOf()
    // Box x [190, 210]. Holes advance along x at pitch 3, diameter 5 (radius 2.5), from x = 180:
    // 180, 183, 186, 189 — all left of the box. The nearest (189) has its wall reaching 191.5, so
    // it overlaps the box's left wall at 190: web 0, a meeting owned by the overlap pass. The next
    // hole out at 186 leaves 190 - 186 - 2.5 = 1.5 mm, a genuine thin web. Flanking alone would
    // silence the pair; walking outward past the touching hole reports the 1.5 mm.
    board.cuts = [
      box({ position: { x: 190, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }),
      hole({ start: { x: 180, y: 380, z: 18 }, pitch: 3, count: 4 }),
    ]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 1.50 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })
})
