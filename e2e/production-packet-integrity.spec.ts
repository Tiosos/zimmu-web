import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { strToU8, unzipSync, zipSync } from 'fflate'

test('a downloaded production packet verifies locally and altered files fail', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  // The seeded Board 1 has no material, which blocks a packet; remove it so the cabinet is all there is.
  await page.getByText('Board 1', { exact: true }).click()
  await page.getByTitle('Delete part').click()
  await expect(page.getByText('Board 1', { exact: true })).toHaveCount(0)
  await page.getByLabel('Add cabinet').click()
  await page.getByRole('option', { name: 'Base 600' }).click()
  await page.getByRole('button', { name: 'File ▾' }).click()
  await page.getByRole('button', { name: 'Manufacturing readiness…' }).click()
  const readiness = page.getByRole('dialog', { name: 'Manufacturing readiness', exact: true })
  const downloading = page.waitForEvent('download')
  await readiness.getByRole('button', { name: 'Export production packet' }).click()
  const packet = await downloading
  const bytes = await readFile(await packet.path())
  await readiness.getByRole('button', { name: 'Close readiness report', exact: true }).click()
  await page.getByRole('button', { name: 'File ▾' }).click()
  await page.getByRole('button', { name: 'Verify production packet…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Verify production packet', exact: true })
  const input = dialog.getByLabel('Production packet ZIP')
  await input.setInputFiles({ name: 'packet.zip', mimeType: 'application/zip', buffer: bytes })
  await expect(dialog.getByText('Integrity checks passed', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/14 files and .* operation references checked/)).toBeVisible()
  const gate = dialog.getByRole('region', { name: 'Production release gate' })
  await gate.getByLabel('Release context').selectOption('initial')
  await gate.getByRole('button', { name: 'Assess production release' }).click()
  await expect(gate.getByRole('button', { name: 'Download release record' })).toBeVisible()
  const releaseDownloading = page.waitForEvent('download')
  await gate.getByRole('button', { name: 'Download release record' }).click()
  const releaseDownload = await releaseDownloading
  const release = JSON.parse(await readFile(await releaseDownload.path(), 'utf8'))
  expect(release.packetSha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  expect(release.formalApproval).toBe('not-recorded')
  expect(release.revision.mode).toBe('initial')
  // A clean Base 600 is review-required, never technically ready: the readiness review always lists
  // standing unassessed items. Recording it must work, and it is the browser's proof that the live
  // project hashes to the packet manifest's sourceSha256.
  await expect(gate.getByRole('heading', { name: 'Release review required' })).toBeVisible()
  const recordButton = gate.getByRole('button', { name: 'Record release' })
  await expect(recordButton).toBeDisabled()
  await gate.getByLabel('Released by').fill('E2E Designer')
  await expect(recordButton).toBeDisabled()
  await gate
    .getByRole('checkbox', { name: /I have reviewed the \d+ open review items in this assessment/ })
    .check()
  await recordButton.click()
  await expect(gate.getByText('Recorded as revision 1.')).toBeVisible()
  const recorded = dialog.getByRole('region', { name: 'Recorded releases' })
  await expect(recorded.getByText('E2E Designer (self-declared, unverified)')).toBeVisible()
  await expect(
    recorded.getByText('Recorded with 9 open review items acknowledged', { exact: true }),
  ).toBeVisible()
  await expect(recorded.getByText('Integrity check passed')).toBeVisible()
  const files = unzipSync(bytes)
  files['lists/machining.csv'] = strToU8('Altered machining')
  await input.setInputFiles({
    name: 'altered.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(files)),
  })
  await expect(dialog.getByText('Integrity checks failed', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/File SHA-256 differs/)).toBeVisible()
  const reportDownloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download verification report' }).click()
  const reportDownload = await reportDownloading
  const report = JSON.parse(await readFile(await reportDownload.path(), 'utf8'))
  expect(report.status).toBe('failed')
  expect(report.findings).toContainEqual(
    expect.objectContaining({
      code: 'hash-mismatch',
      locations: ['lists/machining.csv', 'manifest.json'],
    }),
  )
  await input.setInputFiles({ name: 'packet.zip', mimeType: 'application/zip', buffer: bytes })
  await expect(dialog.getByText('Integrity checks passed', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'File ▾' }).click()
  await expect(page.getByRole('button', { name: 'Export STEP…' })).toBeEnabled()
})
