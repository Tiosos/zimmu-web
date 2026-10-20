import { expect, test, type Page } from '@playwright/test'
async function add(page: Page) {
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
}
async function setup(page: Page) {
  await page.goto('/')
  await add(page)
  await add(page)
  await page.getByRole('tab', { name: 'Placement', exact: true }).click()
  const placement = page.getByRole('region', { name: 'Cabinet placement editor' })
  await placement.getByLabel('Placement X', { exact: true }).fill('600')
  await placement.getByRole('button', { name: 'Preview cabinet placement', exact: true }).click()
  await placement.getByRole('button', { name: 'Apply cabinet placement', exact: true }).click()
  await page.getByRole('tab', { name: 'Finishing', exact: true }).click()
  await page.getByRole('button', { name: 'Run-spanning worktops', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Run worktop editor' })
  for (const checkbox of await editor.getByRole('checkbox', { name: /Base 600/ }).all())
    await checkbox.check()
  return editor
}
test('previews, adds, edits and detaches one continuous worktop with undo', async ({ page }) => {
  const editor = await setup(page)
  await editor.getByLabel('Run worktop name').fill('Continuous kitchen top')
  await editor.getByLabel('Left overhang').fill('10')
  await editor.getByLabel('Right overhang').fill('20')
  await editor.getByRole('button', { name: 'Preview run worktop', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Run worktop preview' })).toContainText(
    '1230.00 × 598.00 × 18.00',
  )
  for (const view of ['Front', 'Top', 'End'])
    await expect(
      editor.getByRole('region', { name: `Run worktop ${view} preview` }).locator('svg'),
    ).toBeVisible()
  const board = page
    .locator('[data-testid^="node-board_"]')
    .filter({ hasText: 'Continuous kitchen top' })
  await expect(board).toHaveCount(0)
  await editor.getByRole('button', { name: 'Add run worktop', exact: true }).click()
  await expect(board).toHaveCount(1)
  await editor.getByRole('button', { name: 'Edit run worktop', exact: true }).click()
  await editor.getByLabel('Right overhang').fill('40')
  await editor.getByRole('button', { name: 'Preview run worktop', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Run worktop preview' })).toContainText(
    '1250.00 × 598.00 × 18.00',
  )
  await editor.getByRole('button', { name: 'Save run worktop', exact: true }).click()
  await expect(board).toHaveCount(1)
  await editor.getByRole('button', { name: 'Detach run worktop', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Edit run worktop', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Detach run worktop"/ }).click()
  await expect(editor.getByRole('button', { name: 'Edit run worktop', exact: true })).toBeVisible()
})
test('rejects incomplete selections and creates a fixed custom worktop', async ({ page }) => {
  const editor = await setup(page)
  await editor.getByRole('button', { name: 'Clear cabinet selection', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview run worktop', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('two distinct')
  for (const checkbox of await editor.getByRole('checkbox', { name: /Base 600/ }).all())
    await checkbox.check()
  for (const checkbox of await editor.getByRole('checkbox', { name: /Base 600/ }).all())
    await checkbox.check()
  await editor.getByLabel('Run worktop thickness source').selectOption('custom')
  await editor.getByLabel('Run worktop custom thickness').fill('30')
  await editor.getByLabel('Follow cabinet run').uncheck()
  await editor.getByRole('button', { name: 'Preview run worktop', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Run worktop preview' })).toContainText(
    '1200.00 × 598.00 × 30.00',
  )
  await editor.getByRole('button', { name: 'Add run worktop', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Edit run worktop', exact: true })).toHaveCount(0)
})
