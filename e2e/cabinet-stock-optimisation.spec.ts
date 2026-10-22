import { expect, test, type Page } from '@playwright/test'
import { stockFixture, stockOption } from '../src/nest/__fixtures__/stock'
test.use({ viewport: { width: 1440, height: 1100 } })
async function workspace(page: Page) {
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: 'Stock Optimisation…', exact: true }).click()
  return page.getByRole('complementary', { name: 'Stock optimisation workspace' })
}
async function start(page: Page) {
  const f = stockFixture(1)
  f.plan.stocks = [stockOption({ quantity: 2 })]
  f.scene.stockPlan = f.plan
  const text = JSON.stringify({
    version: 41,
    name: 'Stock browser',
    appVersion: '0',
    units: 'mm',
    createdAt: '',
    updatedAt: '',
    scene: f.scene,
    project: f.project,
    camera: { position: { x: 300, y: -500, z: 300 }, target: { x: 50, y: 20, z: 0 } },
  })
  await page.addInitScript((text) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory(),
          saved = localStorage.getItem('stock-reopen') === 'yes',
          h = await root.getFileHandle(saved ? 'stock-saved.zimmu' : 'stock-initial.zimmu', {
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
        return root.getFileHandle('stock-saved.zimmu', { create: true })
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
  await expect(page).toHaveTitle(/Stock browser/)
  return workspace(page)
}
test('previews strategy comparisons and downloads allocations and stock SVG', async ({ page }) => {
  const e = await start(page)
  await e.getByRole('button', { name: 'Preview stock optimisation', exact: true }).click()
  await expect(e.getByRole('region', { name: 'Stock optimisation preview' })).toContainText(
    'Single-size baseline',
  )
  await expect(e.locator('svg [data-usable-stock]')).toHaveCount(1)
  let download = page.waitForEvent('download')
  await e
    .getByRole('button', { name: 'Export stock allocation and purchase list', exact: true })
    .click()
  expect((await download).suggestedFilename()).toBe('stock-allocation.csv')
  download = page.waitForEvent('download')
  await e.getByRole('button', { name: 'Export stock sheet 1', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('stock-sheet-1.svg')
  await expect(e.getByRole('button', { name: 'Save stock settings', exact: true })).toBeDisabled()
})
test('consumes finite inventory and selected remnants with undo and redo', async ({ page }) => {
  const e = await start(page)
  await e.getByRole('button', { name: 'Preview stock optimisation', exact: true }).click()
  await e.getByLabel('Keep remnant 0:0', { exact: true }).check()
  await e
    .getByRole('button', { name: 'Consume stock and save selected remnants', exact: true })
    .click()
  await expect(e.getByRole('status')).toContainText('Stock consumed')
  await e.getByRole('button', { name: 'Reload stock settings', exact: true }).click()
  await expect(e.locator('details').first().locator('summary')).toContainText('1 available')
  await expect(e.locator('details')).toHaveCount(2)
  await e.getByRole('button', { name: 'Undo stock change', exact: true }).click()
  await e.getByRole('button', { name: 'Reload stock settings', exact: true }).click()
  await expect(e.locator('details')).toHaveCount(1)
  await expect(e.locator('details').first().locator('summary')).toContainText('2 available')
  await e.getByRole('button', { name: 'Redo stock change', exact: true }).click()
  await e.getByRole('button', { name: 'Reload stock settings', exact: true }).click()
  await expect(e.locator('details')).toHaveCount(2)
})
test('validates inventory dimensions and finite offcut quantity', async ({ page }) => {
  const e = await start(page)
  await e.locator('details').first().locator('summary').click()
  await e.getByLabel('Stock length s', { exact: true }).fill('')
  await expect(e.getByRole('alert')).toContainText('dimensions')
  await expect(
    e.getByRole('button', { name: 'Preview stock optimisation', exact: true }),
  ).toBeDisabled()
  await e.getByLabel('Stock length s', { exact: true }).fill('220')
  await e.getByRole('button', { name: 'Add reusable offcut', exact: true }).click()
  const off = e.locator('details').last()
  await off.locator('summary').click()
  await off.locator('input[aria-label^="Stock quantity"]').fill('')
  await expect(e.getByRole('alert')).toContainText('finite quantity')
})
test('saves and reopens project-local stock settings', async ({ page }) => {
  let e = await start(page)
  await e.getByLabel('Stock strategy', { exact: true }).selectOption('offcut-first')
  await e.getByRole('button', { name: 'Preview stock optimisation', exact: true }).click()
  await e.getByRole('button', { name: 'Save stock settings', exact: true }).click()
  await e.getByRole('button', { name: 'Close stock optimisation', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Save As…/ }).click()
  await page.waitForFunction(async () => {
    try {
      const r = await navigator.storage.getDirectory(),
        h = await r.getFileHandle('stock-saved.zimmu')
      return (await (await h.getFile()).text()).includes('offcut-first')
    } catch {
      return false
    }
  })
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^New/ }).click()
  await expect(page).toHaveTitle(/Untitled/)
  await page.evaluate(() => localStorage.setItem('stock-reopen', 'yes'))
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  await expect(page).toHaveTitle(/Stock browser/)
  e = await workspace(page)
  await expect(e.getByLabel('Stock strategy', { exact: true })).toHaveValue('offcut-first')
  await expect(e.locator('details').first().locator('summary')).toContainText('2 available')
})
