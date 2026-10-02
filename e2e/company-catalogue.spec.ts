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
  await page.goto('/company-auth.html?code=test-code&state=invalid')
  // The SDK owns the callback title and clears invalid response parameters.
  await expect(page).toHaveTitle('Microsoft Authentication')
  await expect(page).toHaveURL(/\/company-auth\.html$/)
  await expect(page.locator('#status')).toHaveText(
    'Sign-in could not complete. Close this window and try again from Zimmu.',
  )
  await expect(page.getByRole('button', { name: 'File ▾', exact: true })).toHaveCount(0)
})
