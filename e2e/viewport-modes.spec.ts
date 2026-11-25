import { test, expect } from '@playwright/test'

const OCCT_READY_TIMEOUT = 120_000

// S3: the 3D viewport is built once in a mount-once effect. Entering and leaving the Viewport
// Modes perspective must reuse the same canvas element, not rebuild the renderer and camera.
test('viewport modes reuse the same 3D canvas across perspective switches', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (c === null) throw new Error('no canvas')
    c.setAttribute('data-zimmu-s3-mark', 'kept')
  })

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Viewport Modes/ }).click()
  await expect(page.getByLabel('Viewport mode list')).toBeVisible()

  const kept = page.locator('canvas[data-zimmu-s3-mark="kept"]')
  await expect(kept).toHaveCount(1)
  await expect(kept).toBeVisible()

  await nav.getByRole('button', { name: /Workbench/ }).click()
  await expect(kept).toHaveCount(1)
  await expect(kept).toBeVisible()
})

test('viewport modes lists 15 modes and applies a real Class A mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Viewport Modes/ }).click()
  const modes = page.getByLabel('Viewport mode list')
  await expect(modes.locator('button')).toHaveCount(15)

  // Activating Dado via the perspective drives the real interaction state machine (key J).
  await modes.getByRole('button', { name: /Dado/ }).click()
  await expect(page.getByLabel('Mode parameters')).toContainText('Dado')
  await expect(page.getByRole('button', { name: 'Activate Mode' })).toBeVisible()
})

test('advisory modes disable Apply and explain the limit', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Viewport Modes/ }).click()
  const modes = page.getByLabel('Viewport mode list')
  await modes.getByRole('button', { name: /Measure/ }).click()

  await expect(page.getByRole('button', { name: 'Not available in 3D yet' })).toBeDisabled()
  await expect(page.getByRole('note')).toContainText('Mortise')
})
