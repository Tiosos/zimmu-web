import { expect, test, type Page } from '@playwright/test'
import { motionScene } from '../src/scene/__fixtures__/motion'
async function start(page: Page, tab: 'Materials' | 'Edgebanding') {
  const scene = motionScene()
  scene.materials['Oak 18'] = { thickness: 18 }
  scene.materials['ABS 1'] = { thickness: 1, use: 'edge' }
  const text = JSON.stringify({
    version: 35,
    name: 'Treatment test',
    appVersion: '0',
    units: 'mm',
    createdAt: '2026-10-22',
    updatedAt: '2026-10-22',
    camera: { position: { x: 800, y: -800, z: 800 }, target: { x: 300, y: 150, z: 0 } },
    scene,
  })
  await page.addInitScript((text) => {
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: async () => {
        const root = await navigator.storage.getDirectory()
        const handle = await root.getFileHandle('treatment-test.zimmu', { create: true })
        const writer = await handle.createWritable()
        await writer.write(text)
        await writer.close()
        return [handle]
      },
    })
  }, text)
  page.on('dialog', (dialog) => void dialog.accept())
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board', exact: true })).toBeEnabled({
    timeout: 120_000,
  })
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /^Open…/ }).click()
  await page.getByTestId('node-cab').click()
  await page.getByRole('tab', { name: tab, exact: true }).click()
  return page.getByRole('region', { name: `${tab} editor`, exact: true })
}
test('bulk material changes preview, apply, undo and redo', async ({ page }) => {
  const editor = await start(page, 'Materials')
  await editor.getByLabel('Filter role', { exact: true }).selectOption('Cabinet sides')
  await editor.getByRole('button', { name: 'Select matching boards', exact: true }).click()
  await editor.getByLabel('Panel material', { exact: true }).selectOption('Oak 18')
  await editor.getByRole('button', { name: 'Stage material', exact: true }).click()
  await editor.getByLabel('Board grain', { exact: true }).selectOption('width')
  await editor.getByRole('button', { name: 'Stage grain', exact: true }).click()
  await expect(editor.getByText('2 selected · 2 staged boards', { exact: true })).toBeVisible()
  await editor.getByRole('button', { name: 'Preview materials', exact: true }).click()
  await expect(editor.getByRole('table', { name: 'Board treatment comparison' })).toContainText(
    'Oak 18',
  )
  await editor.getByRole('button', { name: 'Apply materials', exact: true }).click()
  await expect(editor.getByRole('list', { name: 'Cabinet treatment boards' })).toContainText(
    'Material: override; grain: override',
  )
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply cabinet materials"/ }).click()
  await editor.getByRole('button', { name: 'Reset materials draft', exact: true }).click()
  await expect(editor.getByRole('list', { name: 'Cabinet treatment boards' })).not.toContainText(
    'Material: override',
  )
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Redo "Apply cabinet materials"/ }).click()
  await editor.getByRole('button', { name: 'Reset materials draft', exact: true }).click()
  await expect(editor.getByRole('list', { name: 'Cabinet treatment boards' })).toContainText(
    'Material: override',
  )
})
test('edge presets feed cut-size previews and undo, then cancel discards a new draft', async ({
  page,
}) => {
  const editor = await start(page, 'Edgebanding')
  await editor.getByLabel('Filter role', { exact: true }).selectOption('Cabinet sides')
  await editor.getByRole('button', { name: 'Select matching boards', exact: true }).click()
  await expect(editor.getByRole('img', { name: 'Selected board edge preview' })).toBeVisible()
  await editor.getByLabel('Edgebanding stock', { exact: true }).selectOption('ABS 1')
  await editor.getByRole('button', { name: 'Stage cabinet-front edges', exact: true }).click()
  await editor.getByRole('button', { name: 'Preview edgebanding', exact: true }).click()
  await expect(editor.getByRole('table', { name: 'Edgebanding length totals' })).toContainText(
    '1440.0',
  )
  await editor.getByRole('button', { name: 'Apply edgebanding', exact: true }).click()
  await expect(editor.getByRole('list', { name: 'Cabinet treatment boards' })).toContainText(
    'ABS 1 (explicit)',
  )
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: /Undo "Apply cabinet edgebanding"/ }).click()
  await editor.getByRole('button', { name: 'Reset edgebanding draft', exact: true }).click()
  await expect(editor.getByRole('list', { name: 'Cabinet treatment boards' })).not.toContainText(
    'ABS 1 (explicit)',
  )
  await editor.getByRole('button', { name: 'Select matching boards', exact: true }).click()
  await editor.getByRole('button', { name: 'Stage perimeter edges', exact: true }).click()
  await editor.getByRole('button', { name: 'Cancel edgebanding changes', exact: true }).click()
  await expect(editor.getByText('0 selected · 0 staged boards', { exact: true })).toBeVisible()
})
