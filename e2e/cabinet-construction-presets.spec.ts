import { expect, test, type Page } from '@playwright/test'
async function start(page: Page) {
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
  await page.getByRole('tab', { name: 'Construction', exact: true }).click()
  await page.getByText('Personal construction presets', { exact: true }).click()
  return page.getByRole('region', { name: 'Cabinet construction editor', exact: true })
}
test('persists construction settings, reuses them at destination size and applies with undo', async ({
  page,
}) => {
  await page.goto('/')
  let editor = await start(page)
  await editor.getByLabel('Draft Width', { exact: true }).fill('900')
  await editor.getByLabel('Draft Joint method', { exact: true }).selectOption('dowel')
  await editor.getByLabel('Draft Back construction', { exact: true }).selectOption('applied')
  await editor.getByLabel('Construction preset name', { exact: true }).fill('Workshop dowelled')
  await editor.getByLabel('Construction preset description', { exact: true }).fill('Applied back')
  await editor.getByRole('button', { name: 'Save construction preset', exact: true }).click()
  await expect(
    editor.getByText('Construction preset saved locally.', { exact: true }),
  ).toBeVisible()
  await page.reload()
  editor = await start(page)
  await editor.getByRole('button', { name: 'Workshop dowelled Applied back', exact: true }).click()
  await editor.getByRole('button', { name: 'Stage construction preset', exact: true }).click()
  await expect(editor.getByLabel('Draft Width', { exact: true })).toHaveValue('600')
  await expect(editor.getByLabel('Draft Back construction', { exact: true })).toHaveValue('applied')
  await editor.getByRole('button', { name: 'Preview construction', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Construction preview' })).toBeVisible()
  await editor.getByRole('button', { name: 'Apply construction', exact: true }).click()
  await expect(editor.getByLabel('Draft Joint method', { exact: true })).toHaveValue('dowel')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply cabinet construction"/ }).click()
  await editor.getByRole('button', { name: 'Reset construction draft', exact: true }).click()
  await expect(editor.getByLabel('Draft Joint method', { exact: true })).toHaveValue('butt-screw')
  await expect(editor.getByRole('list').getByRole('button')).toHaveCount(1)
})
test('exports and imports independent copies and supports selective reuse', async ({ page }) => {
  await page.goto('/')
  const editor = await start(page)
  await editor.getByLabel('Draft Joint method', { exact: true }).selectOption('dowel')
  await editor.getByLabel('Construction preset name', { exact: true }).fill('Kitchen')
  await editor.getByRole('button', { name: 'Save construction preset', exact: true }).click()
  const download = page.waitForEvent('download')
  await editor
    .getByRole('button', { name: 'Export selected construction preset', exact: true })
    .click()
  const path = await (await download).path()
  expect(path).toBeTruthy()
  await editor.getByLabel('Import construction preset JSON', { exact: true }).setInputFiles(path!)
  await expect(editor.getByText('1 construction presets imported.', { exact: true })).toBeVisible()
  await expect(editor.getByRole('list').getByRole('button')).toHaveCount(2)
  await editor.getByRole('button', { name: 'Reset construction draft', exact: true }).click()
  const presets = editor.getByRole('region', { name: 'Construction preset library', exact: true })
  await presets.getByLabel('Joint method', { exact: true }).uncheck()
  await expect(
    presets.getByRole('button', { name: 'Stage construction preset', exact: true }),
  ).toBeDisabled()
  await presets.getByLabel('Joint method', { exact: true }).check()
  await expect(
    presets.getByRole('button', { name: 'Stage construction preset', exact: true }),
  ).toBeEnabled()
  await presets.getByRole('button', { name: 'Delete construction preset', exact: true }).click()
  await presets.getByRole('button', { name: 'Confirm delete preset', exact: true }).click()
  await expect(presets.getByRole('list').getByRole('button')).toHaveCount(1)
})
