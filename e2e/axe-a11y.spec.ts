import { test, expect, type Page } from '@playwright/test'
import { axeViolations } from './axe-helpers'

const READY = 120_000

async function check(page: Page, label: string) {
  expect(await axeViolations(page, label)).toEqual([])
}

test('axe WCAG AA scan covers perspectives, tabs, workspaces and dialogs in both themes', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: READY })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  const views = [
    ['workbench', 'Workbench'],
    ['cabinet', 'Cabinet Editor'],
    ['modes', 'Viewport Modes'],
    ['manufacture', 'Manufacturing'],
    ['project', 'Project & Room'],
  ] as const
  const workspaces = [
    ['motion', 'Door & Drawer Motion…', 'Close motion', 'Door and drawer motion workspace'],
    ['grain', 'Front Grain Matching…', 'Close grain matching', 'Front grain matching workspace'],
    ['stock', 'Stock Optimisation…', 'Close stock optimisation', 'Stock optimisation workspace'],
    ['sloped', 'Sloped-Top Cabinets…', 'Close sloped top', 'Sloped top cabinet workspace'],
  ] as const
  const dialogs = [
    ['readiness', /Manufacturing readiness/],
    ['bom', /Cutting List/],
    ['drawings', /2D Drawings/],
    ['project-structure', /Project structure/],
    ['packet-compare', /Compare production packets/],
    ['verify-packet', /Verify production packet/],
    ['catalogue-import', /Import company catalogue/],
  ] as const

  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => {
      if (value === 'light') document.documentElement.dataset.theme = 'light'
      else delete document.documentElement.dataset.theme
    }, theme)

    for (const [id, label] of views) {
      await nav.getByRole('button', { name: new RegExp(label) }).click()
      await page.waitForTimeout(200)
      await check(page, `${theme}-${id}`)
    }

    await nav.getByRole('button', { name: /Cabinet Editor/ }).click()
    const tabs = page.getByRole('navigation', { name: 'Cabinet editor tabs' }).getByRole('button')
    await expect(tabs).toHaveCount(16)
    for (let i = 0; i < 16; i++) {
      await tabs.nth(i).click()
      await check(page, `${theme}-cabinet-tab-${i + 1}`)
    }

    await nav.getByRole('button', { name: /Project & Room/ }).click()
    for (const tab of ['Overview', 'Geometry', 'Assessment', 'Services']) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      await check(page, `${theme}-project-tab-${tab.toLowerCase()}`)
    }

    const file = page.getByRole('button', { name: /^File/ })
    for (const [id, menu, close, region] of workspaces) {
      await file.click()
      await page.getByRole('button', { name: menu, exact: true }).click()
      await expect(page.getByRole('complementary', { name: region })).toBeVisible()
      await check(page, `${theme}-workspace-${id}`)
      await page.getByRole('button', { name: close, exact: true }).click()
    }

    await nav.getByRole('button', { name: /Workbench/ }).click()
    for (const [id, menu] of dialogs) {
      await file.click()
      await page.getByRole('button', { name: menu }).click()
      await page.waitForTimeout(200)
      await check(page, `${theme}-dialog-${id}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
  }
})
