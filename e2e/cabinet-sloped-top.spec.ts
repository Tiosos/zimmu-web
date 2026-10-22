import { expect, test, type Page } from '@playwright/test'
import { slopeFixture } from '../src/scene/__fixtures__/slope'
test.use({ viewport: { width: 1440, height: 1100 } })
async function workspace(page: Page) {
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: 'Sloped-Top Cabinets…', exact: true }).click()
  return page.getByRole('complementary', { name: 'Sloped top cabinet workspace' })
}
async function start(page: Page, captured = false) {
  const f = slopeFixture()
  if (captured) {
    const c = f.scene.components.find((c) => c.kind === 'carcase')!
    c.params.backMode = 'captured'
  }
  const text = JSON.stringify({
    version: 42,
    name: 'Slope browser',
    appVersion: '0',
    units: 'mm',
    createdAt: '',
    updatedAt: '',
    scene: f.scene,
    project: f.project,
    camera: { position: { x: 1600, y: -2000, z: 1400 }, target: { x: 300, y: 200, z: 400 } },
  })
  await page.addInitScript((text) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory(),
          saved = localStorage.getItem('slope-reopen') === 'yes',
          h = await root.getFileHandle(saved ? 'slope-saved.zimmu' : 'slope-initial.zimmu', {
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
        return root.getFileHandle('slope-saved.zimmu', { create: true })
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
  await expect(page).toHaveTitle(/Slope browser/)
  return workspace(page)
}
test('previews generated roof profiles and applies with undo, redo and schedule download', async ({
  page,
}) => {
  const e = await start(page)
  await e.getByLabel('Enable sloped top', { exact: true }).check()
  await e.getByRole('button', { name: 'Preview sloped cabinet', exact: true }).click()
  await expect(e.getByRole('img', { name: 'Sloped cabinet elevation' })).toBeVisible()
  await expect(
    e.getByRole('img', { name: 'Sloped cabinet generated panel projection' }),
  ).toBeVisible()
  await expect(e.getByRole('region', { name: 'Sloped cabinet preview' })).toContainText(
    '800.00 → 600.00',
  )
  const download = page.waitForEvent('download')
  await e.getByRole('button', { name: 'Export sloped panel schedule', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('sloped-panel-schedule.csv')
  await e.getByRole('button', { name: 'Apply sloped cabinet', exact: true }).click()
  await expect(
    e.getByText('Slope settings applied. Reload to continue.', { exact: true }),
  ).toBeVisible()
  await e.getByRole('button', { name: 'Undo slope change', exact: true }).click()
  await e.getByRole('button', { name: 'Reload slope settings', exact: true }).click()
  await expect(e.getByLabel('Enable sloped top', { exact: true })).not.toBeChecked()
  await e.getByRole('button', { name: 'Redo slope change', exact: true }).click()
  await e.getByRole('button', { name: 'Reload slope settings', exact: true }).click()
  await expect(e.getByLabel('Enable sloped top', { exact: true })).toBeChecked()
})
test('drives depth slopes by angle and rejects blank heights before applying', async ({ page }) => {
  const e = await start(page)
  await e.getByLabel('Enable sloped top', { exact: true }).check()
  await e.getByLabel('First roof height (mm)', { exact: true }).fill('')
  await e.getByRole('button', { name: 'Preview sloped cabinet', exact: true }).click()
  await expect(e.getByRole('alert')).toContainText('finite')
  await expect(e.getByRole('button', { name: 'Apply sloped cabinet', exact: true })).toBeDisabled()
  await e.getByLabel('First roof height (mm)', { exact: true }).fill('800')
  await e.getByLabel('Slope axis', { exact: true }).selectOption('depth')
  await e.getByLabel('Slope angle (degrees)', { exact: true }).fill('10')
  expect(
    Number(await e.getByLabel('Opposite roof height (mm)', { exact: true }).inputValue()),
  ).toBeGreaterThan(800)
  await e.getByRole('button', { name: 'Preview sloped cabinet', exact: true }).click()
  await expect(e.getByRole('img', { name: 'Sloped cabinet plan' })).toContainText('depth')
  await expect(e.getByRole('region', { name: 'Sloped cabinet preview' })).toContainText(
    'minimum roof headroom',
  )
})
test('diagnoses captured backs without modifying construction', async ({ page }) => {
  const e = await start(page, true)
  await e.getByLabel('Enable sloped top', { exact: true }).check()
  await e.getByRole('button', { name: 'Preview sloped cabinet', exact: true }).click()
  await expect(e.getByRole('alert')).toContainText('captured back')
  await expect(e.getByRole('button', { name: 'Apply sloped cabinet', exact: true })).toBeDisabled()
  await e.getByRole('button', { name: 'Cancel slope changes', exact: true }).click()
  await expect(e.getByLabel('Enable sloped top', { exact: true })).not.toBeChecked()
})
test('saves and reopens sloped construction, then disables it explicitly', async ({ page }) => {
  let e = await start(page)
  await e.getByLabel('Enable sloped top', { exact: true }).check()
  await e.getByRole('button', { name: 'Preview sloped cabinet', exact: true }).click()
  await e.getByRole('button', { name: 'Apply sloped cabinet', exact: true }).click()
  await e.getByRole('button', { name: 'Close sloped top', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Save As…/ }).click()
  await page.waitForFunction(async () => {
    try {
      const r = await navigator.storage.getDirectory(),
        h = await r.getFileHandle('slope-saved.zimmu')
      return (await (await h.getFile()).text()).includes('slopedTop')
    } catch {
      return false
    }
  })
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^New/ }).click()
  await expect(page).toHaveTitle(/Untitled/)
  await page.evaluate(() => localStorage.setItem('slope-reopen', 'yes'))
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  await expect(page).toHaveTitle(/Slope browser/)
  e = await workspace(page)
  await expect(e.getByLabel('Enable sloped top', { exact: true })).toBeChecked()
  await e.getByRole('button', { name: 'Preview sloped cabinet', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Apply sloped cabinet', exact: true })).toBeDisabled()
  await e.getByLabel('Enable sloped top', { exact: true }).uncheck()
  await e.getByRole('button', { name: 'Preview sloped cabinet', exact: true }).click()
  await e.getByRole('button', { name: 'Apply sloped cabinet', exact: true }).click()
})
