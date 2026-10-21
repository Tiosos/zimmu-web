import { expect, test, type Page } from '@playwright/test'
async function start(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('Add cabinet').click()
    await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  }
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByRole('tab', { name: 'Layout', exact: true }).click()
  await page.getByLabel('Layout workspace', { exact: true }).selectOption('fit')
  const fit = page.getByRole('region', { name: 'Fit cabinet run', exact: true })
  await fit
    .getByRole('group', { name: 'Cabinets to fit', exact: true })
    .getByRole('checkbox')
    .nth(1)
    .check()
  await fit.getByLabel('Detach selected anchors when fitting', { exact: true }).check()
  return fit
}
test('fits widths with a fixed cabinet and reserves, applies once and supports undo/redo', async ({
  page,
}) => {
  const fit = await start(page)
  await fit.getByLabel('Target span', { exact: true }).fill('1850')
  await fit.getByLabel('Start reserve', { exact: true }).fill('25')
  await fit.getByLabel('End reserve', { exact: true }).fill('25')
  await fit.getByLabel('Keep width 1', { exact: true }).check()
  await fit.getByRole('button', { name: 'Preview run fit', exact: true }).click()
  await expect(fit.getByRole('table')).toContainText('1200')
  await expect(fit.getByRole('region', { name: 'Run fit preview' })).toContainText('50 mm reserved')
  await fit.getByRole('button', { name: 'Apply run fit', exact: true }).click()
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
  await expect(width).toHaveValue('1200')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Fit cabinet run"/ }).click()
  await expect(width).toHaveValue('600')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Fit cabinet run"/ }).click()
  await expect(width).toHaveValue('1200')
})
test('blocks infeasible constraints and supports bounded equal allocation without early writes', async ({
  page,
}) => {
  const fit = await start(page)
  await fit.getByLabel('Target span', { exact: true }).fill('1800')
  await fit.getByLabel('Maximum width 1', { exact: true }).fill('700')
  await fit.getByRole('button', { name: 'Preview run fit', exact: true }).click()
  await expect(fit.getByRole('table')).toContainText('1100')
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await expect(width).toHaveValue('600')
  await fit.getByLabel('Minimum width 2', { exact: true }).fill('2000')
  await fit.getByRole('button', { name: 'Preview run fit', exact: true }).click()
  await expect(fit.getByRole('alert')).toContainText('cannot fit')
  await expect(fit.getByRole('button', { name: 'Apply run fit', exact: true })).toBeDisabled()
  await fit.getByRole('button', { name: 'Cancel run fit', exact: true }).click()
  await expect(width).toHaveValue('600')
})
