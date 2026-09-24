import { test, expect } from '@playwright/test'
import type { Match } from './canvas'
import { pollHues, viewportCanvas } from './liveCanvas'

const OCCT_READY_TIMEOUT = 120_000

// Workflow C from the strategic plan, end to end: drop a cabinet, change one dimension, and every
// board follows. Unit tests mock the OCCT worker, so this is the only place that proves the
// generator's output actually reaches the kernel and renders.
test('a cabinet preset drops real boards and resizes when a parameter changes', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  const partsBefore = await page.getByTestId(/^node-board_/).count()

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()

  // A Base 600 emits 8 roles: two sides, bottom, top, back, toe kick, the one adjustable shelf its
  // single opening holds, and the door that covers it. A base unit is shelved by what the user
  // moves, not by a partition — and a cabinet that hangs no door is a carcase.
  await expect(page.getByTestId(/^node-board_/)).toHaveCount(partsBefore + 8)
  await expect(page.getByTestId(/^node-cmp_/)).toHaveCount(1)

  // Selecting the cabinet shows its parameters, not a board's dimensions.
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  const depth = page.getByLabel('Depth')
  await expect(depth).toHaveValue('560')

  // Workflow C: change one dimension; the driven boards follow.
  await depth.fill('600')
  await page
    .locator('[data-testid^="node-board_"]')
    .filter({ hasText: 'Left Side' })
    .first()
    .click()
  // The Shape section's L is the part's length; cut rows reuse the same single-letter labels.
  await expect(page.getByLabel('L', { exact: true }).first()).toHaveValue('600')
})

// Shelving belongs to an opening now, so the panel has to name one before it can be edited. This
// is the only place that proves the picker, the debounce and the regeneration line up: a unit test
// asserts what the updater would produce, not that boards appear.
test('setting an opening\u2019s shelf count drops that many boards', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  const shelves = page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Adj Shelf' })
  await expect(shelves).toHaveCount(1)

  // The Shelving section is collapsed by default and its content is hidden rather than unmounted,
  // so a unit test finds these fields without opening it and a browser does not.
  await page.getByRole('button', { name: /Shelving/ }).click()

  // The elevation is the picker. Selecting the cabinet opened the Section tab beside the sidebar,
  // and clicking the preset's single cell is what hands the panel a section to edit — without it
  // the panel says to pick one instead of showing a field.
  //
  // Centre-clicking a cell is also what pins the opening number's `pointer-events-none`
  // (`SectionElevation.tsx`) — measured: removing that class fails this test, while the whole Vitest
  // suite stays green. Three tests in this file click a cell that way; do not retarget any of them
  // to a corner or an offset, because the coverage is incidental and would vanish silently.
  await page.locator('[data-testid^="section-cell-"]').first().click()

  // Exact: "Fixed shelves" is a substring match on the same word, and Playwright's label lookup is
  // substring and case-insensitive by default.
  const field = page.getByLabel('Shelves', { exact: true })
  await field.fill('3')
  await expect(shelves).toHaveCount(3)

  await field.fill('0')
  await expect(shelves).toHaveCount(0)
})

// A front is chosen per opening, so the panel has to name one before it can be covered. Together
// with the shelf test above this is the only place that proves the picker, the debounce and the
// regeneration line up: a unit test asserts what the updater would produce, not that boards appear.
test('changing an opening\u2019s front changes the board that covers it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  // The preset hangs a single door.
  const doors = page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Door' })
  await expect(doors).toHaveCount(1)

  // Collapsed by default, and its content is `hidden` rather than unmounted — a unit test finds
  // these fields without opening the section and a browser does not.
  await page.getByRole('button', { name: /Front/ }).click()
  // Centre-click, load-bearing for `pointer-events-none` as well — see the note in
  // 'setting an opening's shelf count drops that many boards'.
  await page.locator('[data-testid^="section-cell-"]').first().click()

  // A pair splits the one cell into two boards with a reveal between them.
  await page.getByLabel('Leaves').click()
  await page.getByRole('option', { name: 'Pair' }).click()
  await expect(doors).toHaveCount(2)

  // …and None takes the front off the opening entirely.
  await page.getByLabel('Front', { exact: true }).click()
  await page.getByRole('option', { name: 'None' }).click()
  await expect(doors).toHaveCount(0)
})

