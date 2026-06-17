import { test, expect } from '@playwright/test'

// TEMPORARY DIAGNOSTIC — not part of the smoke suite. Determines why the
// OCCT WASM kernel does not become ready in CI (the "+ Add board" button
// stays disabled). Captures console/pageerror output and reports whether the
// build errored (part-row ⚠ with a title) or merely never resolved (slow/hung).
// Delete once the root cause is found.
test('diagnose occt readiness in CI', async ({ page }) => {
  test.setTimeout(280_000)

  const logs: string[] = []
  page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  page.on('worker', (w) => logs.push(`[worker created] ${w.url()}`))

  const start = Date.now()
  await page.goto('/')

  const addBoard = page.getByRole('button', { name: '+ Add board' })
  const warn = page.locator('span[title]', { hasText: '⚠' })

  let outcome = 'timeout'
  for (let i = 0; i < 120; i++) {
    if (await addBoard.isEnabled()) {
      outcome = 'ready'
      break
    }
    if ((await warn.count()) > 0) {
      outcome = 'error'
      break
    }
    await page.waitForTimeout(2000)
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  let errTitle = ''
  if ((await warn.count()) > 0) errTitle = (await warn.first().getAttribute('title')) ?? ''

  console.log('=== OCCT DIAGNOSIS ===')
  console.log(`outcome=${outcome} elapsed=${elapsed}s`)
  console.log(`errorTitle=${errTitle}`)
  console.log(`crossOriginIsolated=${await page.evaluate(() => globalThis.crossOriginIsolated)}`)
  console.log(
    `hasSharedArrayBuffer=${await page.evaluate(() => typeof SharedArrayBuffer !== 'undefined')}`,
  )
  console.log(`hardwareConcurrency=${await page.evaluate(() => navigator.hardwareConcurrency)}`)
  console.log('--- captured logs ---')
  console.log(logs.join('\n') || '(none)')
  console.log('=== END DIAGNOSIS ===')

  expect(outcome).toBe('ready')
})
