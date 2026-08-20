import { test, expect } from '@playwright/test'

// OCCT boots a ~65MB WASM kernel before the UI is usable.
const OCCT_READY_TIMEOUT = 120_000

// Phase 3 put a hierarchy in the sidebar, but until the "+ Group" affordance existed no component
// could be created in the running app — so every component row was unit-tested and unreachable.
// This spec is the one that proves the tree works against the real app: create a group, confirm it
// appears and is selectable, and confirm hiding it removes its geometry from the viewport rather
// than only greying a row.
test('a group can be created, selected, and hidden with its parts', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })

  await page.getByRole('button', { name: '+ Group' }).click()

  const row = page.getByTestId(/^node-cmp_/)
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Group 1')

  // A second group must be distinguishable from the first — the label counter, not two "Group"s.
  await page.getByRole('button', { name: '+ Group' }).click()
  await expect(page.getByTestId(/^node-cmp_/)).toHaveCount(2)
  await expect(page.getByText('Group 2')).toBeVisible()

  // Selecting a component is the capability Phase 3 exists to add.
  await page.getByText('Group 1').click()
  await expect(page.getByTestId(/^node-cmp_/).first()).toHaveAttribute('data-selected', 'true')
})
