import { expect, test, type Page } from '@playwright/test'

async function addCabinet(page: Page) {
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
}
test('arranges a staged multi-cabinet run and undoes it independently of sizing', async ({
  page,
}) => {
  await page.goto('/')
  await addCabinet(page)
  await addCabinet(page)
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
  await page.getByRole('tab', { name: 'Layout', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Multi-cabinet layout editor' })
  await editor.getByRole('button', { name: 'Select all sibling cabinets' }).click()
  const positions = editor.getByRole('region', { name: 'Staged cabinet positions' })
  const rows = positions.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await editor.getByLabel('Layout run gap').fill('25')
  await editor.getByRole('button', { name: 'Arrange along X', exact: true }).click()
  await expect(rows.nth(1).locator('td').nth(0)).toHaveText('625.00')
  await expect(rows.nth(2).locator('td').nth(0)).toHaveText('1250.00')
  await expect(
    editor.getByRole('button', { name: 'Apply cabinet layout', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Preview cabinet layout', exact: true }).click()
  await expect(
    editor.getByText('No occupied-envelope overlaps among sibling cabinets.', { exact: true }),
  ).toBeVisible()
  await editor.getByRole('button', { name: 'Apply cabinet layout', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply cabinet layout"/ }).click()
  await editor.getByRole('button', { name: 'Reset layout draft' }).click()
  await expect(positions.locator('tbody tr td').nth(0)).toHaveText('0.00')
  await page.getByRole('tab', { name: 'Section', exact: true }).click()
  await expect(width).toHaveValue('700')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Apply cabinet layout"/ }).click()
  await page.getByRole('tab', { name: 'Layout', exact: true }).click()
  await expect(
    editor.getByRole('region', { name: 'Staged cabinet positions' }).locator('tbody tr td').nth(0),
  ).toHaveText('1250.00')
})
test('reorders, translates and aligns a selection, reports overlaps, and cancels without writing', async ({
  page,
}) => {
  await page.goto('/')
  await addCabinet(page)
  await addCabinet(page)
  await page.getByRole('tab', { name: 'Layout', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Multi-cabinet layout editor' })
  await editor.getByRole('button', { name: 'Select all sibling cabinets' }).click()
  await editor.getByRole('button', { name: 'Reverse layout order' }).click()
  await editor.getByLabel('Layout offset X').fill('100')
  await editor.getByRole('button', { name: 'Stage selection move' }).click()
  await editor.getByRole('button', { name: 'Align left', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview cabinet layout' }).click()
  await expect(editor.getByRole('region', { name: 'Layout overlap warnings' })).toBeVisible()
  await expect(
    editor.getByRole('button', { name: 'Apply cabinet layout', exact: true }),
  ).toBeEnabled()
  await editor.getByLabel('Layout offset Y').fill('')
  await expect(editor.getByRole('region', { name: 'Cabinet layout preview' })).toHaveCount(0)
  await editor.getByRole('button', { name: 'Stage selection move' }).click()
  await expect(editor.getByRole('alert')).toContainText('finite')
  await editor.getByRole('button', { name: 'Cancel layout changes' }).click()
  await expect(
    editor.getByRole('region', { name: 'Staged cabinet positions' }).locator('tbody tr td').nth(0),
  ).toHaveText('0.00')
  await editor.getByRole('button', { name: 'Preview cabinet layout' }).click()
  await expect(editor.getByText('No staged layout changes.')).toBeVisible()
  await expect(
    editor.getByRole('button', { name: 'Apply cabinet layout', exact: true }),
  ).toBeDisabled()
})
