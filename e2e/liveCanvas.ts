// Reading the live viewport canvas in a browser, where `canvas.ts` reads a PNG buffer it is handed.
// The split is not taste: `canvas.test.ts` is a Vitest test, so anything `canvas.ts` imports is
// loaded by `pnpm test` — and merely importing `@playwright/test` there makes Node print a fatal
// unhandled ECONNREFUSED 127.0.0.1:3000 over the suite's output. Measured; the tests still pass
// under it, which is exactly why it would go unnoticed.

import { expect, type Locator, type Page } from '@playwright/test'
import { countPixels, type Match } from './canvas'

// Dev mode mounts a small stats.js FPS canvas as a sibling of the WebGL viewport canvas
// (src/render/viewport.tsx). Pick the largest canvas (by area, measured from the live layout) to
// reliably target the viewport. A single page.evaluate avoids per-canvas round-trips and reads
// post-layout sizes.
export async function viewportCanvas(page: Page): Promise<Locator> {
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

// Polls the viewport until the named hue counts satisfy `done`, then returns the last reading.
// Rendering trails the DOM event by at least a frame, so a single sample races the render loop.
export async function pollHues<K extends string>(
  canvas: Locator,
  matchers: Record<K, Match>,
  done: (counts: Record<K, number>) => boolean,
  message: string,
): Promise<Record<K, number>> {
  const entries = Object.entries(matchers) as [K, Match][]
  let last = Object.fromEntries(entries.map(([key]) => [key, -1])) as Record<K, number>
  await expect
    .poll(
      async () => {
        const shot = await canvas.screenshot()
        last = Object.fromEntries(
          entries.map(([key, match]) => [key, countPixels(shot, match)]),
        ) as Record<K, number>
        return done(last)
      },
      { timeout: 30_000, message },
    )
    .toBe(true)
  return last
}
