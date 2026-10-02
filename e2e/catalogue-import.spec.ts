import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { packageFixture } from '../src/scene/__fixtures__/companyCatalogue'

async function install(page: Page, version: number) {
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: 'Import company catalogue…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import company catalogue', exact: true })
  await dialog.getByLabel('Company catalogue package').setInputFiles({
    name: 'catalogue.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(packageFixture(version))),
  })
  await expect(dialog.getByText(/Company base · product/)).toBeVisible()
  const apply = dialog.getByRole('button', { name: 'Install catalogue in project' })
  await expect(apply).toBeDisabled()
  await dialog.getByRole('checkbox').check()
  await apply.click()
  await expect(dialog).toHaveCount(0)
}

test('imports company versions and updates a placed cabinet only after preview and acceptance', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board', exact: true })).toBeEnabled({
    timeout: 120_000,
  })
  await install(page, 1)
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: /Company base.*v1/ }).click()
  const cabinet = page
    .locator('[data-testid^="node-cmp_"]')
    .filter({ hasText: 'Company base' })
    .first()
  await cabinet.click()
  await expect(page.locator('summary').filter({ hasText: /^Company base v1/ })).toBeVisible()
  const width = page.getByLabel('Width', { exact: true })
  await expect(width).toHaveValue('610')
  await width.fill('750')
  await width.blur()
  await expect(page.getByText('width: Item override', { exact: true })).toHaveCount(1)
  await install(page, 2)
  await expect(page.locator('summary').filter({ hasText: /^Company base v1/ })).toBeVisible()
  await expect(width).toHaveValue('750')
  await page
    .locator('summary')
    .filter({ hasText: /^Company base v1/ })
    .click()
  await page.getByLabel('Catalogue update version').selectOption('2')
  await page.getByRole('button', { name: 'Preview catalogue update' }).click()
  await expect(page.getByRole('button', { name: 'Apply catalogue update' })).toBeEnabled()
  await expect(page.locator('summary').filter({ hasText: /^Company base v1/ })).toBeVisible()
  await page.getByRole('button', { name: 'Apply catalogue update' }).click()
  await expect(page.locator('summary').filter({ hasText: /^Company base v2/ })).toBeVisible()
  await expect(width).toHaveValue('750')
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  const undo = page.getByRole('button', { name: /^Undo "Apply cabinet rules"/ })
  await expect(undo).toBeEnabled({ timeout: 10_000 })
  await undo.click()
  await expect(page.locator('summary').filter({ hasText: /^Company base v1/ })).toBeVisible()
})
