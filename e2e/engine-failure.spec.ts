import { test, expect } from '@playwright/test'

const OCCT_READY_TIMEOUT = 120_000

// The geometry kernel is a ~63 MB download. If it is blocked or the network drops, the add buttons
// used to stay disabled for ever behind a hover tooltip, with the error swallowed. Unit tests mock
// the worker, so only a browser proves the failure reaches the screen and that Retry can recover:
// the real Emscripten loader has to reject, and the loader must not remember the failure.
test('a blocked geometry engine is reported, and Retry brings it up', async ({ page }) => {
  let blocked = true
  await page.route(/\.wasm(\?|$)/, (route) => (blocked ? route.abort() : route.continue()))
  await page.goto('/')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('could not load', { timeout: OCCT_READY_TIMEOUT })
  await expect(page.getByRole('button', { name: '+ Board' })).toBeDisabled()
  await expect(page.getByText('Loading geometry engine…')).toHaveCount(0)

  blocked = false
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({
    timeout: OCCT_READY_TIMEOUT,
  })
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.getByRole('button', { name: '+ Board' }).click()
  await expect(page.getByText('Board 1')).toBeVisible()
})
