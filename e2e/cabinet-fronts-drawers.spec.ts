import { expect, test, type Page } from '@playwright/test'
async function addCabinet(page: Page) {
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
}
const drawers = (page: Page) =>
  page.locator('[data-testid^="node-cmp_"]').filter({ hasText: /Drawer/ })
test('previews coordinated drawer settings and applies them separately from cabinet sizing', async ({
  page,
}) => {
  await page.goto('/')
  await addCabinet(page)
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await width.fill('700')
  await width.blur()
  await expect(page.locator('[data-testid^="section-cell-"]').first()).toHaveAttribute(
    'width',
    '664',
  )
  await page.getByRole('tab', { name: 'Fronts & Drawers', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet fronts and drawers editor' })
  await editor.getByRole('button', { name: 'Select all openings', exact: true }).click()
  await editor.getByRole('button', { name: 'Drawer front', exact: true }).click()
  await editor.getByLabel('Front draft box height').fill('100')
  await editor.getByRole('button', { name: 'Stage custom box height' }).click()
  await editor.getByRole('button', { name: 'Stage undermount runners' }).click()
  await editor.getByLabel('Front draft drawer material').selectOption('18mm Ply')
  await editor.getByRole('button', { name: 'Stage drawer material' }).click()
  await expect(drawers(page)).toHaveCount(0)
  await editor.getByRole('button', { name: 'Preview fronts and drawers' }).click()
  await expect(
    editor.getByRole('region', { name: 'Proposed front elevation' }).locator('svg'),
  ).toBeVisible()
  await expect(editor.getByRole('region', { name: 'Front hardware changes' })).toContainText(
    'runner',
  )
  await expect(editor.getByRole('region', { name: 'Front board changes' })).toContainText('100.00')
  await editor.getByRole('button', { name: 'Apply fronts and drawers' }).click()
  await expect(drawers(page)).toHaveCount(1)
  await expect(editor.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply fronts and drawers"/ }).click()
  await expect(drawers(page)).toHaveCount(0)
  await page.getByRole('tab', { name: 'Section', exact: true }).click()
  await expect(width).toHaveValue('700')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Apply fronts and drawers"/ }).click()
  await expect(drawers(page)).toHaveCount(1)
})
test('edits multiple openings, validates shelf interference and invalid offsets, then cancels', async ({
  page,
}) => {
  await page.goto('/')
  await addCabinet(page)
  await page.locator('[data-testid^="section-cell-"]').first().click()
  const tools = page.getByRole('region', { name: 'Opening design tools', exact: true })
  await tools.getByRole('combobox', { name: 'Split openings', exact: true }).selectOption('2')
  await tools.getByRole('button', { name: 'Split down', exact: true }).click()
  await expect(page.locator('[data-testid^="section-cell-"]')).toHaveCount(2)
  await page.getByRole('tab', { name: 'Fronts & Drawers', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet fronts and drawers editor' })
  await editor.getByRole('button', { name: 'Select all openings', exact: true }).click()
  await expect(editor.getByRole('checkbox', { checked: true })).toHaveCount(2)
  await editor.getByRole('button', { name: 'Drawer front', exact: true }).click()
  await editor.getByRole('button', { name: 'Stage automatic box height' }).click()
  await editor.getByRole('button', { name: 'Preview fronts and drawers' }).click()
  await expect(editor.getByRole('alert')).toContainText('intersects a shelf')
  await expect(editor.getByRole('button', { name: 'Apply fronts and drawers' })).toBeDisabled()
  await editor.getByLabel('Front draft box height').fill('100')
  await editor.getByRole('button', { name: 'Stage custom box height' }).click()
  await editor.getByRole('button', { name: 'Preview fronts and drawers' }).click()
  await expect(editor.getByRole('button', { name: 'Apply fronts and drawers' })).toBeEnabled()
  await editor.getByLabel('Front draft runner offset').fill('9999')
  await editor.getByRole('button', { name: 'Stage runner offset' }).click()
  await editor.getByRole('button', { name: 'Preview fronts and drawers' }).click()
  await expect(editor.getByRole('alert')).toContainText('does not fit')
  await editor.getByRole('button', { name: 'Cancel front changes' }).click()
  await expect(drawers(page)).toHaveCount(0)
  await expect(editor.getByRole('region', { name: 'Staged front and drawer edits' })).toContainText(
    'No staged edits.',
  )
})
