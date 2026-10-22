import { expect, test, type Page } from '@playwright/test'
import { installationFixture } from '../src/scene/__fixtures__/installation'
async function start(page: Page) {
  const f = installationFixture(),
    text = JSON.stringify({
      version: 38,
      name: 'Installation test',
      appVersion: '0',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      scene: f.scene,
      project: f.project,
      camera: { position: { x: 2400, y: -2200, z: 1800 }, target: { x: 1200, y: 200, z: 400 } },
    })
  await page.addInitScript((text) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory(),
          saved = localStorage.getItem('installation-open-saved') === 'yes',
          handle = await root.getFileHandle(
            saved ? 'installation-saved.zimmu' : 'installation-initial.zimmu',
            { create: !saved },
          )
        if (!saved) {
          const writer = await handle.createWritable()
          await writer.write(text)
          await writer.close()
        }
        return [handle]
      },
    })
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory()
        return root.getFileHandle('installation-saved.zimmu', { create: true })
      },
    })
  }, text)
  page.on('dialog', (d) => void d.accept())
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board', exact: true })).toBeEnabled({
    timeout: 120000,
  })
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  return openProject(page)
}
async function openProject(page: Page) {
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: 'Project structure…', exact: true }).click()
  await page.getByRole('button', { name: 'Room installation', exact: true }).click()
  return page.getByRole('region', { name: 'Room installation workspace', exact: true })
}
test('installs a two-cabinet run with one undo/redo operation', async ({ page }) => {
  const e = await start(page)
  await e.getByLabel('Install Base B (b)', { exact: true }).check()
  await e.getByLabel('Installation name', { exact: true }).fill('Kitchen row')
  await e.getByLabel('Cabinet spacing', { exact: true }).fill('50')
  await e.getByLabel('Wall starting offset', { exact: true }).fill('100')
  await e.getByRole('button', { name: 'Preview room installation', exact: true }).click()
  await expect(e.getByRole('table', { name: 'Installed cabinet dimensions' })).toContainText(
    '100.00–700.00',
  )
  await expect(e.getByRole('img', { name: 'Plan installation preview' })).toBeVisible()
  await e.getByRole('button', { name: 'Apply room installation', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Edit Kitchen row', exact: true })).toBeVisible()
  await e.getByRole('button', { name: 'Undo scene change', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Edit Kitchen row', exact: true })).toHaveCount(0)
  await e.getByRole('button', { name: 'Redo scene change', exact: true }).click()
  await e.getByRole('button', { name: 'Edit Kitchen row', exact: true }).click()
  await e.getByRole('button', { name: 'Preview room installation', exact: true }).click()
  await expect(
    e.getByRole('button', { name: 'Apply room installation', exact: true }),
  ).toBeDisabled()
})
test('creates, edits, detaches and deletes a real wall filler', async ({ page }) => {
  const e = await start(page)
  await e.getByRole('button', { name: 'Wall-fitted fillers', exact: true }).click()
  await e.getByLabel('Installation wall', { exact: true }).selectOption('left')
  await e.getByRole('button', { name: 'Preview wall filler', exact: true }).click()
  await expect(e.getByRole('region', { name: 'Installation preview', exact: true })).toContainText(
    '720.00 × 98.00 × 18.00',
  )
  await e.getByRole('button', { name: 'Apply wall filler', exact: true }).click()
  await e.getByRole('button', { name: 'Edit Wall filler', exact: true }).click()
  await e.getByLabel('Wall filler name', { exact: true }).fill('Left filler')
  await e.getByRole('button', { name: 'Preview wall filler', exact: true }).click()
  await e.getByRole('button', { name: 'Apply wall filler', exact: true }).click()
  await e.getByRole('button', { name: 'Detach Left filler', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Edit Left filler', exact: true })).toHaveCount(0)
  await e.getByRole('button', { name: 'Undo scene change', exact: true }).click()
  await e.getByRole('button', { name: 'Delete Left filler', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Edit Left filler', exact: true })).toHaveCount(0)
})
test('follows a room wall edit and preserves the installation through project undo', async ({
  page,
}) => {
  let e = await start(page)
  await e.getByLabel('Position from', { exact: true }).selectOption('end')
  await e.getByRole('button', { name: 'Preview room installation', exact: true }).click()
  await e.getByRole('button', { name: 'Apply room installation', exact: true }).click()
  await page.getByRole('button', { name: 'Room and item settings', exact: true }).click()
  await page.getByLabel('End X', { exact: true }).first().fill('4000')
  await page.getByRole('button', { name: 'Room installation', exact: true }).click()
  e = page.getByRole('region', { name: 'Room installation workspace', exact: true })
  await e.getByRole('button', { name: 'Edit Cabinet installation', exact: true }).click()
  await e.getByRole('button', { name: 'Preview room installation', exact: true }).click()
  await expect(e.getByRole('table', { name: 'Installed cabinet dimensions' })).toContainText(
    '3400.00–4000.00',
  )
  await page.getByRole('button', { name: 'Room and item settings', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.getByRole('button', { name: 'Room installation', exact: true }).click()
  await e.getByRole('button', { name: 'Edit Cabinet installation', exact: true }).click()
  await e.getByRole('button', { name: 'Preview room installation', exact: true }).click()
  await expect(e.getByRole('table', { name: 'Installed cabinet dimensions' })).toContainText(
    '2400.00–3000.00',
  )
})
test('saves and reopens linked filler settings', async ({ page }) => {
  let e = await start(page)
  await e.getByRole('button', { name: 'Wall-fitted fillers', exact: true }).click()
  await e.getByLabel('Installation wall', { exact: true }).selectOption('left')
  await e.getByLabel('Filler grain', { exact: true }).selectOption('width')
  await e.getByRole('button', { name: 'Preview wall filler', exact: true }).click()
  await e.getByRole('button', { name: 'Apply wall filler', exact: true }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Save As…/ }).click()
  await page.evaluate(() => localStorage.setItem('installation-open-saved', 'yes'))
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  e = await openProject(page)
  await e.getByRole('button', { name: 'Edit Wall filler', exact: true }).click()
  await expect(e.getByLabel('Filler grain', { exact: true })).toHaveValue('width')
  await e.getByRole('button', { name: 'Preview wall filler', exact: true }).click()
  await expect(e.getByRole('region', { name: 'Installation preview', exact: true })).toContainText(
    '720.00 × 98.00 × 18.00',
  )
})
test('rejects blank dimensions and unsupported filler walls without writes', async ({ page }) => {
  const e = await start(page)
  await e.getByLabel('Wall starting offset', { exact: true }).fill('')
  await e.getByRole('button', { name: 'Preview room installation', exact: true }).click()
  await expect(e.getByRole('alert')).toContainText('finite')
  await e.getByRole('button', { name: 'Cancel installation changes', exact: true }).click()
  await e.getByRole('button', { name: 'Wall-fitted fillers', exact: true }).click()
  await e.getByRole('button', { name: 'Preview wall filler', exact: true }).click()
  await expect(e.getByRole('alert')).toContainText('Angled')
  await expect(e.getByRole('button', { name: 'Apply wall filler', exact: true })).toBeDisabled()
})
