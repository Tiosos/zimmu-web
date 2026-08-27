import { describe, expect, it } from 'vitest'
import { allowedRotations, nestSheets, rotateMask } from './nest'
import type { NestItem, Placement, SheetSpec } from './nest'
import { maskArea, occupancyMask } from './mask'
import type { Mask } from './mask'
import { regenerateComponents } from '../scene/regenerateComponents'
import { reconcileJoints } from '../scene/reconcileJoints'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import type { BoardPart, CarcaseComponent, CarcaseParams, Grain, Scene } from '../scene/types'

function boardsFor(params: CarcaseParams, id = 'cmp_1'): BoardPart[] {
  const cabinet: CarcaseComponent = {
    kind: 'carcase',
    id,
    label: 'Case',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params,
  }
  const scene: Scene = {
    parts: [],
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [cabinet],
  }
  return reconcileJoints(regenerateComponents(scene)).parts.filter(
    (p): p is BoardPart => p.kind === 'board',
  )
}

describe('allowedRotations', () => {
  it('a length-grained part is already along the sheet', () => {
    expect(allowedRotations('length', true)).toEqual([0, 180])
  })

  it('a width-grained part must turn 90 degrees to lie along the sheet', () => {
    expect(allowedRotations('width', true)).toEqual([90, 270])
  })

  it('an unconstrained part may take any quarter turn', () => {
    expect(allowedRotations('free', true)).toEqual([0, 90, 180, 270])
  })

  it('grainless stock frees even a grained part', () => {
    expect(allowedRotations('length', false)).toEqual([0, 90, 180, 270])
  })

  // The rule the spec got wrong. A Tall 600 side is 560 x 2100 with grain along its width, so its
  // mask is 574 x 2114 at a 14 mm clearance — taller than any standard sheet is wide. Locked to
  // 0/180 it cannot be placed at all.
  it('lets a Tall 600 side onto a standard sheet', () => {
    const side = boardsFor(CARCASE_PRESETS[2].params).find((p) => p.role === 'left-side')!
    const m = occupancyMask(side, 14)
    expect(m.h).toBeGreaterThan(1220)

    const fits = allowedRotations(side.grain, true).some((r) => {
      const rm = rotateMask(m, r)
      return rm.w <= 2440 && rm.h <= 1220
    })
    expect(fits).toBe(true)
  })
})

describe('rotateMask', () => {
  const sample = (): Mask =>
    occupancyMask(
      {
        ...boardsFor(CARCASE_PRESETS[0].params).find((p) => p.role === 'left-side')!,
      },
      14,
    )

  it('preserves area under every rotation', () => {
    const m = sample()
    const a = maskArea(m)
    for (const r of [0, 90, 180, 270] as const) expect(maskArea(rotateMask(m, r)), `${r}`).toBe(a)
  })

  it('swaps w and h at a quarter turn and keeps them at a half turn', () => {
    const m = sample()
    expect([rotateMask(m, 90).w, rotateMask(m, 90).h]).toEqual([m.h, m.w])
    expect([rotateMask(m, 270).w, rotateMask(m, 270).h]).toEqual([m.h, m.w])
    expect([rotateMask(m, 180).w, rotateMask(m, 180).h]).toEqual([m.w, m.h])
  })

  // The test that catches an index slip. A hand-written expected bitmap would just be a second
  // implementation of the same rotation.
  it('four quarter turns return the original bits', () => {
    const m = sample()
    let r = m
    for (let i = 0; i < 4; i++) r = rotateMask(r, 90)
    expect([r.w, r.h]).toEqual([m.w, m.h])
    expect(r.bits).toEqual(m.bits)
  })

  it('a half turn maps a cell to the opposite corner', () => {
    const m = sample()
    const half = rotateMask(m, 180)
    for (const [x, y] of [
      [0, 0],
      [m.w - 1, 0],
      [0, m.h - 1],
      [17, 23],
    ]) {
      expect(half.bits[(m.h - 1 - y) * m.w + (m.w - 1 - x)], `${x},${y}`).toBe(m.bits[y * m.w + x])
    }
  })

  it('carries the padding through unchanged, because dilation is isotropic', () => {
    const m = sample()
    for (const r of [0, 90, 180, 270] as const) expect(rotateMask(m, r).pad).toBe(m.pad)
  })
})

const SHEET: SheetSpec = { length: 2440, width: 1220 }
const CLEARANCE = 14