// The claim the cabinet editor rests on: the viewport is hidden, never unmounted. A unit test
// cannot see that — a marker set on the live canvas, and still there after a round trip, can.
// `viewport.tsx` builds its renderer, camera and every mesh in a mount-once effect, so a remount
// would have produced a fresh element without the marker.
test('the cabinet editor never rebuilds the viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()

  await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (c === null) throw new Error('no canvas')
    c.setAttribute('data-zimmu-mark', 'kept')
  })

  // Selecting the cabinet swaps the pane for the editor; 3D swaps it back; Section hides it again.
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await expect(page.getByRole('tab', { name: 'Section' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: '3D' }).click()
  await page.getByRole('tab', { name: 'Section' }).click()
  await page.getByRole('tab', { name: '3D' }).click()

  // Still the same element, and still the one being shown — a remount would have produced a fresh
  // canvas without the marker. Not asserted as "exactly one canvas on the page": `stats.js` renders
  // the dev FPS overlay into a second one (viewport.tsx:273), which has nothing to do with this.
  const kept = page.locator('canvas[data-zimmu-mark="kept"]')
  await expect(kept).toHaveCount(1)
  await expect(kept).toBeVisible()
})

// The detach contract, end to end. This is the promise the whole live-regeneration design rests
// on: a part the user takes ownership of must survive a parameter change untouched.
test('a detached part keeps its own size when the cabinet changes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()

  const sideRow = page
    .locator('[data-testid^="node-board_"]')
    .filter({ hasText: 'Left Side' })
    .first()
  await sideRow.click()

  // Editing a driven part is a question, not a command.
  const length = page.getByLabel('L', { exact: true }).first()
  await length.fill('999')
  await expect(page.getByRole('button', { name: 'Detach this part' })).toBeVisible()
  await page.getByRole('button', { name: 'Detach this part' }).click()

  // The marker, not `data-driven`, identifies the detached row: a top-level board is undriven too.
  const detachedRow = page.locator('[data-testid^="node-board_"]').filter({ hasText: 'detached' })
  await expect(detachedRow).toHaveCount(1)

  // The detach itself runs the pipeline, so the freed `left-side` role regenerates there and then
  // and two boards share the label immediately — which is precisely why the detached one carries a
  // marker. It used to take an unrelated parameter change to reconcile.
  await expect(
    page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Left Side' }),
  ).toHaveCount(2)

  await detachedRow.click()
  await expect(length).toHaveValue('999')

  // Now change the cabinet. Every driven board follows; the detached one does not.
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByLabel('Depth').fill('600')

  await expect(
    page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Left Side' }),
  ).toHaveCount(2)

  await detachedRow.click()
  await expect(page.getByLabel('L', { exact: true }).first()).toHaveValue('999')

  const rightRow = page
    .locator('[data-testid^="node-board_"]')
    .filter({ hasText: 'Right Side' })
    .first()
  await rightRow.click()
  await expect(page.getByLabel('L', { exact: true }).first()).toHaveValue('600')
})

// The elevation edits the cabinet, not just its own picture: clicking a cell and splitting it has
// to reach the generator and come back as boards. A unit test asserts what the updater would
// produce; only this proves the click, the tree edit, the pipeline and the kernel line up.
test('splitting a cell in the elevation adds the panel it divides with', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  const cells = page.locator('[data-testid^="section-cell-"]')
  await expect(cells).toHaveCount(1)

  const boards = page.getByTestId(/^node-board_/)
  const before = await boards.count()
  // Centre-click, load-bearing for `pointer-events-none` as well — see the note in
  // 'setting an opening's shelf count drops that many boards'.
  await cells.first().click()
  await page.getByRole('button', { name: 'Split across' }).click()

  // One cell becomes two, with a shelf between them. The children inherit what their parent wore,
  // so the preset's door and its adjustable shelf are each duplicated: +1 shelf panel, +1 door,
  // +1 adjustable shelf.
  await expect(cells).toHaveCount(2)
  // Exact, and by the label element rather than the row: "Adj Shelf 1" contains "Shelf 1", and the
  // split makes one of each — a substring match would count two and read as a doubled division.
  await expect(page.getByText('Shelf 1', { exact: true })).toHaveCount(1)
  await expect(
    page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Door' }),
  ).toHaveCount(2)
  await expect(boards).toHaveCount(before + 3)

  // …and Merge puts it back, which is the only proof the two operations are inverses in the app
  // rather than only in `editSection`.
  await page.getByRole('button', { name: 'Merge' }).click()
  await expect(cells).toHaveCount(1)
  await expect(boards).toHaveCount(before)
})

