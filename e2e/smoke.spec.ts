import { test, expect, type Page, type Locator } from '@playwright/test'
import { isNonBlank } from './canvas'

// OCCT boots a ~65MB WASM kernel in a worker before the UI is usable; allow
// generous time for it to compile and run the first build on a slow CI runner.
const OCCT_READY_TIMEOUT = 120_000

// Dev mode mounts a small stats.js FPS canvas as a sibling of the WebGL
// viewport canvas (src/render/viewport.tsx). Pick the largest canvas (by area,
// measured from the live layout) to reliably target the viewport. A single
// page.evaluate avoids per-canvas round-trips and reads post-layout sizes.
async function viewportCanvas(page: Page): Promise<Locator> {
  await expect(page.locator('canvas').first()).toBeVisible()
  const index = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'))
    let best = 0
    let bestArea = -1
    canvases.forEach((c, i) => {
      const rect = c.getBoundingClientRect()
      const area = rect.width * rect.height
      if (area > bestArea) {
        bestArea = area
        best = i
      }
    })
    return best
  })
  return page.locator('canvas').nth(index)
}

test('app boots, OCCT initializes, and the default board renders', async ({ page }) => {
  await page.goto('/')

  // Default scene seeds one board labeled "Board 1" (src/scene/useScene.ts).
  await expect(page.getByText('Board 1')).toBeVisible()

  // The "+ Board" button is disabled until occtReady flips true, i.e.
  // until the OCCT WASM kernel has booted in the worker.
  const addBoard = page.getByRole('button', { name: '+ Board' })
  await expect(addBoard).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  // Geometry reached the screen: the viewport canvas is not a uniform color.
  // Poll the screenshot — occtReady flips before the next animation frame has
  // painted the mesh, so the first capture can still be the clear color.
  const canvas = await viewportCanvas(page)
  await expect
    .poll(async () => isNonBlank(await canvas.screenshot()), { timeout: 30_000 })
    .toBe(true)
})

test('adding a board appends a second part', async ({ page }) => {
  await page.goto('/')

  const addBoard = page.getByRole('button', { name: '+ Board' })
  await expect(addBoard).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  await addBoard.click()

  // labelCounter derives the next label as "Board 2" (src/scene/useScene.ts);
  // the new part appears as a row in the sidebar list.
  await expect(page.getByText('Board 2')).toBeVisible()
})

test('adding a dowel renders through the OCCT cylinder kernel path', async ({ page }) => {
  await page.goto('/')

  // The "+ Dowel" button gates on occtReady just like "+ Board".
  const addDowel = page.getByRole('button', { name: '+ Dowel' })
  await expect(addDowel).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  // Hide the default board BEFORE adding the dowel. At boot nothing is selected,
  // so the EditPanel is closed and the parts-list visibility toggle is clickable.
  // (Adding the dowel first selects it and opens the EditPanel — whose content
  // overlaps the toggle and intercepts the click.) The toggle's accessible name
  // is the "●" glyph, so target the title attribute directly. With the board
  // hidden, only the dowel can color the viewport — so a non-blank canvas proves
  // the dowel's live WASM build/mesh path (makeCylinder → BRepPrimAPI_MakeCylinder).
  await page.locator('button[title="Hide"]').first().click()

  await addDowel.click()

  // First dowel is labeled "Dowel 1" (src/scene/useScene.ts).
  await expect(page.getByText('Dowel 1')).toBeVisible()

  const canvas = await viewportCanvas(page)
  await expect
    .poll(async () => isNonBlank(await canvas.screenshot()), { timeout: 30_000 })
    .toBe(true)
})
