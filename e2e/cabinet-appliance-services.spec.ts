import { expect, test, type Page } from '@playwright/test'
async function start(page: Page, tab: 'Appliance Bays' | 'Service Openings') {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board', exact: true })).toBeEnabled({
    timeout: 120000,
  })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600', exact: true }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByRole('tab', { name: tab, exact: true }).click()
  return page.getByRole('region', {
    name: tab === 'Appliance Bays' ? 'Appliance bays editor' : 'Service openings editor',
    exact: true,
  })
}
async function history(page: Page, action: 'Undo' | 'Redo', label: string) {
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`${action} "${label}"`) }).click()
}
test('saves an appliance bay with dimensions, views and undo/redo, then removes it', async ({
  page,
}) => {
  const editor = await start(page, 'Appliance Bays')
  await editor.getByLabel('Bay name', { exact: true }).fill('Oven bay')
  await editor.getByLabel('Appliance category', { exact: true }).selectOption('Oven')
  await editor.getByLabel('Appliance width', { exact: true }).fill('400')
  await editor.getByLabel('Left clearance', { exact: true }).fill('10')
  await editor.getByLabel('Right clearance', { exact: true }).fill('15')
  await editor.getByRole('button', { name: 'Preview appliance bay', exact: true }).click()
  await expect(editor.getByRole('table', { name: 'Appliance opening fit' })).toContainText('425.0')
  for (const view of ['Front', 'Top', 'End'])
    await expect(editor.getByRole('img', { name: `${view} appliance fit` })).toBeVisible()
  await editor.getByRole('button', { name: 'Save appliance bay', exact: true }).click()
  const saved = editor.getByRole('list', { name: 'Saved appliance bays' })
  await expect(saved).toContainText('Oven bay')
  await history(page, 'Undo', 'Save appliance bay')
  await editor.getByRole('button', { name: 'Reset appliance draft', exact: true }).click()
  await expect(saved.locator('li')).toHaveCount(0)
  await history(page, 'Redo', 'Save appliance bay')
  await editor.getByRole('button', { name: 'Reset appliance draft', exact: true }).click()
  await editor.getByRole('button', { name: 'Edit Oven bay', exact: true }).click()
  await expect(editor.getByLabel('Appliance width', { exact: true })).toHaveValue('400')
  await editor.getByRole('button', { name: 'Remove Oven bay', exact: true }).click()
  await editor.getByRole('button', { name: 'Remove appliance bay', exact: true }).click()
  await expect(saved.locator('li')).toHaveCount(0)
})
test('rejects blank body dimensions and shows installation-space issues without writing', async ({
  page,
}) => {
  const editor = await start(page, 'Appliance Bays')
  await editor.getByLabel('Appliance width', { exact: true }).fill('')
  await editor.getByRole('button', { name: 'Preview appliance bay', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('finite')
  await expect(
    editor.getByRole('button', { name: 'Save appliance bay', exact: true }),
  ).toBeDisabled()
  await editor.getByLabel('Appliance width', { exact: true }).fill('1000')
  await editor.getByRole('button', { name: 'Preview appliance bay', exact: true }).click()
  await expect(editor.getByRole('list', { name: 'Appliance fit issues' })).toContainText('width')
  await editor.getByRole('button', { name: 'Cancel appliance changes', exact: true }).click()
  await expect(
    editor.getByRole('list', { name: 'Saved appliance bays' }).locator('li'),
  ).toHaveCount(0)
})
test('associates a real service hole with a saved bay and supports undo/redo', async ({ page }) => {
  const appliance = await start(page, 'Appliance Bays')
  await appliance.getByLabel('Bay name', { exact: true }).fill('Oven bay')
  await appliance.getByRole('button', { name: 'Preview appliance bay', exact: true }).click()
  await appliance.getByRole('button', { name: 'Save appliance bay', exact: true }).click()
  await page.getByRole('tab', { name: 'Service Openings', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Service openings editor', exact: true })
  await editor
    .getByLabel('Service panel', { exact: true })
    .selectOption({ label: 'Back · Carcase' })
  await editor.getByLabel('Service feature name', { exact: true }).fill('Cable access')
  await editor
    .getByLabel('Associated appliance bay', { exact: true })
    .selectOption({ label: 'Oven bay' })
  await editor.getByRole('button', { name: 'Stage service feature', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview service openings', exact: true }).click()
  await expect(
    editor.getByRole('table', { name: 'Resolved service openings' }).locator('tbody tr'),
  ).toHaveCount(1)
  await expect(editor.getByRole('img', { name: 'Service panel machining preview' })).toBeVisible()
  await editor.getByRole('button', { name: 'Apply service openings', exact: true }).click()
  await history(page, 'Undo', 'Apply service openings')
  await editor.getByRole('button', { name: 'Reset service draft', exact: true }).click()
  await expect(
    editor.getByRole('list', { name: 'Staged service features' }).locator('li'),
  ).toHaveCount(0)
  await history(page, 'Redo', 'Apply service openings')
  await editor.getByRole('button', { name: 'Reset service draft', exact: true }).click()
  await expect(editor.getByRole('list', { name: 'Staged service features' })).toContainText(
    'Cable access',
  )
})
test('previews repeated blind slots, removes them, and rejects overlapping duplicates', async ({
  page,
}) => {
  const editor = await start(page, 'Service Openings')
  await editor
    .getByLabel('Service panel', { exact: true })
    .selectOption({ label: 'Back · Carcase' })
  await editor.getByRole('button', { name: 'New service cut-out / slot', exact: true }).click()
  await editor.getByLabel('Service feature name', { exact: true }).fill('Vent slots')
  await editor.getByLabel('Opening width', { exact: true }).fill('10')
  await editor.getByLabel('Repeat count', { exact: true }).fill('3')
  await editor.getByLabel('Repeat pitch', { exact: true }).fill('15')
  await editor.getByLabel('Machining face', { exact: true }).selectOption('-Z')
  await editor.getByLabel('Service depth mode', { exact: true }).selectOption('blind')
  await editor.getByLabel('Blind recess depth', { exact: true }).fill('3')
  await editor.getByRole('button', { name: 'Stage service feature', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview service openings', exact: true }).click()
  await expect(
    editor.getByRole('table', { name: 'Resolved service openings' }).locator('tbody tr'),
  ).toHaveCount(3)
  await editor.getByRole('button', { name: 'Apply service openings', exact: true }).click()
  await editor.getByRole('button', { name: 'Clear service features', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview service openings', exact: true }).click()
  await expect(
    editor.getByRole('table', { name: 'Resolved service openings' }).locator('tbody tr'),
  ).toHaveCount(0)
  await editor.getByRole('button', { name: 'Apply service openings', exact: true }).click()
  await history(page, 'Undo', 'Apply service openings')
  await editor.getByRole('button', { name: 'Reset service draft', exact: true }).click()
  await editor.getByRole('button', { name: 'Duplicate Vent slots', exact: true }).click()
  await editor.getByRole('button', { name: 'Stage service feature', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview service openings', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('overlap')
  await expect(
    editor.getByRole('button', { name: 'Apply service openings', exact: true }),
  ).toBeDisabled()
})