// The regression the selection change exists to prevent. Before it, selecting a part nulled
// `selectedCarcase`, which unmounted the editor and revealed the viewport — so a click in a
// projection destroyed the surface it was clicked in. A unit test cannot see that; only the
// rendered tab can.
test('clicking a part in the Front view selects it without closing the editor', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  await page.getByRole('tab', { name: 'Front' }).click()
  // Last, not first. `CabinetProjection` paints farthest-first so the nearest part takes the
  // click, which puts the back panel at the head of the DOM and the door at its tail — clicking
  // the first one is a click the door intercepts, and Playwright retries that until the test
  // times out rather than failing on the assertion.
  const shapes = page.locator('[data-testid^="projection-part-"]')
  const nearest = shapes.last()
  await expect(nearest).toBeVisible()

  await nearest.click()
  await expect(nearest).toHaveAttribute('data-selected', 'true')

  // Still on Front, and the sidebar now shows a part rather than the carcase parameters.
  await expect(page.getByRole('tab', { name: 'Front' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('L', { exact: true }).first()).toBeVisible()
})

// The End view is a section: the near half is cut away, so the panel standing in front of the cut
// plane is not drawn at all. Counting parts cannot see that — `culled` filters parts OUT, so
// turning the cull off RAISES a Base 600's End view from seven parts to eight. Measured: with the
// cull disabled, "more than one part" still passes. Only the near panel's absence pins it.
test('the End view cuts the near side away', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  // A projection names a part by its own id, so ask the tree for the near panel's.
  const rowId = await page
    .locator('[data-testid^="node-board_"]')
    .filter({ hasText: 'Right Side' })
    .first()
    .getAttribute('data-testid')
  const nearPanel = page.locator(`[data-testid="projection-part-${rowId!.slice('node-'.length)}"]`)

  // Drawn in Front, which is a view rather than a section — so its absence below is the cull and
  // not a mistyped id.
  await page.getByRole('tab', { name: 'Front' }).click()
  await expect(nearPanel).toHaveCount(1)

  await page.getByRole('tab', { name: 'End' }).click()
  const drawn = page.locator('[data-testid^="projection-part-"]')
  await expect(drawn.first()).toBeVisible()
  await expect(nearPanel).toHaveCount(0)
  // …and what stood behind it is what the section exists to show.
  expect(await drawn.count()).toBeGreaterThan(1)
})

// The assembly sheet reaches the deck, and the viewer names it correctly.
test('the drawings deck carries an assembly sheet for the cabinet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()

  // "2D Drawings…" is an item INSIDE the File menu, not a top-level button. Opening the menu is
  // the whole difference between this passing and a timeout that reads like a missing feature.
  // The enabled check is a guard, not a wait: `canExport` is `visibleParts.length > 0`, which the
  // default board already satisfies at boot — it never involves OCCT.
  await page.getByRole('button', { name: 'File ▾' }).click()
  const drawings = page.getByRole('button', { name: '2D Drawings…' })
  await expect(drawings).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })
  await drawings.click()

  await page.getByLabel('→').click()
  await expect(page.getByText(/Assembly — Base 600/)).toBeVisible()
})

