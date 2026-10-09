import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { strToU8, unzipSync, zipSync } from 'fflate'

test('a downloaded production packet verifies locally and altered files fail', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
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
