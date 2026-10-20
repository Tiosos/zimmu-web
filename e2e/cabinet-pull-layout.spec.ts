import { expect, test, type Page } from '@playwright/test'
async function cabinet(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
}
test('stages mirrored pulls on paired doors, applies separately and undoes/redoes drilling', async ({
  page,
}) => {
  await cabinet(page)
  await page.getByRole('tab', { name: 'Fronts & Drawers', exact: true }).click()
  const fronts = page.getByRole('region', { name: 'Cabinet fronts and drawers editor' })
  await fronts.getByRole('button', { name: 'Select all openings', exact: true }).click()
  await fronts.getByRole('button', { name: 'Double doors', exact: true }).click()
  await fronts.getByRole('button', { name: 'Preview fronts and drawers', exact: true }).click()
  await fronts.getByRole('button', { name: 'Apply fronts and drawers', exact: true }).click()
  await page.getByRole('tab', { name: 'Hardware', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet hardware editor' })
  await expect(editor.getByRole('checkbox')).toHaveCount(2)
  await editor.getByRole('button', { name: 'Select all', exact: true }).click()
  await editor.getByRole('button', { name: 'Stage pull settings', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview hardware changes', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Pull hardware quantities' })).toContainText(
    '0 → 2',
  )
  await expect(editor.getByRole('region', { name: 'Pull fixing summary' })).toContainText(
    'diameter 5 mm; through 18 mm',
  )
  for (const view of ['Front', 'Top', 'End'])
    await expect(
      editor.getByRole('region', { name: `Hardware ${view} preview` }).locator('svg'),
    ).toBeVisible()
  await editor.getByRole('button', { name: 'Apply hardware changes', exact: true }).click()
  await expect(editor.getByRole('status')).toContainText('applied')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply cabinet hardware"/ }).click()
  await expect(editor.getByText('No pull configured', { exact: true })).toHaveCount(2)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Apply cabinet hardware"/ }).click()
  await editor.getByRole('button', { name: 'Reset hardware draft', exact: true }).click()
  await editor.getByRole('button', { name: 'Select configured pulls', exact: true }).click()
  await editor.getByRole('button', { name: 'Stage pull removal', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview hardware changes', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Pull hardware quantities' })).toContainText(
    '2 → 0',
  )
  await editor.getByRole('button', { name: 'Cancel hardware changes', exact: true }).click()
  await expect(editor.getByText(/96 mm bar pull/)).toHaveCount(2)
})
test('rejects oversized drawer pulls and applies a centred single-hole knob', async ({ page }) => {
  await cabinet(page)
  await page.getByRole('tab', { name: 'Fronts & Drawers', exact: true }).click()
  const fronts = page.getByRole('region', { name: 'Cabinet fronts and drawers editor' })
  await fronts.getByRole('button', { name: 'Select all openings', exact: true }).click()
  await fronts.getByRole('button', { name: 'Drawer front', exact: true }).click()
  await fronts.getByLabel('Front draft box height').fill('100')
  await fronts.getByRole('button', { name: 'Stage custom box height', exact: true }).click()
  await fronts.getByRole('button', { name: 'Preview fronts and drawers', exact: true }).click()
  await fronts.getByRole('button', { name: 'Apply fronts and drawers', exact: true }).click()
  await page.getByRole('tab', { name: 'Hardware', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet hardware editor' })
  await editor.getByRole('button', { name: 'Select drawer fronts', exact: true }).click()
  await editor.getByLabel('Pull horizontal reference').selectOption('center')
  await editor.getByLabel('Horizontal offset').fill('0')
  await editor.getByLabel('Pull vertical reference').selectOption('center')
  await editor.getByLabel('Vertical offset').fill('0')
  await editor.getByLabel('Fixing pitch').fill('9999')
  await editor.getByRole('button', { name: 'Stage pull settings', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview hardware changes', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('inside the front')
  await expect(
    editor.getByRole('button', { name: 'Apply hardware changes', exact: true }),
  ).toBeDisabled()
  await editor.getByLabel('Pull type').selectOption('knob')
  await expect(editor.getByLabel('Fixing pitch')).toBeDisabled()
  await editor.getByRole('button', { name: 'Stage pull settings', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview hardware changes', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Pull hardware quantities' })).toContainText(
    'Knob',
  )
  await editor.getByRole('button', { name: 'Apply hardware changes', exact: true }).click()
  await expect(editor.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Cutting List/ }).click()
  const bom = page.getByTestId('bom-panel')
  await bom.getByRole('tab', { name: 'Hardware', exact: true }).click()
  const row = bom.getByRole('row').filter({ hasText: 'Knob — 5 mm fixing hole' })
  await expect(row).toHaveCount(1)
  await expect(row.getByRole('cell').nth(2)).toHaveText('1')
})