// The tree and the elevation are two views of one structure, and this is the only place that
// proves they agree on the live app rather than on a fixture. It splits first because every preset
// resolves to exactly ONE opening: a version of this that skipped the split would assert against a
// one-opening cabinet and pass whether or not the parts were grouped at all.
test('an opening selected in the tree is the opening the elevation shows', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  // Adding a cabinet does not select it, and the elevation only exists inside the editor.
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  const cells = page.locator('[data-testid^="section-cell-"]')
  await expect(cells).toHaveCount(1)
  // Centre-click, load-bearing for `pointer-events-none` as well — see the note in
  // 'setting an opening's shelf count drops that many boards'.
  await cells.first().click()
  await page.getByRole('button', { name: 'Split down' }).click()
  await expect(cells).toHaveCount(2)

  // The tree now carries two opening rows. Click the second: the first would be selected by a
  // "take the first opening" fallback as readily as by the click.
  const rows = page.getByTestId(/^node-sec_/)
  await expect(rows).toHaveCount(2)
  await rows.nth(1).click()

  // The elevation shows that same opening selected, matched by id rather than by position — a
  // test that counted selected cells would pass on either one of them.
  const rowId = await rows.nth(1).getAttribute('data-testid')
  const sectionId = rowId!.slice('node-'.length)
  await expect(page.getByTestId(`section-cell-${sectionId}`)).toHaveAttribute(
    'data-selected',
    'true',
  )

  // …and the cabinet editor is still open: selecting an opening must not close it.
  await expect(page.getByRole('tab', { name: 'Section' })).toHaveAttribute('aria-selected', 'true')
})

// Selection blue is 0x4fc3f7 = rgb(79,195,247), painted on 1px anti-aliased edge lines, so most of
// its pixels are that colour mixed with whatever lies behind them and the pure value is a minority.
// Two ratios rather than three channel windows:
//   g/b > 0.75 separates it from 0x60a5fa = rgb(96,165,250) — the hovered-face LineLoop, and the
//     hue the part-flash emissive ramps through — whose ratio is 0.66. The blue channels are 3
//     apart and the green ones 30, so green is the whole separation. Mixed with the 0x1a1a1d
//     background that ratio climbs back toward the background's own 0.90 as the line fades out,
//     but reaches only 0.69 at the dimmest mix still clearing the b > 120 floor.
//   r/b < 0.55 rejects a panel's own flat-shaded blue-grey — 1487 px of (94,134,153) sit in every
//     frame whether anything is selected or not — and the emissive a *part* selection paints
//     (87,119,144).
// The r floor drops the dev FPS overlay's cyan (2,231,232), which both ratios would admit.
// Measured on this scene once framed: nothing selected 0 px, opening 1 selected 1759, opening 2
// selected 1880.
const isSelectionBlue: Match = (r, g, b) =>
  r > 40 && b > 120 && g * 100 > b * 75 && r * 100 < b * 55

// Well below the measured 1759/1880 rather than snug against them.
const SELECTION_PIXELS = 400

// And a ceiling, because a floor alone cannot tell "this opening's parts" from "every part in the
// scene": a viewport lighting everything measures 6932. Placed at the geometric mean of 1880 and
// 6932 — 1.9x above the honest reading and 1.9x below the all-lit one, so neither side is the tight
// one. Not derived from the floor: that guards "nothing painted" and this guards "everything
// painted", against different measurements.
const SELECTION_CEILING = 3600

