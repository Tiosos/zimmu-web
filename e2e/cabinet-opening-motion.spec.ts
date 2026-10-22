import { expect, test, type Page } from '@playwright/test'
import { motionScene } from '../src/scene/__fixtures__/motion'
import { defaultProject } from '../src/scene/projectStructure'
async function start(page: Page, kind: 'pair' | 'drawer' = 'pair') {
  const scene = motionScene(kind),
    text = JSON.stringify({
      version: 39,
      name: 'Motion browser',
      appVersion: '0',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      scene,
      project: defaultProject(scene, 'Motion'),
      camera: { position: { x: 1600, y: -2000, z: 1500 }, target: { x: 300, y: 200, z: 400 } },
    })
  await page.addInitScript((text) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory(),
          saved = localStorage.getItem('motion-reopen') === 'yes',
          handle = await root.getFileHandle(saved ? 'motion-saved.zimmu' : 'motion-initial.zimmu', {
            create: !saved,
          })
        if (!saved) {
          const w = await handle.createWritable()
          await w.write(text)
          await w.close()
        }
        return [handle]
      },
    })
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory()
        return root.getFileHandle('motion-saved.zimmu', { create: true })
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
  await expect(page).toHaveTitle(/Motion browser/)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: 'Door & Drawer Motion…', exact: true }).click()
  return page.getByRole('complementary', { name: 'Door and drawer motion workspace' })
}
test('stages paired leaves, animates and applies one undoable settings change', async ({
  page,
}) => {
  const e = await start(page)
  await e.getByRole('button', { name: 'Select supported fronts', exact: true }).click()
  await e.getByLabel('Maximum opening', { exact: true }).fill('110')
  await e.getByRole('button', { name: 'Stage selected opening settings', exact: true }).click()
  await e.getByRole('button', { name: 'Open selected', exact: true }).click()
  await expect(e.getByText('Current 110.0°', { exact: true })).toHaveCount(2)
  await expect(e.getByRole('img', { name: 'Plan opening motion' })).toBeVisible()
  await e.getByRole('button', { name: 'Reset all closed', exact: true }).click()
  await e.getByRole('button', { name: 'Animate opening', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Pause motion', exact: true })).toBeVisible()
  await e.getByRole('button', { name: 'Pause motion', exact: true }).click()
  await e.getByRole('button', { name: 'Apply motion settings', exact: true }).click()
  await expect(e.getByText(/Scene or project changed/)).toBeVisible()
  await e.getByRole('button', { name: 'Undo motion change', exact: true }).click()
  await e.getByRole('button', { name: 'Reset motion draft', exact: true }).click()
  await expect(e.getByText('Maximum 90°; offset 0 mm', { exact: true })).toHaveCount(2)
  await e.getByRole('button', { name: 'Redo motion change', exact: true }).click()
  await e.getByRole('button', { name: 'Reset motion draft', exact: true }).click()
  await expect(e.getByText('Maximum 110°; offset 0 mm', { exact: true })).toHaveCount(2)
})
test('checks drawer travel and rejects invalid dimensions without applying', async ({ page }) => {
  const e = await start(page, 'drawer')
  await e.getByRole('button', { name: 'Select supported fronts', exact: true }).click()
  await e.getByLabel('Maximum opening', { exact: true }).fill('3000')
  await e.getByRole('button', { name: 'Stage selected opening settings', exact: true }).click()
  await expect(e.getByRole('status')).toContainText('exceeds')
  await e.getByLabel('Maximum opening', { exact: true }).fill('100')
  await e.getByRole('button', { name: 'Stage selected opening settings', exact: true }).click()
  await e.getByRole('button', { name: 'Open selected', exact: true }).click()
  await expect(e.getByText('Current 100.0 mm', { exact: true })).toBeVisible()
  await e.getByRole('button', { name: 'Check opening paths', exact: true }).click()
  await expect(e.getByRole('status').filter({ hasText: 'potential conflicts' })).toBeVisible()
  await e.getByLabel('Operating clearance', { exact: true }).fill('')
  await expect(e.getByRole('button', { name: 'Apply motion settings', exact: true })).toBeDisabled()
  await e.getByRole('button', { name: 'Cancel motion changes', exact: true }).click()
  await expect(e.getByRole('button', { name: 'Apply motion settings', exact: true })).toBeDisabled()
})
test('saves settings and reopens with closed manufacturing positions', async ({ page }) => {
  let e = await start(page)
  await e.getByRole('button', { name: 'Select supported fronts', exact: true }).click()
  await e.getByLabel('Maximum opening', { exact: true }).fill('105')
  await e.getByRole('button', { name: 'Stage selected opening settings', exact: true }).click()
  await e.getByRole('button', { name: 'Apply motion settings', exact: true }).click()
  await e.getByRole('button', { name: 'Reset motion draft', exact: true }).click()
  await e.getByRole('button', { name: 'Select supported fronts', exact: true }).click()
  await e.getByRole('button', { name: 'Open selected', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Save As…/ }).click()
  await page.waitForFunction(async () => {
    try {
      const root = await navigator.storage.getDirectory(),
        h = await root.getFileHandle('motion-saved.zimmu')
      return (await (await h.getFile()).text()).includes('openingMotion')
    } catch {
      return false
    }
  })
  const saved = await page.evaluate(async () => {
    const r = await navigator.storage.getDirectory(),
      h = await r.getFileHandle('motion-saved.zimmu')
    return JSON.parse(await (await h.getFile()).text())
  })
  expect(saved.version).toBe(39)
  expect(saved.scene.components.find((c: { id: string }) => c.id === 'cab').position).toEqual({
    x: 0,
    y: 0,
    z: 0,
  })
  await e.getByRole('button', { name: 'Close motion', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^New(?:\s|$)/ }).click()
  await expect(page).toHaveTitle(/Untitled/)
  await page.evaluate(() => localStorage.setItem('motion-reopen', 'yes'))
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  await expect(page).toHaveTitle(/Motion browser/)
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: 'Door & Drawer Motion…', exact: true }).click()
  e = page.getByRole('complementary', { name: 'Door and drawer motion workspace' })
  await expect(e.getByText('Maximum 105°; offset 0 mm', { exact: true })).toHaveCount(2)
  await expect(e.getByText('Current 0.0°', { exact: true })).toHaveCount(2)
})
