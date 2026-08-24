import { describe, expect, it } from 'vitest'
import { maskArea, occupancyMask } from './mask'
import type { BoardPart, BoxCut, CarcaseComponent, CarcaseParams, MitreCut } from '../scene/types'
import { mitreFaceOutline } from '../geom/mitre'
import { regenerateComponents } from '../scene/regenerateComponents'
import { reconcileJoints } from '../scene/reconcileJoints'
import { CARCASE_PRESETS } from '../scene/carcasePresets'

function board(over: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'b1',
    label: 'Panel',
    length: 600,
    width: 300,
    thickness: 18,
    grain: 'free',
    material: '',
    color: '#c8a97e',
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

function boxCut(over: Partial<BoxCut> = {}): BoxCut {
  return {
    kind: 'box',
    id: 'c1',
    label: 'Cut',
    face: '+Z',
    position: { x: 0, y: 0, z: 0 },
    size: { x: 10, y: 10, z: 18 },
    ...over,
  }
}

describe('occupancyMask — a plain panel', () => {
  it('is exactly its own rectangle when there is no clearance', () => {
    const m = occupancyMask(board({ length: 600, width: 300 }), 0)
    expect(m.w).toBe(600)
    expect(m.h).toBe(300)
    expect(maskArea(m)).toBe(600 * 300)
  })

  it('rounds a fractional panel outward, so it is never nested short', () => {
    const m = occupancyMask(board({ length: 599.5, width: 300.2 }), 0)
    expect(m.w).toBe(600)
    expect(m.h).toBe(301)
  })

  it('is in board axes, not the cutting list s grain order', () => {
    // A side is stored length 560, width 720 and runs its grain along the width. cutDimensions
    // would report 720 x 560; the mask must not, because Stage 3 reads `grain` to decide rotation
    // and a pre-transposed mask would apply that decision twice.
    const m = occupancyMask(board({ length: 560, width: 720, grain: 'width' }), 0)
    expect([m.w, m.h]).toEqual([560, 720])
  })
})

describe('occupancyMask — a through cut clears material, a groove does not', () => {
  it('a through notch removes exactly its own area', () => {
    const notched = board({
      cuts: [boxCut({ position: { x: 0, y: 0, z: -9 }, size: { x: 60, y: 100, z: 36 } })],
    })
    expect(maskArea(occupancyMask(notched, 0))).toBe(600 * 300 - 60 * 100)
  })

  it('a dado leaves the outline whole', () => {
    const grooved = board({
      cuts: [boxCut({ position: { x: 0, y: 100, z: 12 }, size: { x: 600, y: 18, z: 6 } })],
    })
    expect(maskArea(occupancyMask(grooved, 0))).toBe(600 * 300)
  })

  it('a cut flush with both faces counts as through', () => {
    // computeFingerSlots emits exactly this shape (z 0 -> thickness) while the toe-kick notch
    // overshoots. Both conventions are live in this codebase and both must read as through.
    const flush = board({
      cuts: [boxCut({ position: { x: 0, y: 0, z: 0 }, size: { x: 40, y: 40, z: 18 } })],
    })
    expect(maskArea(occupancyMask(flush, 0))).toBe(600 * 300 - 40 * 40)
  })

  it('reads the cut as spanning [position, position + size], not centred on position', () => {
    // `makeCut` builds a box over [0, size] and translates it by `position`, so `position` is the
    // min corner. A centred reading would clear a quarter of this cut off the panel and remove
    // only 30 x 50.
    const notched = board({
      cuts: [boxCut({ position: { x: 0, y: 0, z: -9 }, size: { x: 60, y: 100, z: 36 } })],
    })
    const m = occupancyMask(notched, 0)
    expect(m.bits[0]).toBe(0) // (0,0) is inside the notch
    expect(m.bits[99 * m.w + 59]).toBe(0) // (59,99) is its far corner
    expect(m.bits[100 * m.w + 60]).toBe(1) // (60,100) is just outside it
  })

  it('ignores a hole array — a drilled hole does not change the outline', () => {
    const drilled = board({
      cuts: [
        {
          kind: 'hole-array',
          id: 'h1',
          label: 'Pins',
          face: '+Z',
          axis: 'U',
          start: { x: 40, y: 40, z: 0 },
          pitch: 32,
          count: 10,
          diameter: 5,
          depth: 18,
        },
      ],
    })
    expect(maskArea(occupancyMask(drilled, 0))).toBe(600 * 300)
  })

  it('clamps a cut that runs past the panel edge', () => {
    const over = board({
      cuts: [boxCut({ position: { x: 580, y: -10, z: -9 }, size: { x: 100, y: 60, z: 36 } })],
    })
    // The cut spans x[580, 680] and y[-10, 50]; only x[580,600] x y[0,50] is on the panel.
    expect(maskArea(occupancyMask(over, 0))).toBe(600 * 300 - 20 * 50)
  })
})

describe('occupancyMask — against a real cabinet, not a fixture', () => {
  function base600(): BoardPart[] {
    const cabinet: CarcaseComponent = {
      kind: 'carcase',
      id: 'cmp_1',
      label: 'Base 600',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params: CARCASE_PRESETS[0].params,
    }
    const scene = reconcileJoints(
      regenerateComponents({
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [cabinet],
      }),
    )
    return scene.parts.filter((p): p is BoardPart => p.kind === 'board')
  }

  // The assertion that fails loudly if the through-cut rule is ever loosened back to "every box
  // cut". A Base 600 side carries four dados and one toe-kick notch; only the notch is through.
  it('only the toe-kick notch removes outline material', () => {
    const boards = base600()
    expect(boards.length).toBeGreaterThan(0)

    for (const p of boards) {
      const full = Math.ceil(p.length) * Math.ceil(p.width)
      const area = maskArea(occupancyMask(p, 0))
      const notch = p.role === 'left-side' || p.role === 'right-side' ? 60 * 100 : 0
      expect(area, `${p.role}`).toBe(full - notch)
    }
  })

  it('every board has box cuts that are not through, so the rule is actually exercised', () => {
    const grooves = base600().flatMap((p) =>
      p.cuts.filter((c) => c.kind === 'box' && c.position.z + c.size.z < p.thickness),
    )
    expect(grooves.length).toBeGreaterThan(0)
  })
})

describe('occupancyMask — flat mitres shave the outline', () => {
  const mitre = (over: Partial<MitreCut> = {}): MitreCut => ({
    kind: 'mitre',
    id: 'm1',
    label: 'Mitre',
    end: '+X',
    axis: 'Z',
    angle: 45,
    ...over,
  })

  // Derived from mitreFaceOutline itself rather than from arithmetic in this test: the polygon is
  // the contract, and a triangle area computed here would just be a second copy of it.
  function outlineArea(p: BoardPart): number {
    const pts = mitreFaceOutline(
      { length: p.length, width: p.width, thickness: p.thickness },
      p.cuts.filter((c): c is MitreCut => c.kind === 'mitre'),
      'Face',
    )
    // Shoelace.
    let a = 0
    for (let i = 0; i < pts.length; i++) {
      const q = pts[(i + 1) % pts.length]
      a += pts[i].x * q.y - q.x * pts[i].y
    }
    return Math.abs(a) / 2
  }

  it('a flat mitre removes the wedge the outline polygon describes', () => {
    const p = board({ length: 600, width: 300, cuts: [mitre({ angle: 30 })] })
    const area = maskArea(occupancyMask(p, 0))
    // Rasterised at 1 mm, so within a cell per row of the exact polygon.
    expect(area).toBeGreaterThan(outlineArea(p) - p.width)
    expect(area).toBeLessThanOrEqual(outlineArea(p) + p.width)
  })

  it('a flat mitre never claims more material than the plain rectangle', () => {
    const p = board({ length: 600, width: 300, cuts: [mitre({ angle: 30 })] })
    expect(maskArea(occupancyMask(p, 0))).toBeLessThan(600 * 300)
  })

  it('a bevel through the thickness leaves the footprint square', () => {
    // axis 'Y' tilts through the thickness. The widest section is still the full rectangle, and
    // that is what a nest has to reserve.
    const p = board({ length: 600, width: 300, cuts: [mitre({ axis: 'Y', angle: 45 })] })
    expect(maskArea(occupancyMask(p, 0))).toBe(600 * 300)
  })

  it('mitres both ends', () => {
    const p = board({
      length: 600,
      width: 300,
      cuts: [mitre({ end: '+X', angle: 20 }), mitre({ id: 'm2', end: '-X', angle: 20 })],
    })
    const area = maskArea(occupancyMask(p, 0))
    expect(area).toBeGreaterThan(outlineArea(p) - 2 * p.width)
    expect(area).toBeLessThanOrEqual(outlineArea(p) + 2 * p.width)
  })
})

describe('occupancyMask — clearance dilation', () => {
  it('grows a rectangle by half the clearance on every side', () => {
    const m = occupancyMask(board({ length: 100, width: 50 }), 14)
    expect(m.w).toBe(100 + 14)
    expect(m.h).toBe(50 + 14)
    expect(maskArea(m)).toBe((100 + 14) * (50 + 14))
  })

  it('records the padding it added, so a caller never recomputes the formula', () => {
    expect(occupancyMask(board({ length: 100, width: 50 }), 14).pad).toBe(7)
    expect(occupancyMask(board({ length: 100, width: 50 }), 15).pad).toBe(8)
    expect(occupancyMask(board({ length: 100, width: 50 }), 0).pad).toBe(0)
  })

  it('a zero clearance changes nothing', () => {
    const m = occupancyMask(board({ length: 100, width: 50 }), 0)
    expect([m.w, m.h, maskArea(m)]).toEqual([100, 50, 5000])
  })

  it('fills a notch narrower than the clearance', () => {
    // A 10 mm notch cannot admit anything at a 14 mm clearance, so dilation should close it. This
    // is the case that proves dilation runs on the cleared mask and not on the bounding rectangle.
    const notched = board({
      length: 100,
      width: 50,
      cuts: [boxCut({ position: { x: 45, y: 0, z: -9 }, size: { x: 10, y: 20, z: 36 } })],
    })
    const m = occupancyMask(notched, 14)
    expect(maskArea(m)).toBe(m.w * m.h)
  })

  it('leaves a notch wider than the clearance open', () => {
    const notched = board({
      length: 100,
      width: 50,
      cuts: [boxCut({ position: { x: 30, y: 0, z: -9 }, size: { x: 40, y: 20, z: 36 } })],
    })
    const m = occupancyMask(notched, 14)
    expect(maskArea(m)).toBeLessThan(m.w * m.h)
  })

  // The property the halving exists for, and the one placement will lean on: two dilated masks
  // that merely fail to overlap leave one FULL clearance between the real parts, not two.
  it('two masks that just fail to overlap are one clearance apart', () => {
    const clearance = 14
    const length = 100
    const m = occupancyMask(board({ length, width: 50 }), clearance)

    const overlapsAt = (dx: number): boolean => {
      for (let y = 0; y < m.h; y++) {
        for (let x = dx; x < m.w; x++) {
          if (m.bits[y * m.w + x] === 1 && m.bits[y * m.w + (x - dx)] === 1) return true
        }
      }
      return false
    }

    let dx = 0
    while (dx <= m.w && overlapsAt(dx)) dx++

    // The real rectangle sits `pad` inside its own mask on each side, so the gap between the two
    // real rectangles at offset dx is dx - length.
    expect(dx - length).toBe(clearance)
  })
})

// Every combination of the parameters that decide which roles exist, mirroring the sweep in
// grain.test.ts: the properties below must hold for every board a carcase can emit, not for three
// presets someone picked.
const SWEEP: CarcaseParams[] = (['toe-kick', 'ladder', 'legs', 'none'] as const).flatMap((baseMode) =>
  (['captured', 'applied', 'none'] as const).flatMap((backMode) =>
    [true, false].flatMap((hasTop) =>
      [[], [1 / 3, 2 / 3]].flatMap((dividers) =>
        [0, 2].map(
          (fixedShelves): CarcaseParams => ({
            ...CARCASE_PRESETS[0].params,
            width: 1400,
            height: 2100,
            baseMode,
            backMode,
            hasTop,
            dividers,
            fixedShelves,
          }),
        ),
      ),
    ),
  ),
)

// One board per role family. The sweep emits well over a thousand boards, most of them near
// duplicates; a family is the unit the mask rules are stated in, so covering each once is both the
// meaningful coverage and the affordable one.
function sweepBoards(): BoardPart[] {
  const byFamily = new Map<string, BoardPart>()
  SWEEP.forEach((params, i) => {
    const scene = reconcileJoints(
      regenerateComponents({
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [
          {
            kind: 'carcase',
            id: `cmp_${i}`,
            label: `Case ${i}`,
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            visible: true,
            params,
          },
        ],
      }),
    )
    for (const p of scene.parts) {
      if (p.kind !== 'board' || p.role === undefined) continue
      const family = p.role.replace(/-\d+(-\d+)?$/, '')
      if (!byFamily.has(family)) byFamily.set(family, p)
    }
  })
  return [...byFamily.values()]
}

function sameBits(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

describe('occupancyMask — properties over every role a carcase can emit', () => {
  const boards = sweepBoards()

  it('covers all thirteen role families', () => {
    expect(boards.length).toBe(13)
  })

  it('no role ever masks to nothing', () => {
    for (const p of boards) expect(maskArea(occupancyMask(p, 0)), `${p.role}`).toBeGreaterThan(0)
  })

  it('never claims material the part does not have', () => {
    for (const p of boards) {
      expect(maskArea(occupancyMask(p, 0)), `${p.role}`).toBeLessThanOrEqual(
        Math.ceil(p.length) * Math.ceil(p.width),
      )
    }
  })

  it('area is monotone non-decreasing in clearance', () => {
    for (const p of boards) {
      const areas = [0, 4, 14, 30].map((c) => maskArea(occupancyMask(p, c)))
      for (let i = 1; i < areas.length; i++) {
        expect(areas[i], `${p.role} at index ${i}`).toBeGreaterThanOrEqual(areas[i - 1])
      }
    }
  })

  it('is deterministic', () => {
    // A hand loop, not toEqual: vitest's deep equality on a multi-million-cell Uint8Array is slow
    // enough to time the test out, and it was doing that rather than finding a difference.
    for (const p of boards) {
      const a = occupancyMask(p, 14)
      const b = occupancyMask(p, 14)
      expect([a.w, a.h], `${p.role}`).toEqual([b.w, b.h])
      expect(sameBits(a.bits, b.bits), `${p.role}`).toBe(true)
    }
  })
})

export { board, boxCut }
