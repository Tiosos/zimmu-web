import { test, expect } from '@playwright/test'

test('company catalogue is accessible without configuring sign-in or changing CAD', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'File ▾', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'File ▾', exact: true }).click()
  await page.getByRole('button', { name: 'Company catalogue…' }).click()
  const modal = page.getByRole('dialog', { name: 'Company catalogue' })
  await expect(modal).toBeVisible()
  await expect(modal.getByText(/Company sign-in is not configured/)).toBeVisible()
  await expect(modal.getByRole('button', { name: /Sign in/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
  await expect(page.getByText('Board 1', { exact: true }).first()).toBeVisible()
})

test('sign-in bridge page is independent of the CAD application', async ({ page }) => {
  await page.goto('/company-auth.html')
  await expect(page).toHaveTitle('Company sign-in — Zimmu')
  await expect(page.locator('#status')).toBeVisible()
  await expect(page.getByRole('button', { name: 'File ▾', exact: true })).toHaveCount(0)
})
