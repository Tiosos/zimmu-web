import { expect, test, type Page } from '@playwright/test'
import { grainFixture } from '../src/scene/__fixtures__/grainMatch'
test.use({ viewport: { width: 1280, height: 1100 } })
async function openWorkspace(page: Page) {
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: 'Front Grain Matching…', exact: true }).click()
  return page.getByRole('complementary', { name: 'Front grain matching workspace' })
}
async function start(page: Page) {
  const f = grainFixture(),
    text = JSON.stringify({
      version: 40,
      name: 'Grain browser',
      appVersion: '0',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      scene: f.scene,
      project: f.project,
      camera: { position: { x: 1600, y: -2000, z: 1500 }, target: { x: 300, y: 200, z: 400 } },
    })
  await page.addInitScript((text) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory(),
          saved = localStorage.getItem('grain-reopen') === 'yes',
          h = await root.getFileHandle(saved ? 'grain-saved.zimmu' : 'grain-initial.zimmu', {
            create: !saved,
          })
        if (!saved) {
          const w = await h.createWritable()
          await w.write(text)
          await w.close()
        }
        return [h]
      },
    })
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory()
        return root.getFileHandle('grain-saved.zimmu', { create: true })
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
  await expect(page).toHaveTitle(/Grain browser/)
  return openWorkspace(page)
}
async function add(e: ReturnType<Page['getByRole']>) {
  await e.getByRole('button', { name: 'Add visible fronts', exact: true }).click()
  await e.getByLabel('Grain group name', { exact: true }).fill('Kitchen fronts')
  await e.getByRole('button', { name: 'Preview grain matching', exact: true }).click()
}
test('previews paired fronts and applies with independent undo, redo and no-op checks', async ({
  page,
}) => {
  const e = await start(page)
  await add(e)
  await expect(e.getByRole('region', { name: 'Grain matching preview' })).toContainText(
    '632.00 × 738.00',
  )
  await expect(e.getByRole('img', { name: 'Installed grain matching preview' })).toBeVisible()
  await expect(e.getByRole('img', { name: 'Cutting blank grain matching preview' })).toBeVisible()
  await e.getByRole('button', { name: 'Apply grain matching', exact: true }).click()
  await expect(
    e.getByRole('button', { name: 'Edit grain group Kitchen fronts', exact: true }),
  ).toBeVisible()
  await e.getByRole('button', { name: 'Undo grain change', exact: true }).click()
  await expect(
    e.getByRole('button', { name: 'Edit grain group Kitchen fronts', exact: true }),
  ).toHaveCount(0)
  await e.getByRole('button', { name: 'Redo grain change', exact: true }).click()
  await e.getByRole('button', { name: 'Edit grain group Kitchen fronts', exact: true }).click()
  await e.getByRole('button', { name: 'Preview grain matching', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Apply grain matching', exact: true })).toBeDisabled()
})
test('rejects blank dimensions, explains cutting clearance and cancels without writing', async ({
  page,
}) => {
  const e = await start(page)
  await e.getByRole('button', { name: 'Add visible fronts', exact: true }).click()
  await e.getByLabel('Blank margin', { exact: true }).fill('')
  await e.getByRole('button', { name: 'Preview grain matching', exact: true }).click()
  await expect(e.getByRole('alert')).toContainText('finite')
  await e.getByRole('button', { name: 'Cancel grain changes', exact: true }).click()
  await add(e)
  await e.getByLabel('Additional cutting gap', { exact: true }).fill('0')
  await e.getByRole('button', { name: 'Preview grain matching', exact: true }).click()
  await expect(e.getByRole('status')).toContainText('cutting gaps')
  await e.getByRole('button', { name: 'Cancel grain changes', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Apply grain matching', exact: true })).toBeDisabled()
  await expect(
    e.getByRole('button', { name: 'Edit grain group Kitchen fronts', exact: true }),
  ).toHaveCount(0)
})
test('saves and reopens a matched group and downloads its sequence CSV', async ({ page }) => {
  let e = await start(page)
  await add(e)
  await e.getByRole('button', { name: 'Apply grain matching', exact: true }).click()
  const download = page.waitForEvent('download')
  await e.getByRole('button', { name: 'Export saved grain sequence CSV', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('grain-matching.csv')
  await e.getByRole('button', { name: 'Close grain matching', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Save As…/ }).click()
  await page.waitForFunction(async () => {
    try {
      const r = await navigator.storage.getDirectory(),
        h = await r.getFileHandle('grain-saved.zimmu')
      return (await (await h.getFile()).text()).includes('grainMatches')
    } catch {
      return false
    }
  })
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^New/ }).click()
  await expect(page).toHaveTitle(/Untitled/)
  await page.evaluate(() => localStorage.setItem('grain-reopen', 'yes'))
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  await expect(page).toHaveTitle(/Grain browser/)
  e = await openWorkspace(page)
  await e.getByRole('button', { name: 'Edit grain group Kitchen fronts', exact: true }).click()
  await e.getByRole('button', { name: 'Preview grain matching', exact: true }).click()
  await expect(e.getByRole('region', { name: 'Grain matching preview' })).toContainText(
    '632.00 × 738.00',
  )
  await e.getByRole('button', { name: 'Detach grain group Kitchen fronts', exact: true }).click()
  await expect(
    e.getByRole('button', { name: 'Edit grain group Kitchen fronts', exact: true }),
  ).toHaveCount(0)
})
test('preserves the complete group through the real sheet-nesting worker', async ({ page }) => {
  const e = await start(page)
  await add(e)
  await e.getByRole('button', { name: 'Apply grain matching', exact: true }).click()
  await e.getByRole('button', { name: 'Close grain matching', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Cutting List/ }).click()
  const panel = page.getByTestId('bom-panel')
  await panel.getByRole('tab', { name: 'Sheets', exact: true }).click()
  await expect(panel.locator('svg [data-grain-group]')).toHaveCount(1, { timeout: 60000 })
  await expect(panel.getByText(/Matched blank: Kitchen fronts/)).toBeVisible()
  await expect(panel.locator('svg title').filter({ hasText: 'Sequence 1/2' })).toHaveCount(1)
  await expect(panel.locator('svg title').filter({ hasText: 'Sequence 2/2' })).toHaveCount(1)
})
