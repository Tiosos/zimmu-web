import { test, expect } from '@playwright/test'
import { changedFraction, isNonBlank } from './canvas'

test('selected shelf opens a real insertion preview without editing the cabinet', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  const shelf = page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Adj Shelf' })
  await expect(shelf).toHaveCount(1)
  const before = await page.getByTestId(/^node-board_/).count()
  await shelf.click()
  await page.getByRole('button', { name: 'Preview shelf insertion' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('status')).toHaveText('Straight insertion')
  const canvas = dialog.locator('canvas')
  await expect.poll(async () => isNonBlank(await canvas.screenshot())).toBe(true)
  const start = await canvas.screenshot()
  await dialog.getByRole('slider').focus()
  await page.keyboard.press('End')
  await expect(dialog.getByRole('button', { name: 'Replay' })).toBeVisible()
  await expect
    .poll(async () => changedFraction(start, await canvas.screenshot()))
    .toBeGreaterThan(0.001)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId(/^node-board_/)).toHaveCount(before)
  await expect(shelf).toHaveCount(1)
  // The section entry point also remains available, including for requested but declined shelves.
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByRole('button', { name: /Shelving/ }).click()
  await page.locator('[data-testid^="section-cell-"]').first().click()
  await page.getByRole('button', { name: 'Preview shelf insertion' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close preview' }).click()
})
