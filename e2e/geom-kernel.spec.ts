import { test, expect } from '@playwright/test'

// Exercises the OCCT geometry functions (src/geom/occt.ts) against the live
// opencascade.js v1.1.1 WASM kernel. These paths cannot run in Node (OCCT is
// browser-only), so their Vitest coverage is mocked/skipped — this is the only
// place the real embind overloads are verified. Regression guard for the
// 2026-06-27 fix: BRepPrimAPI_MakeCylinder_1 (not _2) and BRepAlgoAPI_Cut_3(S1,S2)
// with no Message_ProgressRange (absent in v1.1.1). The source module is imported
// in-page via Vite's dev server (the same `pnpm dev` the Playwright webServer runs).

const OCCT_READY_TIMEOUT = 120_000
const DEPTH_MM = 12 // shelf-pin bore depth used by the cost measurement below

test('live OCCT kernel builds every board/dowel cut path and exports STEP', async ({ page }) => {
  await page.goto('/')
  // Gate on the app's own OCCT-ready signal so the WASM kernel is compiled before
  // we boot a second instance for the in-page module under test.
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  const results = await page.evaluate(async () => {
    // @ts-expect-error dev-only source import served by Vite; occt is untyped here
    const occt = await import('/src/geom/occt.ts')
    const oc = await occt.initOCCT()

    const errMsg = (e: unknown): string =>
      (e instanceof Error ? e.message : String(e)).slice(0, 140)

    // `fn` returns an OCCT shape (untyped embind object); we only assert it is
    // truthy. The page context is torn down after the test, so not deleting the
    // handles here is fine.
    const run = (fn: () => unknown): string => {
      try {
        return fn() ? 'OK' : 'ERR: falsy shape'
      } catch (e) {
        return 'ERR: ' + errMsg(e)
      }
    }

    const board = { length: 200, width: 100, thickness: 20 }
    const dowel = { diameter: 12, length: 80 }
    const id = (s: string) => ({ id: s, label: s })

    return {
      // makeBox (baseline) + makeCut
      boardBoxCut: run(() =>
        occt.makeShape(oc, {
          ...board,
          cuts: [
            { kind: 'box', ...id('c1'), face: '+Z', position: { x: 40, y: 40, z: 5 }, size: { x: 30, y: 30, z: 30 } },
          ],
        }),
      ),
      // makeMitreCut
      boardMitreCut: run(() =>
        occt.makeShape(oc, {
          ...board,
          cuts: [{ kind: 'mitre', ...id('m1'), end: '+X', axis: 'Z', angle: 45 }],
        }),
      ),
      // makeCylinder (the headline fix)
      dowelPlain: run(() => occt.makeDowelShape(oc, { ...dowel, cuts: [] })),
      // makeBoxCutAt via end cut
      dowelEndCut: run(() =>
        occt.makeDowelShape(oc, {
          ...dowel,
          cuts: [{ kind: 'end', ...id('e1'), end: '+Z', offset: 5, angle: 30, azimuth: 0 }],
        }),
      ),
      // makeBoxCutAt via notch
      dowelNotch: run(() =>
        occt.makeDowelShape(oc, {
          ...dowel,
          cuts: [{ kind: 'notch', ...id('n1'), position: 40, width: 10, depth: 4, azimuth: 0 }],
        }),
      ),
      // makeCylinderCut via axial bore
      dowelAxialBore: run(() =>
        occt.makeDowelShape(oc, {
          ...dowel,
          cuts: [{ kind: 'bore-axial', ...id('b1'), end: '+Z', diameter: 4, depth: 20 }],
        }),
      ),
      // makeCylinderCut via transverse bore
      dowelTransverseBore: run(() =>
        occt.makeDowelShape(oc, {
          ...dowel,
          cuts: [{ kind: 'bore-transverse', ...id('b2'), position: 40, azimuth: 0, diameter: 4, depth: 12 }],
        }),
      ),
      // writeStep over a board-with-cut + dowel-with-cuts compound
      stepExport: (() => {
        try {
          const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
          const text: string = occt.writeStep(oc, [
            {
              kind: 'board',
              ...id('B'),
              ...board,
              cuts: [
                { kind: 'box', ...id('c1'), face: '+Z', position: { x: 40, y: 40, z: 5 }, size: { x: 30, y: 30, z: 30 } },
              ],
              matrix: m,
            },
            {
              kind: 'cylinder',
              ...id('D'),
              ...dowel,
              cuts: [{ kind: 'bore-axial', ...id('b1'), end: '+Z', diameter: 4, depth: 20 }],
              matrix: m,
            },
          ])
          const valid = text.includes('ISO-10303-21;') && text.includes('END-ISO-10303-21;')
          return valid ? 'OK len=' + text.length : 'ERR: malformed STEP'
        } catch (e) {
          return 'ERR: ' + errMsg(e)
        }
      })(),
    }
  })

  // Surface the full map on failure so a broken path is obvious in CI logs.
  expect(results, JSON.stringify(results, null, 2)).toMatchObject({
    boardBoxCut: 'OK',
    boardMitreCut: 'OK',
    dowelPlain: 'OK',
    dowelEndCut: 'OK',
    dowelNotch: 'OK',
    dowelAxialBore: 'OK',
    dowelTransverseBore: 'OK',
  })
  expect(results.stepExport).toMatch(/^OK len=\d+/)
})

