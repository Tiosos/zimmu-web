import { test, expect } from '@playwright/test'

// OCCT boots a ~65MB WASM kernel in a worker before the UI is usable.
const OCCT_READY_TIMEOUT = 120_000

// The BOM modal is tall and the Sheets tab renders a 600px-wide sheet drawing under the summary
// row; give the page room so both are reachable without fighting the modal's own scroller.
test.use({ viewport: { width: 1280, height: 1100 } })

interface SheetSvg {
  sheet: { w: number; h: number }
  parts: { id: string; x: number; y: number; w: number; h: number }[]
  labels: string[]
}

// Every other test of the Sheets tab mocks Comlink, so this is the only place that proves a
// `NestJob` survives the structured clone into the nest worker and a `NestResult` survives the trip
// back. That gap is not hypothetical: the shop drawings carried a wrong cut-rect convention for
// months precisely because the only coverage sat on the mocked side of a boundary.
test('the Sheets tab nests a real cabinet through the nest worker', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  // A Base 600 emits 8 boards: seven of "18mm Ply" and a back of "12mm MDF", which is the material
  // its back slot names (src/scene/carcasePresets.ts). Only the ply is given stock below, so the
  // back is simply absent from the yield report — a material with no sheet is not nested. The door
  // draws on `frontMaterial`, which is the same ply by default; point that slot elsewhere and it
  // becomes its own nest group with its own sheet count.
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await expect(page.getByTestId(/^node-board_/)).toHaveCount(9) // 8 + the seeded Board 1

  await page.getByRole('button', { name: /^File/ }).click()
  await page.getByRole('button', { name: /Cutting List/ }).click()
  const panel = page.getByTestId('bom-panel')
  await expect(panel).toBeVisible()

  // A sheet size is only settable in the Library tab, and the Library only lists materials the
  // library itself holds — so the material has to be seeded from the Boards tab first, where
  // setting a rate writes to both the project and the library.
  await panel.getByRole('button', { name: '18mm Ply' }).first().click()
  const rate = panel.locator('input[type=number]').first()
  await rate.fill('50')
  await rate.press('Enter')

  await panel.getByRole('tab', { name: 'Library' }).click()
  await page.getByLabel('Sheet length for 18mm Ply').fill('2440')
  await page.getByLabel('Sheet width for 18mm Ply').fill('1220')

  await panel.getByRole('tab', { name: 'Sheets' }).click()

  // Ground truth, computed directly from `regenerateComponents` → `reconcileJoints` →
  // `occupancyMask` → `nestSheets` at the default 14 mm clearance: one sheet, 72.76% used, nothing
  // left over. Pinned exactly because a figure that merely looks plausible is what this test
  // exists to rule out — if the packer is ever improved, this number is expected to move with it.
  // It was 60.38% before the preset hung a door, and 61.30% before its one shelf became adjustable.
  const row = panel.getByTestId('sheets-row-18mm Ply')
  await expect(row).toContainText('2440 × 1220 mm')
  await expect(row).toContainText('sheets 1')
  await expect(row).toContainText('used 73%')
  await expect(panel.getByRole('alert')).toHaveCount(0)

  const svgs = panel.locator('svg[role="img"]')
  await expect(svgs).toHaveCount(1)
  await expect(svgs.first().locator('[data-part]')).toHaveCount(7)

  const drawn: SheetSvg = await svgs.first().evaluate((el) => {
    const num = (r: Element, a: string) => parseFloat(r.getAttribute(a) ?? 'NaN')
    const sheet = el.querySelector('[data-sheet]')!
    return {
      sheet: { w: num(sheet, 'width'), h: num(sheet, 'height') },
      parts: [...el.querySelectorAll('[data-part]')].map((r) => ({
        id: r.getAttribute('data-part') ?? '',
        x: num(r, 'x'),
        y: num(r, 'y'),
        w: num(r, 'width'),
        h: num(r, 'height'),
      })),
      labels: [...el.querySelectorAll('text')].map((t) => t.textContent ?? ''),
    }
  })

  // The drawing's own invariants, checked against itself rather than against numbers this test
  // supplies: every part lies inside the sheet outline, and no two overlap. They hold for any
  // correct nest, so they keep biting after the packer changes — and they are exactly what a
  // flipped axis or a lost `pad` in the round trip would break.
  for (const p of drawn.parts) {
    expect(p.w, `${p.id} has width`).toBeGreaterThan(0)
    expect(p.h, `${p.id} has height`).toBeGreaterThan(0)
    expect(p.x, `${p.id} starts inside the sheet`).toBeGreaterThanOrEqual(-0.01)
    expect(p.y, `${p.id} starts inside the sheet`).toBeGreaterThanOrEqual(-0.01)
    expect(p.x + p.w, `${p.id} ends inside the sheet`).toBeLessThanOrEqual(drawn.sheet.w + 0.01)
    expect(p.y + p.h, `${p.id} ends inside the sheet`).toBeLessThanOrEqual(drawn.sheet.h + 0.01)
  }
  for (let i = 0; i < drawn.parts.length; i++) {
    for (let j = i + 1; j < drawn.parts.length; j++) {
      const a = drawn.parts[i]
      const b = drawn.parts[j]
      const overlaps =
        a.x < b.x + b.w - 0.01 &&
        b.x < a.x + a.w - 0.01 &&
        a.y < b.y + b.h - 0.01 &&
        b.y < a.y + a.h - 0.01
      expect(overlaps, `${a.id} and ${b.id} overlap`).toBe(false)
    }
  }

  // `labelOf` reaches the drawing: the rects carry part ids, so a label on the sheet can only have
  // come from the scene.
  expect(drawn.labels.sort()).toEqual([
    'Adj Shelf 1',
    'Bottom',
    'Door 1',
    'Left Side',
    'Right Side',
    'Toe Kick',
    'Top',
  ])
})

// A panel longer than the stock is a real user mistake, and the sheet count would be a lie if it
// were dropped silently. The unplaced list is carried back across the worker boundary too.
test('stock too small for any panel reports every part as unplaced', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await expect(page.getByTestId(/^node-board_/)).toHaveCount(9)

  await page.getByRole('button', { name: /^File/ }).click()
  await page.getByRole('button', { name: /Cutting List/ }).click()
  const panel = page.getByTestId('bom-panel')

  await panel.getByRole('button', { name: '18mm Ply' }).first().click()
  const rate = panel.locator('input[type=number]').first()
  await rate.fill('50')
  await rate.press('Enter')

  await panel.getByRole('tab', { name: 'Library' }).click()
  // 500 × 400 is smaller than the smallest Base 600 panel plus its clearance, so nothing places.
  await page.getByLabel('Sheet length for 18mm Ply').fill('500')
  await page.getByLabel('Sheet width for 18mm Ply').fill('400')

  await panel.getByRole('tab', { name: 'Sheets' }).click()

  const alert = panel.getByRole('alert')
  await expect(alert).toBeVisible()
  // Every panel of the material that has stock. The back is 12 mm MDF and has none, so it is not
  // nested at all — it is absent from this list rather than unplaced in it.
  for (const label of [
    'Left Side',
    'Right Side',
    'Bottom',
    'Top',
    'Adj Shelf 1',
    'Door 1',
    'Toe Kick',
  ]) {
    await expect(alert).toContainText(label)
  }
  await expect(panel.getByTestId('sheets-row-18mm Ply')).toContainText('sheets 0')
  await expect(panel.locator('svg[role="img"]')).toHaveCount(0)
})
