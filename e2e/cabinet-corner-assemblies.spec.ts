import { expect, test, type Page } from '@playwright/test'
import { cornerScene } from '../src/scene/__fixtures__/corners'
async function start(page: Page) {
  const text = JSON.stringify({
    version: 37,
    name: 'Corner test',
    appVersion: '0',
    units: 'mm',
    createdAt: '',
    updatedAt: '',
    camera: { position: { x: 1800, y: -1800, z: 1600 }, target: { x: 600, y: 0, z: 400 } },
    scene: cornerScene(),
  })
  await page.addInitScript((text) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory(),
          handle = await root.getFileHandle('corner-test.zimmu', { create: true }),
          writer = await handle.createWritable()
        await writer.write(text)
        await writer.close()
        return [handle]
      },
    })
  }, text)
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board', exact: true })).toBeEnabled({
    timeout: 120000,
  })
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  await page.getByTestId('node-a').click()
  await page.getByRole('tab', { name: 'Finishing', exact: true }).click()
  await page.getByRole('button', { name: 'Corner assemblies', exact: true }).click()
  return page.getByRole('region', { name: 'Corner assembly editor', exact: true })
}
async function history(page: Page, action: 'Undo' | 'Redo', label = 'Apply corner assembly') {
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`${action} "${label}"`) }).click()
}
test('detects a corner, previews boards, applies and undoes the entire assembly', async ({
  page,
}) => {
  const editor = await start(page)
  await editor.getByRole('button', { name: 'Find corner runs', exact: true }).click()
  await editor.getByRole('button', { name: 'Use corner with Return', exact: true }).click()
  await editor.getByLabel('Assembly name', { exact: true }).fill('Kitchen corner')
  await editor.getByLabel('Joint clearance', { exact: true }).fill('2')
  await editor.getByRole('button', { name: 'Preview corner assembly', exact: true }).click()
  await expect(editor.getByRole('table', { name: 'Corner board dimensions' })).toContainText(
    '1238.00',
  )
  await expect(editor.getByRole('img', { name: 'Corner joint plan preview' })).toBeVisible()
  await editor.getByRole('button', { name: 'Apply corner assembly', exact: true }).click()
  const saved = editor.getByRole('region', { name: 'Saved corner assemblies', exact: true })
  await expect(
    saved.getByRole('button', { name: 'Edit Kitchen corner', exact: true }),
  ).toBeVisible()
  await history(page, 'Undo')
  await editor.getByRole('button', { name: 'Reset corner draft', exact: true }).click()
  await expect(saved.getByRole('button', { name: 'Edit Kitchen corner', exact: true })).toHaveCount(
    0,
  )
  await history(page, 'Redo')
  await editor.getByRole('button', { name: 'Edit Kitchen corner', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview corner assembly', exact: true }).click()
  await expect(
    editor.getByRole('button', { name: 'Apply corner assembly', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Detach Kitchen corner', exact: true }).click()
  await expect(saved.getByRole('button')).toHaveCount(0)
})
for (const profile of ['plinth', 'splashback'])
  test(`creates ${profile} corner returns with edit and deletion`, async ({ page }) => {
    const editor = await start(page)
    await editor.getByLabel('Corner profile', { exact: true }).selectOption(profile)
    await editor.getByLabel('Leg 2: Return', { exact: true }).check()
    await editor.getByLabel('Add exposed end return for leg 1', { exact: true }).check()
    await editor.getByLabel('Add exposed end return for leg 2', { exact: true }).check()
    await editor.getByRole('button', { name: 'Preview corner assembly', exact: true }).click()
    await expect(
      editor.getByRole('table', { name: 'Corner board dimensions' }).locator('tbody tr'),
    ).toHaveCount(4)
    await editor.getByRole('button', { name: 'Apply corner assembly', exact: true }).click()
    await editor.getByRole('button', { name: 'Edit Corner assembly', exact: true }).click()
    await expect(editor.getByLabel('Corner profile', { exact: true })).toHaveValue(profile)
    await editor.getByRole('button', { name: 'Delete Corner assembly', exact: true }).click()
    await expect(
      editor
        .getByRole('region', { name: 'Saved corner assemblies', exact: true })
        .getByRole('button'),
    ).toHaveCount(0)
    await history(page, 'Undo', 'Delete corner assembly')
    await expect(
      editor.getByRole('button', { name: 'Edit Corner assembly', exact: true }),
    ).toBeVisible()
  })
test('rejects empty joint clearance and cancels without creating boards', async ({ page }) => {
  const editor = await start(page)
  await editor.getByLabel('Leg 2: Return', { exact: true }).check()
  await editor.getByLabel('Joint clearance', { exact: true }).fill('')
  await editor.getByRole('button', { name: 'Preview corner assembly', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('clearance')
  await expect(
    editor.getByRole('button', { name: 'Apply corner assembly', exact: true }),
  ).toBeDisabled()
  await editor.getByRole('button', { name: 'Cancel corner changes', exact: true }).click()
  await expect(
    editor
      .getByRole('region', { name: 'Saved corner assemblies', exact: true })
      .getByRole('button'),
  ).toHaveCount(0)
})
