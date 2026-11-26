import { test, expect } from '@playwright/test'

const OCCT_READY_TIMEOUT = 120_000

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })
}

test('a dialog traps focus, suppresses workbench keys and restores focus on close', async ({
  page,
}) => {
  await ready(page)
  const file = page.getByRole('button', { name: /^File/ })
  await file.click()
  await page.getByRole('button', { name: /Cutting List/ }).click()

  const dialog = page.getByRole('dialog', { name: 'Bill of materials' })
  await expect(dialog).toBeVisible()
  const inside = () => dialog.evaluate((d) => d.contains(document.activeElement))
  await expect.poll(inside).toBe(true)
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    expect(await inside()).toBe(true)
  }

  const snap = page.locator('button.zim-tool').filter({ hasText: 'Snap' })
  await expect(snap).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('f')
  await expect(snap).toHaveAttribute('aria-pressed', 'false')

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(file).toBeFocused()
  await page.keyboard.press('f')
  await expect(snap).toHaveAttribute('aria-pressed', 'true')
})

test('cabinet editor tabs are one tab stop with arrow navigation', async ({ page }) => {
  await ready(page)
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()
  await page.getByRole('navigation', { name: 'Workspace perspectives' }).getByRole('button', { name: /Cabinet Editor/ }).click()
  const tabs = page.locator('.zim-cep-tab')
  await expect(tabs).toHaveCount(16)
  const stops = await tabs.evaluateAll((els) => els.filter((el) => (el as HTMLElement).tabIndex === 0).length)
  expect(stops).toBe(1)

  const first = page.locator('.zim-cep-tab[aria-current="true"]')
  await first.focus()
  await page.keyboard.press('ArrowRight')
  const moved = page.locator('.zim-cep-tab[aria-current="true"]')
  await expect(moved).not.toHaveText(await first.innerText())
  await expect(moved).toBeFocused()
})

test('project structure tree is one tab stop with arrow and Enter navigation', async ({ page }) => {
  await ready(page)
  await page.getByRole('navigation', { name: 'Workspace perspectives' }).getByRole('button', { name: /Project & Room/ }).click()
  const tree = page.getByRole('tree', { name: 'Project rooms' })
  await expect(tree).toBeVisible()
  const rows = tree.locator('[role="treeitem"]')
  expect(await rows.count()).toBeGreaterThan(1)
  const stops = await rows.evaluateAll((els) => els.filter((el) => (el as HTMLElement).tabIndex === 0).length)
  expect(stops).toBe(1)

  await rows.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(rows.nth(1).locator('input').first()).toBeFocused()
})

test('keyboard focus is visible and both themes keep body text at AA contrast', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return ''
    return getComputedStyle(el).outlineStyle
  })
  expect(outline).not.toBe('none')

  const contrast = async () =>
    page.evaluate(() => {
      const rgb = (value: string) => {
        const parts = value.match(/[\d.]+/g)?.map(Number) ?? []
        return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
      }
      const luminance = (value: string) => {
        const [r, g, b] = rgb(value).map((channel) => {
          const c = channel / 255
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const style = getComputedStyle(document.body)
      const a = luminance(style.color)
      const b = luminance(style.backgroundColor)
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })

  expect(await contrast()).toBeGreaterThanOrEqual(4.5)
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light'
  })
  expect(await contrast()).toBeGreaterThanOrEqual(4.5)
})
