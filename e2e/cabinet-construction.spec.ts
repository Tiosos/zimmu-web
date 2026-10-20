import { expect, test, type Page } from '@playwright/test'
async function start(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByRole('tab', { name: 'Construction', exact: true }).click()
  return page.getByRole('region', { name: 'Cabinet construction editor' })
}
test('stages coordinated construction changes and applies and undoes them independently of prior sizing', async ({
  page,
}) => {
  const editor = await start(page)
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await width.fill('650')
  await expect(editor.getByRole('alert')).toContainText('cabinet changed')
  await editor.getByRole('button', { name: 'Reset construction draft', exact: true }).click()
  await editor.getByLabel('Draft Width', { exact: true }).fill('750')
  await editor.getByLabel('Draft Depth', { exact: true }).fill('600')
  await editor.getByLabel('Draft Back construction', { exact: true }).selectOption('applied')
  await editor.getByLabel('Draft Base construction', { exact: true }).selectOption('ladder')
  await expect(width).toHaveValue('650')
  await editor.getByRole('button', { name: 'Preview construction', exact: true }).click()
  await expect(editor.getByRole('table')).toContainText('750 × 720 × 600 mm')
  await editor.getByRole('button', { name: 'Apply construction', exact: true }).click()
  await expect(width).toHaveValue('750')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply cabinet construction"/ }).click()
  await expect(width).toHaveValue('650')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Apply cabinet construction"/ }).click()
  await expect(width).toHaveValue('750')
})
test('validates a coordinated face-frame transition without writing invalid intermediate geometry', async ({
  page,
}) => {
  const editor = await start(page)
  await editor.getByLabel('Draft Front mounting', { exact: true }).selectOption('half-overlay')
  await editor.getByRole('button', { name: 'Preview construction', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('face frame')
  await expect(
    editor.getByRole('button', { name: 'Apply construction', exact: true }),
  ).toBeDisabled()
  await editor.getByLabel('Draft Face frame', { exact: true }).check()
  await editor.getByLabel('Draft Edge stile width', { exact: true }).fill('40')
  await editor.getByRole('button', { name: 'Preview construction', exact: true }).click()
  await expect(editor.getByRole('alert')).toHaveCount(0)
  await editor.getByRole('button', { name: 'Apply construction', exact: true }).click()
  await editor.getByLabel('Draft Width', { exact: true }).fill('1')
  await editor.getByRole('button', { name: 'Preview construction', exact: true }).click()
  await expect(
    editor.getByRole('button', { name: 'Apply construction', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Cancel construction changes', exact: true }).click()
  await expect(editor.getByLabel('Draft Width', { exact: true })).toHaveValue('600')
  await expect(editor.getByLabel('Draft Face frame', { exact: true })).toBeChecked()
})
