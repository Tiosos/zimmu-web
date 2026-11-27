import { test, expect } from '@playwright/test'

const OCCT_READY_TIMEOUT = 120_000

test('header theme toggle persists across reload and stays keyboard operable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  const toggle = page.getByRole('button', { name: 'Dark theme — switch to light' })
  await expect(toggle).toBeVisible()
  const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'Light theme — switch to dark' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('zimmu:theme:v1'))).toBe('light')
  const lightBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(lightBackground).not.toBe(darkBackground)

  await page.reload()
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const back = page.getByRole('button', { name: 'Light theme — switch to dark' })
  await back.focus()
  await expect(back).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'Dark theme — switch to light' })).toBeVisible()
})
