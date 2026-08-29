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

  // The preset's single opening, named by its size. Picking it explicitly is what the test is for.
  await page.getByLabel('Opening').click()
  await page.getByRole('option', { name: /^Opening 1/ }).click()

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
  await expect(page.getByRole('tab', { name: 'Section' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
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
