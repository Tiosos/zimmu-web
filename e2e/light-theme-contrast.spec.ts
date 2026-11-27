import { test, expect, type Page } from '@playwright/test'

const READY = 120_000

const scan = async (page: Page, label: string) => {
  const rows = await page.evaluate(() => {
    const parse = (value: string) => {
      const m = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]
      return { r: m[0] ?? 0, g: m[1] ?? 0, b: m[2] ?? 0, a: m[3] ?? 1 }
    }
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (c: number) => {
        const x = c / 255
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const blend = (fg: ReturnType<typeof parse>, bg: ReturnType<typeof parse>) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    })
    const background = (el: HTMLElement) => {
      let acc = { r: 255, g: 255, b: 255, a: 1 }
      const chain: HTMLElement[] = []
      for (let n: HTMLElement | null = el; n; n = n.parentElement) chain.push(n)
      for (const n of chain.reverse()) {
        const c = parse(getComputedStyle(n).backgroundColor)
        if (c.a > 0) acc = blend(c, acc)
      }
      return acc
    }
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (el.closest('svg, canvas, script, style')) continue
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim() ?? '')
        .join(' ')
        .trim()
      if (!own) continue
      if (
        el.closest('button[disabled], [aria-disabled="true"], :disabled, [inert]') ||
        (el as HTMLInputElement).disabled
      )
        continue
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      const bg = background(el)
      const fg = blend(parse(style.color), bg)
      const a = lum(fg)
      const b = lum(bg)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const size = parseFloat(style.fontSize)
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      const min = large ? 3 : 4.5
      if (ratio < min) {
        const selector = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`
        out.push(`${ratio.toFixed(2)} <${min} ${selector} "${own.slice(0, 40)}" fg=${style.color} bg=${getComputedStyle(el).backgroundColor}`)
      }
    }
    return [...new Set(out)].slice(0, 40)
  })
  return rows.map((row) => `${label}: ${row}`)
}

test('light theme text meets AA contrast in every perspective and dialog', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('zimmu:theme:v1', 'light'))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: READY })
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.locator('[data-testid^="node-cmp_"]').filter({ hasText: 'Base 600' }).first().click()

  const nav = page.getByRole('navigation', { name: 'Workspace perspectives' })
  for (const label of ['Workbench', 'Cabinet Editor', 'Viewport Modes', 'Manufacturing', 'Project & Room']) {
    await nav.getByRole('button', { name: new RegExp(label) }).click()
    await page.waitForTimeout(300)
    expect(await scan(page, label)).toEqual([])
  }

  await nav.getByRole('button', { name: /Workbench/ }).click()
  const file = page.getByRole('button', { name: /^File/ })
  for (const [id, menu] of [
    ['readiness', /Manufacturing readiness/],
    ['bom', /Cutting List/],
    ['drawings', /2D Drawings/],
    ['project-structure', /Project structure/],
    ['packet-compare', /Compare production packets/],
  ] as const) {
    await file.click()
    await page.getByRole('button', { name: menu }).click()
    await page.waitForTimeout(300)
    expect(await scan(page, `dialog-${id}`)).toEqual([])
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
})
