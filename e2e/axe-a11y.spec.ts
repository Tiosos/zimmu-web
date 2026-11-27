import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const READY = 120_000

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The elevation/plan SVGs contain keyboard-operable <g role="button"> hotspots inside a
    // labelled graphic. axe's generic nested-interactive rule cannot express that SVG pattern;
    // the hotspots themselves pass keyboard-access.spec.ts and are intentional.
    .disableRules(['nested-interactive'])
    .analyze()
  const rows = results.violations.map(
    (v) =>
      `${v.id} ${v.impact ?? 'n/a'} x${v.nodes.length}:\n` +
      v.nodes
        .slice(0, 20)
        .map(
          (n) =>
            `  target=${n.target.join(' ')}\n  html=${n.html.slice(0, 260)}\n  why=${(n.failureSummary ?? '').replace(/\n/g, ' ').slice(0, 320)}`,
        )
        .join('\n'),
  )
  if (rows.length) console.log(`AXE ${label}: ${rows.length}\n${rows.join('\n')}`)
  return rows.map((row) => `${label}: ${row}`)
}

test('axe WCAG AA scan passes across perspectives and dialogs in both themes', async ({ page }) => {
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
  const dialogs = [
    ['readiness', /Manufacturing readiness/],
    ['bom', /Cutting List/],
    ['drawings', /2D Drawings/],
    ['project-structure', /Project structure/],
    ['packet-compare', /Compare production packets/],
  ] as const

  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate((value) => {
      if (value === 'light') document.documentElement.dataset.theme = 'light'
      else delete document.documentElement.dataset.theme
    }, theme)
    for (const [id, label] of views) {
      await nav.getByRole('button', { name: new RegExp(label) }).click()
      await page.waitForTimeout(200)
      expect(await scan(page, `${theme}-${id}`)).toEqual([])
    }
    await nav.getByRole('button', { name: /Workbench/ }).click()
    const file = page.getByRole('button', { name: /^File/ })
    for (const [id, menu] of dialogs) {
      await file.click()
      await page.getByRole('button', { name: menu }).click()
      await page.waitForTimeout(200)
      expect(await scan(page, `${theme}-dialog-${id}`)).toEqual([])
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
  }
})
