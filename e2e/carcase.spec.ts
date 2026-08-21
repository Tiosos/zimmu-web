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

  // A Base 600 emits 7 roles: two sides, bottom, top, back, toe kick, one shelf.
  await expect(page.getByTestId(/^node-board_/)).toHaveCount(partsBefore + 7)
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
  await detachedRow.click()
  await expect(length).toHaveValue('999')

  // Now change the cabinet. Every driven board follows; the detached one does not.
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByLabel('Depth').fill('600')

  // The freed `left-side` role regenerates, so two boards now share the label — which is
  // precisely why the detached one carries a marker.
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
