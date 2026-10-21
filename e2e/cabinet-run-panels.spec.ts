import { expect, test, type Page } from '@playwright/test'
async function setup(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('Add cabinet').click()
    await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  }
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
  await page.getByRole('tab', { name: 'Placement', exact: true }).click()
  const placement = page.getByRole('region', { name: 'Cabinet placement editor' })
  await placement.getByLabel('Placement X', { exact: true }).fill('600')
  await placement.getByRole('button', { name: 'Preview cabinet placement', exact: true }).click()
  await placement.getByRole('button', { name: 'Apply cabinet placement', exact: true }).click()
  await page.getByRole('tab', { name: 'Finishing', exact: true }).click()
  await page.getByRole('button', { name: 'Run plinths & splashbacks', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Run finishing panels editor', exact: true })
  for (const box of await editor.getByRole('checkbox', { name: /Panel member/ }).all())
    await box.check()
  return editor
}
test('adds a run plinth, follows a valid width change, edits it and supports undo', async ({
  page,
}) => {
  const editor = await setup(page)
  await editor.getByLabel('Run panel name', { exact: true }).fill('Kitchen plinth')
  await editor.getByLabel('Left run extension', { exact: true }).fill('10')
  await editor.getByRole('button', { name: 'Preview run panel', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Run panel preview' })).toContainText(
    '100 × 1210 × 18 mm',
  )
  for (const view of ['front', 'top', 'end'])
    await expect(editor.getByLabel(`Run panel ${view} preview`).locator('svg')).toBeVisible()
  await editor.getByRole('button', { name: 'Add run panel', exact: true }).click()
  const linked = editor.getByRole('region', { name: 'Linked run finishing panels', exact: true })
  await expect(linked).toContainText('Kitchen plinth')
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await width.fill('700')
  await width.blur()
  await expect(linked).toContainText('1310')
  await editor.getByRole('button', { name: 'Edit linked run panel', exact: true }).click()
  await editor.getByLabel('Right run extension', { exact: true }).fill('20')
  await editor.getByRole('button', { name: 'Preview run panel', exact: true }).click()
  await editor.getByRole('button', { name: 'Save run panel', exact: true }).click()
  await expect(linked).toContainText('1330')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Update run plinth"/ }).click()
  await expect(linked).toContainText('1310')
})
test('adds a splashback with custom dimensions and manages its link with undo', async ({
  page,
}) => {
  const editor = await setup(page)
  await editor.getByLabel('Run panel type', { exact: true }).selectOption('splashback')
  for (const box of await editor.getByRole('checkbox', { name: /Panel member/ }).all())
    await box.check()
  await editor.getByLabel('Run panel height', { exact: true }).fill('150')
  await editor.getByLabel('Splashback top clearance', { exact: true }).fill('10')
  await editor.getByLabel('Splashback rear clearance', { exact: true }).fill('5')
  await editor.getByLabel('Run panel thickness mode', { exact: true }).selectOption('custom')
  await editor.getByLabel('Run panel custom thickness', { exact: true }).fill('24')
  await editor.getByRole('button', { name: 'Preview run panel', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Run panel preview' })).toContainText(
    '150 × 1200 × 24 mm',
  )
  await editor.getByRole('button', { name: 'Add run panel', exact: true }).click()
  await editor.getByRole('button', { name: 'Detach linked run panel', exact: true }).click()
  await expect(editor.getByText('No linked run finishing panels.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Detach run splashback"/ }).click()
  await editor.getByRole('button', { name: 'Delete linked run panel', exact: true }).click()
  await expect(editor.getByText('No linked run finishing panels.', { exact: true })).toBeVisible()
})
