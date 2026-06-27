import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// OCCT boots a ~65MB WASM kernel in a worker before export is possible.
const OCCT_READY_TIMEOUT = 120_000

// Verifies the unnamed-compound STEP writer (src/geom/occt.ts `writeStep`) against
// the live opencascade.js WASM build — the path that cannot run in Node, so the
// occt.test.ts smoke test stays `it.skip`. Regression guard for the 2026-06-16
// XCAF → STEPControl_Writer fallback (PR #12): the XCAF/CAF classes are absent at
// runtime in opencascade.js v1.1.1 and would throw before any file is written, so
// a non-empty, well-formed STEP here proves the fallback path runs end to end.
//
// Uses a board + dowel compound: the dowel also guards the 2026-06-27 makeCylinder
// fix (BRepPrimAPI_MakeCylinder_1). A dowel that fails to build surfaces a "⚠"
// warning on its sidebar row, so asserting the warning is absent proves it built.
test('exports a valid STEP file for a board + dowel compound', async ({ page }) => {
  await page.goto('/')

  const addBoard = page.getByRole('button', { name: '+ Board' })
  await expect(addBoard).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  // Add a dowel so the compound holds two distinct solids (default "Board 1" +
  // "Dowel 1") through the cylinder kernel path, not just boxes.
  const addDowel = page.getByRole('button', { name: '+ Dowel' })
  await expect(addDowel).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })
  await addDowel.click()
  await expect(page.getByText('Dowel 1')).toBeVisible()

  // The dowel must have built: a build failure renders a "⚠" glyph on the row
  // whose title is the OCCT error. None should be present.
  await expect(page.locator('[title*="invalid number of parameters"]')).toHaveCount(0)
  await expect(page.getByText('⚠')).toHaveCount(0)

  // Open the File menu and trigger Export STEP…, capturing the anchor download
  // emitted by downloadBlob (src/ui/download.ts).
  await page.getByRole('button', { name: /^File/ }).click()
  const exportItem = page.getByRole('button', { name: /Export STEP/ })
  await expect(exportItem).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await exportItem.click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.step$/)

  const filePath = await download.path()
  const step = readFileSync(filePath, 'utf8')

  // STEP envelope present → writeStep ran to completion. The XCAF path would have
  // thrown on XCAFApp_Application.GetApplication() before writing anything.
  expect(step).toContain('ISO-10303-21;')
  expect(step).toContain('END-ISO-10303-21;')
  expect(step).toMatch(/DATA;[\s\S]*ENDSEC;/)

  // Geometry actually transferred: a B-rep solid representation is emitted.
  expect(step).toMatch(/MANIFOLD_SOLID_BREP|CLOSED_SHELL|ADVANCED_BREP_SHAPE_REPRESENTATION/)

  // mm units were written (Interface_Static 'write.step.unit' = 'MM').
  expect(step).toMatch(/\.MILLI\./)
})
