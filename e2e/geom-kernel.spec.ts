import { test, expect } from '@playwright/test'

// Exercises the OCCT geometry functions (src/geom/occt.ts) against the live
// opencascade.js v1.1.1 WASM kernel. These paths cannot run in Node (OCCT is
// browser-only), so their Vitest coverage is mocked/skipped — this is the only
// place the real embind overloads are verified. Regression guard for the
// 2026-06-27 fix: BRepPrimAPI_MakeCylinder_1 (not _2) and BRepAlgoAPI_Cut_3(S1,S2)
// with no Message_ProgressRange (absent in v1.1.1). The source module is imported
// in-page via Vite's dev server (the same `pnpm dev` the Playwright webServer runs).

const OCCT_READY_TIMEOUT = 120_000

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