function itemsFor(params: CarcaseParams, id = 'cmp_1'): NestItem[] {
  return boardsFor(params, id).map((p) => ({
    id: p.id,
    mask: occupancyMask(p, CLEARANCE),
    grain: p.grain,
  }))
}

function sixCabinetItems(): NestItem[] {
  return [0, 1, 2, 0, 1, 2].flatMap((preset, i) =>
    itemsFor(CARCASE_PRESETS[preset].params, `cmp_${i}`),
  )
}

// Rebuild what a placement actually occupies, from the item and the reported rotation — never from
// anything the engine kept. Returns the DILATED footprint's min corner, which is `pad` outside the
// reported material rectangle on every side.
function footprint(item: NestItem, p: Placement): { mask: Mask; ox: number; oy: number } {
  const mask = rotateMask(item.mask, p.rotation)
  return { mask, ox: p.x - mask.pad, oy: p.y - mask.pad }
}

function overlaps(a: { mask: Mask; ox: number; oy: number }, b: typeof a): boolean {
  for (let y = 0; y < a.mask.h; y++) {
    const wy = a.oy + y
    if (wy < b.oy || wy >= b.oy + b.mask.h) continue
    for (let x = 0; x < a.mask.w; x++) {
      if (a.mask.bits[y * a.mask.w + x] === 0) continue
      const wx = a.ox + x
      if (wx < b.ox || wx >= b.ox + b.mask.w) continue
      if (b.mask.bits[(wy - b.oy) * b.mask.w + (wx - b.ox)] === 1) return true
    }
  }
  return false
}

// A six-cabinet nest takes about 5 s, so the suite runs one and every property re-derives from its
// result. Only the tests that deliberately nest a second time carry their own timeout.
describe('nestSheets — the six properties, over a six-cabinet job', () => {
  const items = sixCabinetItems()
  const byId = new Map(items.map((i) => [i.id, i]))
  const result = nestSheets(items, SHEET, { hasGrain: true })
  const all = result.sheets.flat()

  it('has something to test', () => {
    expect(items.length).toBeGreaterThan(40)
    expect(result.sheets.length).toBeGreaterThan(0)
  })

  // 1. The property the whole engine exists to satisfy.
  it('no two placed parts overlap', () => {
    for (const [n, sheet] of result.sheets.entries()) {
      const fps = sheet.map((p) => footprint(byId.get(p.id)!, p))
      for (let i = 0; i < fps.length; i++) {
        for (let j = i + 1; j < fps.length; j++) {
          expect(overlaps(fps[i], fps[j]), `sheet ${n}: ${sheet[i].id} vs ${sheet[j].id}`).toBe(
            false,
          )
        }
      }
    }
  })

  // 2.
  it('places every part exactly once', () => {
    const ids = [...all.map((p) => p.id), ...result.unplaced].sort()
    expect(ids).toEqual(items.map((i) => i.id).sort())
  })

  // 3.
  it('places every part wholly within its sheet', () => {
    for (const p of all) {
      expect(p.x, p.id).toBeGreaterThanOrEqual(0)
      expect(p.y, p.id).toBeGreaterThanOrEqual(0)
      expect(p.x + p.w, p.id).toBeLessThanOrEqual(SHEET.length)
      expect(p.y + p.h, p.id).toBeLessThanOrEqual(SHEET.width)
    }
  })

  // 4.
  it('never turns a grain-locked part to a rotation its grain forbids', () => {
    for (const p of all) {
      const item = byId.get(p.id)!
      expect(allowedRotations(item.grain, true), `${p.id} ${item.grain}`).toContain(p.rotation)
    }
  })

  // 5.
  // The SAME items twice, not a second scene: regenerateComponents mints fresh crypto.randomUUID
  // part ids on every call, so two equivalent scenes legitimately differ in every id. Reusing the
  // array also proves nestSheets does not mutate its input, which the sort could easily have done.
  it('is deterministic', () => {
    const again = nestSheets(items, SHEET, { hasGrain: true })
    expect(JSON.stringify(again.sheets)).toBe(JSON.stringify(result.sheets))
    expect(again.unplaced).toEqual(result.unplaced)
  }, 30000)

  // The id tie-break is invisible when the same array is nested twice, because Array.sort is
  // stable — so two equal-area parts keep their input order either way. It only shows up across
  // input ORDERINGS, which is exactly what it exists to make irrelevant.
  it('gives the same nest whatever order the parts arrive in', () => {
    const shuffled = [...items]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (i * 7919 + 13) % (i + 1) // deterministic shuffle; a random one would flake
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    expect(shuffled.map((i) => i.id)).not.toEqual(items.map((i) => i.id))

    const again = nestSheets(shuffled, SHEET, { hasGrain: true })
    expect(JSON.stringify(again.sheets)).toBe(JSON.stringify(result.sheets))
  }, 30000)

  it('does not reorder the caller s array', () => {
    const before = items.map((i) => i.id)
    nestSheets(items, SHEET, { hasGrain: true })
    expect(items.map((i) => i.id)).toEqual(before)
  }, 30000)

  // 6. Measured between the REPORTED rectangles, which is where the pad bookkeeping either holds
  // or does not.
  it('leaves at least the clearance between any two parts', () => {
    for (const sheet of result.sheets) {
      for (let i = 0; i < sheet.length; i++) {
        for (let j = i + 1; j < sheet.length; j++) {
          const a = sheet[i]
          const b = sheet[j]
          const gapX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w))
          const gapY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h))
          expect(
            Math.max(gapX, gapY),
            `${a.id} vs ${b.id}`,
          ).toBeGreaterThanOrEqual(CLEARANCE - 1)
        }
      }
    }
  })

  it('reports a utilisation per sheet, none above 1', () => {
    expect(result.utilisation).toHaveLength(result.sheets.length)
    for (const u of result.utilisation) {
      expect(u).toBeGreaterThan(0)
      expect(u).toBeLessThanOrEqual(1)
    }
  })
})

