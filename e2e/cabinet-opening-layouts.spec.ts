import { expect, test, type Page } from '@playwright/test'

async function addCabinet(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
}
const drawers = (page: Page) =>
  page.locator('[data-testid^="node-cmp_"]').filter({ hasText: /^.*Drawer.*$/ })
async function history(page: Page, action: 'Undo' | 'Redo', label: string) {
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`${action} "${label}"`) }).click()
}

test('previews cabinet fronts, creates real drawer boxes and preserves cabinet sizing across separate undo steps', async ({
  page,
}) => {
  await addCabinet(page)
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await width.fill('720')
  await page.locator('[data-testid^="section-cell-"]').first().click()
  const tools = page.getByRole('region', { name: 'Opening design tools', exact: true })
  await expect(tools.getByText('Clear opening: 684 × 584 mm (width × height).')).toBeVisible()
  await tools.getByRole('combobox', { name: 'Opening layout', exact: true }).selectOption('drawers')
  await tools.getByRole('button', { name: 'Preview opening layout', exact: true }).click()
  await expect(tools.getByRole('region', { name: 'Opening layout preview' })).toBeVisible()
  await expect(drawers(page)).toHaveCount(0)
  await tools.getByRole('button', { name: 'Cancel layout preview', exact: true }).click()
  await expect(drawers(page)).toHaveCount(0)
  await tools.getByRole('button', { name: 'Preview opening layout', exact: true }).click()
  await tools.getByRole('button', { name: 'Apply opening layout', exact: true }).click()
  await expect(drawers(page)).toHaveCount(3)
  await expect(page.locator('[data-testid^="section-cell-"]')).toHaveCount(3)
  await tools
    .getByRole('combobox', { name: 'Opening layout', exact: true })
    .selectOption('double-door')
  await tools.getByRole('button', { name: 'Preview opening layout', exact: true }).click()
  await tools.getByRole('button', { name: 'Apply opening layout', exact: true }).click()
  await expect(drawers(page)).toHaveCount(0)
  await history(page, 'Undo', 'Apply opening layout')
  await expect(drawers(page)).toHaveCount(3)
  await expect(width).toHaveValue('720')
  await history(page, 'Undo', 'Apply opening layout')
  await expect(drawers(page)).toHaveCount(0)
  await expect(page.locator('[data-testid^="section-cell-"]')).toHaveCount(1)
  await expect(width).toHaveValue('720')
  await history(page, 'Undo', 'Edit component')
  await expect(width).toHaveValue('600')
  await history(page, 'Redo', 'Edit component')
  await history(page, 'Redo', 'Apply opening layout')
  await expect(drawers(page)).toHaveCount(3)
})

test('splits and sizes cabinet bays, moves and equalizes them, and returns to the parent layout', async ({
  page,
}) => {
  await addCabinet(page)
  await page.locator('[data-testid^="section-cell-"]').first().click()
  const tools = page.getByRole('region', { name: 'Opening design tools', exact: true })
  await tools.getByRole('combobox', { name: 'Split openings' }).selectOption('3')
  await tools.getByRole('button', { name: 'Split down', exact: true }).click()
  const cells = page.locator('[data-testid^="section-cell-"]')
  await expect(cells).toHaveCount(3)
  await cells.first().click()
  await tools.getByLabel('Size', { exact: true }).click()
  await page.getByRole('option', { name: 'Percent', exact: true }).click()
  await tools.getByLabel('Share', { exact: true }).fill('25')
  await expect(tools.getByText('Clear opening: 132 × 584 mm (width × height).')).toBeVisible()
  const selected = page.locator('[data-testid^="section-cell-"][data-selected="true"]')
  const id = await selected.getAttribute('data-testid')
  await tools.getByRole('button', { name: 'Move opening right', exact: true }).click()
  await expect(cells.nth(1)).toHaveAttribute('data-testid', id!)
  await tools.getByRole('button', { name: 'Reverse opening order', exact: true }).click()
  await tools.getByRole('button', { name: 'Equalize openings', exact: true }).click()
  await expect(tools.getByText('Clear opening: 176 × 584 mm (width × height).')).toBeVisible()
  await tools.getByRole('button', { name: 'Edit parent opening', exact: true }).click()
  await expect(tools.getByRole('button', { name: 'Merge', exact: true })).toBeVisible()
  await tools.getByRole('button', { name: 'Merge', exact: true }).click()
  await expect(cells).toHaveCount(1)
  await tools.getByRole('combobox', { name: 'Split openings' }).selectOption('2')
  await tools.getByRole('button', { name: 'Split down', exact: true }).click()
  for (let index = 0; index < 2; index++) {
    await cells.nth(index).click()
    await tools.getByLabel('Size', { exact: true }).click()
    await page.getByRole('option', { name: 'Fixed', exact: true }).click()
  }
  await page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
    .fill('500')
  await expect(tools.getByRole('alert')).toContainText('sections do not fit')
  await tools.getByRole('button', { name: 'Equalize openings', exact: true }).click()
  await expect(cells).toHaveCount(2)
  await expect(tools.getByText('Clear opening: 223 × 584 mm (width × height).')).toBeVisible()
  await expect(tools.getByRole('alert')).toHaveCount(0)
})
