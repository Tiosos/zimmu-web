import { test, expect } from '@playwright/test'
import { isNonBlank, changedFraction } from './canvas'
import { viewportCanvas } from './liveCanvas'

// OCCT boots a ~65MB WASM kernel in a worker before the UI is usable; allow
// generous time for it to compile and run the first build on a slow CI runner.
const OCCT_READY_TIMEOUT = 120_000

// Minimum fraction of sampled viewport pixels that must change when the default
// dowel renders over the board-only frame. Calibrated between the measured
// real-dowel delta (~0.68%) and steady-state high-bit noise (~0.005%).
const DOWEL_RENDER_DELTA = 0.002

test('app boots empty, OCCT initializes, and an added board renders', async ({ page }) => {
  await page.goto('/')

  // The first launch starts empty, like File > New: no part is seeded.
  await expect(page.getByText('Board 1')).toHaveCount(0)

  // The "+ Board" button is disabled until occtReady flips true, i.e.
  // until the OCCT WASM kernel has booted in the worker.
  const addBoard = page.getByRole('button', { name: '+ Board' })
  await expect(addBoard).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })
  await addBoard.click()
  await expect(page.getByText('Board 1')).toBeVisible()

  // Geometry reached the screen: the viewport canvas is not a uniform color.
  // Poll the screenshot — occtReady flips before the next animation frame has
  // painted the mesh, so the first capture can still be the clear color.
  const canvas = await viewportCanvas(page)
  await expect
    .poll(async () => isNonBlank(await canvas.screenshot()), { timeout: 30_000 })
    .toBe(true)
})

test('adding a board appends a part', async ({ page }) => {
  await page.goto('/')

  const addBoard = page.getByRole('button', { name: '+ Board' })
  await expect(addBoard).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  await addBoard.click()

  // labelCounter derives the next label as "Board 1" on an empty scene (src/scene/useScene.ts);
  // the new part appears as a row in the sidebar list.
  await expect(page.getByText('Board 1')).toBeVisible()
  await addBoard.click()
  await expect(page.getByText('Board 2')).toBeVisible()
})

test('adding a dowel renders through the OCCT cylinder kernel path', async ({ page }) => {
  await page.goto('/')

  // The "+ Dowel" button gates on occtReady just like "+ Board".
  const addDowel = page.getByRole('button', { name: '+ Dowel' })
  await expect(addDowel).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  // Add a board, then capture the board-only frame once it has rendered. The camera
  // is set a single time at init and is never auto-reframed on part changes
  // (src/render/viewport.tsx), so any later pixel change is strictly new geometry.
  await page.getByRole('button', { name: '+ Board' }).click()
  const canvas = await viewportCanvas(page)
  await expect
    .poll(async () => isNonBlank(await canvas.screenshot()), { timeout: 30_000 })
    .toBe(true)
  const boardOnly = await canvas.screenshot()

  await addDowel.click()

  // First dowel is labeled "Dowel 1" (src/scene/useScene.ts).
  await expect(page.getByText('Dowel 1')).toBeVisible()

  // Gate 1 (positive render proof): the default dowel is a ⌀8×100 cylinder at the
  // origin — tall enough to stick out of the 25mm board and visibly change the
  // fixed-camera frame. If makeCylinder throws (e.g. wrong embind overload) no
  // dowel mesh is built, the frame stays identical, and this poll times out.
  // (This replaces the prior `isNonBlank` check, which the still-rendered board
  // satisfied on its own — so it passed even when the dowel failed to build.)
  await expect
    .poll(async () => changedFraction(boardOnly, await canvas.screenshot()), { timeout: 30_000 })
    .toBeGreaterThan(DOWEL_RENDER_DELTA)

  // Gate 2 (deterministic build proof): a failed worker build records the OCCT
  // error as a "⚠" whose title is the message, on the Dowel row (src/ui/sidebar.tsx).
  // By now the build has settled (gate 1 waited for geometry), so this is race-free.
  await expect(page.getByText('⚠')).toHaveCount(0)
})
