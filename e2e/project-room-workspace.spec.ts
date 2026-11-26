import { test, expect } from '@playwright/test'

const OCCT_READY_TIMEOUT = 120_000

test('project and room perspective exposes structure, plan and four detail tabs', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Project & Room/ }).click()

  await expect(page.getByLabel('Project and room workspace')).toBeVisible()
  await expect(page.getByLabel('Project structure tree')).toBeVisible()
  await expect(page.getByLabel('Project room plan')).toBeVisible()
  for (const tab of ['Overview', 'Geometry', 'Assessment', 'Services']) {
    await expect(page.getByRole('tab', { name: tab })).toBeVisible()
  }
  await expect(page).toHaveURL(/#view=project/)
})

test('service points can be added from the perspective and appear in the list', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Project & Room/ }).click()
  await page.getByRole('tab', { name: 'Services' }).click()

  await page.getByLabel('New service name').fill('Outlet B')
  await page.getByLabel('New service size').fill('13A')
  await page.getByLabel('New service source').fill('Site survey')
  await page.getByRole('button', { name: 'Add service point' }).click()

  await expect(page.getByLabel('Service name Outlet B')).toHaveValue('Outlet B')
  await expect(page.getByLabel('Service size Outlet B')).toHaveValue('13A')
})

test('assessment tolerances are editable and findings are visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Project & Room/ }).click()
  await page.getByRole('tab', { name: 'Assessment' }).click()

  const walkway = page.getByLabel('walkway tolerance')
  await expect(walkway).toBeVisible()
  await walkway.fill('1200')
  await expect(walkway).toHaveValue('1200')
  await expect(page.getByLabel('Room assessment findings')).toBeVisible()
})

test('project perspective is deep-linkable and preserves the mounted WebGL canvas', async ({ page }) => {
  await page.goto('/#view=project')
  await expect(page.getByLabel('Project and room workspace')).toBeVisible({ timeout: OCCT_READY_TIMEOUT })

  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (canvas === null) throw new Error('no canvas')
    canvas.setAttribute('data-zimmu-s5-mark', 'kept')
  })
  const kept = page.locator('canvas[data-zimmu-s5-mark="kept"]')
  await expect(kept).toHaveCount(1)

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  await nav.getByRole('button', { name: /Workbench/ }).click()
  await expect(kept).toHaveCount(1)
  await expect(kept).toBeVisible()
})
