import { test, expect } from '@playwright/test'

test('placeholder — replaced in Task 4', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/.*/)
})
