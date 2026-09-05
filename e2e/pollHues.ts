import { expect, type Locator } from '@playwright/test'
import { countPixels, type Match } from './canvas'

// Polls the viewport until the named hue counts satisfy `done`, then returns the last reading.
// Rendering trails the DOM event by at least a frame, so a single sample races the render loop.
//
// Its own module rather than a third export of `canvas.ts`, which is where the pixel matching it
// calls lives: `canvas.test.ts` is a Vitest test, so anything `canvas.ts` imports is loaded by
// `pnpm test` — and merely importing `@playwright/test` there makes Node print a fatal unhandled
// ECONNREFUSED 127.0.0.1:3000 over the suite's output. Measured; the tests still pass under it.
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