describe('nestSheets — yield and edge cases', () => {
  function plain(id: string, length: number, width: number, grain: Grain = 'free'): NestItem {
    return {
      id,
      mask: occupancyMask(
        {
          kind: 'board',
          id,
          label: id,
          length,
          width,
          thickness: 18,
          grain,
          material: '',
          color: '#fff',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          cuts: [],
          visible: true,
          parentId: null,
          driven: false,
        },
        0,
      ),
      grain,
    }
  }

  it('tiles a sheet exactly onto one sheet', () => {
    // Eight 1220 x 305 parts tile a 2440 x 1220 sheet exactly at zero clearance.
    const items = Array.from({ length: 8 }, (_, i) => plain(`p${i}`, 1220, 305))
    const r = nestSheets(items, SHEET, { hasGrain: false })
    expect(r.unplaced).toEqual([])
    expect(r.sheets).toHaveLength(1)
    expect(r.utilisation[0]).toBeCloseTo(1, 6)
  })

  it('opens a second sheet when the first is full', () => {
    const items = Array.from({ length: 9 }, (_, i) => plain(`p${i}`, 1220, 305))
    const r = nestSheets(items, SHEET, { hasGrain: false })
    expect(r.sheets).toHaveLength(2)
    expect(r.unplaced).toEqual([])
  })

  it('reports a part too big for the stock rather than dropping it', () => {
    const r = nestSheets([plain('huge', 3000, 1000, 'length')], SHEET, { hasGrain: true })
    expect(r.unplaced).toEqual(['huge'])
    expect(r.sheets.flat()).toEqual([])
  })

  it('tries an already-open sheet before opening a new one', () => {
    // Sized so the LAST part fits sheet 1 and not sheet 2, which is the only arrangement that
    // distinguishes the two rules. Sorted by area: A (1220x1220) fills sheet 1's left half and
    // leaves a full-height column; B (2440x600) needs the whole width so it opens sheet 2 and
    // leaves a 620 mm strip; C (1220x700) fits A's leftover column but is too tall for B's strip.
    // A nester that only looked at the newest sheet would open a third.
    const r = nestSheets(
      [plain('a', 1220, 1220), plain('b', 2440, 600), plain('c', 1220, 700)],
      SHEET,
      { hasGrain: false },
    )
    expect(r.unplaced).toEqual([])
    expect(r.sheets).toHaveLength(2)
    expect(r.sheets.flat().find((p) => p.id === 'c')!.sheet).toBe(0)
  })

  it('nests nothing into nothing', () => {
    const r = nestSheets([], SHEET, { hasGrain: true })
    expect(r).toEqual({ sheets: [], utilisation: [], unplaced: [] })
  })
})
