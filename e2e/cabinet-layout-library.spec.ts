import { expect, test, type Page } from '@playwright/test'

async function addCabinet(page: Page) {
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
  await page.locator('[data-testid^="section-cell-"]').first().click()
}
async function library(page: Page) {
  await page.getByText('Personal layout library', { exact: true }).click()
  return page.getByRole('region', { name: 'Saved cabinet layouts', exact: true })
}
const drawers = (page: Page) =>
  page.locator('[data-testid^="node-cmp_"]').filter({ hasText: /Drawer/ })

test('saves a drawer layout, restores it on reload and applies it to another cabinet with independent undo', async ({
  page,
}) => {
  await page.goto('/')
  await addCabinet(page)
  const tools = page.getByRole('region', { name: 'Opening design tools', exact: true })
  await tools.getByRole('combobox', { name: 'Opening layout', exact: true }).selectOption('drawers')
  await tools.getByRole('button', { name: 'Preview opening layout', exact: true }).click()
  await tools.getByRole('button', { name: 'Apply opening layout', exact: true }).click()
  await expect(drawers(page)).toHaveCount(3)
  let saved = await library(page)
  await saved.getByLabel('Layout name', { exact: true }).fill('Kitchen drawer stack')
  await saved.getByRole('button', { name: 'Save cabinet layout', exact: true }).click()
  await expect(saved.getByText('Layout saved locally.', { exact: true })).toBeVisible()
  await page.reload()
  await addCabinet(page)
  saved = await library(page)
  await saved.getByRole('button', { name: /Kitchen drawer stack/ }).click()
  await saved
    .getByRole('combobox', { name: 'Apply layout to', exact: true })
    .selectOption('cabinet')
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await width.fill('720')
  await width.blur()
  await expect(page.locator('[data-testid^="section-cell-"]').first()).toHaveAttribute(
    'width',
    '684',
  )
  await page.locator('[data-testid^="section-cell-"]').first().click()
  await saved.getByRole('button', { name: 'Preview saved layout', exact: true }).click()
  await expect(saved.getByRole('region', { name: 'Saved layout preview' })).toBeVisible()
  await expect(drawers(page)).toHaveCount(0)
  await saved.getByRole('button', { name: 'Apply saved layout', exact: true }).click()
  await expect(drawers(page)).toHaveCount(3)
  await expect(width).toHaveValue('720')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply saved cabinet layout"/ }).click()
  await expect(drawers(page)).toHaveCount(0)
  await expect(width).toHaveValue('720')
})

test('exports and imports layout JSON, manages names and protects a layout from accidental deletion', async ({
  page,
}) => {
  await page.goto('/')
  await addCabinet(page)
  const saved = await library(page)
  await saved.getByLabel('Layout name', { exact: true }).fill('Kitchen bay')
  await saved.getByRole('button', { name: 'Save selected opening', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await saved.getByRole('button', { name: 'Export selected layout', exact: true }).click()
  const file = await downloaded
  const path = await file.path()
  expect(path).toBeTruthy()
  await saved.getByLabel('Import layout JSON', { exact: true }).setInputFiles(path!)
  await expect(saved.getByText('1 layouts imported.', { exact: true })).toBeVisible()
  await expect(saved.getByRole('list').getByRole('button')).toHaveCount(2)
  await saved.getByLabel('Layout name', { exact: true }).fill('Utility bay')
  await saved.getByRole('button', { name: 'Rename saved layout', exact: true }).click()
  await saved.getByRole('button', { name: 'Duplicate saved layout', exact: true }).click()
  await saved.getByLabel('Search layouts', { exact: true }).fill('utility')
  await expect(saved.getByRole('list').getByRole('button')).toHaveCount(2)
  await saved.getByRole('combobox', { name: 'Sort layouts', exact: true }).selectOption('oldest')
  await saved.getByRole('button', { name: 'Delete saved layout', exact: true }).click()
  await saved.getByRole('button', { name: 'Cancel delete layout', exact: true }).click()
  await expect(saved.getByRole('list').getByRole('button')).toHaveCount(2)
  await saved.getByRole('button', { name: 'Delete saved layout', exact: true }).click()
  await saved.getByRole('button', { name: 'Confirm delete layout', exact: true }).click()
  await expect(saved.getByRole('list').getByRole('button')).toHaveCount(1)
  await saved
    .getByLabel('Import layout JSON', { exact: true })
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await expect(saved.getByRole('alert')).toContainText('Unsupported cabinet layout file version')
  await expect(saved.getByRole('list').getByRole('button')).toHaveCount(1)
})
