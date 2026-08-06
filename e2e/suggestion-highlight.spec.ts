import { test, expect, type Page, type Locator } from '@playwright/test'
import { PNG } from 'pngjs'
import { isNonBlank } from './canvas'

// OCCT boots a ~65MB WASM kernel in a worker before the UI is usable; allow
// generous time for it to compile and run the first build on a slow CI runner.
const OCCT_READY_TIMEOUT = 120_000

// Minimum amber pixels that must appear in the viewport while a suggestion is
// hovered. The highlight has two halves, both painted 0xfbbf24
// (src/render/viewport.tsx): the neighbour board's edge lines, and the two face
// LineLoops. Threshold is set to require BOTH — mutation-tested on this scene:
//
//   both halves rendering ....... 1942   (bit-identical across repeated runs)
//   neighbour tint disabled ..... 1221
//   face outlines disabled ....... 717
//   nothing hovered ................ 0
//
// 1500 sits in the gap, so deleting either half fails the gate. A permissive
// floor (say 150) would pass with half the feature gone, which is the failure
// mode this spec exists to catch.
//
// The counts come from software rendering (swiftshader) and were reproducible to
// the pixel locally. A runner with different anti-aliasing may shift them; if this
// fails, the assertion message reports the measured count — recalibrate against
// the table above rather than simply lowering the number, or the gate stops
// discriminating between the two halves.
const HIGHLIGHT_AMBER_PIXELS = 1500

// The sidebar is tall: at the default 720px height the suggested-joints section
// renders below the fold, and scrolling it into view does not survive the
// re-render that hovering triggers. Give the page enough height that the row is
// on screen without scrolling.
test.use({ viewport: { width: 1280, height: 1100 } })

// Counts pixels matching the highlight amber (0xfbbf24 = rgb(251,191,36)),
// loosely enough to catch anti-aliased line pixels. Deliberately not
// changedFraction(): that masks colour to its high bits to suppress AA noise,
// which also erases 1px anti-aliased wireframe, leaving the highlight smaller
// than the frame-to-frame noise of the dev-mode FPS overlay. Keying on the
// highlight's own colour ignores that overlay (cyan) entirely.
function amberPixels(pngBuffer: Buffer): number {
  const { data, width, height } = PNG.sync.read(pngBuffer)
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) << 2
      const r = data[o]
      const g = data[o + 1]
      const b = data[o + 2]
      if (r > 200 && g > 130 && g < 225 && b < 110 && r - b > 120) count++
    }
  }
  return count
}

// Private copy of the helper in smoke.spec.ts, matching the per-file convention
// used elsewhere in this repo. Worth hoisting into canvas.ts if a third spec needs it.
//
// Dev mode mounts a small stats.js FPS canvas as a sibling of the WebGL viewport
// canvas (src/render/viewport.tsx). Pick the largest canvas (by area, measured from
// the live layout) to reliably target the viewport.
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

// The Position inputs carry no label association, so reach them through the Radix
// Collapsible: the section trigger's aria-controls names its content panel, whose
// three number inputs are X, Y, Z in order (src/ui/sidebar.tsx).
async function positionInput(page: Page, axis: 'X' | 'Y' | 'Z'): Promise<Locator> {
  const trigger = page.getByRole('button', { name: /Position/i }).first()
  const panelId = await trigger.getAttribute('aria-controls')
  expect(panelId, 'Position section should expose aria-controls').toBeTruthy()
  return page.locator(`#${panelId} input[type=number]`).nth({ X: 0, Y: 1, Z: 2 }[axis])
}

// Polls the viewport until its amber-pixel count satisfies `done`, then returns the
// last reading. Rendering trails the DOM event by at least a frame, so a single
// sample races the render loop.
async function pollAmber(
  canvas: Locator,
  done: (amber: number) => boolean,
  message: string,
): Promise<number> {
  let last = -1
  await expect
    .poll(
      async () => {
        last = amberPixels(await canvas.screenshot())
        return done(last)
      },
      { timeout: 30_000, message },
    )
    .toBe(true)
  return last
}

test('hovering a joint suggestion highlights the neighbour board and its joint faces', async ({
  page,
}) => {
  await page.goto('/')

  const addBoard = page.getByRole('button', { name: '+ Board' })
  await expect(addBoard).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  // Build a coplanar edge glue-up. Both boards default to 200×100×25 at the origin
  // (src/scene/useScene.ts), so moving the second to y=100 makes their long edges
  // meet at y=50 — the geometry suggestJointsFor scores as a tongue & groove.
  await addBoard.click()
  await expect(page.getByText('Board 2')).toBeVisible()
  await (await positionInput(page, 'Y')).fill('100')

  // The new board is selected on add, so its panel lists the joint it could form
  // with Board 1. This row appearing is itself proof that the whole suggestion
  // pipeline ran against live scene state, not just the pure scoring functions.
  const suggestion = page.getByText('Tongue & groove with Board 1')
  await expect(suggestion).toBeVisible()

  const canvas = await viewportCanvas(page)
  await expect
    .poll(async () => isNonBlank(await canvas.screenshot()), { timeout: 30_000 })
    .toBe(true)

  // Park the pointer somewhere inert before measuring the baseline. Clicking
  // "+ Board" leaves the cursor over the add-part footer, and the sidebar then
  // re-renders the suggestion row into that spot — which fires mouseenter and
  // turns the highlight on before the test ever asks for it. Without this the
  // baseline already contains the highlight and the hover appears to do nothing.
  const inertTarget = page.getByRole('button', { name: /Shape/i }).first()
  await inertTarget.hover()
  await pollAmber(canvas, (n) => n === 0, 'highlight should be off before hovering')

  // Gate 1: hovering reaches the screen. This is what the unit tests structurally
  // cannot cover — they pin suggestionFaceRefs/faceHitForDisplay as pure functions,
  // but nothing else asserts a LineLoop is ever drawn. If the viewport stops
  // rendering the highlight, no amber appears and this poll times out.
  await suggestion.hover()
  const amber = await pollAmber(
    canvas,
    (n) => n >= HIGHLIGHT_AMBER_PIXELS,
    'hovering a suggestion should paint the highlight amber into the viewport',
  )
  expect(
    amber,
    `measured ${amber} amber px; ~1942 means both halves rendered, ~1221 means the face ` +
      `outlines are missing, ~717 means the neighbour tint is missing, 0 means neither drew`,
  ).toBeGreaterThanOrEqual(HIGHLIGHT_AMBER_PIXELS)

  // Gate 2: the highlight clears. Park on the sidebar again rather than the canvas —
  // moving over the canvas would raycast a face and light the hoveredFace LineLoop,
  // repainting amber for an unrelated reason.
  await inertTarget.hover()
  const cleared = await pollAmber(canvas, (n) => n === 0, 'un-hover should clear the highlight')
  expect(cleared).toBe(0)
})