// Task 8.2 — a hole array is one compound boolean, not one boolean per hole.
// Volume alone cannot prove this: the same material removed through the wrong face,
// along the wrong in-face axis, or at the wrong pitch measures identically. So the
// removed material is isolated as its own solid (plain minus drilled) and its
// centroid + bounding box are measured directly — undiluted by the 6-million-mm³
// panel it came out of.
test('a hole array drills the right material out of the right place', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  const result = await page.evaluate(async () => {
    // @ts-expect-error dev-only source import served by Vite; occt is untyped here
    const occt = await import('/src/geom/occt.ts')
    const oc = await occt.initOCCT()

    const panel = { length: 600, width: 560, thickness: 18 }
    const plain = occt.makeShape(oc, { ...panel, cuts: [] })
    const drilled = occt.makeShape(oc, {
      ...panel,
      cuts: [
        {
          kind: 'hole-array',
          id: 'h1',
          label: 'pins',
          face: '+Z',
          axis: 'U',
          start: { x: 50, y: 37, z: 18 },
          pitch: 32,
          count: 10,
          diameter: 5,
          depth: 12,
        },
      ],
    })

    const volume = (shape: unknown): number => {
      const g = new oc.GProp_GProps_1()
      oc.BRepGProp.VolumeProperties_1(shape, g, false, false, false)
      const v = g.Mass()
      g.delete()
      return v
    }

    // plain − drilled is exactly the material the array took out.
    const op = new oc.BRepAlgoAPI_Cut_3(plain, drilled)
    const removed = op.Shape()
    const g = new oc.GProp_GProps_1()
    oc.BRepGProp.VolumeProperties_1(removed, g, false, false, false)
    const c = g.CentreOfMass()
    const removedCentroid: [number, number, number] = [c.X(), c.Y(), c.Z()]
    g.delete()
    const box = new oc.Bnd_Box_1()
    oc.BRepBndLib.Add(removed, box, false)
    const lo = box.CornerMin()
    const hi = box.CornerMax()
    const removedBbox: [number, number, number, number, number, number] = [
      lo.X(),
      lo.Y(),
      lo.Z(),
      hi.X(),
      hi.Y(),
      hi.Z(),
    ]
    box.delete()

    return {
      plain: volume(plain),
      drilled: volume(drilled),
      removedCentroid,
      removedBbox,
    }
  })

  expect(result.drilled).toBeLessThan(result.plain)
  // ten ⌀5 holes, 12 mm deep ≈ 10 · π · 2.5² · 12 ≈ 2356 mm³
  expect(result.plain - result.drilled).toBeGreaterThan(2000)
  expect(result.plain - result.drilled).toBeLessThan(2700)

  // Where the material went. Holes march along +X from x=50 at 32 mm pitch, so the
  // tenth centre is at 338; the row sits at y=37 and is bored 12 mm down from the
  // +Z face at z=18. Every one of those numbers moves if the face, the in-face axis,
  // the pitch, the count, the start, or the depth is wrong.
  expect(result.removedCentroid[0]).toBeCloseTo(194, 1)
  expect(result.removedCentroid[1]).toBeCloseTo(37, 1)
  expect(result.removedCentroid[2]).toBeCloseTo(12, 1)

  const [minX, minY, minZ, maxX, maxY, maxZ] = result.removedBbox
  expect(minX).toBeCloseTo(47.5, 1)
  expect(maxX).toBeCloseTo(340.5, 1)
  expect(minY).toBeCloseTo(34.5, 1)
  expect(maxY).toBeCloseTo(39.5, 1)
  expect(minZ).toBeCloseTo(6, 1)
  expect(maxZ).toBeCloseTo(18, 1)
})

