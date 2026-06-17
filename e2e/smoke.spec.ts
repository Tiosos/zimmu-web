import { test, expect, type Page, type Locator } from '@playwright/test'
import { isNonBlank } from './canvas'

// Dev mode mounts a small stats.js FPS canvas as a sibling of the WebGL
// viewport canvas (src/render/viewport.tsx). Pick the largest canvas to
// reliably target the viewport rather than the overlay.
async function viewportCanvas(page: Page): Promise<Locator> {
  const canvases = page.locator('canvas')
  await expect(canvases.first()).toBeVisible()
  const count = await canvases.count()
  let best = canvases.first()
  let bestArea = -1
  for (let i = 0; i < count; i++) {
    const c = canvases.nth(i)
    const box = await c.boundingBox()
    const area = box ? box.width * box.height : 0
    if (area > bestArea) {
      bestArea = area
      best = c
    }
  }
  return best
}

test('app boots, OCCT initializes, and the default board renders', async ({ page }) => {
  await page.goto('/')

  // Default scene seeds one board labeled "Board 1" (src/scene/useScene.ts).
  await expect(page.getByText('Board 1')).toBeVisible()

  // The "+ Add board" button is disabled until occtReady flips true, i.e.
  // until the OCCT WASM kernel has booted in the worker.
  const addBoard = page.getByRole('button', { name: '+ Add board' })
  await expect(addBoard).toBeEnabled({ timeout: 60_000 })

  // Geometry reached the screen: the viewport canvas is not a uniform color.
  const canvas = await viewportCanvas(page)
  const shot = await canvas.screenshot()
  expect(isNonBlank(shot)).toBe(true)
})
