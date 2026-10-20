import { expect, test, type Page } from '@playwright/test'
async function add(page: Page) {
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
}
test('stages and previews a free placement with a separate undo step', async ({ page }) => {
  await page.goto('/')
  await add(page)
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await width.fill('700')
  await expect(width).toHaveValue('700')
  await width.blur()
  await expect(page.locator('[data-testid^="section-cell-"]').first()).toHaveAttribute(
    'width',
    '664',
  )
  await page.getByRole('tab', { name: 'Placement', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet placement editor' })
  await editor.getByLabel('Placement X', { exact: true }).fill('1200')
  await editor.getByLabel('Placement Y', { exact: true }).fill('100')
  await editor.getByLabel('Placement Z', { exact: true }).fill('50')
  await editor.getByRole('button', { name: 'Rotate right 90°', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview cabinet placement', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Cabinet placement preview' })).toBeVisible()
  await expect(
    editor.getByText('No occupied-envelope overlaps among sibling cabinets.'),
  ).toBeVisible()
  await editor.getByRole('button', { name: 'Apply cabinet placement', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply cabinet placement"/ }).click()
  await expect(width).toHaveValue('700')
  await expect(editor.getByRole('alert')).toContainText('draft is retained')
  await editor.getByRole('button', { name: 'Reset placement draft', exact: true }).click()
  await expect(editor.getByLabel('Placement X', { exact: true })).toHaveValue('0')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Apply cabinet placement"/ }).click()
  await editor.getByRole('button', { name: 'Reset placement draft', exact: true }).click()
  await expect(editor.getByLabel('Placement X', { exact: true })).toHaveValue('1200')
  await expect(editor.getByLabel('Placement Rotation Z', { exact: true })).toHaveValue('90')
})
test('aligns to another cabinet and reports positive-volume overlap without blocking an intentional placement', async ({
  page,
}) => {
  await page.goto('/')
  await add(page)
  await page.getByRole('tab', { name: 'Placement', exact: true }).click()
  const reference = page.getByRole('region', { name: 'Cabinet placement editor' })
  await reference.getByLabel('Placement X', { exact: true }).fill('900')
  await reference.getByRole('button', { name: 'Preview cabinet placement', exact: true }).click()
  await reference.getByRole('button', { name: 'Apply cabinet placement', exact: true }).click()
  await add(page)
  await page.getByRole('tab', { name: 'Placement', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet placement editor' })
  await editor.getByLabel('Placement reference cabinet', { exact: true }).selectOption({ index: 1 })
  await editor.getByRole('button', { name: 'Align left', exact: true }).click()
  await editor.getByRole('button', { name: 'Align front', exact: true }).click()
  await editor.getByRole('button', { name: 'Align bottom', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview cabinet placement', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Placement overlap warnings' })).toContainText(
    'Occupied envelopes overlap',
  )
  await expect(
    editor.getByRole('button', { name: 'Apply cabinet placement', exact: true }),
  ).toBeEnabled()
  await editor.getByRole('button', { name: 'Apply cabinet placement', exact: true }).click()
  await expect(editor.getByText('No placement changes staged.')).toBeVisible()
  await editor.getByLabel('Placement X', { exact: true }).fill('')
  await editor.getByRole('button', { name: 'Preview cabinet placement', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('finite')
  await expect(
    editor.getByRole('button', { name: 'Apply cabinet placement', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Cancel placement changes', exact: true }).click()
  await expect(editor.getByRole('alert')).toHaveCount(0)
})
