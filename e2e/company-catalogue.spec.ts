import { test, expect } from '@playwright/test'

test('catalogue opens separately and preserves the CAD application', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'File ▾', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  const opened = context.waitForEvent('page')
  await page.getByRole('button', { name: 'Company catalogue…', exact: true }).click()
  const catalogue = await opened
  await expect(catalogue).toHaveTitle('Company catalogue — Zimmu')
  const dialog = catalogue.getByRole('dialog', { name: 'Company catalogue' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Company sign-in is not configured/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Sign in/ })).toHaveCount(0)
  expect(await catalogue.evaluate(() => window.opener)).toBeNull()
  await expect(page.getByText('Board 1', { exact: true }).first()).toBeVisible()
  const closed = catalogue.waitForEvent('close')
  // Escape closes this scripted window before Chromium may acknowledge the key.
  await catalogue.keyboard.press('Escape').catch((error: unknown) => {
    if (!catalogue.isClosed()) throw error
  })
  await closed
  expect(catalogue.isClosed()).toBe(true)
  await expect(page.getByRole('button', { name: 'File ▾', exact: true })).toBeVisible()
})

test('unconfigured callback page removes response parameters and never loads CAD', async ({
  page,
}) => {
  await page.goto('/company-auth.html?code=test-code&state=invalid#code=invalid')
  await expect(page).toHaveTitle('Company catalogue — Zimmu')
  await expect(page).toHaveURL(/\/company-auth\.html$/)
  await expect(page.getByRole('dialog', { name: 'Company catalogue' })).toBeVisible()
  await expect(page.getByText(/Company sign-in is not configured/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'File ▾', exact: true })).toHaveCount(0)
})
