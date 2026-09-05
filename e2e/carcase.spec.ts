import { test, expect } from '@playwright/test'

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
  // This click is also the only thing in the repo pinning the opening number's `pointer-events-none`
  // (`SectionElevation.tsx`). Playwright clicks an element's centre, which is exactly where the
  // digit is painted, and its actionability check fails on the intercepting `<text>` — measured:
  // removing that class fails this test and the next one, while the whole Vitest suite stays green,
  // because happy-dom loads no stylesheet. Do not retarget this click to a corner or an offset; the
  // coverage is incidental and would vanish silently.
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
  // Centre-click, load-bearing for `pointer-events-none` as well — see the note in the shelf-count
  // test above.
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
