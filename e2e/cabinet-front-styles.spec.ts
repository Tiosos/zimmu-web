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
  // The opening still wears one door: the pieces are its construction, not extra openings. Read
  // that off the opening selection the editor itself lists — the section elevation belongs to the
  // Section tab, so its cells are not on screen here.
  await expect(editor.getByRole('checkbox')).toHaveCount(1)

  await editor.getByRole('button', { name: 'Apply fronts and drawers' }).click()
  await expect(editor.getByRole('alert')).toHaveCount(0)

  // Undo puts the flat door back. The editor then guards its draft: the cabinet changed under it, so
  // it asks for a Reset before any further staging — that guard is the behaviour worth pinning here.
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply fronts and drawers"/ }).click()
  await expect(editor.getByRole('alert')).toContainText('Reset the front draft')
  await editor.getByRole('button', { name: 'Reset front draft', exact: true }).click()
  // The draft is empty again, so there is nothing left to apply and the opening is back to a door.
  await expect(editor.getByRole('region', { name: 'Staged front and drawer edits' })).toContainText(
    'No staged edits.',
  )
  await expect(editor.getByRole('button', { name: 'Apply fronts and drawers' })).toBeDisabled()
  await expect(editor.getByRole('checkbox')).toHaveCount(1)
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
