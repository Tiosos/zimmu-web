import { test, expect } from '@playwright/test'

const OCCT_READY_TIMEOUT = 120_000

// The unit tests prove the handlers; only a browser proves a control is in the tab order and that
// Enter/Space reach it through real focus. Scene-tree rows and the elevation's opening cells are
// not <button>s, so each needs tabIndex and a key handler of its own.
test.describe('keyboard operation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
      timeout: OCCT_READY_TIMEOUT,
    })
    await page.getByLabel('Add cabinet').click()
    await page.getByRole('option', { name: 'Base 600' }).click()
  })

  for (const [key, label] of [
    ['Enter', 'Enter'],
    ['Space', 'Space'],
  ] as const) {
    test(`an opening cell takes focus and is picked with ${label}`, async ({ page }) => {
      await page
        .locator('[data-testid^="node-cmp_"]')
        .filter({ hasText: 'Base 600' })
        .first()
        .click()
      const cell = page.getByRole('button', { name: 'Select opening 1' })
      await cell.focus()
      await expect(cell).toBeFocused()
      await expect(cell).toHaveAttribute('aria-pressed', 'false')
      await page.keyboard.press(key)
      await expect(cell).toHaveAttribute('aria-pressed', 'true')
    })
  }

  test('a scene-tree row takes focus and is selected with Enter', async ({ page }) => {
    const row = page
      .locator('[data-testid^="node-board_"]')
      .filter({ hasText: 'Left Side' })
      .first()
    await row.focus()
    await expect(row).toBeFocused()
    await expect(row).toHaveAttribute('aria-selected', 'false')
    await page.keyboard.press('Enter')
    await expect(row).toHaveAttribute('aria-selected', 'true')
  })

  test('the scene tree moves with the arrow keys and folds with Left and Right', async ({
    page,
  }) => {
    const cabinet = page
      .locator('[data-testid^="node-cmp_"]')
      .filter({ hasText: 'Base 600' })
      .first()
    await cabinet.focus()
    await expect(cabinet).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('ArrowDown')
    const second = page.locator(':focus')
    await expect(second).toHaveAttribute('role', 'treeitem')
    await expect(second).not.toHaveText(/Base 600/)
    await page.keyboard.press('ArrowUp')
    await expect(cabinet).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(cabinet).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('ArrowRight')
    await expect(cabinet).toHaveAttribute('aria-expanded', 'true')
  })

  test('the cutting list traps Tab inside the dialog and Escape closes it', async ({ page }) => {
    await page.getByRole('button', { name: /^File/ }).click()
    await page.getByRole('button', { name: /Cutting List/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Bill of materials' })
    await expect(dialog).toBeVisible()
    const inside = () => dialog.evaluate((d) => d.contains(document.activeElement))
    await expect.poll(inside).toBe(true)
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      expect(await inside()).toBe(true)
    }
    await page.keyboard.press('Shift+Tab')
    expect(await inside()).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('the scene tree is one tab stop and arrow-focusing a row does not make Delete hit another', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '+ Board' }).click()
    await page.getByRole('button', { name: '+ Board' }).click()
    const rows = page.locator('[role="treeitem"]')
    const stops = rows.evaluateAll(
      (els) => els.filter((e) => (e as HTMLElement).tabIndex === 0).length,
    )
    await expect.poll(() => stops).toBe(1)
    const boards = page
      .locator('[data-testid^="node-board_"]')
      .filter({ hasNotText: /Side|Top|Bottom|Back|Shelf|Door|Kick/ })
    const before = await page.locator('[data-testid^="node-board_"]').count()
    // The newest board is selected; focus the other with the arrow keys and press Delete.
    const first = boards.first()
    await first.focus()
    await expect(first).toBeFocused()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-testid^="node-board_"]')).toHaveCount(before)
    // The guard is about focus, not about the selection having moved on: the original board stays.
    await expect(first).toHaveAttribute('aria-selected', 'false')
    // Enter selects the focused row (the app then moves focus to its name field).
    await page.keyboard.press('Enter')
    await expect(first).toHaveAttribute('aria-selected', 'true')
  })

  test('closing a dialog opened from the File menu returns focus to the File button', async ({
    page,
  }) => {
    const file = page.getByRole('button', { name: /^File/ })
    await file.click()
    await page.getByRole('button', { name: /Cutting List/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Bill of materials' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(file).toBeFocused()
  })
})
