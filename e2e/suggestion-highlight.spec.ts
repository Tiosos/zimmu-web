import { test, expect, type Page, type Locator } from '@playwright/test'
import { isNonBlank, type Match } from './canvas'
import { pollHues } from './pollHues'

// OCCT boots a ~65MB WASM kernel in a worker before the UI is usable; allow
// generous time for it to compile and run the first build on a slow CI runner.
const OCCT_READY_TIMEOUT = 120_000

// A hovered suggestion paints two distinct things, and this spec pins both because they are
// separately breakable: the neighbour board's edges are re-tinted amber (0xfbbf24), and the cuts
// the joint would make are outlined in their own hue (0xf472b6, SUGGESTION_OUTLINE_COLOR in
// viewport.tsx). Those two shared a colour until the outlines were given their own, at which point
// counting one colour could no longer tell you both had rendered.
//
// Calibrated on this scene, hovering the tongue & groove suggestion:
//   both rendering ....... tint 717,  outline 1749
//   nothing hovered ...... tint 0,    outline 0
// The gates sit well below the live numbers rather than snug against them. Unlike the earlier
// single-colour threshold — which had to sit in a narrow gap to tell two halves apart — each
// colour is now evidence for exactly one half, so a generous floor still fails if either is
// missing, and there is no need to track the live numbers closely.
const TINT_PIXELS = 300
const OUTLINE_PIXELS = 300

// The sidebar is tall: at the default 720px height the suggested-joints section renders below the
// fold, and scrolling it into view does not survive the re-render that hovering triggers. Give the
// page enough height that the row is on screen without scrolling.
test.use({ viewport: { width: 1280, height: 1100 } })

// Amber 0xfbbf24 = rgb(251,191,36) — the neighbour-board tint.
const isTint: Match = (r, g, b) => r > 200 && g > 130 && g < 225 && b < 110 && r - b > 120
// Pink 0xf472b6 = rgb(244,114,182) — the cut outlines.
const isOutline: Match = (r, g, b) => r > 190 && g > 60 && g < 175 && b > 130 && b - g > 30
const HUES = { tint: isTint, outline: isOutline }

// Private copy of the helper in smoke.spec.ts, matching the per-file convention used elsewhere in
// this repo. Worth hoisting into canvas.ts if a third spec needs it.
//
// Dev mode mounts a small stats.js FPS canvas as a sibling of the WebGL viewport canvas
// (src/render/viewport.tsx). Pick the largest canvas (by area, measured from the live layout).
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

// The Position inputs carry no label association, so reach them through the Radix Collapsible: the
// section trigger's aria-controls names its content panel, whose three number inputs are X, Y, Z in
// order (src/ui/sidebar.tsx).
async function positionInput(page: Page, axis: 'X' | 'Y' | 'Z'): Promise<Locator> {
  const trigger = page.getByRole('button', { name: /Position/i }).first()
  const panelId = await trigger.getAttribute('aria-controls')
  expect(panelId, 'Position section should expose aria-controls').toBeTruthy()
  return page.locator(`#${panelId} input[type=number]`).nth({ X: 0, Y: 1, Z: 2 }[axis])
}

test('hovering a joint suggestion tints the neighbour board and outlines the joint cuts', async ({
  page,
}) => {
  await page.goto('/')

  const addBoard = page.getByRole('button', { name: '+ Board' })
  await expect(addBoard).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  // Build a coplanar edge glue-up. Both boards default to 200×100×25 at the origin
  // (src/scene/useScene.ts), so moving the second to y=100 makes their long edges meet at y=50 —
  // the geometry suggestJointsFor scores as a tongue & groove.
  await addBoard.click()
  await expect(page.getByText('Board 2')).toBeVisible()
  await (await positionInput(page, 'Y')).fill('100')

  // The new board is selected on add, so its panel lists the joint it could form with Board 1.
  // This row appearing is itself proof that the whole suggestion pipeline ran against live scene
  // state, not just the pure scoring functions.
  const suggestion = page.getByText('Tongue & groove with Board 1')
  await expect(suggestion).toBeVisible()

  const canvas = await viewportCanvas(page)
  await expect
    .poll(async () => isNonBlank(await canvas.screenshot()), { timeout: 30_000 })
    .toBe(true)

  // Park the pointer somewhere inert before measuring the baseline. Clicking "+ Board" leaves the
  // cursor over the add-part footer, and the sidebar then re-renders the suggestion row into that
  // spot — which fires mouseenter and turns the highlight on before the test ever asks for it.
  // Without this the baseline already contains the highlight and the hover appears to do nothing.
  const inertTarget = page.getByRole('button', { name: /Shape/i }).first()
  await inertTarget.hover()
  await pollHues(
    canvas,
    HUES,
    (counts) => counts.tint === 0 && counts.outline === 0,
    'highlight should be off before hovering',
  )

  // Gate 1: both halves of the hover reach the screen. This is what the unit tests structurally
  // cannot cover — they pin suggestionOutlines as a pure function, but nothing else asserts a
  // LineLoop is ever drawn. Each colour is evidence for one half, so a missing tint or missing
  // outlines fails here rather than hiding behind the other.
  await suggestion.hover()
  const { tint, outline } = await pollHues(
    canvas,
    HUES,
    (counts) => counts.tint >= TINT_PIXELS && counts.outline >= OUTLINE_PIXELS,
    'hovering should paint both the neighbour tint and the cut outlines',
  )
  expect(tint, `neighbour tint: measured ${tint} amber px`).toBeGreaterThanOrEqual(TINT_PIXELS)
  expect(
    outline,
    `cut outlines: measured ${outline} px of the outline hue — 0 here with a healthy tint means ` +
      `the outlines stopped rendering, or their colour changed without this spec being updated`,
  ).toBeGreaterThanOrEqual(OUTLINE_PIXELS)

  // Gate 2: the highlight clears. Park on the sidebar again rather than the canvas — moving over
  // the canvas would raycast a face and light the hoveredFace LineLoop, repainting for an
  // unrelated reason.
  await inertTarget.hover()
  const cleared = await pollHues(
    canvas,
    HUES,
    (counts) => counts.tint === 0 && counts.outline === 0,
    'un-hover should clear both',
  )
  expect(cleared).toEqual({ tint: 0, outline: 0 })
})