// That `selectedIds` reaches the screen, which is the one claim in this stage no unit test can
// make: there is no viewport.test.tsx, every unit consumer mocks the viewport and happy-dom has no
// WebGL, so dropping the `selectedIds?.includes(id)` arm leaves the whole Vitest suite green.
// Counted by colour rather than by diffing frames — a changed-pixel fraction passes on any repaint,
// including one that recoloured the wrong parts.
test('an opening selected in the tree lights its own parts in 3D', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  const cabinet = page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first()
  await cabinet.click()

  // Two openings, for the same reason as the test above: one is what every preset resolves to.
  const cells = page.locator('[data-testid^="section-cell-"]')
  await expect(cells).toHaveCount(1)
  await cells.first().click()
  await page.getByRole('button', { name: 'Split down' }).click()
  await expect(cells).toHaveCount(2)

  // The opening has to be picked in the tree, not the elevation: `App` shows the viewport only
  // while no cabinet is open or the tab is 3D, and the elevation lives on the Section tab — so a
  // screenshot taken after an elevation click captures a `display: none` canvas.
  await page.getByRole('tab', { name: '3D' }).click()

  // `Home` frames the cabinet in the pane's own aspect, which is what the counts above were read
  // from. The window nudge that used to sit here is gone: `viewport.tsx` now observes its mount, so
  // the canvas refits itself when the editor pane opens beside it.
  await page.keyboard.press('Home')

  const canvas = await viewportCanvas(page)
  const box = (await canvas.boundingBox())!

  // The pixel counts are absolute, so they assume this canvas — 1280px window (the Desktop Chrome
  // descriptor) less the sidebar and the editor pane. Asserted rather than left implicit: a
  // Playwright upgrade that changes the descriptor, or a `test.use({ viewport })` added to this
  // file, would otherwise invalidate every figure above and surface as an app regression that isn't
  // one. This line names the premise, so that failure says what it is.
  expect(Math.round(box.width), 'the counts below assume a 520px canvas').toBe(520)
  const rows = page.getByTestId(/^node-sec_/)
  await expect(rows).toHaveCount(2)
  const hues = { blue: isSelectionBlue }

  // Gate 1: a cabinet is selected and no opening is, so nothing wears the colour. Measured: a
  // viewport that lit every part whenever it held a `selectedIds` array fails here.
  //
  // The cabinet click only restores a named selection; to the viewport it is indistinguishable from
  // nothing selected, because `App` hands `[]` in both cases. It is not load-bearing — the test
  // passes without it, since `splitSection` leaves the old id naming an internal node, which
  // resolves to no opening. Deselecting would not have closed the editor either: `App.tsx` keeps it
  // open on a null selection deliberately, and `App.test.tsx` pins that.
  //
  // The bound is `< SELECTION_PIXELS` rather than `=== 0` because the move gizmo now overlays the
  // viewport whenever a cabinet is selected, and one anti-aliased pixel where its green and blue
  // axes meet satisfies `isSelectionBlue`. Measured, not estimated: exactly **1** px, at (261,378),
  // `rgb(63,165,136)`. The gate keeps all of its discriminating power — one opening lit measures
  // 1759-1880 and an all-lit viewport 6932, so both still fail against a floor of 400.
  await cabinet.click()
  await pollHues(
    canvas,
    hues,
    (c) => c.blue < SELECTION_PIXELS,
    'no opening selected should paint no selection blue',
  )

  // Gate 2: selecting an opening lights that opening's parts, and ONLY that opening's. The upper
  // bound is what makes the second half true — measured, one opening lights ~1759-1880 px while a
  // viewport lighting the whole scene reaches 6932. Without it this gate passes against "light
  // everything", which is Task 6's own mutation 1.
  //
  // The poll waits on the floor and the ceiling is asserted on the settled reading, rather than
  // polling until the count enters a window: an all-lit regression then fails at once instead of
  // after the 30 s timeout, and no transient in-window frame can satisfy it.
  //
  // The second row rather than the first is not load-bearing here, unlike in the structural test
  // above: probed, an `App` that always took `sections[0]` lights 1759 px and clears both bounds.
  // Distinguishing the two openings from each other is that test's job; this one's is the colour.
  await rows.nth(1).click()
  const { blue } = await pollHues(
    canvas,
    hues,
    (c) => c.blue >= SELECTION_PIXELS,
    'selecting an opening should paint its own parts, and no others, in the selection colour',
  )
  expect(blue, `selection colour: measured ${blue} px`).toBeGreaterThanOrEqual(SELECTION_PIXELS)
  expect(blue, `selection colour: measured ${blue} px`).toBeLessThanOrEqual(SELECTION_CEILING)

  // Gate 3: and it clears when the selection moves off. Clicking empty canvas is what deselects
  // without leaving the 3D tab — the elevation background the unit tests click for that is on the
  // Section tab. Measured to be load-bearing: a viewport that painted the selection but never reset
  // an edge to 0x1a1a1d passes gates 1 and 2 and fails here.
  //
  // Bounded rather than zeroed for the same reason as gate 1: deselecting a part does not close the
  // cabinet (`App` keeps it open deliberately), so the gizmo — and its one pixel — is still there.
  await canvas.click({ position: { x: 20, y: box.height - 20 } })
  const cleared = await pollHues(
    canvas,
    hues,
    (c) => c.blue < SELECTION_PIXELS,
    'deselecting should clear it',
  )
  expect(cleared.blue, `after deselect: measured ${cleared.blue} px`).toBeLessThan(SELECTION_PIXELS)
})