// A hinge cup is the largest bore the app makes — ⌀35 into an 18 mm door — and the only one whose
// diameter is a meaningful fraction of the panel it goes into. The pin-row test above proves the
// kernel drills a small array in the right place; this proves a cup does too, and that 12.5 mm blind
// leaves material behind it rather than punching through.
test('a hinge cup is drilled blind, and leaves material behind it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  const result = await page.evaluate(async () => {
    // @ts-expect-error dev-only source import served by Vite; occt is untyped here
    const occt = await import('/src/geom/occt.ts')
    const oc = await occt.initOCCT()

    // A Base 600 door: 617 tall, 597 wide, 18 thick, two cups 22.5 in from the hinged edge.
    const door = { length: 617, width: 597, thickness: 18 }
    const plain = occt.makeShape(oc, { ...door, cuts: [] })
    const bored = occt.makeShape(oc, {
      ...door,
      cuts: [
        {
          kind: 'hole-array',
          id: 'c1',
          label: 'Hinge cups',
          face: '+Z',
          axis: 'U',
          start: { x: 100, y: 22.5, z: 18 },
          pitch: 417,
          count: 2,
          diameter: 35,
          depth: 12.5,
        },
      ],
    })

    const op = new oc.BRepAlgoAPI_Cut_3(plain, bored)
    const removed = op.Shape()
    const g = new oc.GProp_GProps_1()
    oc.BRepGProp.VolumeProperties_1(removed, g, false, false, false)
    const removedVolume = g.Mass()
    const c = g.CentreOfMass()
    const removedCentroid: [number, number, number] = [c.X(), c.Y(), c.Z()]
    g.delete()

    const box = new oc.Bnd_Box_1()
    oc.BRepBndLib.Add(removed, box, false)
    const lo = box.CornerMin()
    const hi = box.CornerMax()
    const removedBbox: [number, number, number, number, number, number] = [
      lo.X(),
      lo.Y(),
      lo.Z(),
      hi.X(),
      hi.Y(),
      hi.Z(),
    ]
    box.delete()

    return { removedVolume, removedCentroid, removedBbox }
  })

  // Two ⌀35 cups 12.5 deep ≈ 2 · π · 17.5² · 12.5 ≈ 24 052 mm³.
  expect(result.removedVolume).toBeGreaterThan(23_000)
  expect(result.removedVolume).toBeLessThan(25_000)

  // Two cups at x = 100 and 517, so the centroid sits midway at 308.5; the row is 22.5 in from the
  // hinged edge and bored 12.5 down from the +Z face at z = 18.
  expect(result.removedCentroid[0]).toBeCloseTo(308.5, 1)
  expect(result.removedCentroid[1]).toBeCloseTo(22.5, 1)
  expect(result.removedCentroid[2]).toBeCloseTo(11.75, 1)

  // Blind: the far face is z = 0 and the bore stops at 5.5. That gap is the whole point — a cup
  // 12.5 into an 18 mm door leaves 5.5 mm of face, and a `depth` read as "through" would show
  // minZ = 0 here.
  const [minX, minY, minZ, maxX, maxY, maxZ] = result.removedBbox
  expect(minZ).toBeCloseTo(5.5, 1)
  expect(maxZ).toBeCloseTo(18, 1)
  expect(minX).toBeCloseTo(82.5, 1)
  expect(maxX).toBeCloseTo(534.5, 1)
  expect(minY).toBeCloseTo(5, 1)
  expect(maxY).toBeCloseTo(40, 1)
})

