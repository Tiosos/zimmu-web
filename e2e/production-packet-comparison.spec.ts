import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

test('compares downloaded revisions locally, reports geometry changes and blocks altered content', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '+ Board' })).toBeEnabled({ timeout: 120_000 })
  const exportPacket = async () => {
    await page.getByRole('button', { name: 'File ▾' }).click()
    await page.getByRole('button', { name: 'Manufacturing readiness…' }).click()
    const readiness = page.getByRole('dialog', { name: 'Manufacturing readiness', exact: true })
    const downloading = page.waitForEvent('download')
    await readiness.getByRole('button', { name: 'Export production packet' }).click()
    const download = await downloading
    const bytes = await readFile(await download.path())
    await readiness.getByRole('button', { name: 'Close readiness report' }).click()
    return bytes
  }
  const earlier = await exportPacket()
  // The initial board has no machining operations, so this exercises the complete part inventory.
  await page.getByText('Board 1', { exact: true }).click()
  const length = page.getByLabel('L', { exact: true })
  await length.fill('720')
  await length.blur()
  const later = await exportPacket()
  await page.getByRole('button', { name: 'File ▾' }).click()
  await page.getByRole('button', { name: 'Compare production packets…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Compare production packets', exact: true })
  await dialog
    .getByLabel('Earlier packet')
    .setInputFiles({ name: 'earlier.zip', mimeType: 'application/zip', buffer: earlier })
  await dialog
    .getByLabel('Later packet')
    .setInputFiles({ name: 'later.zip', mimeType: 'application/zip', buffer: later })
  await dialog.getByRole('button', { name: 'Compare revisions' }).click()
  await expect(dialog.getByText('Revision comparison complete', { exact: true })).toBeVisible()
  await expect(
    dialog.getByText('modified part: Board 1 (manufacturing)', { exact: true }),
  ).toBeVisible()
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download comparison report' }).click()
  const download = await downloading
  const report = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(download.suggestedFilename()).toBe(
    `production-packet-comparison-untitled-${report.before.sha256.slice(0, 12)}-to-${report.after.sha256.slice(0, 12)}.json`,
  )
  expect(report.counts.manufacturing).toBe(1)
  expect(report.changes[0].before.locations).toContain('machining/parts.json')
  expect(
    report.changes[0].after.locations.some((location: string) =>
      location.includes('shop-drawings.pdf#page='),
    ),
  ).toBe(true)
  await dialog.getByLabel('Change classification').selectOption('metadata')
  await expect(
    dialog.getByText(/No changes match the current classification and filters/),
  ).toBeVisible()
  await expect(dialog.getByLabel('Change to review')).toHaveCount(0)
  await dialog.getByLabel('Change classification').selectOption('manufacturing')
  await expect(
    dialog.getByText('1 of 1 changes match the current filters.', { exact: true }),
  ).toBeVisible()
  const fields = dialog.getByRole('table', { name: 'Selected change fields' })
  await expect(fields).toBeVisible()
  const dimensions = fields.getByRole('row').filter({ hasText: 'dimensions (manufacturing)' })
  await expect(dimensions.getByRole('cell').nth(0)).toContainText('200')
  await expect(dimensions.getByRole('cell').nth(1)).toContainText('720')
  await dialog.getByLabel('Change classification').selectOption('all')
  await dialog.getByLabel('Find a change').fill(report.changes[0].partId.toUpperCase())
  await expect(
    dialog.getByText('1 of 1 changes match the current filters.', { exact: true }),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Previous change' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Next change' })).toBeDisabled()
  await expect(dialog.getByText('Change 1 of 1 matching changes')).toBeVisible()
  await dialog.getByLabel('Find a change').fill('missing-part-id')
  await expect(
    dialog.getByText('No changes match this search. Clear or adjust the filters to continue.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Next change' })).toHaveCount(0)
  await dialog.getByLabel('Change classification').selectOption('metadata')
  await dialog.getByLabel('Show pending items only').check()
  await dialog.getByRole('button', { name: 'Clear navigation filters' }).click()
  await expect(dialog.getByLabel('Find a change')).toHaveValue('')
  await expect(dialog.getByLabel('Change classification')).toHaveValue('all')
  await expect(dialog.getByLabel('Show pending items only')).not.toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Clear navigation filters' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Review pending manufacturing changes' }).click()
  await expect(dialog.getByLabel('Change classification')).toHaveValue('manufacturing')
  await expect(dialog.getByLabel('Show pending items only')).toBeChecked()
  await expect(
    dialog.getByRole('button', { name: 'Review pending metadata changes' }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: 'Clear navigation filters' }).click()
  await dialog
    .getByRole('button', { name: `Review part ${report.changes[0].partId}`, exact: true })
    .click()
  await expect(dialog.getByRole('button', { name: 'Show all parts' })).toBeVisible()
  await expect(dialog.getByLabel('Change to review').locator('option')).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Clear navigation filters' }).click()
  await expect(dialog.getByRole('button', { name: 'Show all parts' })).toHaveCount(0)
  await dialog.getByLabel('Show pending parts first').check()
  await expect(dialog.getByLabel('Show pending parts first')).toBeChecked()
  await dialog.getByLabel('Find a part in summary').fill('missing-part')
  await expect(dialog.getByText(/No parts match this summary search/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Clear part search', exact: true }).click()
  await expect(dialog.getByLabel('Find a part in summary')).toHaveValue('')
  const partPendingShortcut = dialog.getByRole('button', {
    name: `Review pending changes for part ${report.changes[0].partId}`,
    exact: true,
  })
  await partPendingShortcut.click()
  await expect(dialog.getByLabel('Show pending items only')).toBeChecked()
  await expect(dialog.getByRole('button', { name: 'Show all parts' })).toBeVisible()
  const pendingPrintableDownloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download printable review' }).click()
  const pendingPrintableDownload = await pendingPrintableDownloading
  const pendingSummary = await context.newPage()
  await pendingSummary.setContent(await readFile(await pendingPrintableDownload.path(), 'utf8'))
  await pendingSummary
    .getByRole('link', {
      name: `Review pending changes for part ${report.changes[0].partId}`,
      exact: true,
    })
    .click()
  await expect(pendingSummary.locator('#finding-0')).toBeInViewport()
  await expect(pendingSummary.locator('#finding-0 h3')).toContainText('Pending')
  await pendingSummary
    .locator('#finding-0')
    .getByRole('link', { name: 'Back to part summary', exact: true })
    .click()
  await expect(pendingSummary.locator('#part-summary-0')).toBeInViewport()
  await pendingSummary.close()
  await dialog.getByLabel('Acknowledge selected change').click()
  await expect(partPendingShortcut).toBeDisabled()
  await expect(dialog.getByText(/No changes match this part and the current filters/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Clear navigation filters' }).click()
  const classificationProgress = dialog.getByRole('table', {
    name: 'Detected change progress by classification',
  })
  await expect(
    classificationProgress.getByRole('row').filter({ hasText: 'Manufacturing' }).getByRole('cell'),
  ).toHaveText(['1', '0', '1'])
  await expect(
    classificationProgress.getByRole('row').filter({ hasText: 'Metadata' }).getByRole('cell'),
  ).toHaveText(['0', '0', '0'])
  const perPartProgress = dialog.getByRole('table', { name: 'Detected change progress by part' })
  await expect(perPartProgress.getByRole('row').nth(1)).toContainText(report.changes[0].partId)
  await expect(perPartProgress.getByRole('row').nth(1).getByRole('cell')).toHaveText([
    '1',
    '0',
    '1',
    '0',
    '1',
  ])
  await dialog.getByLabel('Change note', { exact: true }).fill('Revised length checked')
  await expect(dialog.getByRole('status')).toHaveText('Review edits awaiting a JSON checkpoint.')
  page.once('dialog', (confirmation) => void confirmation.dismiss())
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeVisible()
  page.once('dialog', (confirmation) => void confirmation.dismiss())
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Change note', { exact: true })).toHaveValue(
    'Revised length checked',
  )
  const outputPath = report.otherChangedFiles[0]
  expect(outputPath).toBeTruthy()
  await dialog.getByRole('button', { name: 'Review pending changed outputs', exact: true }).click()
  await expect(dialog.getByLabel(`Acknowledge output: ${outputPath}`)).toBeFocused()
  await expect(dialog.getByLabel(`Acknowledge output: ${outputPath}`)).toBeInViewport()
  await dialog.getByLabel(`Acknowledge output: ${outputPath}`, { exact: true }).click()
  await dialog.getByLabel('Show pending items only').uncheck()
  await dialog
    .getByLabel(`Output note: ${outputPath}`, { exact: true })
    .fill('Changed output inspected')
  await dialog
    .getByText(`Comparison limitations: 0 of ${report.limitations.length} acknowledged`, {
      exact: true,
    })
    .click()
  await dialog
    .getByLabel(`Acknowledge limitation: ${report.limitations[0]}`, { exact: true })
    .check()
  const reviewDownloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download revision review' }).click()
  const reviewDownload = await reviewDownloading
  await expect(dialog.getByRole('status')).toHaveText('No new review edits.')
  expect(report.after.projectName).toBe('Untitled')
  const reviewStem = `production-packet-revision-review-untitled-${report.before.sha256.slice(0, 12)}-to-${report.after.sha256.slice(0, 12)}`
  expect(reviewDownload.suggestedFilename()).toBe(`${reviewStem}.json`)
  const reviewBytes = await readFile(await reviewDownload.path())
  const review = JSON.parse(reviewBytes.toString())
  expect(review.comparison.before.sha256).toBe(report.before.sha256)
  expect(review.changes[0].acknowledged).toBe(true)
  expect(review.schemaVersion).toBe(2)
  expect(review.outputs[0].note).toBe('Changed output inspected')
  expect(review.limitations[0].acknowledged).toBe(true)
  await dialog.getByRole('button', { name: 'Compare revisions' }).click()
  await expect(dialog.getByText('0 of 1 detected changes acknowledged.')).toBeVisible()
  await dialog
    .getByLabel('Resume revision review')
    .setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: reviewBytes })
  await expect(dialog.getByText('1 of 1 detected changes acknowledged.')).toBeVisible()
  await expect(dialog.getByRole('status')).toHaveText('No new review edits.')
  await expect(dialog.getByLabel('Change note', { exact: true })).toHaveValue(
    'Revised length checked',
  )
  await expect(
    dialog.getByText(
      `Other changed outputs: 1 of ${report.otherChangedFiles.length} acknowledged`,
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    dialog.getByText(`Comparison limitations: 1 of ${report.limitations.length} acknowledged`, {
      exact: true,
    }),
  ).toBeVisible()
  await dialog.getByLabel('Show pending items only').check()
  await expect(
    dialog.getByText('No pending changes. Clear the filter to edit acknowledged changes.', {
      exact: true,
    }),
  ).toBeVisible()
  const printableDownloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download printable review' }).click()
  const printableDownload = await printableDownloading
  const html = await readFile(await printableDownload.path(), 'utf8')
  expect(printableDownload.suggestedFilename()).toBe(`${reviewStem}.html`)
  const summaryPage = await context.newPage()
  await summaryPage.setContent(html)
  await expect(
    summaryPage
      .getByRole('table', { name: 'Detected change progress by part' })
      .getByRole('row')
      .nth(1)
      .getByRole('cell'),
  ).toHaveText(['1', '0', '1', '0', '1'])
  await expect(
    summaryPage
      .getByRole('table', { name: 'Detected change progress by classification' })
      .getByRole('row')
      .filter({ hasText: 'Manufacturing' })
      .getByRole('cell'),
  ).toHaveText(['1', '0', '1'])
  await summaryPage
    .getByRole('table', { name: 'Detected change progress by part' })
    .getByRole('link')
    .click()
  await expect(summaryPage.locator('#finding-0')).toBeInViewport()
  await expect(
    summaryPage.getByRole('link', { name: /^Review pending changes for part / }),
  ).toHaveCount(0)
  const contents = summaryPage.getByRole('navigation', { name: 'Review contents' })
  await contents.getByRole('link', { name: 'Comparison limitations', exact: true }).click()
  await expect(summaryPage.locator('#limitations')).toBeInViewport()
  await summaryPage.locator('#limitations').getByRole('link', { name: 'Back to contents' }).click()
  await expect(contents).toBeInViewport()
  await summaryPage.emulateMedia({ media: 'print' })
  await expect(contents).toBeHidden()
  await expect(
    summaryPage
      .locator('#finding-0')
      .getByRole('link', { name: 'Back to part summary', exact: true }),
  ).toBeHidden()
  await expect(
    summaryPage.getByRole('heading', { name: 'Comparison limitations', exact: true }),
  ).toBeVisible()
  await summaryPage.emulateMedia({ media: 'screen' })
  await expect(
    summaryPage.getByRole('heading', { name: 'Production packet revision review', exact: true }),
  ).toBeVisible()
  await expect(summaryPage.getByText(report.before.sha256, { exact: true })).toBeVisible()
  await expect(summaryPage.getByText('Revised length checked', { exact: true })).toBeVisible()
  await summaryPage.emulateMedia({ media: 'print' })
  expect(
    await summaryPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true)
  expect((await summaryPage.pdf()).subarray(0, 4).toString()).toBe('%PDF')
  await summaryPage.close()
  await dialog.getByLabel('Show pending items only').uncheck()
  await expect(dialog.getByLabel('Change note', { exact: true })).toHaveValue(
    'Revised length checked',
  )
  review.comparison.after.sha256 = 'wrong'
  await dialog.getByLabel('Resume revision review').setInputFiles({
    name: 'stale.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(review)),
  })
  await expect(dialog.getByRole('alert')).toContainText('different packet hashes')
  const files = unzipSync(later)
  const inventory = JSON.parse(strFromU8(files['machining/parts.json']))
  expect(inventory.parts).toHaveLength(1)
  files['lists/boards.csv'] = strToU8('Altered stock list')
  await dialog.getByLabel('Later packet').setInputFiles({
    name: 'altered.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(files)),
  })
  await dialog.getByRole('button', { name: 'Compare revisions' }).click()
  await expect(dialog.getByText('Comparison blocked', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/No revision changes were assessed/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(length).toHaveValue('720')
})
