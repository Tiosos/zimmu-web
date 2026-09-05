import { describe, expect, it } from 'vitest'
import { carcaseBoxes } from './carcaseRoles'
import { roleThicknessFor } from './resolveThickness'
import type { CarcaseParams, MaterialDef } from './types'
import { SWEEP } from './__fixtures__/sweep'

// Extracted from the Stage B equivalence suite when its golden-master baseline was retired. The
// baseline proved the switch to per-panel thickness changed nothing; these prove it changed
// something — and they are the only tests that can. Every one of the 96 baseline cases was
// symmetric, so `openingRect` reading one side's thickness for both edges passed all of them and
// failed only here. That mutation was run: 1 failed, 196 passed.
const MATERIALS: Record<string, MaterialDef> = {
  '18mm Ply': { thickness: 18 },
  '12mm MDF': { thickness: 12 },
  '25mm Ply': { thickness: 25 },
}

const tOf = (p: CarcaseParams) => roleThicknessFor(p, MATERIALS, new Map())

describe('a panel resolves its own thickness', () => {
  const params = SWEEP[0]

  // The whole point of the stage: a thicker side shortens the panels between the sides. Both sides
  // differ, so a mistake that reads one side's thickness for both fails here and nowhere else — all
  // 96 baseline cases are symmetric and stay green through exactly that bug.
  it('a thicker left side shortens the panels between the sides', () => {
    const overrides = new Map([['left-side', { thickness: 25 }]])
    const boxes = carcaseBoxes(params, roleThicknessFor(params, MATERIALS, overrides))
    const bottom = boxes.find((b) => b.role === 'bottom')!
    expect(bottom.box.x0).toBe(25)
    expect(bottom.box.x1).toBe(params.width - 18)
    expect(bottom.box.x1 - bottom.box.x0).toBe(params.width - 43)
  })

  // The same asymmetry one layer in. The shell panels are placed from the box table; everything
  // inside the cabinet is placed from `openingRect`, and only a divided cabinet reads both of its
  // vertical edges. Without this, the four calls in openingRect could all be the same call.
  it('a thicker left side shortens the shelves inside it too', () => {
    const divided = SWEEP.find((p) => p.section.content.kind === 'split')!
    const overrides = new Map([['left-side', { thickness: 25 }]])
    const boxes = carcaseBoxes(divided, roleThicknessFor(divided, MATERIALS, overrides))
    const shelf = boxes.find((b) => b.role.startsWith('division-') && b.thicknessAxis === 'z')!
    expect(shelf.box.x0).toBe(25)
    expect(shelf.box.x1).toBe(divided.width - 18)
  })

  // A division's own override, which is what `sectionThickness` exists to fetch. It reads the
  // `division-{parentId}-{index}` key, and `roleThicknessFor` falls back to the carcase material
  // for any role it does not recognise — so a key format that stopped matching would not throw, it
  // would quietly hand back 18 and every division would come out the default thickness. Nothing
  // caught that until this: the mutation was run against all 1689 tests and survived.
  //
  // It needs a division that differs from the carcase default AND a sibling that does not, so
  // "read the override" is distinguishable from "read the default" and from "read one override for
  // every division".
  it('a division takes its own thickness override, and its sibling does not', () => {
    const divided = SWEEP.find(
      (p) =>
        p.section.content.kind === 'split' &&
        p.section.content.axis === 'vertical' &&
        p.section.content.division === 'panel',
    )!
    const overrides = new Map([[`division-${divided.section.id}-0`, { thickness: 25 }]])
    const boxes = carcaseBoxes(divided, roleThicknessFor(divided, MATERIALS, overrides))
    const widthOf = (i: number) => {
      const b = boxes.find((x) => x.role === `division-${divided.section.id}-${i}`)!
      return b.box.x1 - b.box.x0
    }
    expect(widthOf(0)).toBe(25)
    expect(widthOf(1)).toBe(18)
  })

  // Same asymmetry through the material rather than through an override, and read on the side
  // panels themselves: the overridden panel is the one that has to get thicker.
  it('a material override on one side thickens only that side', () => {
    const overrides = new Map([['right-side', { material: '25mm Ply' }]])
    const boxes = carcaseBoxes(params, roleThicknessFor(params, MATERIALS, overrides))
    const left = boxes.find((b) => b.role === 'left-side')!
    const right = boxes.find((b) => b.role === 'right-side')!
    expect(left.box.x1 - left.box.x0).toBe(18)
    expect(right.box.x1 - right.box.x0).toBe(25)
    expect(right.box.x0).toBe(params.width - 25)
  })

  // The back has its own slot, so it is the one panel that does not follow the carcase material.
  it('the back takes the back slot, not the carcase slot', () => {
    const backed = SWEEP.find((p) => p.backMode === 'captured')!
    const back = carcaseBoxes(backed, tOf(backed)).find((b) => b.role === 'back')!
    expect(back.box.y1 - back.box.y0).toBe(12)
  })
})
