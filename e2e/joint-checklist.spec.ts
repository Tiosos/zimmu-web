import { test, expect, type Page, type Locator } from '@playwright/test'

// OCCT boots a ~65MB WASM kernel in a worker before the UI is usable; allow generous time for it to
// compile and run the first build on a slow CI runner.
const OCCT_READY_TIMEOUT = 120_000

// The sidebar is tall and the scene checklist renders near its foot, above the add-part footer.
// Give the page room so the panel's trigger and chips are reachable without fighting the ScrollArea.
test.use({ viewport: { width: 1280, height: 1100 } })

// The Shape/Position/Rotation inputs carry no label association Playwright can query by role, so
// reach them through the Radix Collapsible: each section trigger's aria-controls names its content
// panel, whose number inputs sit in a fixed order (src/ui/sidebar.tsx):
//   Shape (board): 0 = L, 1 = W, 2 = T
//   Position:      0 = X, 1 = Y, 2 = Z
//   Rotation:      0 = X, 1 = Y, 2 = Z
async function sectionInput(
  page: Page,
  section: 'Shape' | 'Position' | 'Rotation',
  index: number,
): Promise<Locator> {
  const trigger = page.getByRole('button', { name: new RegExp(section, 'i') }).first()
  const panelId = await trigger.getAttribute('aria-controls')
  expect(panelId, `${section} section should expose aria-controls`).toBeTruthy()
  return page.locator(`#${panelId} input[type=number]`).nth(index)
}

// The scene checklist's whole reason to exist is that a jointed pair stays on the list, in place,
// as a done row — where the old unjointed-only panel dropped it the moment you jointed it. This
// exercises the full live path a unit test cannot: a chip click applies a real joint through the
// OCCT worker, and the row must survive the rebuild flipped to ✓, not vanish.
//
// What would break it: reverting jointChecklist.ts to render only unjointed pairs (the row would
// disappear on apply and the counter never reach 1 / 1), or a MAX_*_ROWS cap slipping back below a
// classifier so the jointed pair reads as "no joint available".
test('applying a suggested joint leaves the pair on the checklist as done, in place', async ({
  page,
}) => {
  await page.goto('/')

  const addBoard = page.getByRole('button', { name: '+ Board' })
  await expect(addBoard).toBeEnabled({ timeout: OCCT_READY_TIMEOUT })

  // Board 1 is the housing board "H" of the proven tee fixture (src/scene/jointChecklist.test.ts):
  // 200×100×20 at the origin. Only the thickness differs from the seeded 200×100×25 default, so the
  // dado seats on Board 1's face rather than 5mm into it.
  await page.getByText('Board 1', { exact: true }).click()
  await (await sectionInput(page, 'Shape', 2)).fill('20') // T

  // Board 2 is the dado board "D": 80×40×18, rolled −90° about Y and stood on Board 1 to form a
  // perpendicular tee — the geometry the engine scores as a dado and a mortise & tenon.
  await addBoard.click()
  await expect(page.getByText('Board 2', { exact: true })).toBeVisible()
  await (await sectionInput(page, 'Shape', 0)).fill('80') // L
  await (await sectionInput(page, 'Shape', 1)).fill('40') // W
  await (await sectionInput(page, 'Shape', 2)).fill('18') // T
  await (await sectionInput(page, 'Rotation', 1)).fill('-90') // Y
  await (await sectionInput(page, 'Position', 0)).fill('100') // X
  await (await sectionInput(page, 'Position', 1)).fill('30') // Y
  await (await sectionInput(page, 'Position', 2)).fill('20') // Z

  // The checklist is collapsed by default and its rows live in a Radix CollapsibleContent, so they
  // are absent from the DOM until the header is clicked. The header reaching 0 / 1 is itself proof
  // the whole scene-suggestion pipeline ran against live state, not just the pure scorers.
  const header = page.getByRole('button', { name: /Joints —/ })
  await expect(header).toHaveText(/Joints — 0 \/ 1/, { timeout: 30_000 })
  await header.click()

  // The tee offers exactly a dado and a mortise & tenon. Waiting on the Dado chip also settles any
  // transient row shape left by the debounced dimension commits before we act.
  const row = page.getByText('Board 1 + Board 2')
  await expect(row).toBeVisible()
  const dado = page.getByRole('button', { name: 'Dado', exact: true })
  await expect(dado).toBeVisible()
  await expect(page.getByRole('button', { name: 'M&T', exact: true })).toBeVisible()

  // Apply the dado — the behaviour under test.
  await dado.click()

  // The pair stays on the list, in place, flipped to done; the counter ticks to 1 / 1.
  await expect(header).toHaveText(/Joints — 1 \/ 1/, { timeout: 30_000 })
  await expect(page.getByText('✓ Board 1 + Board 2')).toBeVisible()
  // The chips give way to the recorded joint's kind label — a span, no longer a button.
  await expect(page.getByRole('button', { name: 'Dado', exact: true })).toHaveCount(0)
})
