import { test, expect } from '@playwright/test'

const OCCT_READY_TIMEOUT = 120_000

test('manufacturing perspective lists eight workflows and three live summaries', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Manufacturing/ }).click()

  await expect(page.getByLabel('Manufacturing workflow cards').locator('button')).toHaveCount(8)
  await expect(page.getByLabel('Readiness review summary')).toBeVisible()
  await expect(page.getByLabel('Shop drawing deck')).toBeVisible()
  await expect(page.getByLabel('Production packet validation')).toBeVisible()
  await expect(page).toHaveURL(/#view=manufacture/)
})

test('manufacturing cards open the real readiness and packet verification workflows', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Manufacturing/ }).click()

  await page.getByRole('button', { name: 'Open Readiness Review workflow' }).click()
  const readiness = page.getByRole('dialog', { name: 'Manufacturing readiness' })
  await expect(readiness).toBeVisible()
  await readiness.getByRole('button', { name: 'Close readiness report' }).click()

  await page.getByRole('button', { name: 'Open Verify Packet workflow' }).click()
  const verify = page.getByRole('dialog', { name: 'Verify production packet' })
  await expect(verify).toBeVisible()
  await expect(verify.getByLabel('Production packet ZIP')).toBeVisible()
  await verify.getByRole('button', { name: 'Close' }).click()
})

test('manufacturing is deep-linkable and preserves the mounted WebGL canvas', async ({ page }) => {
  await page.goto('/#view=manufacture')
  await expect(page.getByLabel('Manufacturing workflow cards')).toBeVisible({ timeout: OCCT_READY_TIMEOUT })

  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (canvas === null) throw new Error('no canvas')
    canvas.setAttribute('data-zimmu-s4-mark', 'kept')
  })
  const kept = page.locator('canvas[data-zimmu-s4-mark="kept"]')
  await expect(kept).toHaveCount(1)

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Workbench/ }).click()
  await expect(kept).toHaveCount(1)
  await expect(kept).toBeVisible()
})
