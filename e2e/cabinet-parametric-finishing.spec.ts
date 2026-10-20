import { expect, test } from '@playwright/test'

test('linked worktop follows cabinet resizing, supports in-place editing, detach and undo', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  const cabinet = page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last()
  await cabinet.click()
  await page.getByRole('tab', { name: 'Finishing', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Cabinet finishing editor' })
  await editor.getByLabel('Follow cabinet dimensions').check()
  await editor.getByLabel('Finishing board name').fill('Linked kitchen top')
  await editor.getByLabel('Left overhang').fill('10')
  await editor.getByRole('button', { name: 'Preview finishing board', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Finishing board size summary' })).toContainText(
    '610.00',
  )
  await editor.getByRole('button', { name: 'Add finishing board', exact: true }).click()
  const linked = editor.getByRole('region', {
    name: 'Linked panel Linked kitchen top',
    exact: true,
  })
  await expect(linked).toContainText('610.00')
  const board = page
    .locator('[data-testid^="node-board_"]')
    .filter({ hasText: 'Linked kitchen top' })
  const id = await board.getAttribute('data-testid')
  await page.getByRole('tab', { name: 'Section', exact: true }).click()
  const width = page
    .getByRole('region', { name: 'Cabinet parameters' })
    .getByLabel('Width', { exact: true })
  await width.fill('800')
  await width.blur()
  await expect(page.locator('[data-testid^="section-cell-"]').first()).toHaveAttribute(
    'width',
    '764',
  )
  await page.getByRole('tab', { name: 'Finishing', exact: true }).click()
  await expect(linked).toContainText('810.00')
  await linked.getByRole('button', { name: 'Edit linked panel', exact: true }).click()
  await editor.getByLabel('Right overhang').fill('20')
  await editor.getByRole('button', { name: 'Preview finishing board', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Finishing board size summary' })).toContainText(
    '830.00',
  )
  await editor.getByRole('button', { name: 'Save finishing board', exact: true }).click()
  await expect(board).toHaveAttribute('data-testid', id!)
  await expect(linked).toContainText('830.00')
  await linked.getByRole('button', { name: 'Detach linked panel', exact: true }).click()
  await expect(linked).toHaveCount(0)
  await expect(board).toHaveCount(1)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Detach finishing board"/ }).click()
  await expect(linked).toContainText('830.00')
  await linked.getByRole('button', { name: 'Delete linked panel', exact: true }).click()
  await expect(board).toHaveCount(0)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Delete finishing board"/ }).click()
  await expect(board).toHaveCount(1)
})
