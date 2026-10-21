import { expect, test, type Page } from '@playwright/test'
async function start(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByRole('tab', { name: 'Shelves & Interiors', exact: true }).click()
  return page.getByRole('region', { name: 'Shelves and interiors editor', exact: true })
}
test('previews real shelves and drilling, applies with undo and redo, and removes interiors', async ({
  page,
}) => {
  const editor = await start(page)
  await editor.getByRole('button', { name: 'Select all editable openings', exact: true }).click()
  await editor.getByLabel('Adjustable shelf count', { exact: true }).fill('2')
  await editor.getByRole('button', { name: 'Stage shelf settings', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview interiors', exact: true }).click()
  await expect(
    editor.getByRole('table', { name: 'Proposed shelf boards' }).locator('tbody tr'),
  ).toHaveCount(2)
  await editor.getByRole('button', { name: 'Apply interiors', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply cabinet interiors"/ }).click()
  await editor.getByRole('button', { name: 'Reset interiors draft', exact: true }).click()
  await expect(editor.getByRole('list')).toContainText('1 adjustable')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Apply cabinet interiors"/ }).click()
  await editor.getByRole('button', { name: 'Reset interiors draft', exact: true }).click()
  await expect(editor.getByRole('list')).toContainText('2 adjustable')
  await editor.getByRole('button', { name: 'Select all editable openings', exact: true }).click()
  await editor.getByRole('button', { name: 'Remove shelves and drilling', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview interiors', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Interiors preview' })).toContainText(
    'Proposed pin bores: 0',
  )
  await editor.getByRole('button', { name: 'Apply interiors', exact: true }).click()
  await expect(editor.getByRole('list')).toContainText('0 adjustable')
})
test('rejects drilling outside the side panels and cancels without writes', async ({ page }) => {
  const editor = await start(page)
  await editor.getByRole('button', { name: 'Select all editable openings', exact: true }).click()
  await editor.getByLabel('Adjustable shelf count', { exact: true }).fill('2')
  await editor.getByLabel('Front pin setback', { exact: true }).fill('9999')
  await editor.getByRole('button', { name: 'Stage shelf settings', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview interiors', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('outside')
  await expect(editor.getByRole('button', { name: 'Apply interiors', exact: true })).toBeDisabled()
  await editor.getByRole('button', { name: 'Cancel interior changes', exact: true }).click()
  await expect(editor.getByRole('list')).toContainText('1 adjustable')
})