// Task 8.2 Step 1b — the cost of a hole array, measured rather than asserted.// Task 8.2 Step 1b — the cost of a hole array, measured rather than asserted.
// The phase's claim is that hole arrays do not make the app slow, and the reason
// given is that an array is one compound boolean instead of one boolean per hole.
// This times a realistic worst case (six cabinets' worth of side panels, two shelf-pin
// rows each = 480 holes) both ways and prints both figures. Deliberately no timing
// threshold: a wall-clock assertion in CI is flaky, and the budget is set from the
// recorded number, not guessed here. See 2026-08-18-cabinet-assembly-notes.md.
// The expanded-box arm is the slow half (~1 min); the assertions below are on the
// geometry, so a regression still fails loudly without depending on the clock.
test('hole-array build cost: one compound boolean vs one boolean per hole', async ({ page }) => {
  test.setTimeout(600_000)
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  const perf = await page.evaluate(async () => {
    // @ts-expect-error dev-only source import served by Vite; occt is untyped here
    const occt = await import('/src/geom/occt.ts')
    const oc = await occt.initOCCT()

    const PANELS = 12 // six cabinets, two side panels each
    const ROW_Y = [37, 523] // front and back shelf-pin rows
    const COUNT = 20
    const PITCH = 32
    const DIAMETER = 5
    const DEPTH = 12
    const X0 = 100
    const panel = { length: 720, width: 560, thickness: 18 }

    const arrayCuts = ROW_Y.map((y, r) => ({
      kind: 'hole-array',
      id: 'h' + r,
      label: 'pins',
      face: '+Z',
      axis: 'U',
      start: { x: X0, y, z: panel.thickness },
      pitch: PITCH,
      count: COUNT,
      diameter: DIAMETER,
      depth: DEPTH,
    }))

    // The same 40 holes, one boolean each — what this design exists to avoid.
    const boxCuts = ROW_Y.flatMap((y, r) =>
      Array.from({ length: COUNT }, (_, i) => ({
        kind: 'box',
        id: `b${r}_${String(i).padStart(2, '0')}`,
        label: 'pin',
        face: '+Z',
        position: {
          x: X0 + i * PITCH - DIAMETER / 2,
          y: y - DIAMETER / 2,
          z: panel.thickness - DEPTH,
        },
        size: { x: DIAMETER, y: DIAMETER, z: DEPTH },
      })),
    )

    const run = (cuts: unknown[]) => {
      const t0 = performance.now()
      let last: { delete: () => void } | null = null
      for (let p = 0; p < PANELS; p++) {
        if (last) last.delete()
        last = occt.makeShape(oc, { ...panel, cuts })
      }
      const ms = performance.now() - t0
      const g = new oc.GProp_GProps_1()
      oc.BRepGProp.VolumeProperties_1(last, g, false, false, false)
      const volume = g.Mass()
      g.delete()
      last!.delete()
      return { ms, volume }
    }

    return {
      holes: PANELS * ROW_Y.length * COUNT,
      array: run(arrayCuts),
      expanded: run(boxCuts),
    }
  })

  const STOCK = 720 * 560 * 18
  // 40 ⌀5×12 cylinders per panel vs 40 5×5×12 prisms — the arms remove different
  // amounts, so each is checked against its own analytic figure. This is what proves
  // both arms actually drilled all 40 holes and the timings compare like with like.
  expect(STOCK - perf.array.volume).toBeCloseTo(40 * Math.PI * 6.25 * DEPTH_MM, 0)
  expect(STOCK - perf.expanded.volume).toBeCloseTo(40 * 5 * 5 * DEPTH_MM, 0)

  console.log(
    `hole-array cost over ${perf.holes} holes (12 panels x 2 rows x 20): ` +
      `one compound boolean per row = ${perf.array.ms.toFixed(0)} ms; ` +
      `one boolean per hole = ${perf.expanded.ms.toFixed(0)} ms; ` +
      `ratio = ${(perf.expanded.ms / perf.array.ms).toFixed(1)}x`,
  )
})
