import { expect, test, type Page } from '@playwright/test'
async function add(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
}
async function motion(page: Page) {
  await page.getByRole('tab', { name: 'Hardware', exact: true }).click()
  await page.getByRole('button', { name: 'Hinges & Runners', exact: true }).click()
  return page.getByRole('region', { name: 'Hinges and runners editor' })
}
test('stages three hinges, previews plates and undoes the applied layout', async ({ page }) => {
  await add(page)
  const editor = await motion(page)
  await editor.getByRole('button', { name: 'Select all door leaves', exact: true }).click()
  await editor.getByLabel('Hinge count mode', { exact: true }).selectOption('manual')
  await editor.getByLabel('Manual hinge count', { exact: true }).fill('3')
  await editor.getByLabel('Hinge inset mode', { exact: true }).selectOption('manual')
  await editor.getByLabel('Hinge end inset', { exact: true }).fill('75')
  await editor.getByRole('button', { name: 'Stage hinge layout', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview hinges and runners', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Hinges and runners preview' })).toContainText(
    '3 cups',
  )
  for (const view of ['Front', 'Top', 'End'])
    await expect(
      editor.getByRole('region', { name: `Motion ${view} preview` }).locator('svg'),
    ).toBeVisible()
  await editor.getByRole('button', { name: 'Apply hinges and runners', exact: true }).click()
  await expect(editor.getByRole('status')).toContainText('applied')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply hinges and runners"/ }).click()
  await editor.getByRole('button', { name: 'Reset hardware draft', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Door hinge targets' })).toContainText('2 cups')
})
test('shortens a drawer to a selected nominal and rejects an oversized runner', async ({
  page,
}) => {
  await add(page)
  await page.getByRole('tab', { name: 'Fronts & Drawers', exact: true }).click()
  const fronts = page.getByRole('region', { name: 'Cabinet fronts and drawers editor' })
  await fronts.getByRole('button', { name: 'Select all openings', exact: true }).click()
  await fronts.getByRole('button', { name: 'Drawer front', exact: true }).click()
  await fronts.getByLabel('Front draft box height', { exact: true }).fill('100')
  await fronts.getByRole('button', { name: 'Stage custom box height', exact: true }).click()
  await fronts.getByRole('button', { name: 'Preview fronts and drawers', exact: true }).click()
  await fronts.getByRole('button', { name: 'Apply fronts and drawers', exact: true }).click()
  const editor = await motion(page)
  await editor.getByRole('button', { name: 'Select all drawer openings', exact: true }).click()
  await editor.getByLabel('Motion runner nominal', { exact: true }).selectOption('400')
  await editor.getByRole('button', { name: 'Preview hinges and runners', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Hinges and runners preview' })).toContainText(
    '400',
  )
  await editor.getByRole('button', { name: 'Apply hinges and runners', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Drawer runner targets' })).toContainText(
    'nominal 400',
  )
  await editor.getByLabel('Motion runner nominal', { exact: true }).selectOption('600')
  await editor.getByRole('button', { name: 'Preview hinges and runners', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('fit')
  await expect(
    editor.getByRole('button', { name: 'Apply hinges and runners', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Cancel hardware changes', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Drawer runner targets' })).toContainText(
    'nominal 400',
  )
})
