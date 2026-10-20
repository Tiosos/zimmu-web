import { expect, test, type Page } from '@playwright/test'
async function addCabinet(page: Page) {
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
}
test('adds a worktop from a three-view preview and undoes it separately from cabinet sizing', async ({
  page,
}) => {
  await page.goto('/')
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
  await page.getByRole('tab', { name: 'Finishing', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet finishing editor' })
  await editor.getByLabel('Finishing board name').fill('Kitchen worktop')
  await editor.getByLabel('Left overhang').fill('10')
  await editor.getByLabel('Right overhang').fill('20')
  await editor.getByRole('button', { name: 'Preview finishing board', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Finishing board size summary' })).toContainText(
    '730.00 × 598.00 × 18.00',
  )
  for (const view of ['Front', 'Top', 'End'])
    await expect(
      editor.getByRole('region', { name: `Finishing ${view} preview` }).locator('svg'),
    ).toBeVisible()
  const board = page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Kitchen worktop' })
  await expect(board).toHaveCount(0)
  await editor.getByRole('button', { name: 'Add finishing board', exact: true }).click()
  await expect(board).toHaveCount(1)
  await expect(editor.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Add finishing board"/ }).click()
  await expect(board).toHaveCount(0)
  await page.getByRole('tab', { name: 'Section', exact: true }).click()
  await expect(width).toHaveValue('700')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Add finishing board"/ }).click()
  await expect(board).toHaveCount(1)
  await width.fill('800')
  await width.blur()
  await expect(page.locator('[data-testid^="section-cell-"]').first()).toHaveAttribute(
    'width',
    '764',
  )
  await board.click()
  await expect(page.getByLabel('L', { exact: true }).first()).toHaveValue('730')
})
test('creates a custom filler and rejects invalid plinth setback without changing the cabinet', async ({
  page,
}) => {
  await page.goto('/')
  await addCabinet(page)
  await page.getByRole('tab', { name: 'Finishing', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet finishing editor' })
  await editor.getByLabel('Finishing panel type').selectOption('left-filler')
  await editor.getByLabel('Finishing board name').fill('Left scribe filler')
  await editor.getByLabel('Panel height').fill('500')
  await editor.getByLabel('Filler width').fill('75')
  await editor.getByLabel('Finishing thickness source').selectOption('custom')
  await editor.getByLabel('Finishing custom thickness').fill('25')
  await editor.getByLabel('Finishing grain').selectOption('width')
  await editor.getByRole('button', { name: 'Preview finishing board' }).click()
  await expect(editor.getByRole('region', { name: 'Finishing board size summary' })).toContainText(
    '500.00 × 75.00 × 25.00',
  )
  await expect(editor.getByRole('region', { name: 'Finishing board size summary' })).toContainText(
    'differs from stock',
  )
  await editor.getByRole('button', { name: 'Add finishing board', exact: true }).click()
  await expect(
    page.locator('[data-testid^="node-board_"]').filter({ hasText: 'Left scribe filler' }),
  ).toHaveCount(1)
  await editor.getByLabel('Finishing panel type').selectOption('plinth')
  await editor.getByLabel('Plinth setback').fill('1000')
  await editor.getByRole('button', { name: 'Preview finishing board' }).click()
  await expect(editor.getByRole('alert')).toContainText('occupied depth')
  await expect(
    editor.getByRole('button', { name: 'Add finishing board', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Cancel finishing changes' }).click()
  await expect(editor.getByRole('alert')).toHaveCount(0)
  await expect(editor.getByRole('region', { name: 'Finishing board preview' })).toHaveCount(0)
})
