import { expect, test, type Page } from '@playwright/test'

// A made front is five boards where a flat door was one. The two things worth proving in a browser
// are that the stage/preview/apply path carries the style through, and that a frame the hinge cup
// cannot be bored into is refused at the gesture rather than applied as something else.
async function addCabinet(page: Page) {
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).last().click()
}

async function frontsEditor(page: Page) {
  await page.getByRole('tab', { name: 'Fronts & Drawers', exact: true }).click()
  return page.getByRole('region', { name: 'Cabinet fronts and drawers editor' })
}

test('stages, previews and applies a shaker door as five boards', async ({ page }) => {
  await page.goto('/')
  await addCabinet(page)
  const editor = await frontsEditor(page)

  await editor.getByRole('button', { name: 'Select door openings', exact: true }).click()
  await editor.getByRole('button', { name: 'Stage shaker fronts', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Staged front and drawer edits' })).toContainText(
    'shaker 60 / 6 / 6',
  )

  await editor.getByRole('button', { name: 'Preview fronts and drawers' }).click()
  const changes = editor.getByRole('region', { name: 'Front board changes' })
  await expect(changes).toContainText('stile-l')
  await expect(changes).toContainText('stile-r')
  await expect(changes).toContainText('rail-t')
  await expect(changes).toContainText('rail-b')
  await expect(changes).toContainText('panel')
  // The opening still wears one door: the pieces are its construction, not extra openings.
  await expect(page.locator('[data-testid^="section-cell-"]')).toHaveCount(1)

  await editor.getByRole('button', { name: 'Apply fronts and drawers' }).click()
  await expect(editor.getByRole('alert')).toHaveCount(0)

  // Undo puts the flat door back, one board again, and the applied draft is gone.
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply fronts and drawers"/ }).click()
  await editor.getByRole('button', { name: 'Select door openings', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview fronts and drawers' }).click()
  await expect(
    editor.getByRole('region', { name: 'Fronts and drawers preview' }),
  ).toContainText('No design changes to apply.')
})

test('refuses a shaker frame that leaves no room for the hinge cup', async ({ page }) => {
  await page.goto('/')
  await addCabinet(page)
  const editor = await frontsEditor(page)

  await editor.getByRole('button', { name: 'Select door openings', exact: true }).click()
  await editor.getByLabel('Front draft shaker frame width').fill('20')
  await editor.getByRole('button', { name: 'Stage shaker fronts', exact: true }).click()

  await expect(editor.getByRole('alert')).toContainText('hinge cup')
  await expect(editor.getByRole('region', { name: 'Staged front and drawer edits' })).toContainText(
    'No staged edits.',
  )
  await expect(editor.getByRole('button', { name: 'Apply fronts and drawers' })).toBeDisabled()
})

test('keeps a staged style when the opening is re-staged to the other hinge', async ({ page }) => {
  await page.goto('/')
  await addCabinet(page)
  const editor = await frontsEditor(page)

  await editor.getByRole('button', { name: 'Select door openings', exact: true }).click()
  await editor.getByRole('button', { name: 'Stage shaker fronts', exact: true }).click()
  await editor.getByRole('button', { name: 'Right-hinged door', exact: true }).click()
  await expect(editor.getByRole('region', { name: 'Staged front and drawer edits' })).toContainText(
    'shaker 60 / 6 / 6',
  )
  await editor.getByRole('button', { name: 'Preview fronts and drawers' }).click()
  await expect(editor.getByRole('region', { name: 'Front board changes' })).toContainText('stile-l')
})
