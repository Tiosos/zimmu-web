import { test, expect } from '@playwright/test'

const OCCT_READY_TIMEOUT = 120_000

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })
}

test('all five signed-off perspectives are reachable and write shareable view hashes', async ({ page }) => {
  await ready(page)
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  const perspectives = [
    ['Workbench', 'workspace', page.getByRole('button', { name: '+ Board' })],
    ['Cabinet Editor', 'cabinet', page.getByRole('navigation', { name: 'Cabinet editor tabs' })],
    ['Viewport Modes', 'modes', page.getByLabel('Viewport mode list')],
    ['Manufacturing', 'manufacture', page.getByLabel('Manufacturing workflow cards')],
    ['Project & Room', 'project', page.getByLabel('Project and room workspace')],
  ] as const

  for (const [label, id, landmark] of perspectives) {
    await nav.getByRole('button', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()
    await expect(landmark).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`#view=${id}`))
  }
})

test('M opens mortise and tenon, never Measure', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('m')

  const mortiseTool = page.locator('button.zim-tool').filter({ hasText: 'Mortise & tenon' })
  await expect(mortiseTool).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('navigation', { name: 'Workspace perspectives' }).getByRole('button', { name: /Viewport Modes/ }).click()
  const modes = page.getByLabel('Viewport mode list')
  const mortise = modes.locator('button').filter({ hasText: 'Mortise & Tenon' })
  const measure = modes.locator('button').filter({ hasText: 'Measure' })
  await expect(mortise.getByLabel('Mode active')).toBeVisible()
  await expect(measure.getByLabel('Mode active')).toHaveCount(0)
})
